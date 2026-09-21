import { BzapperError } from "./error.js";
import { CLIENT_ID } from "./version.js";
import type { ApiErrorBody } from "./types.js";

/** URL base padrão da API (produção). Sobrescreva só em dev/self-host. */
export const DEFAULT_BASE_URL = "https://api.bzapper.com.br";

export type Query = Record<string, string | number | boolean | undefined>;

/**
 * Transporte HTTP interno, compartilhado pelo `Bzapper` (API key) e pelo
 * `BzapperPartner` (partner secret). A credencial muda; o resto — headers,
 * timeout, parse e `BzapperError` — é o mesmo. Não exportado no index.
 */
export class HttpTransport {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly locale?: string;
  private readonly timeout: number;
  private readonly fetchImpl: typeof fetch;

  constructor(args: {
    /** Prefixo das mensagens de erro de construção (ex.: `Bzapper`). */
    label: string;
    token: string;
    baseUrl?: string;
    locale?: string;
    timeout?: number;
    fetch?: typeof fetch;
  }) {
    this.baseUrl = (args.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.token = args.token;
    this.locale = args.locale;
    this.timeout = args.timeout ?? 30_000;

    const f = args.fetch ?? globalThis.fetch;
    if (typeof f !== "function") {
      throw new Error(
        `${args.label}: \`fetch\` global indisponível. Use Node 18+ ou passe \`fetch\` nas opções.`,
      );
    }
    this.fetchImpl = f;
  }

  async request<T>(
    method: string,
    path: string,
    body?: unknown,
    query?: Query,
    extraHeaders?: Record<string, string>,
  ): Promise<T> {
    const url = this.buildUrl(path, query);

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      Accept: "application/json",
      // Identifica SDK e versão para a API — é por ele que avisamos você
      // quando a versão que roda tem correção que exige atualizar o código.
      // Não usamos User-Agent: o fetch de browser/edge proíbe defini-lo.
      "X-Bzapper-Client": CLIENT_ID,
    };
    if (this.locale) headers["Accept-Language"] = this.locale;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (extraHeaders) Object.assign(headers, extraHeaders);

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
