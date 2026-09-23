/**
 * CLI do bZapper — `npx @bzapper/client listen`.
 *
 * Relay de webhooks para o seu localhost, no espírito do `stripe listen`: abre o
 * stream SSE dos eventos do projeto e faz um POST assinado no seu servidor, com
 * os mesmos headers da produção. Zero dependências, Node 18+.
 *
 * O executável é `bin/bzapper.mjs`, que só chama {@link main}.
 */

import { DEFAULT_BASE_URL } from "./http.js";
import {
  RelayFatalError,
  WebhookRelay,
  generateSecret,
  type RelayDelivery,
  type RelayStats,
} from "./relay.js";
import { VERSION } from "./version.js";

// Reexportados para quem quiser embutir o relay (e para os testes da CLI).
export {
  LISTEN_PATH,
  RelayFatalError,
  SseParser,
  WEBHOOK_SSE_EVENT,
  WebhookRelay,
  backoffDelay,
  generateSecret,
  signWebhookBody,
} from "./relay.js";
export type { RelayConfig, RelayDeps, RelayStats, SseMessage } from "./relay.js";
export type { RelayDelivery } from "./relay.js";

/** Dependências injetáveis (testes). */
export interface CliDeps {
  out?: (line: string) => void;
  err?: (line: string) => void;
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  rand?: () => number;
  signal?: AbortSignal;
  /** Encerra após N sessões de stream (testes). */
  maxConnections?: number;
  stallMs?: number;
  /** Força (des)ligar as cores ANSI; padrão: só em TTY. */
  colors?: boolean;
  /** Instala o handler de Ctrl+C (padrão: sim, fora dos testes). */
  handleSignals?: boolean;
}

/** Opções já resolvidas de `listen`. */
export interface ListenOptions {
  forwardTo?: string;
  apiKey?: string;
  baseUrl: string;
  project?: string;
  events: string[];
  secret?: string;
  printOnly: boolean;
}

/** Resultado do parse dos argumentos. */
export interface ParsedArgs {
  command?: string;
  help: boolean;
  version: boolean;
  options: ListenOptions;
  /** Erro de uso (flag desconhecida, valor faltando). */
  error?: string;
}

const FLAGS_WITH_VALUE = new Set([
  "forward-to",
  "api-key",
  "base-url",
  "project",
  "events",
  "secret",
]);

const SHORT: Record<string, string> = { f: "forward-to", h: "help", v: "version", V: "version" };

/**
 * Lê `argv` (sem `node` nem o script). Aceita `--flag valor` e `--flag=valor`.
 *
 * Nunca lança: erro de uso volta em `error` para quem chamou decidir o código de
 * saída.
 */
export function parseArgs(argv: readonly string[], env: Record<string, string | undefined> = {}): ParsedArgs {
  const options: ListenOptions = {
    baseUrl: env.BZAPPER_BASE_URL || DEFAULT_BASE_URL,
    events: [],
    printOnly: false,
  };
  if (env.BZAPPER_API_KEY) options.apiKey = env.BZAPPER_API_KEY;
  if (env.BZAPPER_PROJECT_ID) options.project = env.BZAPPER_PROJECT_ID;
  if (env.BZAPPER_WEBHOOK_SECRET) options.secret = env.BZAPPER_WEBHOOK_SECRET;

  const parsed: ParsedArgs = { help: false, version: false, options };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    if (!arg.startsWith("-")) {
      if (parsed.command === undefined) parsed.command = arg;
      continue;
    }
    let name: string;
    let inline: string | undefined;
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      name = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
      if (eq !== -1) inline = arg.slice(eq + 1);
    } else {
      const eq = arg.indexOf("=");
      const letter = eq === -1 ? arg.slice(1) : arg.slice(1, eq);
      name = SHORT[letter] ?? letter;
      if (eq !== -1) inline = arg.slice(eq + 1);
    }

    if (name === "help") {
      parsed.help = true;
      continue;
    }
    if (name === "version") {
      parsed.version = true;
      continue;
    }
    if (name === "print-only") {
      options.printOnly = true;
      continue;
    }
    if (!FLAGS_WITH_VALUE.has(name)) {
      parsed.error = `opção desconhecida: ${arg}`;
      return parsed;
    }
    let value = inline;
    if (value === undefined) {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("-")) {
        parsed.error = `a opção --${name} precisa de um valor`;
        return parsed;
      }
      value = next;
      i += 1;
    }
    switch (name) {
      case "forward-to":
        options.forwardTo = value;
        break;
      case "api-key":
        options.apiKey = value;
        break;
      case "base-url":
        options.baseUrl = value;
        break;
      case "project":
        options.project = value;
        break;
      case "secret":
        options.secret = value;
        break;
      case "events":
        options.events = value
          .split(",")
          .map((t) => t.trim())
          .filter((t) => t !== "");
        break;
      default:
        break;
    }
  }
  return parsed;
}

