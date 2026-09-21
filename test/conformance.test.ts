/**
 * Suíte de conformidade (BRIEF §7): roda TODOS os casos de cases.json contra um servidor
 * node:http local que confere cada troca.
 *
 * Fonte dos casos: no monorepo, `clients/conformance/cases.json` (a cópia em
 * test/conformance/cases.json precisa ser idêntica — `python3 clients/conformance/generate.py`);
 * no espelho público, só a cópia existe.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { after, before, describe, it } from "node:test";
import {
  AuthenticationError,
  Bzapper,
  BzapperError,
  BzapperPartner,
  ConflictError,
  NetworkError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError,
  ServerError,
  VERSION,
  ValidationError,
  verifyWebhook,
  constructWebhookEvent,
  WebhookSignatureError,
} from "@bzapper/client";
import type { FileUpload, RequestOptions } from "@bzapper/client";
import { startServer } from "./helpers/server.js";
import type { Recorded, TestServer } from "./helpers/server.js";

// ── Casos ────────────────────────────────────────────────────────────────────

interface ExchangeRequest {
  method: string;
  path: string;
  query: Record<string, string>;
  body: unknown;
  headers?: Record<string, string>;
}
interface Exchange {
  /** true = nova tentativa da troca anterior (mesmos ids); false = chamada lógica nova (ids novos). */
  retry: boolean;
  request: ExchangeRequest;
  response: { status: number; headers: Record<string, string>; body: unknown };
}
interface Case {
  id: string;
  op: string;
  args: { path: Record<string, any>; query: Record<string, any>; body: any };
  multipart: boolean;
  options?: { idempotency_key?: string };
  exchanges: Exchange[];
  expect: { result?: unknown; error?: Record<string, any> };
}
interface Cases {
  api_key: string;
  max_retries: number;
  sdk_excluded_ops: string[];
  ops: string[];
  cases: Case[];
  signatures: { id?: string; secret: string; body: string; signature: string; valid: boolean }[];
}

const MONOREPO_CASES = new URL("../../conformance/cases.json", import.meta.url);
const VENDORED_CASES = new URL("../test/conformance/cases.json", import.meta.url);

function loadCases(): Cases {
  if (existsSync(MONOREPO_CASES)) {
    const source = readFileSync(MONOREPO_CASES, "utf8");
    assert.ok(existsSync(VENDORED_CASES), "falta test/conformance/cases.json — rode `python3 clients/conformance/generate.py`");
    assert.equal(
      readFileSync(VENDORED_CASES, "utf8"),
      source,
      "test/conformance/cases.json está desatualizado — rode `python3 clients/conformance/generate.py`",
    );
    return JSON.parse(source) as Cases;
  }
  assert.ok(existsSync(VENDORED_CASES), "cases.json não encontrado");
  return JSON.parse(readFileSync(VENDORED_CASES, "utf8")) as Cases;
}

const CASES = loadCases();

// ── Tabela op → chamada da SDK ───────────────────────────────────────────────

type A = Case["args"];
interface Clients {
  bz: Bzapper;
  partner: BzapperPartner;
  /** Opções por chamada do caso (ex.: `idempotencyKey` do usuário). */
  opts: RequestOptions | undefined;
}

/** Arquivo neutro do caso (`content_base64` + `filename` + `content_type`) → {@link FileUpload}. */
function file(body: any): FileUpload {
  const f = body.file;
  return { content: Buffer.from(f.content_base64, "base64"), filename: f.filename, contentType: f.content_type };
}

