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
  /**
   * Agenda o envio para um instante futuro (RFC3339). O número é escolhido na
   * hora do envio. Janela máx.: Free 24h, Pro 30 dias, 1 ano com o add-on de
   * agendamento estendido. Retorna status `scheduled`. OTP não pode ser agendado.
   */
  scheduled_at?: string;
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
  /**
   * Filtra por um número (instância) com que o contato interagiu. O vínculo
   * contato↔número é mantido automaticamente pela API.
   */
  instance_id?: string;
  limit?: number;
}

/** Filtro opcional de {@link BzapperClient.listInstances}. */
export interface ListInstancesParams {
  /**
   * Escopo dos números por projeto: id do projeto, ou `"all"` para todos os
   * números da conta. Omita para usar o projeto ativo (X-Project-Id).
   */
  project_id?: string;
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