/** Texto do `--help`. */
export function helpText(): string {
  return `bzapper ${VERSION} — CLI oficial do bZapper

USO
  npx @bzapper/client listen --forward-to <url local> [opções]

COMANDOS
  listen    Reenvia para o seu localhost, assinados, os eventos de webhook do
            projeto — exista ou não um webhook cadastrado (estilo stripe listen).

OPÇÕES
  -f, --forward-to <url>   URL local que recebe os POSTs (ex.: http://localhost:3000/webhooks)
      --api-key <key>      API key bz_live_… (padrão: $BZAPPER_API_KEY)
      --base-url <url>     Base da API (padrão: $BZAPPER_BASE_URL ou ${DEFAULT_BASE_URL})
      --project <id>       Projeto ativo (só para credencial de sessão; a API key já traz o seu)
      --events <a,b,c>     Só estes tipos (ex.: message.received,message.sent)
      --secret <whsec_…>   Segredo de assinatura (padrão: um novo, impresso ao iniciar)
      --print-only         Não reenvia: só imprime os eventos que chegarem
  -h, --help               Esta ajuda
  -v, --version            Versão do pacote

VARIÁVEIS DE AMBIENTE
  BZAPPER_API_KEY, BZAPPER_BASE_URL, BZAPPER_PROJECT_ID, BZAPPER_WEBHOOK_SECRET

COMO O SEU APP VALIDA
  Cada POST leva X-Bzapper-Signature: sha256=<hmac do corpo cru>, X-Bzapper-Event-Id
  e X-Bzapper-Event-Type — iguaizinhos aos da produção. Valide com o Webhooks deste
  pacote usando o MESMO secret que a CLI imprimir.

EXEMPLOS
  npx @bzapper/client listen -f http://localhost:3000/webhooks
  npx @bzapper/client listen -f http://localhost:3000/webhooks --events message.received
  npx @bzapper/client listen --print-only --api-key bz_live_…`;
}

export interface Paint {
  dim(s: string): string;
  bold(s: string): string;
  green(s: string): string;
  red(s: string): string;
  cyan(s: string): string;
  yellow(s: string): string;
}

function paint(enabled: boolean): Paint {
  const wrap = (code: string) => (s: string) => (enabled ? `[${code}m${s}[0m` : s);
  return {
    dim: wrap("2"),
    bold: wrap("1"),
    green: wrap("32"),
    red: wrap("31"),
    cyan: wrap("36"),
    yellow: wrap("33"),
  };
}

