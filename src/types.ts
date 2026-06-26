/**
 * Tipos de payload e retorno do bZapper.
 * Espelham a fonte única `packages/sdk/openapi.yaml`.
 */

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
  /** Correlação ponta-a-ponta do cliente (ecoado nos eventos de status). */
  client_reference?: string;
  /** JIDs mencionados (grupo). */
  mentions?: string[];
  /**
   * Afinidade de conversa: sem instance_id/pool_id, reusa o número que já fala
   * com `to` (atendimento). Padrão true; envie false para forçar rotação.
   */
  sticky?: boolean;
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
  proxy_url?: string;
  created_at?: string;
  updated_at?: string;
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
  is_admin?: boolean;
  is_super_admin?: boolean;
}

export interface Group {
  jid: string;
  name: string;
  topic?: string;
  announce?: boolean;
  locked?: boolean;
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
}
export interface ContactRecordList {
  data: ContactRecord[];
}
export interface ListContactsParams {
  search?: string;
  /** Filtra por projeto: id do projeto ou "current" (o da sua key). */
  project_id?: string;
  limit?: number;
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
