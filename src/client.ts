import { BzapperError } from "./error.js";
import type {
  AccountUsage,
  AccountUser,
  AccountUserList,
  ApiErrorBody,
  ApiKeyCreated,
  ApiKeyList,
  BrandApplyResult,
  BrandProfile,
  ChatActionParams,
  ConnectMethod,
  ConnectResult,
  ContactList,
  ContactRecordList,
  ContactsCheckParams,
  CreateProjectParams,
  InviteUserParams,
  ListContactsParams,
  Project,
  ProjectList,
  UpdateUserRoleParams,
  ConversationHistoryParams,
  ConversationList,
  CreateGroupParams,
  CreateInstanceParams,
  CreateKeyParams,
  GetUsageParams,
  Group,
  GroupInvite,
  GroupList,
  Instance,
  InstanceList,
  JoinGroupParams,
  MessageList,
  MessageQueued,
  PresenceChatParams,
  SendButtonsParams,
  SendContactParams,
  SendListParams,
  SendLocationParams,
  SendMediaParams,
  SendOTPParams,
  Webhook,
  WebhookList,
  CreateWebhookParams,
  WebhookTestResult,
  WebhookDeliveryList,
  SendPollParams,
  SendReactionParams,
  SendTextParams,
  SetProfileParams,
  UpdateGroupParticipantsParams,
  UsageSummary,
  Scheduled,
  Campaign,
  CampaignCreateParams,
  CampaignStats,
  CampaignRecipient,
  CampaignRecipientsParams,
  AddRecipientsResult,
  CampaignDryRun,
  CampaignEstimate,
  EstimateCampaignParams,
} from "./types.js";

/** URL base padrão da API (produção). Sobrescreva só em dev/self-host. */
export const DEFAULT_BASE_URL = "https://api.bzapper.com.br";

/** Opções de construção do cliente. */
export interface BzapperOptions {
  /** API key do tenant (ex.: `bz_live_...`). Único campo obrigatório. */
  apiKey: string;
  /**
   * URL base da API. **Opcional** — por padrão o SDK aponta para produção
   * (`https://api.bzapper.com.br`). Informe só em dev (`http://localhost:8080`)
   * ou self-host.
   */
  baseUrl?: string;
  /** BCP-47, ex.: `pt-BR`. Enviado como `Accept-Language` quando informado. */
  locale?: string;
  /** Timeout por requisição em milissegundos. Default 30000. */
  timeout?: number;
  /** Implementação de fetch (default: fetch global do Node 18+). */
  fetch?: typeof fetch;
}

type Query = Record<string, string | number | boolean | undefined>;

/**
 * Cliente oficial, ergonômico e de alto nível do bZapper.
 *
 * @example
 * ```ts
 * import { Bzapper } from "@bzapper/client";
 *
 * const bz = new Bzapper({ apiKey: "bz_live_..." }); // aponta para produção
 * await bz.sendText({ to: "+5511999999999", body: "Olá!" });
 * ```
 */
