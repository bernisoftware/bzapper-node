/**
 * Tipos de payload e retorno do bZapper.
 * Espelham a fonte única `packages/sdk/openapi.yaml`.
 */

import type { RequestOptions } from "./http.js";

// ---------------------------------------------------------------------------
// Enums / unions
// ---------------------------------------------------------------------------

export type InstanceStatus =
  | "qr_pending"
  | "code_pending"
  | "connecting"
  | "connected"
  | "warming"
  | "disconnected"
  | "banned";

export type InstanceReason =
  | ""
  | "transient"
  | "logged_out"
  | "banned"
  | "user_action"
  | "connect_failed";

export type Role = "admin" | "agent";

export type ConnectMethod = "qr" | "code";

export type PresenceState = "typing" | "recording" | "paused";

export type GroupParticipantAction = "add" | "remove" | "promote" | "demote";

// ---------------------------------------------------------------------------
// Base de envio (presente em TODAS as mensagens)
// ---------------------------------------------------------------------------

export interface SendBase {
  /** Telefone E.164 ou JID de destino. Obrigatório. */
  to: string;
  /** Número específico (ignora a rotação). Se omitido, a rotação escolhe. */
  instance_id?: string;
  /** Rotaciona neste pool (quando instance_id é omitido). */
  pool_id?: string;
  /** wa_message_id citado (reply). */
  quoted_message_id?: string;
  /**
   * Autor (telefone ou JID) da mensagem citada/reagida. Só é preciso em grupo
   * quando a mensagem citada não está no histórico do bZapper.
   */
  quoted_participant?: string;
  /** Correlação ponta-a-ponta do cliente (ecoado nos eventos de status). */
  client_reference?: string;
  /** Mencionados (grupo): JIDs ou telefones ("5511…", "+55 11 9…"). */
  mentions?: string[];
  /**
   * Afinidade de conversa: sem instance_id/pool_id, reusa o número que já fala
   * com `to` (atendimento). Padrão true; envie false para forçar rotação.
   */
  sticky?: boolean;
  /**
   * Agenda o envio para um instante futuro (RFC3339). O número é escolhido na
   * hora do envio. Janela máx.: Free 24h, Pro 30 dias, 1 ano com o add-on de
   * agendamento estendido. Retorna status `scheduled`. OTP não pode ser agendado.
   */
  scheduled_at?: string;
}

/**
 * Opções de requisição dos envios (2º argumento opcional de `send*`).
 */
export interface SendOptions extends RequestOptions {
  /**
   * Vai no header `Idempotency-Key` (até 255 caracteres). Repetir o envio com a
   * mesma chave em 24h (mesma conta) devolve a MESMA resposta, sem reenviar —
   * retry seguro após timeout. Mesma chave com outro corpo → 422
   * `idempotency_key_reused`; 1ª ainda em andamento → 409 `idempotency_in_progress`.
   */
  idempotencyKey?: string;
}

/** Mídia por URL **ou** base64 (nunca os dois). */
export interface MediaInput {
  url?: string;
  base64?: string;
  caption?: string;
  filename?: string;
  mimetype?: string;
  /** Áudio: nota de voz. */
  ptt?: boolean;
}

// ---------------------------------------------------------------------------
// Parâmetros de cada tipo de mensagem
// ---------------------------------------------------------------------------

export interface SendTextParams extends SendBase {
  body: string;
}

export interface Webhook {
  id: string;
  url: string;
  event_types: string[];
  number_filter?: string;
  active: boolean;
  created_at?: string;
  updated_at?: string;
}
export interface WebhookList { data: Webhook[] }
export interface CreateWebhookParams {
  url: string;
  /** Omita para a API gerar (devolvido uma vez). "regenerate" no update rotaciona. */
  secret?: string;
  /** Vazio/ausente = todos os eventos. Cada evento só pode ter um webhook. */
  event_types?: string[];
  /** instance_id — restringe a um número. */
  number_filter?: string;
}
export interface WebhookTestResult { event_id: string; event_type: string; status: number; delivered: boolean; error?: string }
export interface WebhookDelivery { id: string; event_type: string; status: string; attempts: number; last_error?: string; created_at: string; updated_at: string }
export interface WebhookDeliveryList { data: WebhookDelivery[] }

export interface SendOTPParams extends SendBase {
  /** O código de verificação. Enviado sozinho num balão (copiável). */
  code: string;
  /** Texto de contexto (opcional). Vazio → gerado no idioma da conta. */
  body?: string;
  /** Opcional — menciona a expiração no texto gerado. */
  expiry_minutes?: number;
}

export interface SendMediaParams extends SendBase {
  media: MediaInput;
}

export interface SendLocationParams extends SendBase {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
}

export interface SendContactParams extends SendBase {
  contact_name?: string;
  contact_vcard?: string;
}

export interface SendPollParams extends SendBase {
  name: string;
  options: string[];
  /** Quantas opções podem ser marcadas. Default 1. */
  selectable_count?: number;
}

export interface SendReactionParams extends SendBase {
  /** Obrigatório: mensagem reagida. */
  quoted_message_id: string;
  emoji: string;
}

export interface Button {
  id?: string;
  title: string;
}

export interface SendButtonsParams extends SendBase {
  body: string;
  footer?: string;
  buttons: Button[];
}

