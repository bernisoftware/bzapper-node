import {
  DEFAULT_BASE_URL,
  HttpTransport,
  encodePath as p,
  type FileUpload,
  type Query,
  type RequestOptions,
  type SleepFn,
} from "./http.js";
import type {
  AccountUsage,
  AdvisoryList,
  AccountUser,
  AccountUserList,
  ApiKeyCreated,
  ApiKeyList,
  ApiKeyRotated,
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
  ListInstancesParams,
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
  SendOptions,
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
  PartnerConnectionList,
  // r2
  AccountUpdated,
  AddonCart,
  ApplyChatLabelParams,
  BillingConfig,
  CampaignEligibility,
  CampaignEligibilityParams,
  ChangeAddonParams,
  CheckoutAddonCartParams,
  CheckoutResult,
  ConnectOfficialAccountParams,
  ContactHistoryList,
  ContactImportResult,
  ContactNoteParams,
  ContactRecord,
  CreateContactParams,
  CreateLabelParams,
  CreatePoolParams,
  CreateSuppressionParams,
  CreateTaxonParams,
  EditMessageParams,
  ExportContactsParams,
  ImportContactsParams,
  Entitlements,
  ForwardMessageParams,
  GroupInviteParams,
  Health,
  InboundFilters,
  InstanceParams,
  InvoiceList,
  Label,
  LabelList,
  LimitParams,
  LogoUploaded,
  MarkReadParams,
  MediaUploaded,
  Me,
  OfferCallParams,
  OfficialAccount,
  PayInvoiceResult,
  PlanSummary,
  Pool,
  PoolList,
  Pricing,
  ProjectHealthList,
  RejectCallParams,
  RevokeMessageParams,
  RotateKeyParams,
  SetPrivacyParams,
  SetProxyParams,
  SuppressionList,
  TaxonList,
  TaxonMutationParams,
  TaxonRef,
  UpdateAccountParams,
  UpdateContactParams,
  UpdateGroupParams,
  UpdateJoinRequestsParams,
  UpdateProfileParams,
  UpdateProjectParams,
  Blocklist,
  CallOffered,
  CampaignStatusChange,
  GroupJoined,
  JoinRequestList,
  ProfileUpdated,
  WAMessageRef,
} from "./types.js";

