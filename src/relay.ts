/**
 * Relay de webhooks para o localhost — o motor do comando `bzapper listen`.
 *
 * Abre o stream SSE autenticado `GET /webhooks/listen` (todo evento do projeto,
 * exista ou não webhook cadastrado) e faz um `POST` no seu servidor local com os
 * MESMOS headers da produção:
 *
 * - `X-Bzapper-Signature: sha256=<hmac hex do corpo CRU>`
 * - `X-Bzapper-Event-Id`, `X-Bzapper-Event-Type`, `Content-Type: application/json`
 *
 * O corpo enviado são os bytes crus do campo `data:` do SSE — os mesmos bytes
 * assinados —, então o seu código valida com o `Webhooks`/`verifyWebhook` deste
 * pacote exatamente como validaria a produção.
 *
 * Zero dependências: `fetch` + `node:crypto` do Node 18+.
 */

import { createHmac, randomBytes } from "node:crypto";
import { CLIENT_ID } from "./version.js";
import { EVENT_ID_HEADER, EVENT_TYPE_HEADER, SIGNATURE_HEADER } from "./webhooks.js";

/** Caminho do stream SSE de eventos de webhook do projeto. */
export const LISTEN_PATH = "/webhooks/listen";

/** Nome do evento SSE que o relay consome (os demais são ignorados). */
export const WEBHOOK_SSE_EVENT = "webhook.event";

/** Uma mensagem SSE completa (um quadro terminado por linha em branco). */
export interface SseMessage {
  /** Nome do evento (`event:`); `"message"` quando o campo não vem. */
  event: string;
  /** Corpo do `data:` — linhas múltiplas juntadas com `\n`, sem o `\n` final. */
  data: string;
  /** Último `id:` visto no stream (persiste entre quadros, como manda a spec). */
  id?: string;
}

/**
 * Parser incremental do enquadramento SSE (WHATWG event stream), feito na mão
 * para não depender de `EventSource` (que também não manda headers).
 *
 * Trata quebras `\n`, `\r\n` e `\r`, quadros divididos entre chunks, comentários
 * (`: ping` do keep-alive), `retry:` e `data:` de várias linhas.
 */
export class SseParser {
  private buf = "";
  private dataLines: string[] = [];
  private eventType = "";
  private lastId: string | undefined;

  /** Último `retry:` anunciado pelo servidor, em ms (`undefined` se não veio). */
  retryMs: number | undefined;

  /** Alimenta o parser com um pedaço de texto e devolve os quadros completos. */
  push(chunk: string): SseMessage[] {
    this.buf += chunk;
    const out: SseMessage[] = [];
    for (;;) {
      const at = this.nextBreak();
      if (at === undefined) break;
      const line = this.buf.slice(0, at.index);
      this.buf = this.buf.slice(at.index + at.length);
      const msg = this.line(line);
      if (msg) out.push(msg);
    }
    return out;
  }

  /**
   * Encerra o stream: processa uma última linha pendente sem terminador.
   *
   * A spec descarta o quadro incompleto do fim (sem linha em branco ele nunca
   * foi despachado), e é isso que fazemos — só limpamos o estado.
   */
  flush(): void {
    this.buf = "";
    this.dataLines = [];
    this.eventType = "";
  }

  /**
   * Posição do próximo terminador de linha. Um `\r` no fim do buffer NÃO conta:
   * o `\n` do `\r\n` pode estar no chunk seguinte.
   */
  private nextBreak(): { index: number; length: number } | undefined {
    for (let i = 0; i < this.buf.length; i++) {
      const c = this.buf[i];
      if (c === "\n") return { index: i, length: 1 };
      if (c === "\r") {
        if (i + 1 >= this.buf.length) return undefined; // pode ser \r\n partido
        return { index: i, length: this.buf[i + 1] === "\n" ? 2 : 1 };
      }
    }
    return undefined;
  }