export interface ListRow {
  id?: string;
  title: string;
  description?: string;
}

export interface ListSection {
  title?: string;
  rows: ListRow[];
}

export interface SendListParams extends SendBase {
  body: string;
  footer?: string;
  button_text?: string;
  sections: ListSection[];
}

// ---------------------------------------------------------------------------
// Retornos de mensagem
// ---------------------------------------------------------------------------

export interface MessageQueued {
  message_id: string;
  status: "queued";
  client_reference?: string;
  /** Presente quando o envio foi agendado (`scheduled_at`). */
  scheduled_id?: string;
  /** Instante agendado (RFC3339), quando houver. */
  scheduled_at?: string;
}

// ---------------------------------------------------------------------------
// Instâncias
// ---------------------------------------------------------------------------

export interface Instance {
  id: string;
  phone: string;
  nickname?: string;
  /** JID do dispositivo (após parear). */
  jid?: string;
  status: InstanceStatus;
  status_reason?: InstanceReason;
  /** Quando um ban TEMPORÁRIO expira (o número reconecta sozinho); ausente = permanente ou sem ban. */
  banned_until?: string | null;
  proxy_url?: string;
  tenant_id?: string;
  project_id?: string;
  /** Início do aquecimento do número. */
  warming_started_at?: string;
  /** Saúde do número (0–100). */
  health_score?: number;
  /** Preenchido quando o número está arquivado. */
  archived_at?: string;
  created_at?: string;
  updated_at?: string;
  /**
   * Envios recusados pelo WhatsApp em sequência. Zera no primeiro envio aceito.
   * Um número `connected` com valor acima de zero está vivo, mas não entrega —
   * veja `last_send_error_code`.
   */
  consecutive_send_failures?: number;
  /** Código devolvido pelo WhatsApp na última recusa (ver REACH_OUT_LOCK_CODE). */
  last_send_error_code?: number;
  last_send_failure_at?: string;
  last_send_error?: string;
}

/**
 * Bloqueio anti-spam do WhatsApp (reach-out time-lock). É limite por conta, não
 * falha de infraestrutura: a sessão segue saudável, responder a quem falou
 * primeiro continua funcionando, e costuma liberar em algumas horas.
 */
export const REACH_OUT_LOCK_CODE = 463;

/** Indica se o WhatsApp está recusando os envios deste número pelo time-lock. */
export function isReachOutLocked(instance: Instance): boolean {
  return instance.last_send_error_code === REACH_OUT_LOCK_CODE && (instance.consecutive_send_failures ?? 0) > 0;
}

export interface Pagination {
  total: number;
  cursor?: string | null;
}

export interface InstanceList {
  data: Instance[];
  pagination: Pagination;
}

export interface CreateInstanceParams {
  phone: string;
  nickname?: string;
  proxy_url?: string;
}

export interface ConnectResult {
  status: InstanceStatus;
  /** Conteúdo do QR (método qr). */
  qr_code?: string;
  /** Código de pareamento de 8 caracteres (método code). */
  pair_code?: string;
}

// ---------------------------------------------------------------------------
// API keys
// ---------------------------------------------------------------------------

export interface ApiKey {
  id: string;
  tenant_id: string;
  name?: string;
  role: Role;
  scopes?: string[];
  created_at?: string;
  last_used_at?: string | null;
  revoked_at?: string | null;
  /** Projeto ao qual a chave pertence. */
  project_id?: string;
  /** Preenchido quando a chave foi emitida a um parceiro via bZapper Connect. */
  partner_connection_id?: string;
  /**
   * Quando a chave para de funcionar (período de carência de uma rotação).
   * `null`/ausente = a chave não foi rotacionada.
   */
  expires_at?: string | null;
  /** Id da chave que substituiu esta (preenchido pela rotação). */
  rotated_to?: string;
}

export interface ApiKeyList {
  data: ApiKey[];
}

export interface CreateKeyParams {
  name?: string;
  role?: Role;
}

export interface ApiKeyCreated {
  /** Chave CRUA — mostrada uma única vez, nunca recuperável. */
  api_key: string;
  key: ApiKey;
}

/** `POST /keys/{id}/rotate` */
export interface RotateKeyParams {
  /**
   * Carência da chave ANTIGA, em segundos (padrão 86400, máx. 2592000 = 30 dias).
   * `0` revoga na hora.
   */
  revoke_in_seconds?: number;
}

export interface ApiKeyRotated {
  /** Chave CRUA nova — mostrada uma única vez, nunca recuperável. */
  api_key: string;
  /** A chave nova (herda papel, escopos, projeto e nome da antiga). */
  key: ApiKey;
  /** A chave antiga, com `expires_at`/`revoked_at` já atualizados. */
  previous_key?: ApiKey;
  /** Quando a antiga para de funcionar. `null` quando revogada na hora. */
  old_key_expires_at?: string | null;
}

// ---------------------------------------------------------------------------
// Uso
// ---------------------------------------------------------------------------

export interface UsageByNumber {
  instance_id?: string;
  phone?: string;
  total?: number;
}

export interface UsageSummary {
  from?: string;
  to?: string;
  total?: number;
  sent?: number;
  received?: number;
  delivered?: number;
  read?: number;
  failed?: number;
  delivery_rate?: number;
  by_type?: Record<string, number>;
  by_number?: UsageByNumber[];
}