// Os métodos existentes antes do padrão r2 mantêm o nome (listKeys, createKey, revokeKey,
// groupInvite, webhookDeliveries, triggerWebhook; no parceiro me, exchangeCode, listConnections,
// getConnection, revokeConnection, rotateConnectionKey) — a tabela aponta para eles.
const OPS: Record<string, (c: Clients, a: A) => Promise<unknown>> = {
  // mensagens
  sendText: ({ bz, opts }, a) => bz.sendText(a.body, opts),
  sendImage: ({ bz, opts }, a) => bz.sendImage(a.body, opts),
  sendVideo: ({ bz, opts }, a) => bz.sendVideo(a.body, opts),
  sendDocument: ({ bz, opts }, a) => bz.sendDocument(a.body, opts),
  sendAudio: ({ bz, opts }, a) => bz.sendAudio(a.body, opts),
  sendSticker: ({ bz, opts }, a) => bz.sendSticker(a.body, opts),
  sendLocation: ({ bz, opts }, a) => bz.sendLocation(a.body, opts),
  sendContact: ({ bz, opts }, a) => bz.sendContact(a.body, opts),
  sendPoll: ({ bz, opts }, a) => bz.sendPoll(a.body, opts),
  sendReaction: ({ bz, opts }, a) => bz.sendReaction(a.body, opts),
  sendButtons: ({ bz, opts }, a) => bz.sendButtons(a.body, opts),
  sendList: ({ bz, opts }, a) => bz.sendList(a.body, opts),
  sendOTP: ({ bz, opts }, a) => bz.sendOTP(a.body, opts),
  editMessage: ({ bz, opts }, a) => bz.editMessage(a.path.id, a.body, opts),
  revokeMessage: ({ bz, opts }, a) => bz.revokeMessage(a.path.id, a.query, opts),
  forwardMessage: ({ bz, opts }, a) => bz.forwardMessage(a.body, opts),
  markRead: ({ bz, opts }, a) => bz.markRead(a.path.id, a.body, opts),
  presenceChat: ({ bz, opts }, a) => bz.presenceChat(a.body, opts),
  listScheduled: ({ bz, opts }, a) => bz.listScheduled(a.query, opts),
  cancelScheduled: ({ bz, opts }, a) => bz.cancelScheduled(a.path.id, opts),

  // campanhas
  listCampaigns: ({ bz, opts }, a) => bz.listCampaigns(a.query, opts),
  createCampaign: ({ bz, opts }, a) => bz.createCampaign(a.body, opts),
  estimateCampaign: ({ bz, opts }, a) => bz.estimateCampaign(a.query, opts),
  getCampaignEligibility: ({ bz, opts }, a) => bz.getCampaignEligibility(a.query, opts),
  uploadCampaignMedia: ({ bz, opts }, a) => bz.uploadCampaignMedia(file(a.body), opts),
  getCampaign: ({ bz, opts }, a) => bz.getCampaign(a.path.id, opts),
  updateCampaign: ({ bz, opts }, a) => bz.updateCampaign(a.path.id, a.body, opts),
  listCampaignRecipients: ({ bz, opts }, a) => bz.listCampaignRecipients(a.path.id, a.query, opts),
  addCampaignRecipients: ({ bz, opts }, a) => bz.addCampaignRecipients(a.path.id, a.body, opts),
  startCampaign: ({ bz, opts }, a) => bz.startCampaign(a.path.id, opts),
  pauseCampaign: ({ bz, opts }, a) => bz.pauseCampaign(a.path.id, opts),
  resumeCampaign: ({ bz, opts }, a) => bz.resumeCampaign(a.path.id, opts),
  cancelCampaign: ({ bz, opts }, a) => bz.cancelCampaign(a.path.id, opts),
  dryRunCampaign: ({ bz, opts }, a) => bz.dryRunCampaign(a.path.id, opts),

  // pools
  listPools: ({ bz, opts }) => bz.listPools(opts),
  createPool: ({ bz, opts }, a) => bz.createPool(a.body, opts),
  getPool: ({ bz, opts }, a) => bz.getPool(a.path.id, opts),
  addPoolNumber: ({ bz, opts }, a) => bz.addPoolNumber(a.path.id, a.body, opts),

  // números
  getHealth: ({ bz, opts }) => bz.getHealth(opts),
  listInstances: ({ bz, opts }, a) => bz.listInstances(a.query, opts),
  createInstance: ({ bz, opts }, a) => bz.createInstance(a.body, opts),
  getInstance: ({ bz, opts }, a) => bz.getInstance(a.path.id, opts),
  deleteInstance: ({ bz, opts }, a) => bz.deleteInstance(a.path.id, opts),
  connectInstance: ({ bz, opts }, a) => bz.connectInstance(a.path.id, a.query.method, opts),
  disconnectInstance: ({ bz, opts }, a) => bz.disconnectInstance(a.path.id, opts),
  logoutInstance: ({ bz, opts }, a) => bz.logoutInstance(a.path.id, opts),
  clearInstanceSession: ({ bz, opts }, a) => bz.clearInstanceSession(a.path.id, opts),
  archiveInstance: ({ bz, opts }, a) => bz.archiveInstance(a.path.id, opts),
  unarchiveInstance: ({ bz, opts }, a) => bz.unarchiveInstance(a.path.id, opts),
  setInstanceProxy: ({ bz, opts }, a) => bz.setInstanceProxy(a.path.id, a.body, opts),
  setInboundFilters: ({ bz, opts }, a) => bz.setInboundFilters(a.path.id, a.body, opts),
  setProfile: ({ bz, opts }, a) => bz.setProfile(a.path.id, a.body, opts),
  setPrivacy: ({ bz, opts }, a) => bz.setPrivacy(a.path.id, a.body, opts),
  getOfficialAccount: ({ bz, opts }) => bz.getOfficialAccount(opts),
  connectOfficialAccount: ({ bz, opts }, a) => bz.connectOfficialAccount(a.body, opts),
  disconnectOfficialAccount: ({ bz, opts }) => bz.disconnectOfficialAccount(opts),

  // conversas e chats
  listConversations: ({ bz, opts }, a) => bz.listConversations(a.query.instance_id, opts),
  conversationHistory: ({ bz, opts }, a) => bz.conversationHistory(a.path.jid, a.query as any, opts),
  archiveChat: ({ bz, opts }, a) => bz.archiveChat(a.path.jid, a.body, opts),
  pinChat: ({ bz, opts }, a) => bz.pinChat(a.path.jid, a.body, opts),
  markChat: ({ bz, opts }, a) => bz.markChat(a.path.jid, a.body, opts),
  muteChat: ({ bz, opts }, a) => bz.muteChat(a.path.jid, a.body, opts),
  applyChatLabel: ({ bz, opts }, a) => bz.applyChatLabel(a.path.jid, a.body, opts),

  // etiquetas, bloqueio, chamadas
  listLabels: ({ bz, opts }, a) => bz.listLabels(a.query.instance_id, opts),
  createLabel: ({ bz, opts }, a) => bz.createLabel(a.body, opts),
  deleteLabel: ({ bz, opts }, a) => bz.deleteLabel(a.path.id, a.query.instance_id, opts),
  blockContact: ({ bz, opts }, a) => bz.blockContact(a.path.jid, a.body, opts),
  unblockContact: ({ bz, opts }, a) => bz.unblockContact(a.path.jid, a.body, opts),
  getBlocklist: ({ bz, opts }, a) => bz.getBlocklist(a.query.instance_id, opts),
  rejectCall: ({ bz, opts }, a) => bz.rejectCall(a.body, opts),
  offerCall: ({ bz, opts }, a) => bz.offerCall(a.body, opts),

  // grupos
  listGroups: ({ bz, opts }, a) => bz.listGroups(a.query.instance_id, opts),
  createGroup: ({ bz, opts }, a) => bz.createGroup(a.query.instance_id, a.body, opts),
  joinGroup: ({ bz, opts }, a) => bz.joinGroup(a.query.instance_id, a.body, opts),
  previewGroupInvite: ({ bz, opts }, a) => bz.previewGroupInvite(a.query.instance_id, a.body, opts),
  getGroup: ({ bz, opts }, a) => bz.getGroup(a.path.jid, a.query.instance_id, opts),
  updateGroup: ({ bz, opts }, a) => bz.updateGroup(a.path.jid, a.query.instance_id, a.body, opts),
  updateGroupParticipants: ({ bz, opts }, a) =>
    bz.updateGroupParticipants(a.path.jid, a.query.instance_id, a.body, opts),
  groupInviteLink: ({ bz, opts }, a) =>
    bz.groupInvite(a.path.jid, a.query.instance_id, { reset: a.query.reset }, opts),
  leaveGroup: ({ bz, opts }, a) => bz.leaveGroup(a.path.jid, a.query.instance_id, opts),
  listJoinRequests: ({ bz, opts }, a) => bz.listJoinRequests(a.path.jid, a.query.instance_id, opts),
  updateJoinRequests: ({ bz, opts }, a) => bz.updateJoinRequests(a.path.jid, a.query.instance_id, a.body, opts),

  // contatos
  contactsCheck: ({ bz, opts }, a) => bz.contactsCheck(a.body, opts),
  listContacts: ({ bz, opts }, a) => bz.listContacts(a.query, opts),
  createContact: ({ bz, opts }, a) => bz.createContact(a.body, opts),
  getContact: ({ bz, opts }, a) => bz.getContact(a.path.id, opts),
  updateContact: ({ bz, opts }, a) => bz.updateContact(a.path.id, a.body, opts),
  deleteContact: ({ bz, opts }, a) => bz.deleteContact(a.path.id, opts),
  getContactHistory: ({ bz, opts }, a) => bz.getContactHistory(a.path.id, a.query, opts),
  addContactNote: ({ bz, opts }, a) => bz.addContactNote(a.path.id, a.body, opts),
  mutateContactTags: ({ bz, opts }, a) => bz.mutateContactTags(a.path.id, a.body, opts),
  mutateContactGroups: ({ bz, opts }, a) => bz.mutateContactGroups(a.path.id, a.body, opts),
  optOutContact: ({ bz, opts }, a) => bz.optOutContact(a.path.id, opts),
  suppressContact: ({ bz, opts }, a) => bz.suppressContact(a.path.id, opts),
  optInContact: ({ bz, opts }, a) => bz.optInContact(a.path.id, opts),
  listTags: ({ bz, opts }) => bz.listTags(opts),
  createTag: ({ bz, opts }, a) => bz.createTag(a.body, opts),
  deleteTag: ({ bz, opts }, a) => bz.deleteTag(a.path.id, opts),
  listContactGroups: ({ bz, opts }) => bz.listContactGroups(opts),
  createContactGroup: ({ bz, opts }, a) => bz.createContactGroup(a.body, opts),
  deleteContactGroup: ({ bz, opts }, a) => bz.deleteContactGroup(a.path.id, opts),
  listSuppressions: ({ bz, opts }, a) => bz.listSuppressions(a.query, opts),
  createSuppression: ({ bz, opts }, a) => bz.createSuppression(a.body, opts),
  deleteSuppression: ({ bz, opts }, a) => bz.deleteSuppression(a.query.phone, opts),

  // projetos, marca, conta, usuários, keys, uso
  listProjects: ({ bz, opts }) => bz.listProjects(opts),
  createProject: ({ bz, opts }, a) => bz.createProject(a.body, opts),
  getProjectsHealth: ({ bz, opts }) => bz.getProjectsHealth(opts),
  updateProject: ({ bz, opts }, a) => bz.updateProject(a.path.id, a.body, opts),
  deleteProject: ({ bz, opts }, a) => bz.deleteProject(a.path.id, opts),
  getProjectBrand: ({ bz, opts }, a) => bz.getProjectBrand(a.path.id, opts),
  setProjectBrand: ({ bz, opts }, a) => bz.setProjectBrand(a.path.id, a.body, opts),
  uploadProjectLogo: ({ bz, opts }, a) => bz.uploadProjectLogo(a.path.id, file(a.body), opts),
  getBrand: ({ bz, opts }) => bz.getBrand(opts),
  setBrand: ({ bz, opts }, a) => bz.setBrand(a.body, opts),
  applyBrand: ({ bz, opts }) => bz.applyBrand(opts),
  uploadBrandLogo: ({ bz, opts }, a) => bz.uploadBrandLogo(file(a.body), opts),
  getMe: ({ bz, opts }) => bz.getMe(opts),
  updateProfile: ({ bz, opts }, a) => bz.updateProfile(a.body, opts),
  updateAccount: ({ bz, opts }, a) => bz.updateAccount(a.body, opts),
  listUsers: ({ bz, opts }) => bz.listUsers(opts),
  inviteUser: ({ bz, opts }, a) => bz.inviteUser(a.body, opts),
  updateUserRole: ({ bz, opts }, a) => bz.updateUserRole(a.path.id, a.body, opts),
  removeUser: ({ bz, opts }, a) => bz.removeUser(a.path.id, opts),
  getAccountUsage: ({ bz, opts }, a) => bz.getAccountUsage(a.query, opts),
  getUsage: ({ bz, opts }, a) => bz.getUsage(a.query, opts),
  listMyKeys: ({ bz, opts }) => bz.listKeys(opts),
  createMyKey: ({ bz, opts }, a) => bz.createKey(a.body, opts),
  revokeMyKey: ({ bz, opts }, a) => bz.revokeKey(a.path.id, opts),

  // cobrança
  getMyEntitlements: ({ bz, opts }) => bz.getMyEntitlements(opts),
  upgradePlan: ({ bz, opts }) => bz.upgradePlan(opts),
  cancelPlan: ({ bz, opts }) => bz.cancelPlan(opts),
  uncancelPlan: ({ bz, opts }) => bz.uncancelPlan(opts),
  getMySubscription: ({ bz, opts }) => bz.getMySubscription(opts),
  changeAddon: ({ bz, opts }, a) => bz.changeAddon(a.body, opts),
  getAddonCart: ({ bz, opts }) => bz.getAddonCart(opts),
  clearAddonCart: ({ bz, opts }) => bz.clearAddonCart(opts),
  checkoutAddonCart: ({ bz, opts }, a) => bz.checkoutAddonCart(a.body ?? undefined, opts),
  listMyInvoices: ({ bz, opts }) => bz.listMyInvoices(opts),
  payInvoice: ({ bz, opts }, a) => bz.payInvoice(a.path.id, opts),
  getBillingConfig: ({ bz, opts }) => bz.getBillingConfig(opts),
  getPricing: ({ bz, opts }) => bz.getPricing(opts),

  // avisos e webhooks
  listAdvisories: ({ bz, opts }) => bz.listAdvisories(opts),
  markAdvisoryRead: ({ bz, opts }, a) => bz.markAdvisoryRead(a.path.id, opts),
  listWebhooks: ({ bz, opts }) => bz.listWebhooks(opts),
  createWebhook: ({ bz, opts }, a) => bz.createWebhook(a.body, opts),
  updateWebhook: ({ bz, opts }, a) => bz.updateWebhook(a.path.id, a.body, opts),
  deleteWebhook: ({ bz, opts }, a) => bz.deleteWebhook(a.path.id, opts),
  testWebhook: ({ bz, opts }, a) => bz.testWebhook(a.path.id, a.body?.event_type, opts),
  listWebhookDeliveries: ({ bz, opts }, a) => bz.webhookDeliveries(a.path.id, a.query.limit, opts),
  triggerWebhookEvent: ({ bz, opts }, a) => bz.triggerWebhook(a.body?.event_type, opts),

  // bZapper Connect — lado do cliente
  listConnectedApps: ({ bz, opts }) => bz.listConnectedApps(opts),
  revokeConnectedApp: ({ bz, opts }, a) => bz.revokeConnectedApp(a.path.id, opts),

  // bZapper Connect — parceiro (BzapperPartner)
  getPartnerMe: ({ partner, opts }) => partner.me(opts),
  createConnectSession: ({ partner, opts }, a) => partner.createConnectSession(a.body, opts),
  exchangeConnectCode: ({ partner, opts }, a) => partner.exchangeCode(a.body.code, opts),
  listPartnerConnections: ({ partner, opts }, a) => partner.listConnections(a.query, opts),
  getPartnerConnection: ({ partner, opts }, a) => partner.getConnection(a.path.id, opts),
  revokePartnerConnection: ({ partner, opts }, a) => partner.revokeConnection(a.path.id, opts),
  rotatePartnerConnectionKey: ({ partner, opts }, a) => partner.rotateConnectionKey(a.path.id, opts),
};

