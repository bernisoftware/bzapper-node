/**
 * Erro tipado lançado pelo SDK em respostas não-2xx.
 *
 * A lógica do cliente deve usar SEMPRE o `code` (estável), nunca o `message`
 * (texto traduzido, só para humanos).
 */
export class BzapperError extends Error {
  /**
   * Código neutro estável (ex.: `instance_not_connected`, `rate_limited`).
   *
   * bZapper Connect (key entregue a um parceiro): `connect_suspended` (402 — o
   * Pro do cliente está sem pagamento; volta sozinho quando pagar) e
   * `connect_revoked` (401 — a conexão foi encerrada).
   */
  readonly code: string;
  /** HTTP status code da resposta. */
  readonly statusCode: number;
  /** Locale da mensagem traduzida, quando informado pela API. */
  readonly locale?: string;

  constructor(args: {
    code: string;
    message: string;
    statusCode: number;
    locale?: string;
  }) {
    super(args.message);
    this.name = "BzapperError";
    this.code = args.code;
    this.statusCode = args.statusCode;
    this.locale = args.locale;
    // Mantém a cadeia de protótipo correta ao transpilar para ES5/ESNext.
    Object.setPrototypeOf(this, BzapperError.prototype);
  }
}