/** URL base padrão da API (produção). Sobrescreva só em dev/self-host. */
export { DEFAULT_BASE_URL };

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
  /**
   * Novas tentativas além da primeira (erro de rede/timeout, 429, 502, 503, 504).
   * Default 2. `0` desliga.
   */
  maxRetries?: number;
  /** Enviado como `X-Project-Id` (escopo de projeto; a chave já traz o dela). */
  projectId?: string;
  /** Espera entre tentativas (substituível em testes). Default: `setTimeout`. */
  sleep?: SleepFn;
}

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
  private readonly http: HttpTransport;

  constructor(options: BzapperOptions) {
    if (!options?.apiKey) throw new Error("Bzapper: `apiKey` é obrigatório.");

    this.http = new HttpTransport({
      label: "Bzapper",
      token: options.apiKey,
      baseUrl: options.baseUrl,
      locale: options.locale,
      timeout: options.timeout,
      fetch: options.fetch,
      maxRetries: options.maxRetries,
      projectId: options.projectId,
      sleep: options.sleep,
    });
  }

  // -------------------------------------------------------------------------
  // Mensagens
  // -------------------------------------------------------------------------

  /** Envia mensagem de texto. `POST /messages/text` */
  async sendText(params: SendTextParams, options?: SendOptions): Promise<MessageQueued> {
    return this.send("/messages/text", params, options);
  }

  /**
   * Envia um código OTP. `POST /messages/otp`
   *
   * Manda DUAS mensagens (texto de contexto + código sozinho), para que o
   * destinatário copie o código em qualquer aparelho. Conta como 1 envio.
   * Sem `body`, a API gera o texto no idioma da conta, com variações.
   */
  async sendOTP(params: SendOTPParams, options?: SendOptions): Promise<MessageQueued> {
    return this.send("/messages/otp", params, options);
  }

  /** Envia imagem (url ou base64). `POST /messages/image` */
  async sendImage(params: SendMediaParams, options?: SendOptions): Promise<MessageQueued> {
    return this.send("/messages/image", params, options);
  }

  /** Envia vídeo. `POST /messages/video` */
  async sendVideo(params: SendMediaParams, options?: SendOptions): Promise<MessageQueued> {
    return this.send("/messages/video", params, options);
  }

  /** Envia documento. `POST /messages/document` */
  async sendDocument(params: SendMediaParams, options?: SendOptions): Promise<MessageQueued> {
    return this.send("/messages/document", params, options);
  }

  /** Envia áudio (use `media.ptt=true` para nota de voz). `POST /messages/audio` */
  async sendAudio(params: SendMediaParams, options?: SendOptions): Promise<MessageQueued> {
    return this.send("/messages/audio", params, options);
  }

  /** Envia sticker. `POST /messages/sticker` */
  async sendSticker(params: SendMediaParams, options?: SendOptions): Promise<MessageQueued> {
    return this.send("/messages/sticker", params, options);
  }

  /** Envia localização. `POST /messages/location` */
  async sendLocation(params: SendLocationParams, options?: SendOptions): Promise<MessageQueued> {
    return this.send("/messages/location", params, options);
  }

  /** Envia contato (vCard). `POST /messages/contact` */
  async sendContact(params: SendContactParams, options?: SendOptions): Promise<MessageQueued> {
    return this.send("/messages/contact", params, options);
  }

  /** Envia enquete. `POST /messages/poll` */
  async sendPoll(params: SendPollParams, options?: SendOptions): Promise<MessageQueued> {
    return this.send("/messages/poll", params, options);
  }

  /** Reage a uma mensagem (requer `quoted_message_id`). `POST /messages/reaction` */
  async sendReaction(params: SendReactionParams, options?: SendOptions): Promise<MessageQueued> {
    return this.send("/messages/reaction", params, options);
  }

  /**
   * Envia botões. `POST /messages/buttons`
   *
   * Caveat: botões não são confiáveis no WhatsApp (pior em grupo). A API
   * **sempre** envia um menu de texto numerado equivalente como fallback.
   */
  async sendButtons(params: SendButtonsParams, options?: SendOptions): Promise<MessageQueued> {
    return this.send("/messages/buttons", params, options);
  }

  /**
   * Envia lista. `POST /messages/list`
   *
   * Caveat: pode cair para menu de texto numerado do lado do WhatsApp.
   */
  async sendList(params: SendListParams, options?: SendOptions): Promise<MessageQueued> {
    return this.send("/messages/list", params, options);
  }

  /** Edita o texto de uma mensagem enviada. `PATCH /messages/{id}` */
  async editMessage(id: string, params: EditMessageParams, options?: RequestOptions): Promise<WAMessageRef> {
    return this.patch(`/messages/${p(id)}`, params, undefined, options);
  }

  /** Apaga uma mensagem (para todos com `for_everyone`). `DELETE /messages/{id}` */
  async revokeMessage(id: string, params: RevokeMessageParams = {}, options?: RequestOptions): Promise<void> {
    return this.delete(`/messages/${p(id)}`, { for_everyone: params.for_everyone }, options);
  }

  /** Encaminha uma mensagem (experimental). `POST /messages/forward` */
  async forwardMessage(params: ForwardMessageParams, options?: RequestOptions): Promise<WAMessageRef> {
    return this.post("/messages/forward", params, undefined, options);
  }

  /** Marca mensagens como lidas. `POST /messages/{id}/read` */
  async markRead(id: string, params: MarkReadParams, options?: RequestOptions): Promise<void> {
    return this.post(`/messages/${p(id)}/read`, params, undefined, options);
  }

  // -------------------------------------------------------------------------
  // Envio agendado (scheduled_at em qualquer envio)
  // -------------------------------------------------------------------------

  /** Lista os agendamentos pendentes/recentes. `GET /messages/scheduled` */
  async listScheduled(params: LimitParams = {}, options?: RequestOptions): Promise<{ data: Scheduled[] }> {
    return this.get("/messages/scheduled", { limit: params.limit }, options);
  }

  /** Cancela um agendamento ainda pendente. `DELETE /messages/scheduled/{id}` */
  async cancelScheduled(id: string, options?: RequestOptions): Promise<void> {
    return this.delete(`/messages/scheduled/${p(id)}`, undefined, options);
  }

  // -------------------------------------------------------------------------
  // Campanhas (Pro + add-on de campanhas)
  // -------------------------------------------------------------------------

  /** Cria uma campanha (com variações). `POST /campaigns` */
  async createCampaign(params: CampaignCreateParams, options?: RequestOptions): Promise<Campaign> {
    return this.post("/campaigns", params, undefined, options);
  }

  /** Lista as campanhas do projeto. `GET /campaigns` */
  async listCampaigns(params: LimitParams = {}, options?: RequestOptions): Promise<{ data: Campaign[] }> {
    return this.get("/campaigns", { limit: params.limit }, options);
  }

  /** Campanha + estatísticas. `GET /campaigns/{id}` */
  async getCampaign(id: string, options?: RequestOptions): Promise<{ campaign: Campaign; stats: CampaignStats }> {
    return this.get(`/campaigns/${p(id)}`, undefined, options);
  }

  /** Adiciona destinatários (array `recipients` ou mapa `contacts`). `POST /campaigns/{id}/recipients` */
  async addCampaignRecipients(
    id: string,
    params: CampaignRecipientsParams,
    options?: RequestOptions,
  ): Promise<AddRecipientsResult> {
    return this.post(`/campaigns/${p(id)}/recipients`, params, undefined, options);
  }

  /** Lista destinatários. `GET /campaigns/{id}/recipients` */
  async listCampaignRecipients(
    id: string,
    params: LimitParams = {},
    options?: RequestOptions,
  ): Promise<{ data: CampaignRecipient[] }> {
    return this.get(`/campaigns/${p(id)}/recipients`, { limit: params.limit }, options);
  }

  /** Inicia (ou agenda) a campanha. `POST /campaigns/{id}/start` */
  async startCampaign(
    id: string,
    options?: RequestOptions,
  ): Promise<{ id: string; status: string; start_at?: string; waiting?: string; starts_at?: string }> {
    return this.post(`/campaigns/${p(id)}/start`, undefined, undefined, options);
  }

  /** Pausa a campanha. `POST /campaigns/{id}/pause` */
  async pauseCampaign(id: string, options?: RequestOptions): Promise<CampaignStatusChange> {
    return this.post(`/campaigns/${p(id)}/pause`, undefined, undefined, options);
  }

  /** Retoma a campanha. `POST /campaigns/{id}/resume` */
  async resumeCampaign(id: string, options?: RequestOptions): Promise<CampaignStatusChange> {
    return this.post(`/campaigns/${p(id)}/resume`, undefined, undefined, options);
  }

  /** Cancela a campanha. `POST /campaigns/{id}/cancel` */
  async cancelCampaign(id: string, options?: RequestOptions): Promise<CampaignStatusChange> {
    return this.post(`/campaigns/${p(id)}/cancel`, undefined, undefined, options);
  }

  /** Simula a campanha sem disparar (números, duração estimada, avisos). `POST /campaigns/{id}/dry-run` */
  async dryRunCampaign(id: string, options?: RequestOptions): Promise<CampaignDryRun> {
    return this.post(`/campaigns/${p(id)}/dry-run`, undefined, undefined, options);
  }

  /** Edita uma campanha ainda não iniciada (rascunho/agendada); substitui as variações quando enviadas. `PATCH /campaigns/{id}` */
  async updateCampaign(id: string, params: CampaignCreateParams, options?: RequestOptions): Promise<Campaign> {
    return this.patch(`/campaigns/${p(id)}`, params, undefined, options);
  }

  /** Estimativa ao vivo (números elegíveis + duração) para N destinatários, sem criar a campanha. `GET /campaigns/estimate` */
  async estimateCampaign(params: EstimateCampaignParams = {}, options?: RequestOptions): Promise<CampaignEstimate> {
    return this.get(
      "/campaigns/estimate",
      {
        recipients: params.recipients,
        pacing: params.pacing,
        pool_id: params.pool_id,
      },
      options,
    );
  }

  /** Elegibilidade de cada número para campanhas (conexão + aquecimento). `GET /campaigns/eligibility` */
  async getCampaignEligibility(
    params: CampaignEligibilityParams = {},
    options?: RequestOptions,
  ): Promise<CampaignEligibility> {
    return this.get("/campaigns/eligibility", { pool_id: params.pool_id }, options);
  }

  /** Envia a imagem de cabeçalho da campanha (multipart). `POST /campaigns/media` */
  async uploadCampaignMedia(file: FileUpload, options?: RequestOptions): Promise<MediaUploaded> {
    return this.http.call({ method: "POST", path: "/campaigns/media", file }, options);
  }

  // -------------------------------------------------------------------------
  // Pools de números (rotação)
  // -------------------------------------------------------------------------

  /** Lista os pools da conta. `GET /pools` */
  async listPools(options?: RequestOptions): Promise<PoolList> {
    return this.get("/pools", undefined, options);
  }

  /** Cria um pool de números. `POST /pools` */
  async createPool(params: CreatePoolParams, options?: RequestOptions): Promise<Pool> {
    return this.post("/pools", params, undefined, options);
  }

  /** Detalha um pool (com membros). `GET /pools/{id}` */
  async getPool(id: string, options?: RequestOptions): Promise<Pool> {
    return this.get(`/pools/${p(id)}`, undefined, options);
  }

  /** Adiciona um número ao pool. `POST /pools/{id}/numbers` */
  async addPoolNumber(id: string, params: InstanceParams, options?: RequestOptions): Promise<void> {
    return this.post(`/pools/${p(id)}/numbers`, params, undefined, options);
  }

  // -------------------------------------------------------------------------
  // Instâncias (números)
  // -------------------------------------------------------------------------

  /**
   * Lista instâncias (números) do tenant. `GET /instances`
   *
   * Passe `project_id` para escopar por projeto (um id ou `"all"`); sem
   * argumento, usa o projeto ativo. `archived: "1"` lista os arquivados.
   */
  async listInstances(params: ListInstancesParams = {}, options?: RequestOptions): Promise<InstanceList> {
    return this.get("/instances", { project_id: params.project_id, archived: params.archived }, options);
  }

  /** Cria uma instância. `POST /instances` */
  async createInstance(params: CreateInstanceParams, options?: RequestOptions): Promise<Instance> {
    return this.post("/instances", params, undefined, options);
  }

  /** Detalha uma instância. `GET /instances/{id}` */
  async getInstance(id: string, options?: RequestOptions): Promise<Instance> {
    return this.get(`/instances/${p(id)}`, undefined, options);
  }

  /** Remove uma instância (encerra a sessão). `DELETE /instances/{id}` */
  async deleteInstance(id: string, options?: RequestOptions): Promise<void> {
    return this.delete(`/instances/${p(id)}`, undefined, options);
  }

  /**
   * Conecta a instância por QR ou código de pareamento.
   * `POST /instances/{id}/connect?method=qr|code`
   */
  async connectInstance(id: string, method: ConnectMethod = "qr", options?: RequestOptions): Promise<ConnectResult> {
    return this.post(`/instances/${p(id)}/connect`, undefined, { method }, options);
  }

  /** Desconecta (reconectável). `POST /instances/{id}/disconnect` */
  async disconnectInstance(id: string, options?: RequestOptions): Promise<void> {
    return this.post(`/instances/${p(id)}/disconnect`, undefined, undefined, options);
  }

  /** Logout (exige novo QR depois). `POST /instances/{id}/logout` */
  async logoutInstance(id: string, options?: RequestOptions): Promise<void> {
    return this.post(`/instances/${p(id)}/logout`, undefined, undefined, options);
  }

  /**
   * Apaga a credencial do dispositivo pareado, forçando um novo pareamento
   * limpo. Use quando o `connectInstance` não emite QR ou o pareamento travou:
   * o logout comum só desreferencia e deixa o dispositivo antigo para trás.
   *
   * Destrutivo e irreversível — o número fica offline e precisa escanear o QR
   * de novo. É idempotente e pode ser repetido com segurança.
   *
   * `POST /instances/{id}/clear-session`
   */
  async clearInstanceSession(id: string, options?: RequestOptions): Promise<void> {
    return this.post(`/instances/${p(id)}/clear-session`, undefined, undefined, options);
  }

  /** Arquiva (desativa) um número, mantendo o histórico. `POST /instances/{id}/archive` */
  async archiveInstance(id: string, options?: RequestOptions): Promise<void> {
    return this.post(`/instances/${p(id)}/archive`, undefined, undefined, options);
  }

  /** Reativa um número arquivado (volta desconectado). `POST /instances/{id}/unarchive` */
  async unarchiveInstance(id: string, options?: RequestOptions): Promise<void> {
    return this.post(`/instances/${p(id)}/unarchive`, undefined, undefined, options);
  }

  /** Define o proxy do número (isolamento de rede/IP). `PATCH /instances/{id}/proxy` */
  async setInstanceProxy(id: string, params: SetProxyParams, options?: RequestOptions): Promise<void> {
    return this.patch(`/instances/${p(id)}/proxy`, params, undefined, options);
  }

  /** Define os filtros de entrada (broadcast/status/grupos). `PATCH /instances/{id}/inbound-filters` */
  async setInboundFilters(id: string, params: InboundFilters, options?: RequestOptions): Promise<InboundFilters> {
    return this.patch(`/instances/${p(id)}/inbound-filters`, params, undefined, options);
  }

  /** Define uma configuração de privacidade do número. `PATCH /instances/{id}/privacy` */
  async setPrivacy(id: string, params: SetPrivacyParams, options?: RequestOptions): Promise<void> {
    return this.patch(`/instances/${p(id)}/privacy`, params, undefined, options);
  }

  /** Verifica a saúde da API. `GET /healthz` */
  async getHealth(options?: RequestOptions): Promise<Health> {
    return this.get("/healthz", undefined, options);
  }

  // -------------------------------------------------------------------------
  // API oficial (WhatsApp Cloud API)
  // -------------------------------------------------------------------------

  /** Conta WhatsApp Business conectada ao projeto. `GET /official/account` */
  async getOfficialAccount(options?: RequestOptions): Promise<OfficialAccount> {
    return this.get("/official/account", undefined, options);
  }

  /** Conecta uma conta WhatsApp Business (credenciais manuais). `POST /official/account` */
  async connectOfficialAccount(params: ConnectOfficialAccountParams, options?: RequestOptions): Promise<OfficialAccount> {
    return this.post("/official/account", params, undefined, options);
  }

  /** Desconecta a conta WhatsApp Business do projeto. `DELETE /official/account` */
  async disconnectOfficialAccount(options?: RequestOptions): Promise<void> {
    return this.delete("/official/account", undefined, options);
  }

  // -------------------------------------------------------------------------
  // API keys (self-serve)
  // -------------------------------------------------------------------------

  /** Lista as API keys do tenant (sem a chave crua). `GET /keys` (operationId `listMyKeys`) */
  async listKeys(options?: RequestOptions): Promise<ApiKeyList> {
    return this.get("/keys", undefined, options);
  }

  /** Gera uma API key (a chave crua é mostrada uma única vez). `POST /keys` (operationId `createMyKey`) */
  async createKey(params: CreateKeyParams, options?: RequestOptions): Promise<ApiKeyCreated> {
    return this.post("/keys", params, undefined, options);
  }

  /** Revoga uma API key do tenant. `DELETE /keys/{id}` (operationId `revokeMyKey`) */
  async revokeKey(id: string, options?: RequestOptions): Promise<void> {
    return this.delete(`/keys/${p(id)}`, undefined, options);
  }

  /**
   * Rotaciona uma API key do tenant (admin). `POST /keys/{id}/rotate`
   * (operationId `rotateMyKey`)
   *
   * Cria uma chave NOVA herdando papel, escopos, projeto e nome da antiga, e
   * mantém a ANTIGA funcionando por um período de carência — assim a
   * integração que está rodando não quebra no meio do deploy. A chave crua vem
   * em `api_key` e é mostrada UMA única vez. Depois do prazo, a antiga responde
   * `401 key_expired`.
   *
   * Erros: `403 admin_required`, `404 not_found`, `409 key_already_revoked` /
   * `key_already_expired`. Chaves de parceiro (bZapper Connect) rotacionam pelo
   * {@link BzapperPartner.rotateConnectionKey}.
   *
   * @example
   * ```ts
   * // 1h de carência: sobe a nova, troca o segredo, e a antiga morre sozinha.
   * const { api_key, old_key_expires_at } = await bz.rotateKey(keyId, { revoke_in_seconds: 3600 });
   * ```
   */
  async rotateKey(id: string, params?: RotateKeyParams, options?: RequestOptions): Promise<ApiKeyRotated> {
    return this.post(`/keys/${p(id)}/rotate`, params, undefined, options);
  }

  // -------------------------------------------------------------------------
  // Uso
  // -------------------------------------------------------------------------

  /** Resumo de uso do tenant (por período). `GET /usage` */
  async getUsage(params: GetUsageParams = {}, options?: RequestOptions): Promise<UsageSummary> {
    return this.get("/usage", { from: params.from, to: params.to }, options);
  }

  /**
   * Atualiza o perfil do número (white-label).
   * `PATCH /instances/{id}/profile`
   *
   * Caveat: `status_message` é confiável; `display_name`/`picture` são
   * experimentais (podem retornar 501 conforme o servidor).
   */
  async setProfile(id: string, params: SetProfileParams, options?: RequestOptions): Promise<void> {
    return this.patch(`/instances/${p(id)}/profile`, params, undefined, options);
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
  async presenceChat(params: PresenceChatParams, options?: RequestOptions): Promise<void> {
    return this.post("/presence/chat", params, undefined, options);
  }

  // -------------------------------------------------------------------------
  // Conversas
  // -------------------------------------------------------------------------

  /** Lista os threads (inbox) de uma instância. `GET /conversations?instance_id=` */
  async listConversations(instanceId: string, options?: RequestOptions): Promise<ConversationList> {
    return this.get("/conversations", { instance_id: instanceId }, options);
  }

  /**
   * Histórico paginado de um chat (mais recentes primeiro).
   * `GET /conversations/{jid}/messages?instance_id=&before=&limit=`
   */
  async conversationHistory(
    jid: string,
    params: ConversationHistoryParams,
    options?: RequestOptions,
  ): Promise<MessageList> {
    return this.get(
      `/conversations/${p(jid, "jid")}/messages`,
      {
        instance_id: params.instance_id,
        before: params.before,
        limit: params.limit,
      },
      options,
    );
  }

  /** Arquiva/desarquiva um chat. `POST /chats/{jid}/archive` */
  async archiveChat(jid: string, params: ChatActionParams, options?: RequestOptions): Promise<void> {
    return this.post(`/chats/${p(jid, "jid")}/archive`, params, undefined, options);
  }

  /** Fixa/desafixa um chat. `POST /chats/{jid}/pin` */
  async pinChat(jid: string, params: ChatActionParams, options?: RequestOptions): Promise<void> {
    return this.post(`/chats/${p(jid, "jid")}/pin`, params, undefined, options);
  }

  /** Marca um chat lido/não-lido. `POST /chats/{jid}/read` */
  async markChat(jid: string, params: ChatActionParams, options?: RequestOptions): Promise<void> {
    return this.post(`/chats/${p(jid, "jid")}/read`, params, undefined, options);
  }

  /** Silencia/reativa um chat. `POST /chats/{jid}/mute` */
  async muteChat(jid: string, params: ChatActionParams, options?: RequestOptions): Promise<void> {
    return this.post(`/chats/${p(jid, "jid")}/mute`, params, undefined, options);
  }

  /** Aplica/remove uma etiqueta num chat (experimental). `POST /chats/{jid}/labels` */
  async applyChatLabel(jid: string, params: ApplyChatLabelParams, options?: RequestOptions): Promise<void> {
    return this.post(`/chats/${p(jid, "jid")}/labels`, params, undefined, options);
  }

  // -------------------------------------------------------------------------
  // Etiquetas, bloqueio e chamadas
  // -------------------------------------------------------------------------

  /** Lista as etiquetas do número (experimental). `GET /labels?instance_id=` */
  async listLabels(instanceId: string, options?: RequestOptions): Promise<LabelList> {
    return this.get("/labels", { instance_id: instanceId }, options);
  }

  /** Cria uma etiqueta (experimental). `POST /labels` */
  async createLabel(params: CreateLabelParams, options?: RequestOptions): Promise<Label> {
    return this.post("/labels", params, undefined, options);
  }

  /** Apaga uma etiqueta (experimental). `DELETE /labels/{id}?instance_id=` */
  async deleteLabel(id: string, instanceId: string, options?: RequestOptions): Promise<void> {
    return this.delete(`/labels/${p(id)}`, { instance_id: instanceId }, options);
  }

  /** Bloqueia um contato. `POST /contacts/{jid}/block` */
  async blockContact(jid: string, params: InstanceParams, options?: RequestOptions): Promise<void> {
    return this.post(`/contacts/${p(jid, "jid")}/block`, params, undefined, options);
  }

  /** Desbloqueia um contato. `POST /contacts/{jid}/unblock` */
  async unblockContact(jid: string, params: InstanceParams, options?: RequestOptions): Promise<void> {
    return this.post(`/contacts/${p(jid, "jid")}/unblock`, params, undefined, options);
  }

  /** Lista os contatos bloqueados. `GET /blocklist?instance_id=` */
  async getBlocklist(instanceId: string, options?: RequestOptions): Promise<Blocklist> {
    return this.get("/blocklist", { instance_id: instanceId }, options);
  }

  /** Rejeita uma chamada. `POST /calls/reject` */
  async rejectCall(params: RejectCallParams, options?: RequestOptions): Promise<void> {
    return this.post("/calls/reject", params, undefined, options);
  }

  /** Inicia uma chamada (experimental). `POST /calls/offer` */
  async offerCall(params: OfferCallParams, options?: RequestOptions): Promise<CallOffered> {
    return this.post("/calls/offer", params, undefined, options);
  }

  // -------------------------------------------------------------------------
  // Grupos
  // -------------------------------------------------------------------------

  /** Lista os grupos do número. `GET /groups?instance_id=` */
  async listGroups(instanceId: string, options?: RequestOptions): Promise<GroupList> {
    return this.get("/groups", { instance_id: instanceId }, options);
  }

  /** Cria um grupo. `POST /groups?instance_id=` */
  async createGroup(instanceId: string, params: CreateGroupParams, options?: RequestOptions): Promise<Group> {
    return this.post("/groups", params, { instance_id: instanceId }, options);
  }

  /** Info do grupo. `GET /groups/{jid}?instance_id=` */
  async getGroup(jid: string, instanceId: string, options?: RequestOptions): Promise<Group> {
    return this.get(`/groups/${p(jid, "jid")}`, { instance_id: instanceId }, options);
  }

  /** Altera nome/descrição/configurações do grupo. `PATCH /groups/{jid}?instance_id=` */
  async updateGroup(jid: string, instanceId: string, params: UpdateGroupParams, options?: RequestOptions): Promise<void> {
    return this.patch(`/groups/${p(jid, "jid")}`, params, { instance_id: instanceId }, options);
  }

  /** Entra num grupo por link/código de convite. `POST /groups/join?instance_id=` */
  async joinGroup(instanceId: string, params: JoinGroupParams, options?: RequestOptions): Promise<GroupJoined> {
    return this.post("/groups/join", params, { instance_id: instanceId }, options);
  }

  /**
   * Mostra o grupo de um convite (nome, descrição, tamanho) SEM entrar — para
   * confirmar antes de colocar o número num grupo de terceiros.
   * `POST /groups/join/preview?instance_id=`
   */
  async previewGroupInvite(instanceId: string, params: JoinGroupParams, options?: RequestOptions): Promise<Group> {
    return this.post("/groups/join/preview", params, { instance_id: instanceId }, options);
  }

  /**
   * Adiciona/remove/promove/rebaixa participantes.
   * `POST /groups/{jid}/participants?instance_id=`
   */
  async updateGroupParticipants(
    jid: string,
    instanceId: string,
    params: UpdateGroupParticipantsParams,
    options?: RequestOptions,
  ): Promise<void> {
    return this.post(`/groups/${p(jid, "jid")}/participants`, params, { instance_id: instanceId }, options);
  }

  /** Sai do grupo. `POST /groups/{jid}/leave?instance_id=` */
  async leaveGroup(jid: string, instanceId: string, options?: RequestOptions): Promise<void> {
    return this.post(`/groups/${p(jid, "jid")}/leave`, undefined, { instance_id: instanceId }, options);
  }

  /**
   * Link de convite do grupo (`reset: true` gera um novo).
   * `GET /groups/{jid}/invite?instance_id=&reset=` (operationId `groupInviteLink`)
   */
  async groupInvite(
    jid: string,
    instanceId: string,
    params: GroupInviteParams = {},
    options?: RequestOptions,
  ): Promise<GroupInvite> {
    return this.get(`/groups/${p(jid, "jid")}/invite`, { instance_id: instanceId, reset: params.reset }, options);
  }

  /** Pedidos de entrada pendentes. `GET /groups/{jid}/join-requests?instance_id=` */
  async listJoinRequests(jid: string, instanceId: string, options?: RequestOptions): Promise<JoinRequestList> {
    return this.get(`/groups/${p(jid, "jid")}/join-requests`, { instance_id: instanceId }, options);
  }

  /** Aprova/rejeita pedidos de entrada. `POST /groups/{jid}/join-requests?instance_id=` */
  async updateJoinRequests(
    jid: string,
    instanceId: string,
    params: UpdateJoinRequestsParams,
    options?: RequestOptions,
  ): Promise<void> {
    return this.post(`/groups/${p(jid, "jid")}/join-requests`, params, { instance_id: instanceId }, options);
  }

  // -------------------------------------------------------------------------
  // Contatos
  // -------------------------------------------------------------------------

  /** Verifica se números estão no WhatsApp. `POST /contacts/check` */
  async contactsCheck(params: ContactsCheckParams, options?: RequestOptions): Promise<ContactList> {
    return this.post("/contacts/check", params, undefined, options);
  }

  // -------------------------------------------------------------------------
  // Contatos (base/CRM — compartilhada na conta)
  // -------------------------------------------------------------------------

  /**
   * Lista a base de contatos da conta, com filtros. `GET /contacts`
   *
   * `tags`/`groups` vão como CSV; datas aceitam `Date` (vira ISO 8601 UTC).
   */
  async listContacts(params: ListContactsParams = {}, options?: RequestOptions): Promise<ContactRecordList> {
    return this.get("/contacts", { ...contactFilterQuery(params), offset: params.offset }, options);
  }

  /**
   * Importa contatos em lote (upsert por telefone). `POST /contacts/import`
   *
   * Até 1000 linhas por chamada. Contato novo nasce com `source: import` e
   * `status: pending_validation` (precisa de opt-in antes de campanha); no que
   * já existe, só os campos informados mudam — valor vazio nunca apaga o que
   * está lá. Supresso/opt-out/bloqueado aparece em `skipped_rows` e não
   * ressuscita. Tags e grupos são criados sob demanda. Linha ruim vai para
   * `errors` e NÃO derruba o resto do lote; `dry_run` valida sem escrever nada.
   *
   * Erros: `400 invalid_body` / `contacts_required`, `422 import_too_large`.
   *
   * @example
   * ```ts
   * const dry = await bz.importContacts({ contacts: rows, dry_run: true });
   * if (dry.failed === 0) await bz.importContacts({ contacts: rows });
   * ```
   */
  async importContacts(params: ImportContactsParams, options?: RequestOptions): Promise<ContactImportResult> {
    return this.post("/contacts/import", params, undefined, options);
  }

  /**
   * Exporta a base de contatos em **CSV**. `GET /contacts/export`
   *
   * Mesmos filtros de {@link listContacts} (sem `offset`; `limit` é o teto de
   * linhas). Devolve o **texto CSV cru** — colunas
   * `phone,name,email,status,source,tags,groups,created_at,last_activity_at`,
   * com tags/grupos unidos por `;` e datas RFC 3339 em UTC. É a única rota da
   * SDK que não responde JSON: grave direto num arquivo ou passe para o seu
   * parser de CSV.
   *
   * @example
   * ```ts
   * import { writeFile } from "node:fs/promises";
   * const csv = await bz.exportContacts({ tags: ["vip"], status: "active" });
   * await writeFile("contatos.csv", csv, "utf8");
   * ```
   */
  async exportContacts(params: ExportContactsParams = {}, options?: RequestOptions): Promise<string> {
    return this.http.call<string>(
      {
        method: "GET",
        path: "/contacts/export",
        query: contactFilterQuery(params),
        accept: "text",
        headers: { Accept: "text/csv" },
      },
      options,
    );
  }

  /** Cria um contato. `POST /contacts` */
  async createContact(params: CreateContactParams, options?: RequestOptions): Promise<ContactRecord> {
    return this.post("/contacts", params, undefined, options);
  }

  /** Detalha um contato. `GET /contacts/{id}` */
  async getContact(id: string, options?: RequestOptions): Promise<ContactRecord> {
    return this.get(`/contacts/${p(id)}`, undefined, options);
  }

  /** Atualiza um contato (só os campos enviados). `PATCH /contacts/{id}` */
  async updateContact(id: string, params: UpdateContactParams, options?: RequestOptions): Promise<ContactRecord> {
    return this.patch(`/contacts/${p(id)}`, params, undefined, options);
  }

  /** Apaga um contato. `DELETE /contacts/{id}` */
  async deleteContact(id: string, options?: RequestOptions): Promise<void> {
    return this.delete(`/contacts/${p(id)}`, undefined, options);
  }

  /** Linha do tempo do contato (mensagens + eventos). `GET /contacts/{id}/history` */
  async getContactHistory(id: string, params: LimitParams = {}, options?: RequestOptions): Promise<ContactHistoryList> {
    return this.get(`/contacts/${p(id)}/history`, { limit: params.limit }, options);
  }

  /** Adiciona uma nota interna ao contato. `POST /contacts/{id}/notes` */
  async addContactNote(id: string, params: ContactNoteParams, options?: RequestOptions): Promise<void> {
    return this.post(`/contacts/${p(id)}/notes`, params, undefined, options);
  }

  /** Adiciona/remove tags do contato. `POST /contacts/{id}/tags` */
  async mutateContactTags(id: string, params: TaxonMutationParams, options?: RequestOptions): Promise<ContactRecord> {
    return this.post(`/contacts/${p(id)}/tags`, params, undefined, options);
  }

  /** Adiciona/remove grupos de contato. `POST /contacts/{id}/groups` */
  async mutateContactGroups(id: string, params: TaxonMutationParams, options?: RequestOptions): Promise<ContactRecord> {
    return this.post(`/contacts/${p(id)}/groups`, params, undefined, options);
  }

  /** Opt-out do contato (LGPD). `POST /contacts/{id}/optout` */
  async optOutContact(id: string, options?: RequestOptions): Promise<ContactRecord> {
    return this.post(`/contacts/${p(id)}/optout`, undefined, undefined, options);
  }

  /** Suprime o contato manualmente. `POST /contacts/{id}/suppress` */
  async suppressContact(id: string, options?: RequestOptions): Promise<ContactRecord> {
    return this.post(`/contacts/${p(id)}/suppress`, undefined, undefined, options);
  }

  /** Opt-in de volta (remove a supressão). `POST /contacts/{id}/optin` */
  async optInContact(id: string, options?: RequestOptions): Promise<ContactRecord> {
    return this.post(`/contacts/${p(id)}/optin`, undefined, undefined, options);
  }

  /** Dicionário de tags. `GET /tags` */
  async listTags(options?: RequestOptions): Promise<TaxonList> {
    return this.get("/tags", undefined, options);
  }

  /** Cria uma tag. `POST /tags` */
  async createTag(params: CreateTaxonParams, options?: RequestOptions): Promise<TaxonRef> {
    return this.post("/tags", params, undefined, options);
  }

  /** Apaga uma tag. `DELETE /tags/{id}` */
  async deleteTag(id: string, options?: RequestOptions): Promise<void> {
    return this.delete(`/tags/${p(id)}`, undefined, options);
  }

  /** Dicionário de grupos de contato. `GET /contact-groups` */
  async listContactGroups(options?: RequestOptions): Promise<TaxonList> {
    return this.get("/contact-groups", undefined, options);
  }

  /** Cria um grupo de contato. `POST /contact-groups` */
  async createContactGroup(params: CreateTaxonParams, options?: RequestOptions): Promise<TaxonRef> {
    return this.post("/contact-groups", params, undefined, options);
  }

  /** Apaga um grupo de contato. `DELETE /contact-groups/{id}` */
  async deleteContactGroup(id: string, options?: RequestOptions): Promise<void> {
    return this.delete(`/contact-groups/${p(id)}`, undefined, options);
  }

  /** Lista de supressão. `GET /suppressions` */
  async listSuppressions(params: LimitParams = {}, options?: RequestOptions): Promise<SuppressionList> {
    return this.get("/suppressions", { limit: params.limit }, options);
  }

  /** Adiciona um número à lista de supressão. `POST /suppressions` */
  async createSuppression(params: CreateSuppressionParams, options?: RequestOptions): Promise<void> {
    return this.post("/suppressions", params, undefined, options);
  }

  /** Remove um número (`+DDIdigits`) da lista de supressão. `DELETE /suppressions?phone=` */
  async deleteSuppression(phone: string, options?: RequestOptions): Promise<void> {
    return this.delete("/suppressions", { phone }, options);
  }

  // -------------------------------------------------------------------------
  // Projetos (números, inbox, keys e stats são isolados por projeto)
  // -------------------------------------------------------------------------

  /** Lista os projetos da conta. `GET /projects` */
  async listProjects(options?: RequestOptions): Promise<ProjectList> {
    return this.get("/projects", undefined, options);
  }

  /** Cria um projeto (admin). `POST /projects` */
  async createProject(params: CreateProjectParams, options?: RequestOptions): Promise<Project> {
    return this.post("/projects", params, undefined, options);
  }

  /** Status dos números por projeto (semáforo). `GET /projects/health` */
  async getProjectsHealth(options?: RequestOptions): Promise<ProjectHealthList> {
    return this.get("/projects/health", undefined, options);
  }

  /** Atualiza um projeto (admin). `PATCH /projects/{id}` */
  async updateProject(id: string, params: UpdateProjectParams, options?: RequestOptions): Promise<void> {
    return this.patch(`/projects/${p(id)}`, params, undefined, options);
  }

  /** Apaga um projeto (admin). `DELETE /projects/{id}` */
  async deleteProject(id: string, options?: RequestOptions): Promise<void> {
    return this.delete(`/projects/${p(id)}`, undefined, options);
  }

  /** Identidade dos números de um projeto específico. `GET /projects/{id}/brand` */
  async getProjectBrand(id: string, options?: RequestOptions): Promise<BrandProfile> {
    return this.get(`/projects/${p(id)}/brand`, undefined, options);
  }

  /** Salva a identidade dos números de um projeto específico (admin). `PUT /projects/{id}/brand` */
  async setProjectBrand(id: string, params: BrandProfile, options?: RequestOptions): Promise<BrandProfile> {
    return this.put(`/projects/${p(id)}/brand`, params, undefined, options);
  }

  /** Envia o logo do projeto (multipart; PNG/JPEG/WebP até 5 MB) — admin. `POST /projects/{id}/logo` */
  async uploadProjectLogo(id: string, file: FileUpload, options?: RequestOptions): Promise<LogoUploaded> {
    return this.http.call({ method: "POST", path: `/projects/${p(id)}/logo`, file }, options);
  }

  // -------------------------------------------------------------------------
  // Identidade dos números (kit de marca — do projeto)
  // -------------------------------------------------------------------------

  /** Lê a identidade dos números do projeto. `GET /brand` */
  async getBrand(options?: RequestOptions): Promise<BrandProfile> {
    return this.get("/brand", undefined, options);
  }

  /** Atualiza a identidade dos números do projeto. `PUT /brand` */
  async setBrand(params: BrandProfile, options?: RequestOptions): Promise<BrandProfile> {
    return this.put("/brand", params, undefined, options);
  }

  /** Aplica o "Sobre" a todos os números conectados do projeto. `POST /brand/apply` */
  async applyBrand(options?: RequestOptions): Promise<BrandApplyResult> {
    return this.post("/brand/apply", undefined, undefined, options);
  }

  /** Envia o logo da marca (multipart). `POST /brand/logo` */
  async uploadBrandLogo(file: FileUpload, options?: RequestOptions): Promise<LogoUploaded> {
    return this.http.call({ method: "POST", path: "/brand/logo", file }, options);
  }

  // -------------------------------------------------------------------------
  // Conta: identidade, usuários e consumo
  // -------------------------------------------------------------------------

  /** Identidade autenticada (+ perfil quando é sessão de usuário). `GET /me` */
  async getMe(options?: RequestOptions): Promise<Me> {
    return this.get("/me", undefined, options);
  }

  /** Atualiza o perfil do usuário (nome/telefone/cargo/idioma). `PATCH /me` */
  async updateProfile(params: UpdateProfileParams, options?: RequestOptions): Promise<ProfileUpdated> {
    return this.patch("/me", params, undefined, options);
  }

  /** Renomeia a conta (nome da empresa) — admin. `PATCH /account` */
  async updateAccount(params: UpdateAccountParams, options?: RequestOptions): Promise<AccountUpdated> {
    return this.patch("/account", params, undefined, options);
  }

  /** Lista os usuários da conta. `GET /users` */
  async listUsers(options?: RequestOptions): Promise<AccountUserList> {
    return this.get("/users", undefined, options);
  }

  /** Convida um usuário (admin). `POST /users` */
  async inviteUser(params: InviteUserParams, options?: RequestOptions): Promise<AccountUser> {
    return this.post("/users", params, undefined, options);
  }

  /** Troca o papel de um usuário (admin). `PATCH /users/{id}` */
  async updateUserRole(id: string, params: UpdateUserRoleParams, options?: RequestOptions): Promise<void> {
    return this.patch(`/users/${p(id)}`, params, undefined, options);
  }

  /** Remove um usuário da conta (admin). `DELETE /users/{id}` */
  async removeUser(id: string, options?: RequestOptions): Promise<void> {
    return this.delete(`/users/${p(id)}`, undefined, options);
  }

  /** Consumo agregado da conta + por projeto (admin). `GET /account/usage` */
  async getAccountUsage(params: GetUsageParams = {}, options?: RequestOptions): Promise<AccountUsage> {
    return this.get("/account/usage", { from: params.from, to: params.to }, options);
  }

  // -------------------------------------------------------------------------
  // Plano, add-ons e faturas
  // -------------------------------------------------------------------------

  /** Limites efetivos da conta (plano + add-ons + uso). `GET /me/entitlements` */
  async getMyEntitlements(options?: RequestOptions): Promise<Entitlements> {
    return this.get("/me/entitlements", undefined, options);
  }

  /** Estado do plano/assinatura (`null` no Free). `GET /me/subscription` */
  async getMySubscription(options?: RequestOptions): Promise<PlanSummary | null> {
    return this.get("/me/subscription", undefined, options);
  }

  /** Põe o Pro no carrinho (vale depois de pagar). `POST /me/plan/upgrade` */
  async upgradePlan(options?: RequestOptions): Promise<AddonCart> {
    return this.post("/me/plan/upgrade", undefined, undefined, options);
  }

  /** Cancela o Pro no fim do ciclo. `POST /me/plan/cancel` */
  async cancelPlan(options?: RequestOptions): Promise<Entitlements> {
    return this.post("/me/plan/cancel", undefined, undefined, options);
  }

  /** Desfaz o cancelamento agendado do Pro. `POST /me/plan/uncancel` */
  async uncancelPlan(options?: RequestOptions): Promise<Entitlements> {
    return this.post("/me/plan/uncancel", undefined, undefined, options);
  }

  /** Adiciona (+) ou remove (−) add-ons no carrinho. `POST /me/addons` */
  async changeAddon(params: ChangeAddonParams, options?: RequestOptions): Promise<AddonCart> {
    return this.post("/me/addons", params, undefined, options);
  }

  /** Estado do carrinho. `GET /me/addons/cart` */
  async getAddonCart(options?: RequestOptions): Promise<AddonCart> {
    return this.get("/me/addons/cart", undefined, options);
  }

  /** Esvazia o carrinho. `DELETE /me/addons/cart` */
  async clearAddonCart(options?: RequestOptions): Promise<AddonCart> {
    return this.delete("/me/addons/cart", undefined, options);
  }

  /** Paga o carrinho (cria a fatura e abre o pagamento). `POST /me/addons/cart/checkout` */
  async checkoutAddonCart(params?: CheckoutAddonCartParams, options?: RequestOptions): Promise<CheckoutResult> {
    return this.post("/me/addons/cart/checkout", params, undefined, options);
  }

  /** Faturas da conta (últimas 24). `GET /me/invoices` */
  async listMyInvoices(options?: RequestOptions): Promise<InvoiceList> {
    return this.get("/me/invoices", undefined, options);
  }

  /** Reabre o pagamento de uma fatura em aberto. `POST /me/invoices/{id}/pay` */
  async payInvoice(id: string, options?: RequestOptions): Promise<PayInvoiceResult> {
    return this.post(`/me/invoices/${p(id)}/pay`, undefined, undefined, options);
  }

  /** Chave publicável do Stripe para o checkout no front. `GET /billing/config` */
  async getBillingConfig(options?: RequestOptions): Promise<BillingConfig> {
    return this.get("/billing/config", undefined, options);
  }

  /** Tabela de preços pública por moeda. `GET /pricing` */
  async getPricing(options?: RequestOptions): Promise<Pricing> {
    return this.get("/pricing", undefined, options);
  }

  // -------------------------------------------------------------------------
  // Avisos
  // -------------------------------------------------------------------------

  /**
   * Lista os avisos de AÇÃO NECESSÁRIA na sua integração. `GET /advisories`
   *
   * Um aviso significa que uma mudança nossa exige atualizar o SEU código (SDK a
   * atualizar, payload ou endpoint que mudou). Nunca é changelog: você só recebe
   * o que afeta a sua conta, cruzado com a versão de SDK que você roda e os
   * recursos que de fato usa. O campo `action` diz o que fazer.
   */
  async listAdvisories(options?: RequestOptions): Promise<AdvisoryList> {
    return this.get("/advisories", undefined, options);
  }

  /** Marca um aviso como tratado. `POST /advisories/{id}/read` */
  async markAdvisoryRead(id: string, options?: RequestOptions): Promise<void> {
    return this.post(`/advisories/${p(id)}/read`, undefined, undefined, options);
  }

  // -------------------------------------------------------------------------
  // Webhooks
  // -------------------------------------------------------------------------

  /** Lista os webhooks do projeto. `GET /webhooks` */
  async listWebhooks(options?: RequestOptions): Promise<WebhookList> {
    return this.get("/webhooks", undefined, options);
  }

  /**
   * Cria um webhook. `POST /webhooks`
   *
   * Omita `secret` para a API gerar um forte e devolvê-lo UMA vez (em `secret`).
   * Cada evento só pode pertencer a um webhook (erro 409 em conflito).
   */
  async createWebhook(params: CreateWebhookParams, options?: RequestOptions): Promise<Webhook & { secret?: string }> {
    return this.post("/webhooks", params, undefined, options);
  }

  /** Edita/pausa um webhook. `secret: "regenerate"` rotaciona o segredo. `PATCH /webhooks/{id}` */
  async updateWebhook(
    id: string,
    params: CreateWebhookParams & { active?: boolean },
    options?: RequestOptions,
  ): Promise<Webhook & { secret?: string }> {
    return this.patch(`/webhooks/${p(id)}`, params, undefined, options);
  }

  /** Remove um webhook. `DELETE /webhooks/{id}` */
  async deleteWebhook(id: string, options?: RequestOptions): Promise<void> {
    return this.delete(`/webhooks/${p(id)}`, undefined, options);
  }

  /** Envia um evento de teste e devolve o status HTTP da resposta. `POST /webhooks/{id}/test` */
  async testWebhook(id: string, eventType?: string, options?: RequestOptions): Promise<WebhookTestResult> {
    return this.post(`/webhooks/${p(id)}/test`, { event_type: eventType }, undefined, options);
  }

  /** Histórico de entregas recentes do webhook. `GET /webhooks/{id}/deliveries` (operationId `listWebhookDeliveries`) */
  async webhookDeliveries(id: string, limit?: number, options?: RequestOptions): Promise<WebhookDeliveryList> {
    return this.get(`/webhooks/${p(id)}/deliveries`, { limit }, options);
  }

  /** Dispara um evento de teste no stream do projeto (relay). `POST /webhooks/trigger` (operationId `triggerWebhookEvent`) */
  async triggerWebhook(eventType?: string, options?: RequestOptions): Promise<{ event_id: string; event_type: string }> {
    return this.post("/webhooks/trigger", { event_type: eventType }, undefined, options);
  }

  // -------------------------------------------------------------------------
  // Apps conectados (bZapper Connect — lado do cliente)
  // -------------------------------------------------------------------------

  /**
   * Lista os softwares parceiros conectados a esta conta (com nome/logo do
   * parceiro). `GET /me/connections`
   */
  async listConnectedApps(options?: RequestOptions): Promise<PartnerConnectionList> {
    return this.get("/me/connections", undefined, options);
  }

  /**
   * Desconecta um app parceiro (admin). A key do parceiro para de funcionar na
   * hora. `DELETE /me/connections/{id}`
   */
  async revokeConnectedApp(id: string, options?: RequestOptions): Promise<void> {
    return this.delete(`/me/connections/${p(id)}`, undefined, options);
  }

  // -------------------------------------------------------------------------
  // Internos
  // -------------------------------------------------------------------------

  /** POST de envio: `options.idempotencyKey` vira o header `Idempotency-Key`. */
  private send(path: string, params: unknown, options?: SendOptions): Promise<MessageQueued> {
    return this.http.call<MessageQueued>({ method: "POST", path, body: params }, options);
  }

  private get<T>(path: string, query?: Query, options?: RequestOptions): Promise<T> {
    return this.http.call<T>({ method: "GET", path, query }, options);
  }

  private post<T>(path: string, body?: unknown, query?: Query, options?: RequestOptions): Promise<T> {
    return this.http.call<T>({ method: "POST", path, body, query }, options);
  }

  private put<T>(path: string, body?: unknown, query?: Query, options?: RequestOptions): Promise<T> {
    return this.http.call<T>({ method: "PUT", path, body, query }, options);
  }

  private patch<T>(path: string, body?: unknown, query?: Query, options?: RequestOptions): Promise<T> {
    return this.http.call<T>({ method: "PATCH", path, body, query }, options);
  }

  private delete<T>(path: string, query?: Query, options?: RequestOptions): Promise<T> {
    return this.http.call<T>({ method: "DELETE", path, query }, options);
  }
}

/**
 * Filtros compartilhados por `GET /contacts` e `GET /contacts/export` (a spec
 * declara os mesmos parâmetros nas duas rotas). `offset` é só da listagem.
 */
function contactFilterQuery(params: ExportContactsParams): Query {
  return {
    search: params.search,
    tags: params.tags,
    tags_match: params.tags_match,
    groups: params.groups,
    project_id: params.project_id,
    instance_id: params.instance_id,
    status: params.status,
    city: params.city,
    state: params.state,
    country: params.country,
    zip: params.zip,
    document: params.document,
    has_email: params.has_email,
    last_activity_after: params.last_activity_after,
    last_activity_before: params.last_activity_before,
    created_after: params.created_after,
    created_before: params.created_before,
    sort: params.sort,
    limit: params.limit,
  };
}

/** Factory equivalente a `new Bzapper(options)`. */
export function createClient(options: BzapperOptions): Bzapper {
  return new Bzapper(options);
}