// ── Conferência de cada troca ────────────────────────────────────────────────

const WRITE = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const CLIENT_RE = new RegExp(`^bzapper-node/${VERSION.replace(/\./g, "\\.")}$`);

function header(req: Recorded, name: string): string | undefined {
  const v = req.headers[name.toLowerCase()];
  return Array.isArray(v) ? v.join(", ") : v;
}

/** Segmentos decodificados de um caminho (dividido no `/` CRU, antes de decodificar). */
const segments = (path: string) => path.split("/").map((s) => decodeURIComponent(s));

/** Confere a requisição `index` da chamada; devolve a lista de divergências. */
function check(c: Case, index: number, req: Recorded, seen: Recorded[]): string[] {
  const exp = c.exchanges[index]!.request;
  const at = `[troca ${index + 1}]`;
  const problems: string[] = [];
  const eq = (label: string, got: unknown, want: unknown) => {
    try {
      assert.deepStrictEqual(got, want);
    } catch {
      problems.push(`${at} ${label}: recebido ${JSON.stringify(got)}, esperado ${JSON.stringify(want)}`);
    }
  };

  eq("método", req.method, exp.method);
  if (/\s/.test(req.path)) problems.push(`${at} caminho cru com espaço: ${req.path}`);
  eq("caminho (segmentos)", segments(req.path), segments(exp.path));

  const keys = req.queryPairs.map(([k]) => k);
  if (new Set(keys).size !== keys.length) problems.push(`${at} query com chave repetida: ${keys.join(",")}`);
  const wantQuery = Object.fromEntries(Object.entries(exp.query).map(([k, v]) => [k, String(v)]));
  eq("query", Object.fromEntries(req.queryPairs), wantQuery);

  const contentType = header(req, "content-type");
  if (c.multipart) {
    if (!contentType?.startsWith("multipart/form-data")) problems.push(`${at} Content-Type não é multipart: ${contentType}`);
    const filename = c.args.body?.file?.filename as string;
    if (!req.rawBody.includes(`filename="${filename}"`)) problems.push(`${at} arquivo ${filename} ausente no multipart`);
  } else {
    eq("corpo", req.body, exp.body);
    eq("Content-Type", contentType, exp.body === null ? undefined : "application/json");
  }

  eq("Authorization", header(req, "authorization"), `Bearer ${CASES.api_key}`);
  eq("Accept", header(req, "accept"), "application/json");
  const client = header(req, "x-bzapper-client") ?? "";
  if (!CLIENT_RE.test(client)) problems.push(`${at} X-Bzapper-Client inválido: ${client}`);
  eq("User-Agent", header(req, "user-agent"), client);

  const rid = header(req, "x-request-id");
  if (!rid || !/^[0-9a-f]{32}$/.test(rid)) problems.push(`${at} X-Request-Id ausente/fora do formato: ${rid}`);
  const idem = header(req, "idempotency-key");
  if (WRITE.has(exp.method) && !idem) problems.push(`${at} Idempotency-Key ausente numa escrita`);
  if (!WRITE.has(exp.method) && idem !== undefined) problems.push(`${at} Idempotency-Key numa leitura`);

  for (const [name, value] of Object.entries(exp.headers ?? {})) eq(`header ${name}`, header(req, name), value);

  if (index === 0 && c.exchanges[0]!.retry) problems.push(`${at} a primeira troca não pode ser retry`);
  if (index > 0) {
    const prev = seen[index - 1]!;
    if (c.exchanges[index]!.retry) {
      eq("X-Request-Id repetido na nova tentativa", rid, header(prev, "x-request-id"));
      eq("Idempotency-Key repetida na nova tentativa", idem, header(prev, "idempotency-key"));
    } else {
      if (rid === header(prev, "x-request-id")) problems.push(`${at} X-Request-Id reaproveitado entre chamadas`);
      if (idem && idem === header(prev, "idempotency-key")) problems.push(`${at} Idempotency-Key reaproveitada entre chamadas`);
    }
  }
  return problems;
}