  /** Processa uma linha; devolve o quadro quando a linha em branco o despacha. */
  private line(line: string): SseMessage | undefined {
    if (line === "") return this.dispatch();
    if (line.startsWith(":")) return undefined; // comentário (heartbeat)

    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1); // só UM espaço, por spec

    switch (field) {
      case "event":
        this.eventType = value;
        break;
      case "data":
        this.dataLines.push(value);
        break;
      case "id":
        if (!value.includes("\0")) this.lastId = value;
        break;
      case "retry": {
        if (/^\d+$/.test(value)) this.retryMs = Number(value);
        break;
      }
      default:
        break; // campo desconhecido: ignorado
    }
    return undefined;
  }

  private dispatch(): SseMessage | undefined {
    if (this.dataLines.length === 0) {
      this.eventType = ""; // quadro sem data não é despachado, mas reseta o tipo
      return undefined;
    }
    const msg: SseMessage = {
      event: this.eventType || "message",
      data: this.dataLines.join("\n"),
    };
    if (this.lastId !== undefined) msg.id = this.lastId;
    this.dataLines = [];
    this.eventType = "";
    return msg;
  }
}

/**
 * Assina o corpo CRU como a produção assina: `sha256=<hmac-sha256 hex>`.
 *
 * É o inverso exato de {@link verifyWebhook} — a mesma função que o seu app usa
 * para validar. Assine sempre os MESMOS bytes que vão no corpo.
 */
export function signWebhookBody(secret: string, rawBody: string | Uint8Array): string {
  const bytes = typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : rawBody;
  return `sha256=${createHmac("sha256", secret).update(bytes).digest("hex")}`;
}

/** Gera um segredo de assinatura local, no formato `whsec_…`. */
export function generateSecret(): string {
  return `whsec_${randomBytes(24).toString("base64url")}`;
}

/**
 * Espera antes da tentativa `attempt` de reconexão (1 = primeira), em ms.
 *
 * Exponencial a partir do `retry:` do servidor (3 s em produção), teto de 30 s,
 * com até 20% de jitter para não sincronizar várias CLIs.
 */
export function backoffDelay(attempt: number, retryMs: number | undefined, rand = Math.random): number {
  const base = retryMs && retryMs > 0 ? retryMs : 3000;
  const raw = Math.min(base * 2 ** Math.max(0, attempt - 1), 30_000);
  return Math.round(raw * (1 + 0.2 * rand()));
}

/** Falha que NÃO deve ser reconectada (credencial/rota erradas). */
export class RelayFatalError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "RelayFatalError";
    this.status = status;
  }
}

/** O que aconteceu com um evento recebido (usado na impressão e nos testes). */
export interface RelayDelivery {
  eventId: string;
  eventType: string;
  /** Corpo cru reenviado (os bytes assinados). */
  rawBody: string;
  /** Status HTTP devolvido pelo seu servidor local (`undefined` se não houve POST). */
  status?: number;
  /** Duração do POST em ms (`undefined` em `--print-only`). */
  ms?: number;
  /** Mensagem do erro de transporte, quando o POST nem completou. */
  error?: string;
  /** `true` quando o evento foi descartado pelo filtro `--events`. */
  filtered?: boolean;
}

/** Configuração do relay. */
export interface RelayConfig {
  /** Base da API (sem barra no fim), ex.: `https://api.bzapper.com.br`. */
  baseUrl: string;
  /** API key `bz_live_…` (ou JWT do painel). Vai no `Authorization`, nunca na URL. */
  apiKey: string;
  /** URL local que recebe os POSTs. Obrigatória fora do `printOnly`. */
  forwardTo?: string;
  /** Segredo com que o relay assina o corpo. */
  secret: string;
  /** Projeto ativo (só vale para credencial de sessão; a API key já traz o seu). */
  projectId?: string;
  /** Tipos aceitos; vazio/ausente = todos. */
  events?: readonly string[];
  /** Não reenvia nada: só imprime o que chegou. */
  printOnly?: boolean;
}

