import { randomUUID } from "node:crypto";
import { BzapperError, NetworkError, errorForStatus } from "./error.js";
import { CLIENT_ID } from "./version.js";

/** URL base padrão da API (produção). Sobrescreva só em dev/self-host. */
export const DEFAULT_BASE_URL = "https://api.bzapper.com.br";

/** Valor aceito na query. `Date` vira ISO 8601 UTC com `Z`; lista vira CSV; `undefined`/`null` são omitidos. */
export type QueryValue = string | number | boolean | Date | readonly (string | number)[] | null | undefined;

export type Query = Record<string, QueryValue>;

/**
 * Opções por chamada, aceitas como último argumento (opcional) de todo método.
 */
export interface RequestOptions {
  /**
   * Vai no header `Idempotency-Key` das escritas (POST/PUT/PATCH/DELETE). Padrão: um uuid4
   * gerado por chamada e repetido nas novas tentativas. Passe o seu para tornar segura a
   * repetição da MESMA operação entre execuções (ex.: um job que pode rodar duas vezes).
   */
  idempotencyKey?: string;
  /** Tempo máximo por tentativa, em ms (sobrepõe o do cliente). */
  timeout?: number;
  /** Novas tentativas além da primeira (sobrepõe o do cliente). `0` desliga. */
  maxRetries?: number;
  /** Cancela a chamada (inclusive a espera entre tentativas). Não é tentado de novo. */
  signal?: AbortSignal;
}

/** Função de espera entre tentativas (substituível nos testes). */
export type SleepFn = (ms: number, signal?: AbortSignal) => Promise<void>;

/**
 * Arquivo para upload (`multipart/form-data`).
 *
 * Use {@link fileFromPath} para ler do disco.
 */
export interface FileUpload {
  /** Bytes do arquivo. */
  content: Uint8Array | ArrayBuffer | Blob;
  /** Nome do arquivo (ex.: `logo.png`). */
  filename: string;
  /** Tipo MIME (ex.: `image/png`). */
  contentType?: string;
}

/** Monta um {@link FileUpload} a partir de um caminho no disco (Node). */
export async function fileFromPath(path: string, contentType?: string): Promise<FileUpload> {
  const { readFile } = await import("node:fs/promises");
  const { basename } = await import("node:path");
  const content = await readFile(path);
  return { content: new Uint8Array(content), filename: basename(path), contentType };
}

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

const WRITE_METHODS = new Set<string>(["POST", "PUT", "PATCH", "DELETE"]);
const RETRY_STATUSES = new Set([429, 502, 503, 504]);
const MAX_RETRY_AFTER_S = 60;

// ── Codificação ──────────────────────────────────────────────────────────────

/**
 * Percent-encoding estrito (RFC 3986) de UM segmento de caminho: `abc 1` → `abc%201`,
 * `a/b` → `a%2Fb`. JIDs passam como vieram, só codificados.
 *
 * Vazio, `.` e `..` são recusados com `TypeError` antes de qualquer requisição: o parser de
 * URL do `fetch` resolve `.`/`..` como diretório atual/pai, e a requisição iria para outra rota.
 */
