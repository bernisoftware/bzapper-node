/**
 * Erros da SDK.
 *
 * Toda resposta fora de 2xx vira um {@link BzapperError} (ou uma subclasse dele). A lógica
 * do cliente deve usar SEMPRE o `code` (estável), nunca o `message` (texto traduzido, só
 * para humanos).
 *
 * | Status            | Classe                    |
 * |-------------------|---------------------------|
 * | 400, 422          | {@link ValidationError}   |
 * | 401               | {@link AuthenticationError} |
 * | 403               | {@link PermissionDeniedError} |
 * | 404               | {@link NotFoundError}     |
 * | 409               | {@link ConflictError}     |
 * | 429               | {@link RateLimitError}    |
 * | 5xx               | {@link ServerError}       |
 * | sem resposta      | {@link NetworkError} (`status = 0`, `code = "NETWORK_ERROR"`) |
 * | qualquer outro    | {@link BzapperError}      |
 */

/** Dados para construir um {@link BzapperError}. */
export interface BzapperErrorInit {
  code: string;
  message: string;
  statusCode: number;
  locale?: string;
  /** `X-Request-Id` da resposta (ou o que a SDK enviou). */
  requestId?: string;
  /** Segundos do header `Retry-After` (só 429). */
  retryAfter?: number;
  /** Header `X-Required-Scope` (só 403 de escopo). */
  requiredScope?: string;
  /** Corpo decodificado da resposta de erro. */
  body?: unknown;
  /** Erro original (ex.: falha de rede do `fetch`). */
  cause?: unknown;
}

/**
 * Erro tipado lançado pelo SDK em respostas não-2xx (e, pelas subclasses, em falhas de rede).
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
   *
   * Sem corpo JSON: `HTTP_<status>`. Sem resposta: `NETWORK_ERROR`. Resposta 2xx que não é
   * JSON: `INVALID_RESPONSE`.
   */
  readonly code: string;
  /** HTTP status code da resposta (`0` em erro de rede). */
  readonly statusCode: number;
  /** Locale da mensagem traduzida, quando informado pela API. */
  readonly locale?: string;
  /** O mesmo que {@link statusCode} (nome do padrão Berni Software). */
  readonly status: number;
  /**
   * Id da requisição: header `X-Request-Id` da resposta, senão o que a SDK enviou.
   * Informe ao suporte para achar a chamada no log.
   */
  readonly requestId?: string;
  /** Segundos pedidos pelo header `Retry-After` (só em 429). */
  readonly retryAfter?: number;
  /** Escopo que faltou na chave de API (header `X-Required-Scope`, só em 403 de escopo). */
  readonly requiredScope?: string;
  /** Corpo decodificado da resposta de erro (detalhe estruturado de alguns erros). */
  readonly body?: unknown;

  constructor(args: BzapperErrorInit) {
    super(args.message, args.cause === undefined ? undefined : { cause: args.cause });
    this.name = "BzapperError";
    this.code = args.code;
    this.statusCode = args.statusCode;
    this.status = args.statusCode;
    this.locale = args.locale;
    this.requestId = args.requestId;
    this.retryAfter = args.retryAfter;
    this.requiredScope = args.requiredScope;
    this.body = args.body;
    // Mantém a cadeia de protótipo correta (também para as subclasses) ao transpilar.
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /** Representação para logs estruturados (`JSON.stringify(err)`). */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      status: this.statusCode,
      locale: this.locale,
      requestId: this.requestId,
      retryAfter: this.retryAfter,
      requiredScope: this.requiredScope,
      body: this.body,
    };
  }
}

/** 401 — chave ausente, inválida ou revogada (inclui `connect_revoked`). */
export class AuthenticationError extends BzapperError {
  constructor(args: BzapperErrorInit) {
    super(args);
    this.name = "AuthenticationError";
  }
}

/** 403 — chave sem o escopo da operação (`requiredScope`) ou sem permissão (ex.: `admin_required`). */
export class PermissionDeniedError extends BzapperError {
  constructor(args: BzapperErrorInit) {
    super(args);
    this.name = "PermissionDeniedError";
  }
}

/** 404 — recurso inexistente. */
export class NotFoundError extends BzapperError {
  constructor(args: BzapperErrorInit) {
    super(args);
    this.name = "NotFoundError";
  }
}

/** 409 — conflito de estado (ex.: `instance_not_connected`, `idempotency_in_progress`). */
export class ConflictError extends BzapperError {
  constructor(args: BzapperErrorInit) {
    super(args);
    this.name = "ConflictError";
  }
}

/** 400 ou 422 — corpo ou parâmetro inválido. */
export class ValidationError extends BzapperError {
  constructor(args: BzapperErrorInit) {
    super(args);
    this.name = "ValidationError";
  }
}

/** 429 — limite de requisições; `retryAfter` diz quanto esperar. */
export class RateLimitError extends BzapperError {
  constructor(args: BzapperErrorInit) {
    super(args);
    this.name = "RateLimitError";
  }
}

/** 5xx — erro do lado do bZapper (informe o `requestId`). */
export class ServerError extends BzapperError {
  constructor(args: BzapperErrorInit) {
    super(args);
    this.name = "ServerError";
  }
}

/** Falha de conexão ou tempo esgotado: `status = 0`, `code = "NETWORK_ERROR"`. */
export class NetworkError extends BzapperError {
  constructor(args: { message: string; requestId?: string; cause?: unknown }) {
    super({
      code: "NETWORK_ERROR",
      message: args.message,
      statusCode: 0,
      requestId: args.requestId,
      cause: args.cause,
    });
    this.name = "NetworkError";
  }
}

/** Escolhe a classe de erro pelo status HTTP. */
export function errorForStatus(args: BzapperErrorInit): BzapperError {
  const s = args.statusCode;
  if (s === 400 || s === 422) return new ValidationError(args);
  if (s === 401) return new AuthenticationError(args);
  if (s === 403) return new PermissionDeniedError(args);
  if (s === 404) return new NotFoundError(args);
  if (s === 409) return new ConflictError(args);
  if (s === 429) return new RateLimitError(args);
  if (s >= 500) return new ServerError(args);
  return new BzapperError(args);
}