/** `HH:MM:SS` local, como o stripe imprime. */
function clock(at = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(at.getHours())}:${p(at.getMinutes())}:${p(at.getSeconds())}`;
}

/** Uma linha por evento: hora, tipo, id, desfecho local. */
export function deliveryLine(d: RelayDelivery, c: Paint, at = new Date()): string {
  const head = `${c.dim(clock(at))}  ${(d.eventType || "?").padEnd(26)} ${c.dim(d.eventId || "-")}`;
  if (d.filtered) return `${head}  ${c.dim("→  ignorado (--events)")}`;
  if (d.error) return `${head}  ${c.red("→  falhou")} ${c.dim(d.error)}`;
  if (d.status === undefined) return `${head}  ${c.dim("→  só impressão")}`;
  const ok = d.status >= 200 && d.status < 300;
  const code = ok ? c.green(String(d.status)) : c.red(String(d.status));
  return `${head}  →  ${code} ${c.dim(`${d.ms}ms`)}`;
}

function summary(stats: RelayStats): string {
  return `recebidos ${stats.received} · reenviados ${stats.forwarded} · falhas ${stats.failed} · ignorados ${stats.filtered}`;
}

/**
 * Executa a CLI e devolve o código de saída (`0` = ok).
 *
 * Não chama `process.exit`: quem chama decide (o bin sai com este código; os
 * testes só leem o número e as linhas impressas).
 */
export async function main(argv: readonly string[], deps: CliDeps = {}): Promise<number> {
  const out = deps.out ?? ((line: string) => console.log(line));
  const err = deps.err ?? ((line: string) => console.error(line));
  const env = deps.env ?? process.env;
  const c = paint(deps.colors ?? Boolean(process.stdout?.isTTY));

  const args = parseArgs(argv, env);
  if (args.error) {
    err(`${c.red("✗")} ${args.error}`);
    err(`Rode ${c.bold("npx @bzapper/client --help")} para ver o uso.`);
    return 1;
  }
  if (args.version) {
    out(VERSION);
    return 0;
  }
  if (args.help || args.command === undefined || args.command === "help") {
    out(helpText());
    return args.command === undefined && !args.help ? 1 : 0;
  }
  if (args.command !== "listen") {
    err(`${c.red("✗")} comando desconhecido: ${args.command}`);
    err(`Rode ${c.bold("npx @bzapper/client --help")} para ver o uso.`);
    return 1;
  }

  const o = args.options;
  if (!o.apiKey) {
    err(`${c.red("✗")} falta a API key: passe --api-key bz_live_… ou defina BZAPPER_API_KEY.`);
    return 1;
  }
  if (!o.forwardTo && !o.printOnly) {
    err(`${c.red("✗")} falta o destino: --forward-to http://localhost:3000/webhooks (ou use --print-only).`);
    return 1;
  }
  if (o.forwardTo && !/^https?:\/\//i.test(o.forwardTo)) {
    err(`${c.red("✗")} --forward-to precisa ser uma URL http(s): recebi "${o.forwardTo}".`);
    return 1;
  }

  const generated = !o.secret;
  const secret = o.secret ?? generateSecret();
  const base = o.baseUrl.replace(/\/+$/, "");

  // Ctrl+C: aborta o stream, imprime o resumo e sai limpo.
  const controller = new AbortController();
  const signal = deps.signal ? anySignal([deps.signal, controller.signal]) : controller.signal;
  const onSigint = (): void => {
    out("");
    out(`${c.dim("↩")} encerrando…`);
    controller.abort();
  };
  const installSignals = deps.handleSignals ?? deps.signal === undefined;
  if (installSignals) process.on("SIGINT", onSigint).on("SIGTERM", onSigint);

  const relay = new WebhookRelay(
    {
      baseUrl: base,
      apiKey: o.apiKey,
      ...(o.forwardTo ? { forwardTo: o.forwardTo } : {}),
      secret,
      ...(o.project ? { projectId: o.project } : {}),
      events: o.events,
      printOnly: o.printOnly,
    },
    {
      ...(deps.fetch ? { fetch: deps.fetch } : {}),
      ...(deps.sleep ? { sleep: deps.sleep } : {}),
      ...(deps.rand ? { rand: deps.rand } : {}),
      ...(deps.maxConnections !== undefined ? { maxConnections: deps.maxConnections } : {}),
      ...(deps.stallMs !== undefined ? { stallMs: deps.stallMs } : {}),
      signal,
      onDelivery: (d) => out(deliveryLine(d, c)),
      onConnect: () => out(`${c.green("✓")} conectado ao stream de eventos. ${c.dim("Ctrl+C para sair.")}\n`),
      onDisconnect: (reason, next) =>
        out(`${c.yellow("•")} desconectado (${reason}) ${c.dim(`— reconectando em ${Math.round(next / 1000)}s`)}`),
    },
  );

  // Banner de partida.
  const label = (name: string) => `  ${c.dim(name.padEnd(10))} `;
  out("");
  out(`${c.bold("bZapper")} ${c.dim(`v${VERSION}`)} — relay de webhooks para o localhost`);
  out(`${label("ouvindo")}${relay.streamUrl}`);
  out(`${label("reenviando")}${o.printOnly ? c.dim("(nada: --print-only)") : c.cyan(o.forwardTo as string)}`);
  if (o.project) out(`${label("projeto")}${o.project}`);
  if (o.events.length) out(`${label("eventos")}${o.events.join(", ")}`);
  out(`${label("secret")}${c.bold(secret)}`);
  if (generated) {
    out("");
    out(`  ${c.yellow("⚠")} Este secret foi ${c.bold("gerado agora")}, só para esta sessão.`);
    out(`    Coloque-o no seu app (ex.: BZAPPER_WEBHOOK_SECRET) e valide com o ${c.bold("Webhooks")} do SDK.`);
    out(`    A assinatura só vale o que o secret vale: ela prova que o POST veio ${c.bold("desta CLI")},`);
    out(`    não da bZapper. Em produção use o secret do webhook cadastrado.`);
  }
  out("");

  try {
    await relay.run();
    out(`${c.dim("↩")} ${summary(relay.stats)}`);
    return 0;
  } catch (e) {
    if (e instanceof RelayFatalError) {
      err(`${c.red("✗")} ${e.message}`);
      if (e.status === 401 || e.status === 403) {
        err(`  Confira a API key (--api-key / BZAPPER_API_KEY) e a base (--base-url ${base}).`);
      } else if (e.status === 404) {
        err(`  ${base}/webhooks/listen não existe nessa base. Confira --base-url.`);
      }
      return 1;
    }
    err(`${c.red("✗")} ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  } finally {
    if (installSignals) {
      process.off("SIGINT", onSigint);
      process.off("SIGTERM", onSigint);
    }
  }
}

/** Une vários sinais num só (o `AbortSignal.any` só existe no Node 20+). */
function anySignal(signals: readonly AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  for (const s of signals) {
    if (s.aborted) {
      controller.abort(s.reason);
      break;
    }
    s.addEventListener("abort", () => controller.abort(s.reason), { once: true });
  }
  return controller.signal;
}