export function encodePath(value: string, name = "id"): string {
  if (typeof value !== "string" && typeof value !== "number") {
    throw new TypeError(`bZapper: \`${name}\` é obrigatório (string).`);
  }
  const raw = String(value);
  if (raw === "") throw new TypeError(`bZapper: \`${name}\` não pode ser vazio.`);
  if (raw === "." || raw === "..") {
    throw new TypeError(`bZapper: \`${name}\` não pode ser "${raw}" (não é endereçável num caminho HTTP).`);
  }
  return encodeURIComponent(raw).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/** `Date` → ISO 8601 em UTC com `Z` (sem milissegundos quando zerados). */
function toIsoUtc(value: Date): string {
  if (Number.isNaN(value.getTime())) throw new TypeError("bZapper: data inválida.");
  return value.toISOString().replace(/\.000Z$/, "Z");
}

function formatQueryValue(value: Exclude<QueryValue, null | undefined>): string {
  if (value instanceof Date) return toIsoUtc(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) return value.map(String).join(",");
  return String(value);
}

function buildQuery(query: Query | undefined): string {
  if (!query) return "";
  const parts: string[] = [];
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(formatQueryValue(value))}`);
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

// ── Novas tentativas ─────────────────────────────────────────────────────────

/** Segundos de um header `Retry-After` (número ou data HTTP). */
function parseRetryAfter(value: string | null): number | undefined {
  if (value === null) return undefined;
  const text = value.trim();
  if (/^\d+(\.\d+)?$/.test(text)) return Number(text);
  const at = Date.parse(text);
  if (Number.isNaN(at)) return undefined;
  return Math.max(0, Math.ceil((at - Date.now()) / 1000));
}

/** Espera antes da nova tentativa `attempt` (0 = primeira nova tentativa), em ms. */
function retryDelayMs(attempt: number, retryAfter: number | undefined): number {
  if (retryAfter !== undefined) return Math.min(retryAfter, MAX_RETRY_AFTER_S) * 1000;
  const base = Math.min(8, 0.5 * 2 ** attempt);
  return Math.round((base + base * 0.25 * Math.random()) * 1000);
}

/** Espera padrão: `setTimeout`, interrompida pelo `signal`. */
const defaultSleep: SleepFn = (ms, signal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });

// ── Respostas ────────────────────────────────────────────────────────────────

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

function buildError(status: number, headers: Headers, text: string, sentRequestId: string): BzapperError {
  let decoded: unknown;
  try {
    decoded = text.trim() === "" ? undefined : JSON.parse(text);
  } catch {
    decoded = undefined; // corpo não-JSON: fallback abaixo
  }
  const body = isObject(decoded) ? decoded : undefined;
  const code = nonEmptyString(body?.code) ?? nonEmptyString(body?.error) ?? `HTTP_${status}`;
  return errorForStatus({
    code,
    message: nonEmptyString(body?.message) ?? code,
    statusCode: status,
    locale: nonEmptyString(body?.locale),
    requestId: nonEmptyString(headers.get("x-request-id")) ?? sentRequestId,
    retryAfter: status === 429 ? parseRetryAfter(headers.get("retry-after")) : undefined,
    requiredScope: status === 403 ? nonEmptyString(headers.get("x-required-scope")) : undefined,
    body: decoded ?? (text === "" ? undefined : text),
  });
}

/** Marca interna de tempo esgotado. */
class TimeoutSignal extends Error {
  constructor() {
    super("timeout");
    this.name = "TimeoutSignal";
  }
}

function describeCause(err: unknown): string {
  if (err instanceof Error) {
    const cause = (err as Error & { cause?: unknown }).cause;
    if (cause instanceof Error && cause.message) return `${err.message}: ${cause.message}`;
    if (cause && typeof cause === "object" && "code" in cause) {
      return `${err.message}: ${String((cause as { code: unknown }).code)}`;
    }
    return err.message || err.name;
  }
  return String(err);
}

/** Uma requisição lógica (pode virar várias tentativas). */
export interface RequestSpec {
  method: HttpMethod | string;
  /** Caminho com os segmentos já codificados (use {@link encodePath}). */
  path: string;
  query?: Query;
  /** Corpo JSON. `undefined` = sem corpo. */
  body?: unknown;
  /** Upload `multipart/form-data` (exclusivo com `body`). */
  file?: FileUpload;
  /** Campos extras do formulário multipart. */
  fields?: Record<string, string>;
  /** Headers extras (legado; prefira `options`). */
  headers?: Record<string, string>;
}

/**
 * Transporte HTTP interno, compartilhado pelo `Bzapper` (API key) e pelo
 * `BzapperPartner` (partner secret). A credencial muda; o resto — headers,
 * novas tentativas, idempotência, parse e `BzapperError` — é o mesmo. Não exportado no index.
 */
export class HttpTransport {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly locale?: string;
  private readonly projectId?: string;
  private readonly timeout: number;
  private readonly maxRetries: number;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: SleepFn;

  constructor(args: {
    /** Prefixo das mensagens de erro de construção (ex.: `Bzapper`). */
    label: string;
    token: string;
    baseUrl?: string;
    locale?: string;
    projectId?: string;
    timeout?: number;
    maxRetries?: number;
    fetch?: typeof fetch;
    sleep?: SleepFn;
  }) {
    this.baseUrl = (args.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.token = args.token;
    this.locale = args.locale;
    this.projectId = args.projectId;
    this.timeout = args.timeout ?? 30_000;
    this.maxRetries = args.maxRetries ?? 2;
    if (!Number.isInteger(this.maxRetries) || this.maxRetries < 0) {
      throw new TypeError(`${args.label}: \`maxRetries\` precisa ser um inteiro ≥ 0.`);
    }
    this.sleep = args.sleep ?? defaultSleep;

    const f = args.fetch ?? globalThis.fetch;
    if (typeof f !== "function") {
      throw new Error(
        `${args.label}: \`fetch\` global indisponível. Use Node 18+ ou passe \`fetch\` nas opções.`,
      );
    }
    this.fetchImpl = f;
  }

  /** Forma legada (posicional) — delega para {@link call}. */
  request<T>(
    method: string,
    path: string,
    body?: unknown,
    query?: Query,
    extraHeaders?: Record<string, string>,
    options?: RequestOptions,
  ): Promise<T> {
    return this.call<T>({ method, path, body, query, headers: extraHeaders }, options);
  }

  /** Faz a chamada lógica (com novas tentativas) e devolve o JSON de sucesso. */
  async call<T>(spec: RequestSpec, options: RequestOptions = {}): Promise<T> {
    const url = this.baseUrl + spec.path + buildQuery(spec.query);
    const requestId = randomUUID().replace(/-/g, "");

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      Accept: "application/json",
      // Identifica SDK e versão para a API — é por ele que avisamos você
      // quando a versão que roda tem correção que exige atualizar o código.
      "X-Bzapper-Client": CLIENT_ID,
      "User-Agent": CLIENT_ID,
      "X-Request-Id": requestId,
    };
    if (this.locale) headers["Accept-Language"] = this.locale;
    if (this.projectId) headers["X-Project-Id"] = this.projectId;
    if (spec.headers) Object.assign(headers, spec.headers);
    const method = spec.method.toUpperCase();
    if (WRITE_METHODS.has(method)) {
      headers["Idempotency-Key"] = options.idempotencyKey ?? headers["Idempotency-Key"] ?? randomUUID();
    }

    let payload: string | FormData | undefined;
    if (spec.file) {
      const form = new FormData();
      for (const [k, v] of Object.entries(spec.fields ?? {})) form.append(k, v);
      const f = spec.file;
      const blob =
        f.content instanceof Blob
          ? f.content
          : new Blob(
              [f.content instanceof ArrayBuffer ? new Uint8Array(f.content) : f.content],
              f.contentType ? { type: f.contentType } : undefined,
            );
      form.append("file", blob, f.filename);
      payload = form; // o fetch define o Content-Type com o boundary
    } else if (spec.body !== undefined) {
      payload = JSON.stringify(spec.body);
      headers["Content-Type"] = "application/json";
    }

    const timeout = options.timeout ?? this.timeout;
    const maxRetries = options.maxRetries ?? this.maxRetries;
    const signal = options.signal;

    for (let attempt = 0; ; attempt++) {
      signal?.throwIfAborted();
      let res: { status: number; headers: Headers; text: string };
      try {
        res = await this.attempt(url, method, headers, payload, timeout, signal);
      } catch (err) {
        if (signal?.aborted) throw err; // cancelado por quem chamou: propaga, sem nova tentativa
        const error =
          err instanceof TimeoutSignal
            ? new NetworkError({ message: `NETWORK_ERROR: tempo esgotado após ${timeout} ms.`, requestId })
            : new NetworkError({ message: `NETWORK_ERROR: ${describeCause(err)}`, requestId, cause: err });
        if (attempt < maxRetries) {
          await this.sleep(retryDelayMs(attempt, undefined), signal);
          continue;
        }
        throw error;
      }

      if (res.status >= 200 && res.status < 300) {
        // 204 No Content e corpos vazios.
        if (res.text.trim() === "") return undefined as T;
        try {
          return JSON.parse(res.text) as T;
        } catch {
          throw new BzapperError({
            code: "INVALID_RESPONSE",
            message: `INVALID_RESPONSE: resposta ${res.status} não é JSON.`,
            statusCode: res.status,
            requestId: res.headers.get("x-request-id") || requestId,
            body: res.text,
          });
        }
      }

      const error = buildError(res.status, res.headers, res.text, requestId);
      if (RETRY_STATUSES.has(res.status) && attempt < maxRetries) {
        await this.sleep(retryDelayMs(attempt, parseRetryAfter(res.headers.get("retry-after"))), signal);
        continue;
      }
      throw error;
    }
  }

  private async attempt(
    url: string,
    method: string,
    headers: Record<string, string>,
    body: string | FormData | undefined,
    timeout: number,
    signal: AbortSignal | undefined,
  ): Promise<{ status: number; headers: Headers; text: string }> {
    const controller = new AbortController();
    const onAbort = () => controller.abort(signal?.reason);
    signal?.addEventListener("abort", onAbort, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort(new TimeoutSignal());
    }, timeout);
    try {
      const res = await this.fetchImpl(url, { method, headers, body, signal: controller.signal });
      const text = await res.text(); // o timeout cobre também a leitura do corpo
      return { status: res.status, headers: res.headers, text };
    } catch (err) {
      if (timedOut) throw new TimeoutSignal();
      throw err;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  }
}
