import { HttpTransport, type Query } from "./http.js";
import type {
  ConnectSession,
  CreateConnectSessionParams,
  ListPartnerConnectionsParams,
  Partner,
  PartnerConnection,
  PartnerConnectionList,
  PartnerConnectionWithKey,
} from "./types.js";

/** Opções de construção do cliente de parceiro (bZapper Connect). */
export interface BzapperPartnerOptions {
  /**
   * Partner secret (`bz_partner_...`). Único campo obrigatório.
   *
   * Só no seu **backend** — o partner secret nunca pode chegar a um navegador.
   */
  partnerSecret: string;
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

/**
 * Cliente do **parceiro** no bZapper Connect: o seu software deixa os SEUS
 * clientes assinarem o bZapper Pro e conectarem o WhatsApp sem sair do seu
 * produto, e recebe uma API key autorizada pelo cliente.
 *
 * Autentica com o partner secret (`Authorization: Bearer bz_partner_...`). Com a
 * key do cliente (`bz_live_...`) em mãos, use o {@link Bzapper} normal.
 *
 * Fluxo: `createConnectSession` → o front abre `BzapperConnect.open({ session })`
 * → o componente emite um `code` → `exchangeCode(code)` devolve a `api_key`.
 *
 * @example
 * ```ts
 * import { BzapperPartner } from "@bzapper/client";
 *
 * const partner = new BzapperPartner({ partnerSecret: "bz_partner_..." });
 * const { session_token } = await partner.createConnectSession({
 *   external_id: "cliente-42",
 *   customer: { name: "Ana Souza", email: "ana@exemplo.com" },
 * });
 * ```
 */
export class BzapperPartner {
  private readonly http: HttpTransport;

  constructor(options: BzapperPartnerOptions) {
    if (!options?.partnerSecret) {
      throw new Error("BzapperPartner: `partnerSecret` é obrigatório.");
    }

    this.http = new HttpTransport({
      label: "BzapperPartner",
      token: options.partnerSecret,
      baseUrl: options.baseUrl,
      locale: options.locale,
      timeout: options.timeout,
      fetch: options.fetch,
    });
  }

  /** Identidade do parceiro (de quem é o partner secret). `GET /partner/me` */
  me(): Promise<Partner> {
    return this.http.request("GET", "/partner/me");
  }

  /**
   * Abre uma sessão do Connect para um cliente seu. `POST /partner/connect-sessions`
   *
   * Cria (ou reutiliza) a **conexão** do cliente (`external_id` = o id dele no SEU
   * sistema) e devolve um `session_token` de curta duração (30 min) para o front
   * abrir o componente. Os dados do cliente são confiáveis: a conta é criada sem
   * senha, captcha nem confirmação de e-mail (exceto se o e-mail já tiver conta —
   * aí o componente pede um código enviado a ele).
   */
  createConnectSession(params: CreateConnectSessionParams): Promise<ConnectSession> {
    return this.http.request("POST", "/partner/connect-sessions", params);
  }

  /**
   * Troca o `code` de conclusão (uso único, válido 10 min) pela API key do
   * cliente. `POST /partner/connect/exchange`
   *
   * A resposta traz a key **crua** (`api_key`, `bz_live_...`) — guarde; ela não é
   * mostrada de novo (use `rotateConnectionKey` se perder).
   */
  exchangeCode(code: string): Promise<PartnerConnectionWithKey> {
    return this.http.request("POST", "/partner/connect/exchange", { code });
  }

  /** Lista suas conexões (filtro por `external_id` / `status`). `GET /partner/connections` */
  listConnections(params: ListPartnerConnectionsParams = {}): Promise<PartnerConnectionList> {
    const query: Query = { external_id: params.external_id, status: params.status };
    return this.http.request("GET", "/partner/connections", undefined, query);
  }

  /** Detalha uma conexão (status, conta, números). `GET /partner/connections/{id}` */
  getConnection(id: string): Promise<PartnerConnection> {
    return this.http.request("GET", `/partner/connections/${encodeURIComponent(id)}`);
  }

  /**
   * Emite uma nova API key para uma conexão concluída (a anterior para de
   * funcionar). `POST /partner/connections/{id}/rotate-key`
   *
   * Responde 409 `connection_not_active` se a conexão não foi concluída ou foi revogada.
   */
  rotateConnectionKey(id: string): Promise<PartnerConnectionWithKey> {
    return this.http.request(
      "POST",
      `/partner/connections/${encodeURIComponent(id)}/rotate-key`,
    );
  }

  /**
   * Encerra uma conexão (revoga a key; NÃO cancela o plano do cliente).
   * Um webhook `connect.revoked` é enviado. `DELETE /partner/connections/{id}`
   */
  revokeConnection(id: string): Promise<void> {
    return this.http.request("DELETE", `/partner/connections/${encodeURIComponent(id)}`);
  }
}

/** Factory equivalente a `new BzapperPartner(options)`. */
export function createPartnerClient(options: BzapperPartnerOptions): BzapperPartner {
  return new BzapperPartner(options);
}