const ERROR_TYPES = new Map<Function, string>([
  [AuthenticationError, "authentication"],
  [PermissionDeniedError, "permission_denied"],
  [NotFoundError, "not_found"],
  [ConflictError, "conflict"],
  [ValidationError, "validation"],
  [RateLimitError, "rate_limit"],
  [ServerError, "server"],
  [NetworkError, "network"],
  [BzapperError, "api"],
]);

/** `sentRequestId` = X-Request-Id que a SDK enviou (o valor especial `"$sent"` do caso). */
function compareError(err: unknown, exp: Record<string, any>, sentRequestId: string | undefined): void {
  if (exp.type === "argument") {
    assert.ok(err instanceof TypeError, `esperava erro de argumento (TypeError), veio ${String(err)}`);
    assert.ok(!(err instanceof BzapperError), "erro de argumento não é BzapperError");
    return;
  }
  assert.ok(err instanceof BzapperError, `esperava BzapperError, veio ${String(err)}`);
  assert.equal(ERROR_TYPES.get(err.constructor), exp.type, "tipo do erro");
  assert.equal(err.code, exp.code, "code");
  assert.equal(err.status, exp.status, "status");
  assert.equal(err.statusCode, exp.status, "statusCode (legado)");
  if ("request_id" in exp) {
    const want = exp.request_id === "$sent" ? sentRequestId : exp.request_id;
    assert.ok(want, "request_id esperado indefinido");
    assert.equal(err.requestId, want, "requestId");
  }
  if ("retry_after" in exp) assert.equal(err.retryAfter, exp.retry_after, "retryAfter");
  if ("required_scope" in exp) assert.equal(err.requiredScope, exp.required_scope, "requiredScope");
}