/** Dependências injetáveis (testes). */
export interface RelayDeps {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** Sorteio do jitter do backoff. */
  rand?: () => number;
  /** Aborta o relay (Ctrl+C). */
  signal?: AbortSignal;
  /** Encerra depois de N sessões de stream (testes); `undefined` = para sempre. */
  maxConnections?: number;
  /** Reconecta se o stream ficar mudo por tanto tempo (ms). `0` desliga. */
  stallMs?: number;
  /** Chamado a cada entrega (impressão). */
  onDelivery?: (d: RelayDelivery) => void;
  /** Chamado quando (re)conecta e quando cai. */
  onConnect?: () => void;
  onDisconnect?: (reason: string, nextDelayMs: number) => void;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Estatísticas da sessão, mostradas na saída. */
export interface RelayStats {
  connections: number;
  received: number;
  forwarded: number;
  failed: number;
  filtered: number;
}

/**
 * Consome o stream de eventos do projeto e reenvia cada um ao localhost.
 *
 * `run()` só volta quando o `signal` aborta, quando `maxConnections` se esgota
 * ou quando a API recusa a credencial ({@link RelayFatalError}).
 */
export class WebhookRelay {
  readonly stats: RelayStats = { connections: 0, received: 0, forwarded: 0, failed: 0, filtered: 0 };

  private readonly cfg: RelayConfig;
  private readonly deps: RelayDeps;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly allowed: Set<string>;
  private parser = new SseParser();

  constructor(cfg: RelayConfig, deps: RelayDeps = {}) {
    this.cfg = cfg;
    this.deps = deps;
    const f = deps.fetch ?? globalThis.fetch;
    if (typeof f !== "function") {
      throw new Error("bzapper listen: `fetch` global indisponível. Use Node 18+.");
    }
    this.fetchImpl = f;
    this.sleep = deps.sleep ?? defaultSleep;
    this.allowed = new Set(cfg.events ?? []);
  }

  /** URL do stream (a credencial vai no header, não na query). */
  get streamUrl(): string {
    return `${this.cfg.baseUrl.replace(/\/+$/, "")}${LISTEN_PATH}`;
  }

  /** Laço de vida: conecta, consome, reconecta com backoff. */
  async run(): Promise<void> {
    let attempt = 0;
    for (;;) {
      if (this.deps.signal?.aborted) return;
      if (this.deps.maxConnections !== undefined && this.stats.connections >= this.deps.maxConnections) {
        return;
      }
      let reason = "stream encerrado pelo servidor";
      try {
        await this.connectOnce();
        attempt = 0; // conectou e leu: recomeça o backoff do zero
      } catch (err) {
        if (err instanceof RelayFatalError) throw err;
        if (this.deps.signal?.aborted) return;
        reason = err instanceof Error ? err.message : String(err);
        attempt += 1;
      }
      if (this.deps.signal?.aborted) return;
      if (this.deps.maxConnections !== undefined && this.stats.connections >= this.deps.maxConnections) {
        return;
      }
      const delay = backoffDelay(attempt || 1, this.parser.retryMs, this.deps.rand);
      this.deps.onDisconnect?.(reason, delay);
      await this.sleep(delay);
    }
  }

  /** Uma sessão de stream: volta quando o servidor fecha (ou lança em falha). */
  async connectOnce(): Promise<void> {
    const controller = new AbortController();
    const outer = this.deps.signal;
    const onAbort = (): void => controller.abort();
    outer?.addEventListener("abort", onAbort, { once: true });

    let stallTimer: NodeJS.Timeout | undefined;
    const stallMs = this.deps.stallMs ?? 60_000;
    const armStall = (): void => {
      if (!stallMs) return;
      clearTimeout(stallTimer);
      stallTimer = setTimeout(() => controller.abort(new Error("stream mudo")), stallMs);
    };

    try {
      const headers: Record<string, string> = {
        Accept: "text/event-stream",
        Authorization: `Bearer ${this.cfg.apiKey}`,
        "Cache-Control": "no-cache",
        "X-Bzapper-Client": CLIENT_ID,
        "User-Agent": CLIENT_ID,
      };
      if (this.cfg.projectId) headers["X-Project-Id"] = this.cfg.projectId;

      const res = await this.fetchImpl(this.streamUrl, { headers, signal: controller.signal });
      if (!res.ok) {
        throw await streamError(res);
      }
      this.stats.connections += 1;
      this.deps.onConnect?.();
      const body = res.body;
      if (!body) return;

      this.parser = new SseParser();
      const reader = body.getReader();
      const decoder = new TextDecoder();
      armStall();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return;
        armStall();
        const text = decoder.decode(value, { stream: true });
        if (text === "") continue;
        for (const msg of this.parser.push(text)) {
          await this.onMessage(msg);
        }
      }
    } finally {
      clearTimeout(stallTimer);
      outer?.removeEventListener("abort", onAbort);
      this.parser.flush();
    }
  }