export class Bzapper {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly locale?: string;
  private readonly timeout: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: BzapperOptions) {
    if (!options?.apiKey) throw new Error("Bzapper: `apiKey` é obrigatório.");

    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.apiKey = options.apiKey;
    this.locale = options.locale;
    this.timeout = options.timeout ?? 30_000;

    const f = options.fetch ?? globalThis.fetch;
    if (typeof f !== "function") {
      throw new Error(
        "Bzapper: `fetch` global indisponível. Use Node 18+ ou passe `fetch` nas opções.",
      );
    }
    this.fetchImpl = f;
  }

  // -------------------------------------------------------------------------
  // Mensagens
  // -------------------------------------------------------------------------

  /** Envia mensagem de texto. `POST /messages/text` */
  sendText(params: SendTextParams): Promise<MessageQueued> {
    return this.post("/messages/text", params);
  }

  /**
   * Envia um código OTP. `POST /messages/otp`
   *
   * Manda DUAS mensagens (texto de contexto + código sozinho), para que o
   * destinatário copie o código em qualquer aparelho. Conta como 1 envio.
   * Sem `body`, a API gera o texto no idioma da conta, com variações.
   */
  sendOTP(params: SendOTPParams): Promise<MessageQueued> {
    return this.post("/messages/otp", params);
  }

  /** Envia imagem (url ou base64). `POST /messages/image` */
  sendImage(params: SendMediaParams): Promise<MessageQueued> {
    return this.post("/messages/image", params);
  }

  /** Envia vídeo. `POST /messages/video` */
  sendVideo(params: SendMediaParams): Promise<MessageQueued> {
    return this.post("/messages/video", params);
  }

  /** Envia documento. `POST /messages/document` */
  sendDocument(params: SendMediaParams): Promise<MessageQueued> {
    return this.post("/messages/document", params);
  }

  /** Envia áudio (use `media.ptt=true` para nota de voz). `POST /messages/audio` */
  sendAudio(params: SendMediaParams): Promise<MessageQueued> {
    return this.post("/messages/audio", params);
  }

  /** Envia sticker. `POST /messages/sticker` */
  sendSticker(params: SendMediaParams): Promise<MessageQueued> {
    return this.post("/messages/sticker", params);
  }

  /** Envia localização. `POST /messages/location` */
  sendLocation(params: SendLocationParams): Promise<MessageQueued> {
    return this.post("/messages/location", params);
  }

  /** Envia contato (vCard). `POST /messages/contact` */
  sendContact(params: SendContactParams): Promise<MessageQueued> {
    return this.post("/messages/contact", params);
  }

  /** Envia enquete. `POST /messages/poll` */
  sendPoll(params: SendPollParams): Promise<MessageQueued> {
    return this.post("/messages/poll", params);
  }

  /** Reage a uma mensagem (requer `quoted_message_id`). `POST /messages/reaction` */
  sendReaction(params: SendReactionParams): Promise<MessageQueued> {
    return this.post("/messages/reaction", params);
  }

  /**
   * Envia botões. `POST /messages/buttons`
   *
   * Caveat: botões não são confiáveis no WhatsApp (pior em grupo). A API
   * **sempre** envia um menu de texto numerado equivalente como fallback.
   */
  sendButtons(params: SendButtonsParams): Promise<MessageQueued> {
    return this.post("/messages/buttons", params);
  }

  /**
   * Envia lista. `POST /messages/list`
   *
   * Caveat: pode cair para menu de texto numerado do lado do WhatsApp.
   */
  sendList(params: SendListParams): Promise<MessageQueued> {
    return this.post("/messages/list", params);
  }

  // -------------------------------------------------------------------------
  // Envio agendado (scheduled_at em qualquer envio)
  // -------------------------------------------------------------------------

  /** Lista os agendamentos pendentes/recentes. `GET /messages/scheduled` */
  listScheduled(): Promise<{ data: Scheduled[] }> {
    return this.get("/messages/scheduled");
  }

  /** Cancela um agendamento ainda pendente. `DELETE /messages/scheduled/{id}` */
  cancelScheduled(id: string): Promise<void> {
    return this.delete(`/messages/scheduled/${encodeURIComponent(id)}`);
  }

  // -------------------------------------------------------------------------
  // Campanhas (Pro + add-on de campanhas)
  // -------------------------------------------------------------------------

  /** Cria uma campanha (com variações). `POST /campaigns` */
  createCampaign(params: CampaignCreateParams): Promise<Campaign> {
    return this.post("/campaigns", params);
  }

  /** Lista as campanhas do projeto. `GET /campaigns` */
  listCampaigns(): Promise<{ data: Campaign[] }> {
    return this.get("/campaigns");
  }

  /** Campanha + estatísticas. `GET /campaigns/{id}` */
  getCampaign(id: string): Promise<{ campaign: Campaign; stats: CampaignStats }> {
    return this.get(`/campaigns/${encodeURIComponent(id)}`);
  }

  /** Adiciona destinatários (array `recipients` ou mapa `contacts`). `POST /campaigns/{id}/recipients` */
  addCampaignRecipients(id: string, params: CampaignRecipientsParams): Promise<AddRecipientsResult> {
    return this.post(`/campaigns/${encodeURIComponent(id)}/recipients`, params);
  }

  /** Lista destinatários. `GET /campaigns/{id}/recipients` */
  listCampaignRecipients(id: string): Promise<{ data: CampaignRecipient[] }> {
    return this.get(`/campaigns/${encodeURIComponent(id)}/recipients`);
  }

  /** Inicia (ou agenda) a campanha. `POST /campaigns/{id}/start` */
  startCampaign(id: string): Promise<{ id: string; status: string }> {
    return this.post(`/campaigns/${encodeURIComponent(id)}/start`);
  }

  /** Pausa a campanha. `POST /campaigns/{id}/pause` */
  pauseCampaign(id: string): Promise<{ id: string; status: string }> {
    return this.post(`/campaigns/${encodeURIComponent(id)}/pause`);
  }

  /** Retoma a campanha. `POST /campaigns/{id}/resume` */
  resumeCampaign(id: string): Promise<{ id: string; status: string }> {
    return this.post(`/campaigns/${encodeURIComponent(id)}/resume`);
  }

  /** Cancela a campanha. `POST /campaigns/{id}/cancel` */
  cancelCampaign(id: string): Promise<{ id: string; status: string }> {
    return this.post(`/campaigns/${encodeURIComponent(id)}/cancel`);
  }

  /** Simula a campanha sem disparar (números, duração estimada, avisos). `POST /campaigns/{id}/dry-run` */
  dryRunCampaign(id: string): Promise<CampaignDryRun> {
    return this.post(`/campaigns/${encodeURIComponent(id)}/dry-run`);
  }

  /** Edita uma campanha ainda não iniciada (rascunho/agendada); substitui as variações quando enviadas. `PATCH /campaigns/{id}` */
  updateCampaign(id: string, params: CampaignCreateParams): Promise<Campaign> {
    return this.patch(`/campaigns/${encodeURIComponent(id)}`, params);
  }

  /** Estimativa ao vivo (números elegíveis + duração) para N destinatários, sem criar a campanha. `GET /campaigns/estimate` */
  estimateCampaign(params: EstimateCampaignParams = {}): Promise<CampaignEstimate> {
    return this.get("/campaigns/estimate", {
      recipients: params.recipients,
      pacing: params.pacing,
      pool_id: params.pool_id,
    });
  }

  // -------------------------------------------------------------------------
  // Instâncias (números)
  // -------------------------------------------------------------------------

  /** Lista instâncias do tenant. `GET /instances` */
  listInstances(): Promise<InstanceList> {
    return this.get("/instances");
  }

  /** Cria uma instância. `POST /instances` */
  createInstance(params: CreateInstanceParams): Promise<Instance> {
    return this.post("/instances", params);
  }

  /** Detalha uma instância. `GET /instances/{id}` */
  getInstance(id: string): Promise<Instance> {
    return this.get(`/instances/${encodeURIComponent(id)}`);
  }

  /**
   * Conecta a instância por QR ou código de pareamento.
   * `POST /instances/{id}/connect?method=qr|code`
   */
  connectInstance(
    id: string,
    method: ConnectMethod = "qr",
  ): Promise<ConnectResult> {
    return this.post(
      `/instances/${encodeURIComponent(id)}/connect`,
      undefined,
      { method },
    );
  }

  /** Desconecta (reconectável). `POST /instances/{id}/disconnect` */
  disconnectInstance(id: string): Promise<void> {
    return this.post(`/instances/${encodeURIComponent(id)}/disconnect`);
  }

  // -------------------------------------------------------------------------
  // API keys (self-serve)
  // -------------------------------------------------------------------------

  /** Lista as API keys do tenant (sem a chave crua). `GET /keys` */
  listKeys(): Promise<ApiKeyList> {
    return this.get("/keys");
  }

  /** Gera uma API key (a chave crua é mostrada uma única vez). `POST /keys` */
  createKey(params: CreateKeyParams): Promise<ApiKeyCreated> {
    return this.post("/keys", params);
  }

  /** Revoga uma API key do tenant. `DELETE /keys/{id}` */
  revokeKey(id: string): Promise<void> {
    return this.delete(`/keys/${encodeURIComponent(id)}`);
  }

  // -------------------------------------------------------------------------
  // Uso
  // -------------------------------------------------------------------------

  /** Resumo de uso do tenant (por período). `GET /usage` */
  getUsage(params: GetUsageParams = {}): Promise<UsageSummary> {
    return this.get("/usage", { from: params.from, to: params.to });
  }

  /**
   * Atualiza o perfil do número (white-label).
   * `PATCH /instances/{id}/profile`
   *
   * Caveat: `status_message` é confiável; `display_name`/`picture` são
   * experimentais (podem retornar 501 conforme o servidor).
   */
  setProfile(id: string, params: SetProfileParams): Promise<void> {
    return this.patch(`/instances/${encodeURIComponent(id)}/profile`, params);
  }

  // -------------------------------------------------------------------------
  // Presença (funciona em grupos!)
  // -------------------------------------------------------------------------

  /**
   * Atualiza a presença num chat (digitando/gravando/pausado).
   * `POST /presence/chat`
   *
   * `to` pode ser um **JID de grupo** — a presença funciona em grupos.
   */
  presenceChat(params: PresenceChatParams): Promise<void> {
    return this.post("/presence/chat", params);
  }

  // -------------------------------------------------------------------------
  // Conversas
  // -------------------------------------------------------------------------

  /** Lista os threads (inbox) de uma instância. `GET /conversations?instance_id=` */
  listConversations(instanceId: string): Promise<ConversationList> {
    return this.get("/conversations", { instance_id: instanceId });
  }

  /**
   * Histórico paginado de um chat (mais recentes primeiro).
   * `GET /conversations/{jid}/messages?instance_id=&before=&limit=`
   */
  conversationHistory(
    jid: string,
    params: ConversationHistoryParams,
  ): Promise<MessageList> {
    return this.get(
      `/conversations/${encodeURIComponent(jid)}/messages`,
      {
        instance_id: params.instance_id,
        before: params.before,
        limit: params.limit,
      },
    );
  }

  /** Arquiva/desarquiva um chat. `POST /chats/{jid}/archive` */
  archiveChat(jid: string, params: ChatActionParams): Promise<void> {
    return this.post(`/chats/${encodeURIComponent(jid)}/archive`, params);
  }

  /** Fixa/desafixa um chat. `POST /chats/{jid}/pin` */
  pinChat(jid: string, params: ChatActionParams): Promise<void> {
    return this.post(`/chats/${encodeURIComponent(jid)}/pin`, params);
  }

  /** Marca um chat lido/não-lido. `POST /chats/{jid}/read` */
  markChat(jid: string, params: ChatActionParams): Promise<void> {
    return this.post(`/chats/${encodeURIComponent(jid)}/read`, params);
  }

  // -------------------------------------------------------------------------
  // Grupos
  // -------------------------------------------------------------------------

  /** Lista os grupos do número. `GET /groups?instance_id=` */
  listGroups(instanceId: string): Promise<GroupList> {
    return this.get("/groups", { instance_id: instanceId });
  }

  /** Cria um grupo. `POST /groups?instance_id=` */
  createGroup(instanceId: string, params: CreateGroupParams): Promise<Group> {
    return this.post("/groups", params, { instance_id: instanceId });
  }

  /** Info do grupo. `GET /groups/{jid}?instance_id=` */
  getGroup(jid: string, instanceId: string): Promise<Group> {
    return this.get(`/groups/${encodeURIComponent(jid)}`, {
      instance_id: instanceId,
    });
  }

  /** Entra num grupo por link/código de convite. `POST /groups/join?instance_id=` */
  joinGroup(instanceId: string, params: JoinGroupParams): Promise<void> {
    return this.post("/groups/join", params, { instance_id: instanceId });
  }

  /**
   * Adiciona/remove/promove/rebaixa participantes.
   * `POST /groups/{jid}/participants?instance_id=`
   */
  updateGroupParticipants(
    jid: string,
    instanceId: string,
    params: UpdateGroupParticipantsParams,
  ): Promise<void> {
    return this.post(
      `/groups/${encodeURIComponent(jid)}/participants`,
      params,
      { instance_id: instanceId },
    );
  }

  /** Sai do grupo. `POST /groups/{jid}/leave?instance_id=` */
  leaveGroup(jid: string, instanceId: string): Promise<void> {
    return this.post(
      `/groups/${encodeURIComponent(jid)}/leave`,
      undefined,
      { instance_id: instanceId },
    );
  }

  /** Link de convite do grupo. `GET /groups/{jid}/invite?instance_id=` */
  groupInvite(jid: string, instanceId: string): Promise<GroupInvite> {
    return this.get(`/groups/${encodeURIComponent(jid)}/invite`, {
      instance_id: instanceId,
    });
  }

  // -------------------------------------------------------------------------
  // Contatos
  // -------------------------------------------------------------------------

  /** Verifica se números estão no WhatsApp. `POST /contacts/check` */
  contactsCheck(params: ContactsCheckParams): Promise<ContactList> {
    return this.post("/contacts/check", params);
  }

  // -------------------------------------------------------------------------
  // Contatos (base capturada das conversas — compartilhada na conta)
  // -------------------------------------------------------------------------

  /** Lista a base de contatos da conta (filtro opcional por projeto). `GET /contacts` */
  listContacts(params: ListContactsParams = {}): Promise<ContactRecordList> {
    return this.get("/contacts", {
      search: params.search,
      project_id: params.project_id,
      limit: params.limit,
    });
  }

  // -------------------------------------------------------------------------
  // Projetos (números, inbox, keys e stats são isolados por projeto)
  // -------------------------------------------------------------------------

  /** Lista os projetos da conta. `GET /projects` */
  listProjects(): Promise<ProjectList> {
    return this.get("/projects");
  }

  /** Cria um projeto (admin). `POST /projects` */
  createProject(params: CreateProjectParams): Promise<Project> {
    return this.post("/projects", params);
  }

  // -------------------------------------------------------------------------
  // Identidade dos números (kit de marca — do projeto)
  // -------------------------------------------------------------------------

  /** Lê a identidade dos números do projeto. `GET /brand` */
  getBrand(): Promise<BrandProfile> {
    return this.get("/brand");
  }

  /** Atualiza a identidade dos números do projeto. `PUT /brand` */
  setBrand(params: BrandProfile): Promise<BrandProfile> {
    return this.put("/brand", params);
  }

  /** Aplica o "Sobre" a todos os números conectados do projeto. `POST /brand/apply` */
  applyBrand(): Promise<BrandApplyResult> {
    return this.post("/brand/apply");
  }

  // -------------------------------------------------------------------------
  // Conta: usuários e consumo (admin)
  // -------------------------------------------------------------------------

  /** Lista os usuários da conta. `GET /users` */
  listUsers(): Promise<AccountUserList> {
    return this.get("/users");
  }

  /** Convida um usuário (admin). `POST /users` */
  inviteUser(params: InviteUserParams): Promise<AccountUser> {
    return this.post("/users", params);
  }

  /** Troca o papel de um usuário (admin). `PATCH /users/{id}` */
  updateUserRole(id: string, params: UpdateUserRoleParams): Promise<void> {
    return this.patch(`/users/${encodeURIComponent(id)}`, params);
  }

  /** Remove um usuário da conta (admin). `DELETE /users/{id}` */
  removeUser(id: string): Promise<void> {
    return this.delete(`/users/${encodeURIComponent(id)}`);
  }

  /** Consumo agregado da conta + por projeto (admin). `GET /account/usage` */
  getAccountUsage(params: GetUsageParams = {}): Promise<AccountUsage> {
    return this.get("/account/usage", { from: params.from, to: params.to });
  }

  // -------------------------------------------------------------------------
  // Webhooks
  // -------------------------------------------------------------------------

  /** Lista os webhooks do projeto. `GET /webhooks` */
  listWebhooks(): Promise<WebhookList> {
    return this.get("/webhooks");
  }

  /**
   * Cria um webhook. `POST /webhooks`
   *
   * Omita `secret` para a API gerar um forte e devolvê-lo UMA vez (em `secret`).
   * Cada evento só pode pertencer a um webhook (erro 409 em conflito).
   */
  createWebhook(params: CreateWebhookParams): Promise<Webhook & { secret?: string }> {
    return this.post("/webhooks", params);
  }

  /** Edita/pausa um webhook. `secret: "regenerate"` rotaciona o segredo. `PATCH /webhooks/{id}` */
  updateWebhook(id: string, params: CreateWebhookParams & { active?: boolean }): Promise<Webhook & { secret?: string }> {
    return this.patch(`/webhooks/${id}`, params);
  }

  /** Remove um webhook. `DELETE /webhooks/{id}` */
  deleteWebhook(id: string): Promise<void> {
    return this.delete(`/webhooks/${id}`);
  }

  /** Envia um evento de teste e devolve o status HTTP da resposta. `POST /webhooks/{id}/test` */
  testWebhook(id: string, eventType?: string): Promise<WebhookTestResult> {
    return this.post(`/webhooks/${id}/test`, { event_type: eventType });
  }

  /** Histórico de entregas recentes do webhook. `GET /webhooks/{id}/deliveries` */
  webhookDeliveries(id: string, limit?: number): Promise<WebhookDeliveryList> {
    return this.get(`/webhooks/${id}/deliveries`, { limit });
  }

  /** Dispara um evento de teste no stream do projeto (relay). `POST /webhooks/trigger` */
  triggerWebhook(eventType?: string): Promise<{ event_id: string; event_type: string }> {
    return this.post("/webhooks/trigger", { event_type: eventType });
  }

  // -------------------------------------------------------------------------
  // Internos
  // -------------------------------------------------------------------------

  private get<T>(path: string, query?: Query): Promise<T> {
    return this.request<T>("GET", path, undefined, query);
  }

  private post<T>(path: string, body?: unknown, query?: Query): Promise<T> {
    return this.request<T>("POST", path, body, query);
  }

  private put<T>(path: string, body?: unknown, query?: Query): Promise<T> {
    return this.request<T>("PUT", path, body, query);
  }

  private patch<T>(path: string, body?: unknown, query?: Query): Promise<T> {
    return this.request<T>("PATCH", path, body, query);
  }

  private delete<T>(path: string, query?: Query): Promise<T> {
    return this.request<T>("DELETE", path, undefined, query);
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    query?: Query,
  ): Promise<T> {
    const url = this.buildUrl(path, query);

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: "application/json",
    };
    if (this.locale) headers["Accept-Language"] = this.locale;
    if (body !== undefined) headers["Content-Type"] = "application/json";

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new BzapperError({
          code: "timeout",
          message: `Requisição expirou após ${this.timeout}ms.`,
          statusCode: 0,
        });
      }
      throw new BzapperError({
        code: "network_error",
        message: err instanceof Error ? err.message : "Falha de rede.",
        statusCode: 0,
      });
    } finally {
      clearTimeout(timer);
    }

    return this.parse<T>(res);
  }

  private buildUrl(path: string, query?: Query): string {
    const url = new URL(this.baseUrl + path);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }

  private async parse<T>(res: Response): Promise<T> {
    const text = await res.text();

    if (!res.ok) {
      let parsed: Partial<ApiErrorBody> = {};
      try {
        parsed = text ? (JSON.parse(text) as ApiErrorBody) : {};
      } catch {
        // corpo não-JSON: usa fallback abaixo.
      }
      throw new BzapperError({
        code: parsed.code ?? "http_error",
        message: parsed.message ?? res.statusText ?? "Erro HTTP.",
        statusCode: res.status,
        locale: parsed.locale,
      });
    }

    // 204 No Content e corpos vazios.
    if (!text) return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      return undefined as T;
    }
  }
}

/** Factory equivalente a `new Bzapper(options)`. */
export function createClient(options: BzapperOptions): Bzapper {
  return new Bzapper(options);
}
