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
  /** Só no oficial: id de {@link Bzapper.uploadOfficialMedia} — envia sem subir de novo (30 dias, mesmo número). */
  id?: string;
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

/** Um evento que a Meta mandou ao bZapper, cru, com o estado do processamento. */
export interface MetaWebhookEvent {
  id: number;
  received_at: string;
  /** Campos de mudança da Meta no evento, separados por vírgula. */
  fields: string;
  status: "pending" | "running" | "done" | "failed";
  attempts: number;
  error?: string;
  body: Record<string, unknown>;
}

export interface MetaWebhookEventList { data: MetaWebhookEvent[] }

/** Painel do oficial: custo estimado com a Meta (por categoria, com projeção do mês) e KPIs do trilho. */
export interface OfficialInsights {
  from: string;
  to: string;
  rate_card: { market: string; currency: string; effective: string; source: string; rates: Record<string, number>; tiers: { from: number; rate: number }[] };
  cost: {
    currency: string; period: number; previous_period: number; change_pct: number | null;
    month_to_date: number; projected_month: number;
    by_category: { category: "marketing" | "utility" | "authentication" | "service"; messages: number; billable: number; cost: number }[];
    confirmed: number; estimated: number; other_countries: number;
  };
  messages: {
    sent: number; delivered: number; read: number; failed: number; received: number;
    delivery_rate: number; read_rate: number; free_messages: number; contacts: number;
  };
  templates: { name: string; category: string; sent: number; failed: number; cost: number }[];
  failures: { reason: string; count: number }[];
  ad_referrals: number;
  marketing_opt_outs: number;
  numbers: { display_number: string; quality: string; limit: string; status: string }[];
}

/** Arquivo guardado na Meta: reaproveite como `media.id` por 30 dias, do mesmo número. */
export interface OfficialMedia {
  id: string;
  type: "image" | "sticker" | "video" | "audio" | "document";
  mime_type: string;
  file_size: number;
  instance_id: string;
  expires_at: string;
}

/** O que a Meta sabe de um arquivo guardado. */
export interface OfficialMediaInfo { id: string; mime_type: string; sha256: string; file_size: number }

/** Resultado do reenvio de uma entrega. */
export interface WebhookRedelivery {
  delivery_id: string;
  event_id: string;
  event_type: string;
  /** Status HTTP que o seu endpoint respondeu (0 em falha de transporte). */
  status: number;
  delivered: boolean;
  error?: string;
}

export interface SendOTPParams extends SendBase {
  /** O código de verificação. Enviado sozinho num balão (copiável). */
  code: string;
  /** Texto de contexto (opcional). Vazio → gerado no idioma da conta. */
  body?: string;
  /** Opcional — menciona a expiração no texto gerado. */
  expiry_minutes?: number;
  /**
   * Só no oficial: template de AUTENTICAÇÃO aprovado que leva o código, mesmo com
   * a janela aberta. Sem ele, o do projeto é usado só com a janela fechada.
   */
  template?: string;
  /** Idioma do template de autenticação (ex.: `pt_BR`). */
  language?: string;
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
  /**
   * Telefone (E.164) do contato COMPARTILHADO no cartão — nunca o destino.
   * Obrigatório junto de `contact_name`; dispensável com `contact_vcard` pronto.
   */
  contact_phone?: string;
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
  /**
   * Presente SÓ quando a plataforma tomou um caminho diferente do pedido. Hoje
   * isso quer dizer uma coisa: a janela de 24h com o contato estava fechada, e
   * o texto livre saiu como o template de alternativa do projeto (trilho
   * oficial). A plataforma decide, mas não esconde.
   */
  delivery?: DeliveryInfo;
}