  /** Trata um quadro SSE: filtra, assina e reenvia. */
  async onMessage(msg: SseMessage): Promise<void> {
    if (msg.event !== WEBHOOK_SSE_EVENT || msg.data === "") return;
    let envelope: Record<string, unknown>;
    try {
      envelope = JSON.parse(msg.data) as Record<string, unknown>;
    } catch {
      return; // quadro corrompido: ignora (o stream segue)
    }
    const eventType = typeof envelope.event_type === "string" ? envelope.event_type : "";
    const eventId = typeof envelope.event_id === "string" ? envelope.event_id : (msg.id ?? "");
    this.stats.received += 1;

    if (this.allowed.size > 0 && !this.allowed.has(eventType)) {
      this.stats.filtered += 1;
      this.deps.onDelivery?.({ eventId, eventType, rawBody: msg.data, filtered: true });
      return;
    }

    if (this.cfg.printOnly || !this.cfg.forwardTo) {
      this.deps.onDelivery?.({ eventId, eventType, rawBody: msg.data });
      return;
    }
    await this.forward(this.cfg.forwardTo, msg.data, eventId, eventType);
  }

  /** POST assinado no destino local. Nunca lança: falha vira linha vermelha. */
  private async forward(url: string, rawBody: string, eventId: string, eventType: string): Promise<void> {
    const started = Date.now();
    try {
      const res = await this.fetchImpl(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [SIGNATURE_HEADER]: signWebhookBody(this.cfg.secret, rawBody),
          [EVENT_ID_HEADER]: eventId,
          [EVENT_TYPE_HEADER]: eventType,
        },
        body: rawBody,
        signal: this.deps.signal,
      });
      // Drena o corpo para o socket poder ser reaproveitado.
      try {
        await res.text();
      } catch {
        /* corpo já descartado */
      }
      const ok = res.status >= 200 && res.status < 300;
      if (ok) this.stats.forwarded += 1;
      else this.stats.failed += 1;
      this.deps.onDelivery?.({ eventId, eventType, rawBody, status: res.status, ms: Date.now() - started });
    } catch (err) {
      this.stats.failed += 1;
      this.deps.onDelivery?.({
        eventId,
        eventType,
        rawBody,
        ms: Date.now() - started,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

/**
 * Converte um status de erro do stream em exceção: 4xx (fora de 408/429) é
 * fatal — credencial ou base erradas não melhoram com reconexão.
 */
async function streamError(res: Response): Promise<Error> {
  let detail = "";
  try {
    const text = await res.text();
    const body = text.trim() === "" ? undefined : (JSON.parse(text) as Record<string, unknown>);
    const message = typeof body?.message === "string" ? body.message : "";
    const code = typeof body?.code === "string" ? body.code : "";
    detail = [code, message].filter(Boolean).join(": ") || text.slice(0, 200);
  } catch {
    detail = "";
  }
  const suffix = detail ? ` — ${detail}` : "";
  const fatal = res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429;
  const message =
    res.status === 401 || res.status === 403
      ? `credencial recusada pela API (HTTP ${res.status})${suffix}`
      : `a API respondeu HTTP ${res.status}${suffix}`;
  return fatal ? new RelayFatalError(message, res.status) : new Error(message);
}