export interface GetUsageParams {
  /** RFC3339. */
  from?: string;
  /** RFC3339. */
  to?: string;
}

// ---------------------------------------------------------------------------
// Presença
// ---------------------------------------------------------------------------

export interface PresenceChatParams {
  /** Número que envia a presença. Obrigatório. */
  instance_id: string;
  /** Destino — E.164 ou JID. Pode ser **JID de grupo**. */
  to: string;
  /** Estado da presença. Default `typing`. */
  state?: PresenceState;
}

// ---------------------------------------------------------------------------
// Conversas
// ---------------------------------------------------------------------------

export interface Conversation {
  chat_jid: string;
  last_type?: string;
  last_status?: string;
  last_direction?: "in" | "out";
  last_body?: string;
  last_at: string;
  unread: number;
}

export interface ConversationList {
  data: Conversation[];
}

export interface Message {
  id: string;
  instance_id: string;
  direction: "in" | "out";
  chat_jid: string;
  sender_jid?: string;
  sender_lid?: string;
  type: string;
  status: string;
  wa_message_id?: string;
  quoted_id?: string;
  client_reference?: string;
  media_id?: string;
  payload?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface MessageList {
  data: Message[];
}

export interface ConversationHistoryParams {
  /** Número dono do inbox. Obrigatório (vai na query). */
  instance_id: string;
  /** Mensagens anteriores a este instante (RFC3339). */
  before?: string;
  /** Máximo de mensagens (≤ 200, default 50). */
  limit?: number;
}

/** Ação on/off para arquivar, fixar ou marcar lido/não-lido um chat. */
export interface ChatActionParams {
  /** Número dono do chat. Obrigatório (vai no body). */
  instance_id: string;
  /** Liga (`true`) ou desliga (`false`) a ação. */
  on: boolean;
}

// ---------------------------------------------------------------------------
// Grupos
// ---------------------------------------------------------------------------

export interface GroupParticipant {
  jid: string;
  /**
   * Telefone (+DDIdigits) de quem participa, quando se conhece. Em grupo
   * endereçado por LID o `jid` é o @lid e só o `phone` identifica a pessoa.
   */
  phone?: string;
  /** @lid associado, quando houver. */
  lid?: string;
  is_admin?: boolean;
  is_super_admin?: boolean;
}

export interface Group {
  jid: string;
  name: string;
  topic?: string;
  announce?: boolean;
  locked?: boolean;
  /** Nº de participantes. */
  size?: number;
  participants?: GroupParticipant[];
}

export interface GroupList {
  data: Group[];
}

export interface CreateGroupParams {
  name: string;
  participants?: string[];
}

export interface JoinGroupParams {
  /** Código (parte final do link de convite). */
  code: string;
}

export interface UpdateGroupParticipantsParams {
  action: GroupParticipantAction;
  participants: string[];
}

/** Link de convite do grupo. O corpo exato pode variar conforme o servidor. */
export interface GroupInvite {
  invite_link?: string;
  code?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Contatos
// ---------------------------------------------------------------------------

export interface ContactsCheckParams {
  /** Número que faz a checagem. Obrigatório (vai no body). */
  instance_id: string;
  /** Telefones a verificar (E.164). */
  phones: string[];
}

export interface Contact {
  query: string;
  in_whatsapp: boolean;
  jid?: string;
  /** @lid associado, quando o servidor responde nesse modo. */
  lid?: string;
}

export interface ContactList {
  data: Contact[];
}

// ---------------------------------------------------------------------------
// Perfil do número (white-label)
// ---------------------------------------------------------------------------

export interface SetProfileParams {
  display_name?: string;
  status_message?: string;
  /** Foto em base64. */
  picture?: string;
}

// ---------------------------------------------------------------------------
// Erro (corpo padrão da API)
// ---------------------------------------------------------------------------

export interface ApiErrorBody {
  code: string;
  message: string;
  locale?: string;
}

// ---------------------------------------------------------------------------
// Projetos, usuários, contatos, identidade e consumo da conta
// ---------------------------------------------------------------------------

/** Projeto: ambiente isolado (números, inbox, keys, stats) dentro da conta. */
export interface Project {
  id: string;
  tenant_id: string;
  name: string;
  logo_url?: string;
  color?: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}
export interface ProjectList {
  data: Project[];
}
export interface CreateProjectParams {
  name: string;
  /** Trilho do projeto (imutável depois de criado). */
  api_mode?: "UNOFFICIAL" | "OFFICIAL";
}

/** Usuário da conta. role `admin` (tudo) ou `agent` (membro — sem faturamento). */
export interface AccountUser {
  id: string;
  email: string;
  name: string;
  role: "admin" | "agent";
  avatar_url?: string;
  email_verified_at?: string | null;
}
export interface AccountUserList {
  data: AccountUser[];
}
export interface InviteUserParams {
  email: string;
  name?: string;
  role?: "admin" | "agent";
}
export interface UpdateUserRoleParams {
  role: "admin" | "agent";
}

/** Contato capturado automaticamente das conversas recebidas. */
export interface ContactRecord {
  id: string;
  chat_jid: string;
  phone: string;
  name: string;
  avatar_url: string;
  instance_id?: string;
  message_count: number;
  last_message_at?: string;
  email?: string;
  document?: string;
  document_type?: string;
  address?: ContactAddress;
  status?: ContactStatus;
  status_reason?: string;
  source?: "inbound" | "outbound" | "api" | "import" | "widget";
  opted_out_at?: string | null;
  created_at?: string;
  updated_at?: string;
  /** Chaves das tags do contato. */
  tags?: string[];
  /** Chaves dos grupos de contato. */
  groups?: string[];
}
export interface ContactRecordList {
  data: ContactRecord[];
  total?: number;
  limit?: number;
  offset?: number;
}
export interface ListContactsParams {
  search?: string;
  /** Filtra por projeto: id do projeto ou "current" (o da sua key). */
  project_id?: string;
  /**
   * Filtra por um número (instância) com que o contato interagiu. O vínculo
   * contato↔número é mantido automaticamente pela API.
   */
  instance_id?: string;
  limit?: number;
  /** Chaves de tag (enviadas como CSV). */
  tags?: string[];
  /** `any` (padrão) ou `all` das `tags`. */
  tags_match?: "any" | "all";
  /** Chaves de grupos de contato (enviadas como CSV). */
  groups?: string[];
  status?: ContactStatus;
  city?: string;
  state?: string;
  country?: string;
  zip?: string;
  document?: string;
  has_email?: boolean;
  /** RFC3339 (ou `Date`). */
  last_activity_after?: string | Date;
  last_activity_before?: string | Date;
  created_after?: string | Date;
  created_before?: string | Date;
  sort?: "last_activity" | "name" | "created";
  offset?: number;
}

/** Filtro opcional de {@link BzapperClient.listInstances}. */
export interface ListInstancesParams {
  /**
   * Escopo dos números por projeto: id do projeto, ou `"all"` para todos os
   * números da conta. Omita para usar o projeto ativo (X-Project-Id).
   */
  project_id?: string;
  /** `"1"` lista os números ARQUIVADOS do projeto ativo em vez dos ativos. */
  archived?: "1";
}

/** Identidade dos números (kit de marca + "Sobre"). Vive no projeto. */
export interface BrandProfile {
  about?: string;
  display_name?: string;
  logo_url?: string;
  website?: string;
  email?: string;
  phone?: string;
  address?: string;
  description?: string;
}
export interface BrandApplyResult {
  applied: number;
  skipped: string[];
  total: number;
}

/** Consumo agregado da conta + por projeto (admin). */
export interface ProjectUsage {
  project_id: string;
  name: string;
  numbers: number;
  total: number;
  sent: number;
  received: number;
}
export interface AccountUsage {
  account: UsageSummary;
  projects: ProjectUsage[];
}

// ---------------------------------------------------------------------------
// Envio agendado
// ---------------------------------------------------------------------------

/** Um envio agendado (guardado até o `scheduled_at`). */
export interface Scheduled {
  id: string;
  scheduled_at: string;
  status: "pending" | "claimed" | "promoted" | "canceled" | "failed";
  message_id?: string;
  tenant_id?: string;
  project_id?: string;
  /** O envio original, como foi pedido. */
  request?: Record<string, unknown>;
  error?: string;
  created_at?: string;
  updated_at?: string;
}

// ---------------------------------------------------------------------------
// Campanhas (Pro + add-on de campanhas)
// ---------------------------------------------------------------------------

/** Variação do template (rotacionada). Corpo aceita {variaveis} e spintax {a|b}. */
export interface CampaignVariation {
  body: string;
  weight?: number;
  media?: Record<string, unknown>;
}

export interface CampaignCreateParams {
  name?: string;
  pool_id?: string;
  pacing_profile?: "conservative" | "normal";
  /** Início futuro = campanha agendada. */
  start_at?: string;
  variations: CampaignVariation[];
}

export interface Campaign {
  id: string;
  name: string;
  status: "draft" | "scheduled" | "running" | "paused" | "completed" | "canceled";
  rail: "unofficial" | "official";
  pacing_profile: "conservative" | "normal";
  pool_id?: string;
  start_at?: string;
  paused_reason?: string;
  created_at?: string;
  /** Presente quando a campanha (agendada/em andamento) espera a janela de envio 08h–21h BRT. */
  waiting?: string;
  /** Quando a janela reabre para esta campanha (ISO 8601); vem junto com `waiting`. */
  starts_at?: string;
}

export interface CampaignStats {
  total: number;
  pending: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  suppressed: number;
}

/** Item da lista `recipients`: telefone + payload de variáveis. */
export interface CampaignRecipientInput {
  phone: string;
  payload?: Record<string, unknown>;
}

/** Subconjunto dos filtros de busca de contatos para escolher destinatários. */
export interface ContactFilter {
  search?: string;
  tags?: string[];
  /** Exige TODAS as tags (default: qualquer uma). */
  tags_all?: boolean;
  groups?: string[];
  city?: string;
  state?: string;
  country?: string;
  has_email?: boolean;
}

/**
 * Formas de adicionar destinatários (combináveis): array `recipients`, mapa
 * `contacts` (telefone → payload), `contact_ids` (contatos explícitos) e/ou
 * `contact_filter` (todo contato que casa o filtro). Para contact_ids/filter
 * os telefones são resolvidos no servidor e restritos a contatos ATIVOS
 * (bloqueado/opt-out/inalcançável nunca entram); a supressão é re-checada.
 */
export interface CampaignRecipientsParams {
  recipients?: CampaignRecipientInput[];
  contacts?: Record<string, Record<string, unknown>>;
  /** Ids de contatos selecionados explicitamente (só os ativos entram). */
  contact_ids?: string[];
  /** Adiciona todo contato ATIVO que casa este filtro. */
  contact_filter?: ContactFilter;
  /**
   * Substitui toda a lista em vez de anexar (limpa antes). Só permitido
   * enquanto a campanha está draft/scheduled.
   */
  replace?: boolean;
}

export interface AddRecipientsResult {
  inserted: number;
  suppressed: number;
  skipped: number;
}

/** Um destinatário da campanha, com estado de entrega por contato. */
export interface CampaignRecipient {
  id: string;
  /** Só dígitos. */
  phone: string;
  /** Resolvido da base de contatos, se houver. */
  contact_name?: string;
  status: "pending" | "claimed" | "sent" | "failed" | "suppressed";
  /** Estado real de entrega vindo dos recibos do WhatsApp. */
  delivery?: "" | "sent" | "delivered" | "read";
  message_id?: string;
  last_error?: string;
}

/** Estimativa de duração de envio ao vivo (sem precisar de campanha). */
export interface CampaignEstimate {
  recipients: number;
  /** Números aquecidos e elegíveis agora. */
  numbers_available: number;
  estimated_seconds: number;
  /** Ex.: `2h15m0s`. */
  estimated_human: string;
}

/** Parâmetros (query) da estimativa ao vivo. */
export interface EstimateCampaignParams {
  recipients?: number;
  pacing?: "conservative" | "normal";
  pool_id?: string;
}

export interface CampaignDryRun {
  campaign_id: string;
  stats: CampaignStats;
  variations: number;
  numbers_available: number;
  missing_variables: string[];
  estimated_seconds: number;
  estimated_human: string;
  warnings: string[];
}

/** Aviso de ação necessária na integração (ver `listAdvisories`). */
export interface Advisory {
  id: string;
  title: string;
  /** O que quebra, em concreto. */
  impact: string;
  /** O que você tem que FAZER. */
  action: string;
  link?: string;
  published_at: string;
}

export interface AdvisoryList {
  advisories: Advisory[];
}

// ---------------------------------------------------------------------------
// bZapper Connect (parceiros)
// ---------------------------------------------------------------------------

/**
 * Estado da conexão de um cliente do parceiro.
 *
 * `active` = a key funciona. `suspended` = o Pro do cliente está sem pagamento:
 * a key responde **402 `connect_suspended`** e volta sozinha quando pagar.
 * `revoked` = encerrada (a key responde 401 `connect_revoked`).
 */
export type ConnectionStatus =
  | "pending_account"
  | "pending_payment"
  | "pending_number"
  | "active"
  | "suspended"
  | "revoked";

/** Códigos de erro (`BzapperError.code`) específicos de uma key do Connect. */
export type ConnectErrorCode =
  /** 402 — o Pro do cliente está sem pagamento; volta sozinho quando pagar. */
  | "connect_suspended"
  /** 401 — a conexão foi encerrada (pelo cliente, pelo parceiro ou exclusão da conta). */
  | "connect_revoked";

/** Seu cliente, como autenticado no seu produto. `name` ou `company` é obrigatório. */
export interface ConnectCustomer {
  name?: string;
  email: string;
  /** E.164; pré-preenche o número de WhatsApp. */
  phone?: string;
  /** Vira o nome da conta e do projeto no bZapper. */
  company?: string;
  /** ISO-3166 alfa-2. Define a moeda (BR → BRL, Américas → USD, demais → EUR). */
  country?: string;
  locale?: string;
}

/** Identidade do parceiro dono do partner secret. */
export interface Partner {
  id: string;
  slug: string;
  name: string;
  logo_url?: string;
  allowed_origins?: string[];
  webhook_url?: string;
  key_scopes?: string[];
}

/** Número (instância) vinculado a uma conexão. */
export interface PartnerConnectionNumber {
  id: string;
  phone: string;
  status: string;
}

/** Conexão entre um cliente do parceiro e a conta bZapper dele. */
export interface PartnerConnection {
  id: string;
  /** O id do cliente no SEU sistema. Mesmo id = mesma conexão. */
  external_id: string;
  status: ConnectionStatus;
  /** Conta (tenant) bZapper do cliente. */
  account_id?: string;
  project_id?: string;
  customer?: ConnectCustomer;
  numbers?: PartnerConnectionNumber[];
  /** Só em `listConnectedApps` (`/me/connections`). */
  partner_name?: string;
  /** Só em `listConnectedApps` (`/me/connections`). */
  partner_logo_url?: string;
  activated_at?: string | null;
  suspended_at?: string | null;
  revoked_at?: string | null;
  created_at: string;
}

/** Conexão + a API key crua do cliente (mostrada uma única vez). */
export interface PartnerConnectionWithKey extends PartnerConnection {
  /**
   * Key crua (`bz_live_...`), mostrada só uma vez — guarde. Escopada ao projeto
   * do cliente; não mexe em cobrança, usuários, keys nem webhooks da conta.
   */
  api_key: string;
}

export interface PartnerConnectionList {
  data: PartnerConnection[];
}

/** Parâmetros de `createConnectSession`. */
export interface CreateConnectSessionParams {
  /** O id deste cliente no SEU sistema (máx. 200). Mesmo id = mesma conexão. */
  external_id: string;
  customer: ConnectCustomer;
  /** Idioma do componente, ex.: `pt-BR`. */
  locale?: string;
}

/** Sessão do componente embutido (`BzapperConnect.open({ session })`). */
export interface ConnectSession {
  /** Token de curta duração (30 min) que abre o componente no front. */
  session_token: string;
  expires_at: string;
  connection: PartnerConnection;
}

/** Filtros de `listConnections`. */
export interface ListPartnerConnectionsParams {
  external_id?: string;
  status?: ConnectionStatus;
}

// ---------------------------------------------------------------------------
// Adições do padrão Berni r2 (0.7): todas as operações da spec
// ---------------------------------------------------------------------------

/** Paginação simples por quantidade (`?limit=`). */
export interface LimitParams {
  /** Máximo de itens. */
  limit?: number;
}

/** Parâmetros de `groupInvite`. */
export interface GroupInviteParams {
  /** `true` revoga o link atual e gera um novo. */
  reset?: boolean;
}

// ----- Identidade / conta -----

/** Identidade autenticada (+ perfil quando é sessão de usuário). `GET /me` */
export interface Me {
  tenant_id?: string;
  user_id?: string;
  email?: string;
  name?: string;
  phone?: string;
  job_title?: string;
  avatar_url?: string;
  role?: "admin" | "agent" | "super_admin";
  scopes?: string[];
  locale?: string;
  tenant_name?: string;
  is_platform_admin?: boolean;
  bfocus?: { user_external_id?: string; customer_external_id?: string; user_hash?: string };
}

/** `PATCH /me` */
export interface UpdateProfileParams {
  name?: string;
  phone?: string;
  job_title?: string;
  locale?: string;
}

/** `PATCH /account` */
export interface UpdateAccountParams {
  /** Nome da empresa (conta). */
  name: string;
}

export interface AccountUpdated {
  tenant_name: string;
}

/** Resultado de upload de logo. */
export interface LogoUploaded {
  logo_url?: string;
}

/** Nome do schema no OpenAPI (`BrandLogoUploaded`) — mesmo formato de {@link LogoUploaded}. */
export type BrandLogoUploaded = LogoUploaded;

/** Usuário (schema `User`) — devolvido por `PATCH /me`. */
export interface User {
  id: string;
  tenant_id: string;
  email: string;
  name?: string;
  role: Role;
  /** Telefone em E.164 (+DDIdigits). */
  phone?: string;
  job_title?: string;
  avatar_url?: string;
  email_verified_at?: string | null;
  phone_verified_at?: string | null;
  /** Opt-in para receber avisos de integração pelo WhatsApp. */
  notify_whatsapp?: boolean;
  created_at?: string;
  updated_at?: string;
}

/** `PATCH /me` → `{ user }`. */
export interface ProfileUpdated {
  user: User;
}

// ----- Respostas de operações avançadas / grupos / campanhas -----

/** `PATCH /messages/{id}` e `POST /messages/forward` → id WhatsApp da mensagem resultante. */
export interface WAMessageRef {
  wa_message_id: string;
}

/** `GET /blocklist` → JIDs bloqueados. */
export interface Blocklist {
  data: string[];
}

/** `POST /calls/offer` */
export interface CallOffered {
  call_id: string;
}

/** `POST /groups/join` */
export interface GroupJoined {
  /** JID do grupo em que entrou (…@g.us). */
  jid: string;
}

/** Pedido de entrada pendente num grupo. */
export interface JoinRequest {
  /** JID de quem pediu. */
  jid: string;
}

/** `GET /groups/{jid}/join-requests` */
export interface JoinRequestList {
  data: JoinRequest[];
}

/** Novo status da campanha após pause/resume/cancel. */
export interface CampaignStatusChange {
  id: string;
  status: "paused" | "running" | "canceled" | (string & {});
}

// ----- Projetos -----

/** `PATCH /projects/{id}` */
export interface UpdateProjectParams {
  name: string;
  logo_url?: string;
  color?: string;
}

export interface ProjectHealth {
  project_id?: string;
  total?: number;
  /** Contagem por status do número. */
  statuses?: Record<string, number>;
}

export interface ProjectHealthList {
  data?: ProjectHealth[];
}

// ----- Contatos (CRM) -----

export type ContactStatus = "active" | "pending_validation" | "opted_out" | "blocked" | "unreachable";

export interface ContactAddress {
  street?: string;
  number?: string;
  complement?: string;
  district?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
}

/** `POST /contacts` */
export interface CreateContactParams {
  /** `+DDIdigits` (E.164 sem espaços). */
  phone: string;
  name?: string;
  email?: string;
  document?: string;
  document_type?: string;
  address?: ContactAddress;
}

/** `PATCH /contacts/{id}` — só os campos enviados mudam. */
export interface UpdateContactParams {
  name?: string;
  email?: string;
  document?: string;
  document_type?: string;
  address?: ContactAddress;
}

/** Uma linha do lote de {@link Bzapper.importContacts}. */
export interface ContactImportRow {
  /** `+DDIdigits` (E.164 sem espaços) — a chave do upsert. */
  phone: string;
  name?: string;
  email?: string;
  document?: string;
  document_type?: string;
  address?: ContactAddress;
  /** Chaves de tag (criadas sob demanda). */
  tags?: string[];
  /** Chaves de grupo de contato (criadas sob demanda). */
  groups?: string[];
}

/** `POST /contacts/import` — no máximo 1000 linhas por chamada. */
export interface ImportContactsParams {
  contacts: ContactImportRow[];
  /** Valida e relata tudo sem escrever nada. Padrão `false`. */
  dry_run?: boolean;
}

/** Linha que a importação pulou (`skipped_rows`) ou recusou (`errors`). */
export interface ContactImportRowIssue {
  /** Posição da linha no lote enviado (base 0). */
  index: number;
  phone: string;
  /** Motivo estável, para a sua lógica (ex.: `suppressed`, `invalid_phone`). */
  reason: string;
  detail?: string;
}

export interface ContactImportResult {
  dry_run?: boolean;
  total: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  /** Contatos não tocados (supresso/opt-out/bloqueado). */
  skipped_rows?: ContactImportRowIssue[];
  /** Linhas inválidas — não derrubam o resto do lote. */
  errors?: ContactImportRowIssue[];
}

/**
 * `GET /contacts/export` — os MESMOS filtros de {@link ListContactsParams},
 * sem `offset` (o export não pagina; `limit` é o teto de linhas).
 */
export type ExportContactsParams = Omit<ListContactsParams, "offset">;

export interface ContactHistoryItem {
  kind: "message" | "event";
  type?: string;
  direction?: "" | "inbound" | "outbound";
  status?: string;
  actor?: string;
  payload?: Record<string, unknown>;
  created_at: string;
}

export interface ContactHistoryList {
  data: ContactHistoryItem[];
}

/** `POST /contacts/{id}/notes` */
export interface ContactNoteParams {
  body: string;
}

/** Adiciona/remove chaves de tag ou de grupo de contato. */
export interface TaxonMutationParams {
  add?: string[];
  remove?: string[];
}

/** Tag ou grupo de contato. */
export interface Taxon {
  id: string;
  key: string;
  name: string;
  color?: string;
  count?: number;
  created_at?: string;
}

export interface TaxonList {
  data: Taxon[];
}

export interface TaxonRef {
  id: string;
  key: string;
}

/** `POST /tags` e `POST /contact-groups` */
export interface CreateTaxonParams {
  key: string;
  name?: string;
  color?: string;
}

export interface Suppression {
  id: string;
  phone: string;
  reason?: string;
  source?: string;
  created_at?: string;
}

export interface SuppressionList {
  data: Suppression[];
}

/** `POST /suppressions` */
export interface CreateSuppressionParams {
  /** `+DDIdigits`. */
  phone: string;
  reason?: string;
}

// ----- Cobrança -----

export interface Entitlements {
  currency?: string;
  project_free_count?: number;
  plan_code?: string;
  plan_name?: string;
  status?: string;
  gated?: boolean;
  plan?: string;
  plan_renews_at?: string;
  plan_monthly_cents?: number;
  plan_cancel_at?: string;
  addon_numbers?: number;
  addon_numbers_next?: number;
  addon_projects?: number;
  addon_projects_next?: number;
  addon_storage_gb?: number;
  addon_storage_gb_next?: number;
  addon_retention_blocks?: number;
  addon_retention_blocks_next?: number;
  addon_number_cents?: number;
  addon_project_cents?: number;
  addon_storage_gb_cents?: number;
  addon_retention_block_cents?: number;
  max_projects?: number;
  max_numbers_per_project?: number;
  max_users?: number;
  max_api_keys?: number;
  storage_mb?: number;
  media_retention_days?: number;
  message_retention_days?: number;
  rate_limit_rps?: number;
  sends_included?: number;
  sends_used?: number;
  messages_used?: number;
  message_free_count?: number;
  number_free_count?: number;
  storage_free_mb?: number;
  retention_free_days?: number;
}

export interface AddonCart {
  plan_pro?: boolean;
  pro_monthly_cents?: number;
  numbers?: number;
  projects?: number;
  storage_gb?: number;
  retention_blocks?: number;
  campaigns?: number;
  schedule_year?: number;
  prorated_cents?: number;
  currency?: string;
  empty?: boolean;
}

export type AddonKind = "number" | "project" | "storage_gb" | "retention_block" | "campaigns" | "schedule_year";

/** `POST /me/addons` */
export interface ChangeAddonParams {
  kind: AddonKind;
  /** +N adiciona, −N remove (toggles: 0/1). */
  delta: number;
}

/** `POST /me/addons/cart/checkout` */
export interface CheckoutAddonCartParams {
  save_card?: boolean;
}

export interface CheckoutResult {
  client_secret?: string;
  invoice_id?: string;
}

export interface PlanSummary {
  plan?: string;
  status?: "active" | "past_due" | "grace" | "canceling";
  renews_at?: string | null;
  cancel_at?: string | null;
  grace_until?: string | null;
  recurring?: boolean;
  currency?: string;
}

export interface InvoiceItem {
  kind?: "plan" | "addon";
  addon_kind?: string;
  description?: string;
  qty?: number;
  unit_amount_cents?: number;
  amount_cents?: number;
  proration?: boolean;
  period_start?: string;
  period_end?: string;
}

export interface Invoice {
  id?: string;
  number?: number;
  currency?: string;
  status?: "open" | "awaiting_payment" | "paid" | "failed" | "void";
  reason?: "initial" | "addon" | "renewal";
  recurring?: boolean;
  subtotal_cents?: number;
  total_cents?: number;
  period_start?: string;
  period_end?: string;
  issue_date?: string;
  due_date?: string;
  paid_at?: string;
  items?: InvoiceItem[];
}

export interface InvoiceList {
  data?: Invoice[];
}

export interface PayInvoiceResult {
  client_secret?: string;
}

export interface BillingConfig {
  publishable_key?: string;
  enabled?: boolean;
}

export interface Pricing {
  retention_free_days?: number;
  plans?: Record<string, unknown>;
  currencies?: Record<string, unknown>;
}

// ----- Avançado (mensagens, privacidade, etiquetas, chamadas) -----

/** `PATCH /messages/{id}` */
export interface EditMessageParams {
  text: string;
}

/** `DELETE /messages/{id}` */
export interface RevokeMessageParams {
  for_everyone?: boolean;
}

/** `POST /messages/forward` */
export interface ForwardMessageParams {
  instance_id: string;
  to: string;
  from_chat: string;
  wa_message_id: string;
}

/** `POST /messages/{id}/read` */
export interface MarkReadParams {
  instance_id: string;
  chat: string;
  wa_message_ids?: string[];
  sender?: string;
}

/** `PATCH /instances/{id}/privacy` */
export interface SetPrivacyParams {
  setting: string;
  value: string;
}

/** `POST /chats/{jid}/labels` */
export interface ApplyChatLabelParams {
  instance_id: string;
  label_id: string;
  apply?: boolean;
}

export interface Label {
  id?: string;
  name?: string;
  color?: string;
}

export interface LabelList {
  data?: Label[];
}

/** `POST /labels` */
export interface CreateLabelParams {
  instance_id: string;
  name: string;
  color?: string;
}

/** Corpo com só o número (`instance_id`). */
export interface InstanceParams {
  instance_id: string;
}

/** `POST /calls/reject` */
export interface RejectCallParams {
  instance_id: string;
  call_from: string;
  call_id: string;
}

/** `POST /calls/offer` */
export interface OfferCallParams {
  instance_id: string;
  to: string;
  video?: boolean;
}

// ----- Números -----

/** Filtros de entrada do número. */
export interface InboundFilters {
  ignore_broadcast?: boolean;
  ignore_status?: boolean;
  ignore_groups?: boolean;
  group_allowlist?: string[];
  group_denylist?: string[];
}

/** `PATCH /instances/{id}/proxy` */
export interface SetProxyParams {
  proxy_url: string;
}

export interface Health {
  status: "ok" | "degraded";
  version: string;
}

// ----- Grupos -----

/** `PATCH /groups/{jid}` */
export interface UpdateGroupParams {
  name?: string;
  topic?: string;
  announce?: boolean;
  locked?: boolean;
}

/** `POST /groups/{jid}/join-requests` */
export interface UpdateJoinRequestsParams {
  participants: string[];
  approve: boolean;
}

// ----- API oficial (WhatsApp Cloud API) -----

export type OfficialAccountStatus = "PENDENTE" | "AGUARDANDO_PAGAMENTO" | "ATIVA" | "SUSPENSA";

export interface OfficialAccount {
  id?: string;
  tenant_id?: string;
  project_id?: string;
  waba_id?: string;
  phone_number_id?: string;
  display_number?: string;
  verified_name?: string;
  status?: OfficialAccountStatus;
  status_reason?: string;
  quality_rating?: string;
  messaging_limit?: string;
  source?: "embedded_signup" | "manual";
}

/** `POST /official/account` */
export interface ConnectOfficialAccountParams {
  waba_id: string;
  phone_number_id: string;
  access_token: string;
  display_number?: string;
  verified_name?: string;
  status?: "PENDENTE" | "AGUARDANDO_PAGAMENTO" | "ATIVA";
}

// ----- Campanhas -----

export interface NumberEligibility {
  instance_id?: string;
  phone?: string;
  nickname?: string;
  status?: string;
  connected_days?: number;
  health?: number;
  eligible?: boolean;
  reason?: string;
}

export interface CampaignEligibility {
  warmup_days?: number;
  min_numbers?: number;
  eligible_count?: number;
  can_dispatch?: boolean;
  reason?: string;
  numbers?: NumberEligibility[];
}

/** `GET /campaigns/eligibility` */
export interface CampaignEligibilityParams {
  pool_id?: string;
}

export interface MediaUploaded {
  url?: string;
}

// ----- Pools -----

export type PoolStrategy = "round_robin" | "least_used" | "health_weighted";

export interface Pool {
  id: string;
  tenant_id: string;
  name?: string;
  strategy: PoolStrategy;
  is_default?: boolean;
  /** instance_ids dos números do pool. */
  members?: string[];
  created_at?: string;
  updated_at?: string;
}

export interface PoolList {
  data: Pool[];
}

/** `POST /pools` */
export interface CreatePoolParams {
  name?: string;
  strategy?: PoolStrategy;
  is_default?: boolean;
}