/** Retorno → JSON neutro (`undefined` = `null`). */
const toJson = (value: unknown): unknown => (value === undefined ? null : JSON.parse(JSON.stringify(value)));

// ── Suíte ────────────────────────────────────────────────────────────────────

describe("conformidade: tabela de operações", () => {
  it("toda op de `ops` tem entrada na tabela (op sem método FALHA)", () => {
    const missing = CASES.ops.filter((op) => !(op in OPS));
    assert.deepEqual(missing, [], `ops sem método na SDK: ${missing.join(", ")}`);
  });

  it("toda op usada nos casos está em `ops`, nenhuma excluída foi implementada", () => {
    const ops = new Set(CASES.ops);
    const stray = [...new Set(CASES.cases.map((c) => c.op))].filter((op) => !ops.has(op));
    assert.deepEqual(stray, []);
    for (const op of CASES.sdk_excluded_ops) assert.ok(!(op in OPS), `${op} está em sdk_excluded_ops`);
    const extra = Object.keys(OPS).filter((op) => !ops.has(op));
    assert.deepEqual(extra, [], `ops da tabela fora de cases.json: ${extra.join(", ")}`);
  });
});

describe("conformidade: casos", () => {
  let server: TestServer;
  before(async () => {
    server = await startServer();
  });
  after(() => server.close());

  for (const c of CASES.cases) {
    it(c.id, async () => {
      const run = OPS[c.op];
      assert.ok(run, `op sem método: ${c.op}`);
      server.reset();
      const problems: string[] = [];
      server.setHandler((req) => {
        const index = server.requests.length - 1;
        const exchange = c.exchanges[index];
        if (!exchange) {
          problems.push(`requisição inesperada #${index + 1}: ${req.method} ${req.path}`);
          return { status: 599, body: { code: "UNEXPECTED_REQUEST" } };
        }
        problems.push(...check(c, index, req, server.requests));
        const r = exchange.response;
        return { status: r.status, headers: r.headers, body: r.body === null ? undefined : r.body };
      });

      const sleeps: number[] = [];
      const common = {
        baseUrl: server.url,
        maxRetries: CASES.max_retries,
        sleep: async (ms: number) => {
          sleeps.push(ms); // espera desligada: registra, não dorme
        },
      };
      const clients: Clients = {
        bz: new Bzapper({ apiKey: CASES.api_key, ...common }),
        partner: new BzapperPartner({ partnerSecret: CASES.api_key, ...common }),
        opts: c.options?.idempotency_key ? { idempotencyKey: c.options.idempotency_key } : undefined,
      };

      let result: unknown;
      let error: unknown;
      try {
        result = await run(clients, c.args);
      } catch (e) {
        error = e;
      }

      assert.deepEqual(problems, []);
      assert.equal(server.requests.length, c.exchanges.length, "número de requisições");
      const retries = c.exchanges.filter((x) => x.retry).length;
      assert.equal(sleeps.length, retries, "esperas entre tentativas");

      if (c.expect.error) {
        const last = server.requests[server.requests.length - 1];
        compareError(error, c.expect.error, last ? header(last, "x-request-id") : undefined);
      } else {
        if (error) throw error;
        const got = toJson(result);
        const want = c.expect.result as any;
        // §4: a SDK pode desembrulhar {"data": [...]} (esta SDK devolve o objeto inteiro).
        if (want && typeof want === "object" && "data" in want && Array.isArray(got)) {
          assert.deepStrictEqual(got, want.data);
        } else {
          assert.deepStrictEqual(got, want);
        }
      }
    });
  }
});

describe("conformidade: assinaturas de webhook", () => {
  for (const [i, v] of CASES.signatures.entries()) {
    it(`vetor ${v.id ?? i + 1}`, () => {
      assert.equal(verifyWebhook(v.secret, v.body, v.signature), v.valid);
      assert.equal(verifyWebhook(v.secret, Buffer.from(v.body, "utf8"), v.signature), v.valid, "Buffer");
      if (v.valid) {
        assert.ok(constructWebhookEvent(v.secret, v.body, v.signature));
      } else {
        assert.throws(() => constructWebhookEvent(v.secret, v.body, v.signature), WebhookSignatureError);
      }
    });
  }
});