/** Desvio tomado pela plataforma no envio (schema `DeliveryInfo`). */
export interface DeliveryInfo {
  /** Caminho tomado (hoje: `template_fallback`). */
  via?: "template_fallback";
  /** Nome do template efetivamente enviado. */
  template?: string;
  /** Uma frase explicando o que aconteceu, pronta para mostrar a uma pessoa. */
  note?: string;
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
  /**
   * De onde o número vem: `unofficial` (pareado por QR) ou `official` (número da
   * Meta — sem QR, sessão nem regra de tempo de conexão; o ciclo de vida fica em /official/numbers).
   */
  rail?: "unofficial" | "official";
  status_reason?: InstanceReason;
  /** Quando um ban TEMPORÁRIO expira (o número reconecta sozinho); ausente = permanente ou sem ban. */
  banned_until?: string | null;
  proxy_url?: string;
  tenant_id?: string;
  project_id?: string;
  /** Início da rampa gradual de limite de envio do número. */
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
  /** Nome do contato, quando conhecido. */
  name?: string;
  avatar_url?: string;
  /** Número (instância) que tratou a última mensagem. */
  last_instance_id?: string;
  /**
   * Última mensagem DO contato. No trilho oficial ela abre a janela de 24h: texto
   * livre passa até `last_inbound_at` + 24h; depois, só template aprovado.
   * Ausente quando o contato nunca escreveu.
   */
  last_inbound_at?: string;
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
  /** LID do WhatsApp (`<dígitos>@lid`) — só na ficha do contato. */
  lid?: string;
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

/**
 * Variação da mensagem (rotacionada). No trilho não oficial é texto: o corpo
 * aceita {variaveis} e spintax {a|b}. No OFICIAL é um template aprovado
 * (`template`) — texto livre só alcança quem escreveu nas últimas 24h.
 */
export interface CampaignVariation {
  /** Corpo de texto (trilho não oficial). Numa variação de template, deixe vazio. */
  body: string;
  weight?: number;
  media?: Record<string, unknown>;
  template?: CampaignVariationTemplate;
}

/**
 * Template APROVADO do projeto (trilho oficial). Conferido ao criar/editar a
 * campanha: precisa existir, estar aprovado e ter tantas `variables` quantas o
 * corpo espera. Cada valor aceita {coluna} da lista de destinatários.
 */
export interface CampaignVariationTemplate {
  name: string;
  /** Obrigatório só quando o template existe em mais de um idioma. */
  language?: string;
  variables?: string[];
  header_variables?: string[];
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
  /** Números elegíveis agora. */
  numbers_available: number;
  estimated_seconds: number;
  /** Ex.: `2h15m0s`. */
  estimated_human: string;
}

/** Estado atual e histórico de mudanças de qualidade e limite de um número oficial. */
export interface NumberHealth {
  quality_rating: string;
  messaging_limit: string;
  history: Array<{ quality_rating: string; messaging_limit: string; at: string }>;
}

/** Quanto a Meta vai cobrar por uma campanha de template (trilho oficial). */
export interface CampaignMetaCost {
  currency: string;
  category: "marketing" | "utility" | "authentication" | "service";
  unit_price: number;
  total: number;
  /** Contatos novos por dia que o número alcança. */
  daily_limit?: number;
  days_needed?: number;
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
  /** Quando o cliente converteu esta conta para uso geral. Ausente = ainda gerida
   *  pelo parceiro, e por isso sem chave de API própria. */
  standalone_at?: string | null;
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
  /** `+DDIdigits` (E.164 sem espaços) ou o LID do WhatsApp (`<dígitos>@lid`). */
  phone: string;
  /** LID do WhatsApp; com o telefone, o contato do LID se funde ao do telefone. */
  lid?: string;
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
  /** `+DDIdigits` ou o LID do WhatsApp (`<dígitos>@lid`) — a chave do upsert. */
  phone: string;
  /** LID do WhatsApp (`<dígitos>@lid` ou só os dígitos). */
  lid?: string;
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
  /** Tags para TODAS as linhas (somam às de cada linha). */
  tags?: string[];
  /** Grupos para TODAS as linhas (somam aos de cada linha). */
  groups?: string[];
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
  /**
   * Número espelho deste número oficial (em `listOfficialNumbers`): o mesmo
   * valor que se passa em `instance_id` no envio para escolher por qual número
   * a mensagem sai, exatamente como no trilho não oficial.
   */
  instance_id?: string;
  /** Em `listOfficialNumbers`: o número que envia quando o pedido não escolhe um. */
  is_default?: boolean;
}

/**
 * `POST /official/account` (schema `ConnectOfficialAccount`).
 *
 * Chamar de novo substitui as credenciais — é o caminho de reconexão quando o
 * token é revogado, e nunca cria uma segunda conta no mesmo projeto.
 */
export interface ConnectOfficialAccountParams {
  waba_id: string;
  /**
   * Opcional — sem ele, o número é descoberto pela WABA. Se a WABA tiver mais
   * de um número, a API responde 409 com a lista (`AmbiguousPhoneNumbers` em
   * `error.body.numbers`) para o dono da conta escolher.
   */
  phone_number_id?: string;
  /**
   * Token da WABA (guardado cifrado). O token da tela "API Setup" da Meta
   * expira em 24h; para conexão duradoura use um usuário de sistema com
   * `whatsapp_business_messaging` + `whatsapp_business_management`.
   */
  access_token: string;
  display_number?: string;
  verified_name?: string;
  status?: "PENDENTE" | "AGUARDANDO_PAGAMENTO" | "ATIVA";
}

/** O que já está pronto e o que falta, conferido ao vivo contra a Meta. `GET /official/status` */
export interface OfficialReadiness {
  connected: boolean;
  /** A única pergunta que interessa: este projeto consegue enviar agora? */
  can_send: boolean;
  /** Falso = não deu para falar com a Meta; os valores são os últimos conhecidos. */
  live: boolean;
  /** O número concluiu a verificação por SMS/ligação. */
  number_verified: boolean;
  status?: OfficialAccountStatus;
  status_reason?: string;
  display_number?: string;
  verified_name?: string;
  /**
   * Análise do nome de exibição (APPROVED, PENDING_REVIEW, REJECTED). Reprovação
   * não bloqueia o envio — aparece o número no lugar do nome.
   */
  name_status?: string;
  /** Verificação da empresa (APPROVED, PENDING). É o que libera faixas maiores de volume. */
  business_review?: string;
  /** Moeda em que a Meta cobra a conta. Conta brasileira em USD migra para BRL até 30/06/2027. */
  currency?: string;
  quality_rating?: string;
  messaging_limit?: string;
  /** `invalid_token` (precisa reconectar) ou `meta_unavailable`. */
  problem?: string;
}

/** Dados que o navegador precisa para abrir o Embedded Signup da Meta. `GET /official/signup-config` */
export interface OfficialSignupConfig {
  /** Falso = esta instalação não tem Embedded Signup; ofereça o caminho manual. */
  enabled: boolean;
  app_id: string;
  config_id: string;
  /** Ex.: `v26.0`. */
  graph_version: string;
}

/** `POST /official/embedded-signup` */
export interface CompleteOfficialSignupParams {
  /** Código de uso único do callback do Embedded Signup (vale ~30 s). */
  code: string;
  waba_id: string;
  /** Opcional — descoberto pela WABA quando o popup não o informa. */
  phone_number_id?: string;
}

export interface OfficialSignupResult {
  account?: OfficialAccount;
  /**
   * `webhooks_not_subscribed` ou `phone_not_registered` — conectou, mas um passo
   * precisa de atenção (a conta fica salva de qualquer jeito; ofereça repetir).
   */
  warning?: "" | "webhooks_not_subscribed" | "phone_not_registered";
}

/** `GET /official/numbers` */
export interface OfficialNumberList {
  numbers: OfficialAccount[];
}

/** Um número da conta comercial como a Meta o informa. */
export interface MetaPhoneNumber {
  /** Id da Meta do número (`phone_number_id`) — é o que vai em `addOfficialNumber`. */
  id?: string;
  display_phone_number?: string;
  verified_name?: string;
  /** VERIFIED, NOT_VERIFIED ou EXPIRED. */
  code_verification_status?: string;
  /** Análise do nome de exibição: APPROVED, PENDING_REVIEW, REJECTED. */
  name_status?: string;
  quality_rating?: string;
  messaging_limit_tier?: string;
}

/** `GET /official/numbers/available` */
export interface MetaPhoneNumberList {
  numbers: MetaPhoneNumber[];
}

/** `POST /official/numbers` */
export interface AddOfficialNumberParams {
  /** Id da Meta do número (`id` de `listAvailableOfficialNumbers`). */
  phone_number_id: string;
}

/** Setor da empresa (lista fechada da Meta). */
export type BusinessVertical =
  | "UNDEFINED"
  | "OTHER"
  | "AUTO"
  | "BEAUTY"
  | "APPAREL"
  | "EDU"
  | "ENTERTAIN"
  | "EVENT_PLAN"
  | "FINANCE"
  | "GROCERY"
  | "GOVT"
  | "HOTEL"
  | "HEALTH"
  | "NONPROFIT"
  | "PROF_SERVICES"
  | "RETAIL"
  | "TRAVEL"
  | "RESTAURANT"
  | "NOT_A_BIZ";

/**
 * Perfil comercial de um número do trilho oficial — o que o cliente final vê
 * ao abrir a conversa. Campo vazio LIMPA o valor na Meta: envie sempre o perfil
 * inteiro (leia, edite, devolva).
 */
export interface BusinessProfile {
  /** Linha curta sob o nome (até 139 caracteres). */
  about?: string;
  /** Até 256 caracteres. */
  address?: string;
  /** Até 512 caracteres. */
  description?: string;
  email?: string;
  vertical?: BusinessVertical;
  /** No máximo 2 sites. */
  websites?: string[];
  /** Foto atual, servida pela Meta. Só na leitura; troque pela rota da foto. */
  readonly profile_picture_url?: string;
}

// ----- Templates (trilho oficial) -----

export type TemplateCategory = "MARKETING" | "UTILITY" | "AUTHENTICATION";

/** Cabeçalho do template. Texto aceita no MÁXIMO uma variável. */
export interface TemplateHeader {
  type: "text" | "image" | "video" | "document";
  /** Cabeçalho de texto, até 60 caracteres. */
  text?: string;
  /** Valor de amostra da variável do cabeçalho. A Meta reprova variável sem exemplo. */
  example?: string;
  /**
   * Só em cabeçalho de mídia — URL pública do arquivo de AMOSTRA (ou a `url`
   * devolvida por `uploadTemplateMedia`). A API baixa e envia à Meta.
   */
  media_url?: string;
}

/** Corpo do template — o único componente obrigatório. */
export interface TemplateBody {
  /**
   * Use `{{1}}`, `{{2}}`… para os valores que mudam, numerados a partir de 1 e
   * sem pular. Não pode começar nem terminar com variável, e duas variáveis não
   * podem ficar coladas — a Meta reprova os três casos, e a API confere antes.
   */
  text: string;
  /** Um valor de amostra por variável, na ordem. Omitir é o motivo nº 1 de reprovação. */
  example?: string[];
}

export interface TemplateButton {
  type: "quick_reply" | "url" | "phone_number";
  /** Até 25 caracteres. */
  text: string;
  /** Botões de url (até 2 por template); pode terminar com um `{{1}}`. */
  url?: string;
  /** Botões de telefone (no máximo 1 por template). */
  phone?: string;
  /** URL de amostra preenchida, obrigatória quando a url tem variável. */
  example?: string;
}

/**
 * O formato simples que você preenche. A API o converte no array de componentes
 * da Meta — o aninhamento, o formato dos exemplos e as regras que ela não
 * documenta junto não são problema seu. `POST /templates`
 */
export interface TemplateSpec {
  /** Só minúsculas, números e `_`. É por ele que você envia. */
  name: string;
  /** Ex.: `pt_BR` (`pt-BR` também é aceito). */
  language: string;
  /**
   * Decide quanto a conversa CUSTA e o que a Meta aceita no conteúdo — não é um
   * rótulo administrativo. UTILITY é mais barata, mas linguagem promocional nela
   * é reclassificada, e o preço muda junto.
   */
  category: TemplateCategory;
  header?: TemplateHeader;
  body: TemplateBody;
  /** Até 60 caracteres. Não aceita variável. */
  footer?: string;
  /** Até 10 botões. */
  buttons?: TemplateButton[];
  /**
   * Só em AUTHENTICATION (1 a 90). Nessa categoria a Meta escreve o texto e
   * inclui o botão de copiar o código; isto é a única coisa que você define.
   */
  code_expiry_minutes?: number;
  /**
   * Oferta por tempo limitado (MARKETING): selo de até 16 caracteres e, com
   * `has_expiration`, contagem regressiva até o `offer_expires_at` do envio.
   */
  limited_time_offer?: { text: string; has_expiration?: boolean };
  /**
   * Carrossel (MARKETING ou UTILITY, 2 a 10 cartões): o template fica só com o
   * `body` de abertura; cada cartão tem mídia, texto e 1–2 botões, com o mesmo
   * tipo de mídia e os mesmos botões em todos.
   */
  cards?: Array<{ header: TemplateHeader; body: TemplateBody; buttons: TemplateButton[] }>;
}

/** Um template como o bZapper o guarda. A Meta é a dona da verdade do status. */
export interface Template {
  id?: string;
  project_id?: string;
  name?: string;
  language?: string;
  category?: TemplateCategory;
  /**
   * A decisão é assíncrona e pode levar até 24h. Ela chega pelos webhooks
   * `template.approved` / `template.rejected` — você não precisa ficar
   * consultando.
   */
  status?: "PENDING" | "APPROVED" | "REJECTED" | "PAUSED" | "DISABLED";
  /** O que a Meta disse ao reprovar. */
  rejected_reason?: string;
  /** RED = a Meta está prestes a pausá-lo sozinha. */
  quality?: "GREEN" | "YELLOW" | "RED";
  /** Quantos valores o corpo espera — e quantos você tem que enviar. */
  variables?: number;
  spec?: TemplateSpec;
  created_at?: string;
  updated_at?: string;
}

/** `GET /templates` */
export interface TemplateList {
  templates: Template[];
}

/** `POST /templates` */
/** Veredito de validateTemplate. */
export interface TemplateCheck {
  valid: boolean;
  /** O que a Meta recusaria, e como consertar. */
  problem?: string;
  advice?: string[];
}

/** Desempenho de um template no período. */
export interface TemplateStats {
  name: string;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  /** Entregues / enviados, em porcentagem. */
  delivery_rate: number;
  /** Lidos / enviados, em porcentagem. */
  read_rate: number;
}

export interface TemplateAnalytics {
  days: number;
  templates: TemplateStats[];
}

/** Filtros da Template Library da Meta (todos opcionais). */
export interface LibraryQuery {
  search?: string;
  topic?: string;
  usecase?: string;
  industry?: string;
  language?: string;
}

/** Modelo pronto da Template Library da Meta. */
export interface LibraryTemplate {
  id?: string;
  name: string;
  language: string;
  category: "UTILITY" | "AUTHENTICATION";
  topic?: string;
  usecase?: string;
  industry?: string[];
  header?: string;
  /** Corpo com variáveis {{n}}. */
  body: string;
  /** Exemplo de cada variável. */
  body_params?: string[];
  buttons?: Array<Record<string, unknown>>;
}

export interface LibraryTemplateList {
  templates: LibraryTemplate[];
}

/** O que um botão de link ou de telefone do modelo pede. */
export interface LibraryButtonInput {
  type: "url" | "phone_number";
  url?: string;
  url_suffix_example?: string;
  phone?: string;
}

/** Criação a partir da Template Library. */
export interface LibraryCreate {
  library_template_name: string;
  /** Seu nome para o template (padrão: o da biblioteca). */
  name?: string;
  language: string;
  button_inputs?: LibraryButtonInput[];
  /** Só em modelo de Autenticação (padrão 10). */
  code_expiry_minutes?: number;
}

export interface CreateTemplateResult {
  template?: Template;
  /**
   * Avisos que NÃO impediram a submissão mas mudam o resultado — linguagem
   * promocional num template UTILITY, por exemplo, que a Meta reclassifica
   * sozinha, e reclassificar muda o preço.
   */
  advice?: string[];
}

/** `POST /templates/sync` */
export interface TemplateSyncResult {
  /** Quantos templates vieram da Meta. */
  imported?: number;
}

/** `GET /templates/fallback` */
/** O que a Meta exige para liberar templates de Autenticação, com o estado de cada critério. */
export interface OTPEligibility {
  business_verification: string;
  messaging_limit: string;
  required_limit: string;
  verification_ok: boolean;
  limit_ok: boolean;
  approved_auth_templates: number;
}

export interface OTPTemplate {
  /** `null` quando nenhum foi escolhido (vale o primeiro de Autenticação aprovado). */
  template: Template | null;
  eligibility: OTPEligibility;
}

export interface FallbackTemplate {
  /** `null` quando não há alternativa configurada. */
  template: Template | null;
}

/** `PUT /templates/fallback` */
export interface SetFallbackTemplateParams {
  /** Id do template APROVADO. String vazia limpa a alternativa. */
  template_id?: string;
}

/**
 * Envio de template aprovado — o único jeito de iniciar conversa fora da janela
 * de 24h. `POST /messages/template`
 */
export interface SendTemplateParams extends SendBase {
  /** NOME do template. O id que a Meta deu a ele nunca aparece aqui. */
  template: string;
  /**
   * Ex.: `pt_BR`. Pode ser omitido quando o nome existe num só idioma; se
   * existir em mais de um, a API devolve 409 `template_ambiguous` em vez de
   * escolher por você.
   */
  language?: string;
  /**
   * Valores do corpo, na ordem (`{{1}}`, `{{2}}`…). A quantidade tem que bater
   * exatamente com o template aprovado — divergência é a causa nº 1 do erro
   * 132000 da Meta, e a API confere antes de gastar a chamada.
   */
  variables?: string[];
  /** Valor da variável do cabeçalho, quando o template tem uma. */
  header_variables?: string[];
  /** Valores de botões de URL dinâmica, por índice de botão. Entradas vazias são puladas. */
  button_variables?: string[];
  /**
   * Só em template de categoria AUTHENTICATION. A Meta exige o código no corpo
   * E no botão de copiar; a API coloca nos dois.
   */
  code?: string;
  /** Oferta com prazo: o prazo deste envio (RFC 3339). */
  offer_expires_at?: string;
  /** Carrossel: os valores de cada cartão, na ordem. */
  cards?: Array<{ header_url?: string; variables?: string[]; button_variables?: string[] }>;
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
