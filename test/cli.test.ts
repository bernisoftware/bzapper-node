/**
 * Testes da CLI `bzapper listen` — o relay de webhooks para o localhost.
 *
 * Cobrem o enquadramento SSE (inclusive partido entre chunks), a assinatura (a
 * MESMA que o `Webhooks` valida), o filtro de tipos, a reconexão com backoff, a
 * falha do destino local e o laço inteiro contra um servidor SSE falso.
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { after, before, beforeEach, describe, it } from "node:test";
import { Webhooks, verifyWebhook } from "@bzapper/client";
import {
  RelayFatalError,
  SseParser,
  WebhookRelay,
  backoffDelay,
  deliveryLine,
  generateSecret,
  helpText,
  main,
  parseArgs,
  signWebhookBody,
} from "@bzapper/client/cli";
import type { RelayDelivery } from "@bzapper/client/cli";
import { startServer } from "./helpers/server.js";
import type { TestServer } from "./helpers/server.js";
import { sampleEnvelope, startSseServer, waitUntil, webhookFrame } from "./helpers/sse.js";
import type { SseTestServer } from "./helpers/sse.js";

const SECRET = "whsec_teste_1234567890";

/** Junta todos os quadros que os chunks produziram. */
function feed(parser: SseParser, chunks: string[]) {
  return chunks.flatMap((c) => parser.push(c));
}

describe("enquadramento SSE", () => {
  it("lê um quadro completo (event + data)", () => {
    const msgs = new SseParser().push("event: webhook.event\ndata: {\"a\":1}\n\n");
    assert.equal(msgs.length, 1);
    assert.equal(msgs[0].event, "webhook.event");
    assert.equal(msgs[0].data, '{"a":1}');
  });

  it("remonta um quadro partido em vários chunks (até no meio do \\n\\n)", () => {
    const p = new SseParser();
    const msgs = feed(p, ["event: webhoo", "k.event\nda", 'ta: {"x":', '"ção"}\n', "\n"]);
    assert.equal(msgs.length, 1);
    assert.equal(msgs[0].data, '{"x":"ção"}');
  });

  it("um chunk pode fechar dois quadros de uma vez", () => {
    const p = new SseParser();
    const msgs = p.push("event: a\ndata: 1\n\nevent: b\ndata: 2\n\n");
    assert.deepEqual(
      msgs.map((m) => [m.event, m.data]),
      [
        ["a", "1"],
        ["b", "2"],
      ],
    );
  });

  it("ignora comentários (o heartbeat `: ping` da API) sem despachar nada", () => {
    const p = new SseParser();
    assert.deepEqual(p.push(": ping\n\n"), []);
    assert.deepEqual(p.push(":\n\n"), []);
    const msgs = p.push(": ping\nevent: webhook.event\ndata: ok\n\n");
    assert.equal(msgs.length, 1);
    assert.equal(msgs[0].data, "ok");
  });

  it("lê o `retry:` do servidor e ignora um retry não numérico", () => {
    const p = new SseParser();
    assert.equal(p.retryMs, undefined);
    p.push("retry: 3000\n\n");
    assert.equal(p.retryMs, 3000);
    p.push("retry: depois\n\n");
    assert.equal(p.retryMs, 3000);
  });

  it("junta `data:` de várias linhas com \\n e tira só o \\n final", () => {
    const msgs = new SseParser().push("data: linha 1\ndata: linha 2\ndata:\n\n");
    assert.equal(msgs[0].data, "linha 1\nlinha 2\n");
  });

  it("tira exatamente UM espaço depois dos dois-pontos", () => {
    const msgs = new SseParser().push("data:  dois espaços\n\n");
    assert.equal(msgs[0].data, " dois espaços");
  });

  it("aceita \\r\\n e \\r como fim de linha, mesmo partidos entre chunks", () => {
    const crlf = new SseParser().push("event: webhook.event\r\ndata: x\r\n\r\n");
    assert.equal(crlf[0].data, "x");
    const cr = new SseParser();
    // Um \r no FIM do buffer fica retido: o \n do \r\n pode vir no próximo chunk.
    assert.deepEqual(cr.push("event: webhook.event\rdata: y\r"), []);
    assert.equal(cr.push("\rz")[0].data, "y");
    const p = new SseParser();
    assert.deepEqual(p.push("data: z\r"), []);
    assert.equal(p.push("\n\r\n")[0].data, "z");
  });

  it("campo sem valor vira string vazia e quadro sem `data` não despacha", () => {
    const p = new SseParser();
    assert.deepEqual(p.push("event: webhook.event\n\n"), []);
    assert.equal(p.push("data\n\n")[0].data, "");
  });

  it("o `id:` persiste entre quadros, como manda a spec", () => {
    const p = new SseParser();
    const first = p.push("id: 1\ndata: a\n\n");
    const second = p.push("data: b\n\n");
    assert.equal(first[0].id, "1");
    assert.equal(second[0].id, "1");
  });

  it("descarta o quadro incompleto no fim do stream", () => {
    const p = new SseParser();
    p.push("event: webhook.event\ndata: parcial");
    p.flush();
    assert.deepEqual(p.push("\n\n"), []);
  });
});

describe("assinatura do relay", () => {
  it("é aceita pelo mesmo verifyWebhook da produção", () => {
    const raw = JSON.stringify(sampleEnvelope());
    const sig = signWebhookBody(SECRET, raw);
    assert.ok(verifyWebhook(SECRET, raw, sig));
  });

  it("tem o prefixo sha256= e 64 hex — igual ao Sign() do servidor Go", () => {
    const raw = '{"event_id":"evt_1"}';
    const sig = signWebhookBody(SECRET, raw);
    assert.match(sig, /^sha256=[0-9a-f]{64}$/);
    assert.equal(sig, "sha256=" + createHmac("sha256", SECRET).update(raw).digest("hex"));
  });

  it("assina os BYTES crus (utf-8), não o JSON reserializado", () => {
    const raw = JSON.stringify({ body: "ação — 𝄞" });
    assert.ok(verifyWebhook(SECRET, Buffer.from(raw, "utf8"), signWebhookBody(SECRET, raw)));
  });

  it("outro secret não valida", () => {
    const raw = '{"a":1}';
    assert.equal(verifyWebhook("whsec_outro", raw, signWebhookBody(SECRET, raw)), false);
  });

  it("generateSecret devolve whsec_ + entropia, sempre diferente", () => {
    const a = generateSecret();
    const b = generateSecret();
    assert.match(a, /^whsec_[A-Za-z0-9_-]{32}$/);
    assert.notEqual(a, b);
  });
});

describe("backoff", () => {
  it("cresce exponencialmente a partir do retry do servidor e satura em 30s", () => {
    const zero = () => 0;
    assert.equal(backoffDelay(1, 3000, zero), 3000);
    assert.equal(backoffDelay(2, 3000, zero), 6000);
    assert.equal(backoffDelay(3, 3000, zero), 12000);
    assert.equal(backoffDelay(9, 3000, zero), 30000);
  });

  it("sem retry do servidor usa 3s de base e aplica até 20% de jitter", () => {
    assert.equal(backoffDelay(1, undefined, () => 0), 3000);
    assert.equal(backoffDelay(1, undefined, () => 1), 3600);
    assert.equal(backoffDelay(1, 0, () => 0), 3000);
  });
});

describe("relay contra um stream falso", () => {
  let api: SseTestServer;
  let local: TestServer;
  let deliveries: RelayDelivery[];

  before(async () => {
    local = await startServer(() => ({ status: 200, body: { ok: true } }));
  });
  beforeEach(() => {
    deliveries = [];
    local.reset();
  });
  after(async () => {
    await local.close();
  });

  /** Sobe um stream falso e roda o relay até ele fechar a conexão. */
  async function relayOnce(
    cfg: Partial<ConstructorParameters<typeof WebhookRelay>[0]> = {},
    frames: string[] = [],
  ) {
    api = await startSseServer();
    const relay = new WebhookRelay(
      { baseUrl: api.url, apiKey: "bz_live_teste", forwardTo: local.url + "/hook", secret: SECRET, ...cfg },
      { maxConnections: 1, stallMs: 0, onDelivery: (d) => deliveries.push(d) },
    );
    const running = relay.run();
    const conn = await api.waitForConnection();
    for (const f of frames) conn.write(f);
    conn.end();
    await running;
    await api.close();
    return relay;
  }

  it("entrega o evento com os headers EXATOS da produção e corpo cru assinado", async () => {
    const envelope = sampleEnvelope();
    const raw = JSON.stringify(envelope);
    await relayOnce({}, [webhookFrame(envelope)]);

    assert.equal(local.requests.length, 1);
    const req = local.requests[0];
    assert.equal(req.method, "POST");
    assert.equal(req.path, "/hook");
    assert.equal(req.rawBody, raw); // byte a byte: o que foi assinado é o que foi enviado
    assert.equal(req.headers["content-type"], "application/json");
    assert.equal(req.headers["x-bzapper-event-id"], "evt_01HZX");
    assert.equal(req.headers["x-bzapper-event-type"], "message.received");
    assert.match(String(req.headers["x-bzapper-signature"]), /^sha256=[0-9a-f]{64}$/);
  });

  it("o POST passa pelo Webhooks.verify do SDK, como um webhook de verdade", async () => {
    await relayOnce({}, [webhookFrame(sampleEnvelope())]);
    const req = local.requests[0];

    const hooks = new Webhooks(SECRET);
    const seen: string[] = [];
    hooks.on("message.received", (e) => {
      seen.push(`${e.id}:${String(e.payload.body)}`);
    });
    const event = await hooks.handle(req.rawBody, String(req.headers["x-bzapper-signature"]));
    assert.deepEqual(seen, ["evt_01HZX:olá"]);
    assert.equal(event.type, "message.received");
    assert.equal(event.sender?.name, "Ana");
    assert.equal(event.raw.event_id, "evt_01HZX"); // o envelope cru chega inteiro
  });

  it("manda a credencial no header Authorization (nunca na URL)", async () => {
    await relayOnce({}, []);
    const conn = api.connections[0];
    assert.equal(conn.headers.authorization, "Bearer bz_live_teste");
    assert.equal(conn.headers.accept, "text/event-stream");
    assert.equal(conn.path, "/webhooks/listen");
    assert.ok(!conn.path.includes("access_token"));
    assert.match(String(conn.headers["x-bzapper-client"]), /^bzapper-node\//);
  });

  it("manda X-Project-Id quando se passa --project", async () => {
    await relayOnce({ projectId: "prj_123" }, []);
    assert.equal(api.connections[0].headers["x-project-id"], "prj_123");
  });

  it("ignora o heartbeat e os eventos que não são webhook.event", async () => {
    const relay = await relayOnce({}, [": ping\n\n", "event: instance.status\ndata: {}\n\n"]);
    assert.equal(local.requests.length, 0);
    assert.equal(relay.stats.received, 0);
  });

  it("não morre com um data: que não é JSON", async () => {
    const relay = await relayOnce({}, ["event: webhook.event\ndata: {quebrado\n\n", webhookFrame(sampleEnvelope())]);
    assert.equal(local.requests.length, 1);
    assert.equal(relay.stats.received, 1);
  });

  it("--events filtra por tipo: só o que foi pedido é reenviado", async () => {
    const relay = await relayOnce({ events: ["message.received"] }, [
      webhookFrame(sampleEnvelope({ event_id: "evt_a", event_type: "message.sent" })),
      webhookFrame(sampleEnvelope({ event_id: "evt_b", event_type: "message.received" })),
      webhookFrame(sampleEnvelope({ event_id: "evt_c", event_type: "instance.banned" })),
    ]);
    assert.equal(local.requests.length, 1);
    assert.equal(local.requests[0].headers["x-bzapper-event-id"], "evt_b");
    assert.equal(relay.stats.received, 3);
    assert.equal(relay.stats.filtered, 2);
    assert.equal(relay.stats.forwarded, 1);
    assert.deepEqual(
      deliveries.filter((d) => d.filtered).map((d) => d.eventType),
      ["message.sent", "instance.banned"],
    );
  });

  it("sem --events tudo passa", async () => {
    const relay = await relayOnce({}, [
      webhookFrame(sampleEnvelope({ event_id: "evt_a", event_type: "message.sent" })),
      webhookFrame(sampleEnvelope({ event_id: "evt_b", event_type: "instance.banned" })),
    ]);
    assert.equal(local.requests.length, 2);
    assert.equal(relay.stats.filtered, 0);
  });

  it("--print-only não faz POST nenhum", async () => {
    const relay = await relayOnce({ printOnly: true }, [webhookFrame(sampleEnvelope())]);
    assert.equal(local.requests.length, 0);
    assert.equal(relay.stats.received, 1);
    assert.equal(relay.stats.forwarded, 0);
    assert.equal(deliveries[0].status, undefined);
  });

  it("destino local respondendo 500 conta como falha, sem derrubar o relay", async () => {
    local.setHandler(() => ({ status: 500, body: "boom" }));
    const relay = await relayOnce({}, [webhookFrame(sampleEnvelope()), webhookFrame(sampleEnvelope({ event_id: "evt_2" }))]);
    assert.equal(local.requests.length, 2); // o segundo evento ainda foi tentado
    assert.equal(relay.stats.failed, 2);
    assert.equal(relay.stats.forwarded, 0);
    assert.equal(deliveries[0].status, 500);
    local.setHandler(() => ({ status: 200 }));
  });

  it("destino local fora do ar (conexão recusada) vira linha de falha, não exceção", async () => {
    const closed = "http://127.0.0.1:1/hook";
    const relay = await relayOnce({ forwardTo: closed }, [webhookFrame(sampleEnvelope())]);
    assert.equal(relay.stats.failed, 1);
    assert.ok(deliveries[0].error, "a entrega deveria trazer o erro de transporte");
    assert.equal(deliveries[0].status, undefined);
  });
});

describe("reconexão", () => {
  it("reconecta quando o stream cai, dormindo o retry anunciado pelo servidor", async () => {
    const api = await startSseServer();
    const delays: number[] = [];
    const relay = new WebhookRelay(
      { baseUrl: api.url, apiKey: "bz_live_teste", secret: SECRET, printOnly: true },
      {
        maxConnections: 3,
        stallMs: 0,
        rand: () => 0,
        sleep: async (ms) => {
          delays.push(ms);
        },
      },
    );
    const running = relay.run();
    for (let n = 1; n <= 3; n++) {
      const conn = await api.waitForConnection(n);
      conn.write("retry: 500\n\n");
      conn.end();
    }
    await running;
    await api.close();

    assert.equal(relay.stats.connections, 3);
    assert.deepEqual(delays, [500, 500]); // dorme entre as conexões, não depois da última
  });

  it("erro de rede escala o backoff a cada tentativa seguida", async () => {
    const delays: number[] = [];
    const stop = new AbortController();
    const relay = new WebhookRelay(
      { baseUrl: "http://127.0.0.1:1", apiKey: "bz_live_teste", secret: SECRET, printOnly: true },
      {
        rand: () => 0,
        signal: stop.signal,
        sleep: async (ms) => {
          delays.push(ms);
          if (delays.length >= 3) stop.abort();
        },
      },
    );
    await relay.run();
    assert.deepEqual(delays, [3000, 6000, 12000]);
    assert.equal(relay.stats.connections, 0);
  });

  it("401 da API é fatal: não reconecta, e o erro diz que a credencial foi recusada", async () => {
    const api = await startSseServer();
    api.fail(401, { code: "invalid_key", message: "Credencial inválida." });
    const delays: number[] = [];
    const relay = new WebhookRelay(
      { baseUrl: api.url, apiKey: "bz_live_ruim", secret: SECRET, printOnly: true },
      { sleep: async (ms) => void delays.push(ms) },
    );
    const err = await relay.run().then(
      () => undefined,
      (e: unknown) => e,
    );
    await api.close();
    assert.ok(err instanceof RelayFatalError, `esperava RelayFatalError, veio ${String(err)}`);
    assert.equal(err.status, 401);
    assert.match(err.message, /credencial recusada/);
    assert.match(err.message, /Credencial inválida/);
    assert.deepEqual(delays, []);
  });

  it("5xx da API não é fatal: reconecta", async () => {
    const api = await startSseServer();
    api.fail(503, { code: "unavailable" });
    const stop = new AbortController();
    const delays: number[] = [];
    const relay = new WebhookRelay(
      { baseUrl: api.url, apiKey: "bz_live_teste", secret: SECRET, printOnly: true },
      {
        rand: () => 0,
        signal: stop.signal,
        sleep: async (ms) => {
          delays.push(ms);
          stop.abort();
        },
      },
    );
    await relay.run();
    await api.close();
    assert.equal(delays.length, 1);
  });

  it("o sinal de parada (Ctrl+C) encerra o laço sem erro", async () => {
    const api = await startSseServer();
    const stop = new AbortController();
    const relay = new WebhookRelay(
      { baseUrl: api.url, apiKey: "bz_live_teste", secret: SECRET, printOnly: true },
      { signal: stop.signal, stallMs: 0 },
    );
    const running = relay.run();
    await api.waitForConnection();
    stop.abort();
    await running; // não lança
    await api.close();
  });
});

describe("argumentos", () => {
  it("lê as opções longas", () => {
    const a = parseArgs(
      ["listen", "--forward-to", "http://localhost:3000/w", "--api-key", "bz_live_x", "--base-url", "http://api.local", "--project", "prj_1", "--events", "message.received, message.sent ,", "--secret", "whsec_y", "--print-only"],
      {},
    );
    assert.equal(a.command, "listen");
    assert.equal(a.options.forwardTo, "http://localhost:3000/w");
    assert.equal(a.options.apiKey, "bz_live_x");
    assert.equal(a.options.baseUrl, "http://api.local");
    assert.equal(a.options.project, "prj_1");
    assert.deepEqual(a.options.events, ["message.received", "message.sent"]);
    assert.equal(a.options.secret, "whsec_y");
    assert.equal(a.options.printOnly, true);
    assert.equal(a.error, undefined);
  });

  it("aceita -f e --flag=valor", () => {
    const a = parseArgs(["listen", "-f", "http://localhost:3000/w", "--events=a,b"], {});
    assert.equal(a.options.forwardTo, "http://localhost:3000/w");
    assert.deepEqual(a.options.events, ["a", "b"]);
  });

  it("o ambiente preenche o que a linha de comando não trouxe", () => {
    const env = { BZAPPER_API_KEY: "bz_live_env", BZAPPER_BASE_URL: "http://env.local", BZAPPER_WEBHOOK_SECRET: "whsec_env" };
    const a = parseArgs(["listen"], env);
    assert.equal(a.options.apiKey, "bz_live_env");
    assert.equal(a.options.baseUrl, "http://env.local");
    assert.equal(a.options.secret, "whsec_env");
    const b = parseArgs(["listen", "--api-key", "bz_live_cli"], env);
    assert.equal(b.options.apiKey, "bz_live_cli"); // a flag vence o ambiente
  });

  it("a base padrão é a produção", () => {
    assert.equal(parseArgs(["listen"], {}).options.baseUrl, "https://api.bzapper.com.br");
  });

  it("opção desconhecida e valor faltando viram erro de uso", () => {
    assert.match(String(parseArgs(["listen", "--forward"], {}).error), /desconhecida/);
    assert.match(String(parseArgs(["listen", "--forward-to"], {}).error), /precisa de um valor/);
    assert.match(String(parseArgs(["listen", "--api-key", "--print-only"], {}).error), /precisa de um valor/);
  });

  it("--help e --version são reconhecidos em qualquer posição", () => {
    assert.equal(parseArgs(["--help"], {}).help, true);
    assert.equal(parseArgs(["listen", "-h"], {}).help, true);
    assert.equal(parseArgs(["-v"], {}).version, true);
  });
});

describe("main", () => {
  const capture = () => {
    const lines: string[] = [];
    return { lines, sink: (l: string) => lines.push(l), text: () => lines.join("\n") };
  };

  it("--help imprime o uso e sai 0", async () => {
    const o = capture();
    assert.equal(await main(["--help"], { out: o.sink, env: {}, colors: false }), 0);
    assert.match(o.text(), /npx @bzapper\/client listen --forward-to/);
    assert.match(helpText(), /--print-only/);
  });

  it("--version imprime a versão do pacote", async () => {
    const o = capture();
    assert.equal(await main(["--version"], { out: o.sink, env: {}, colors: false }), 0);
    assert.match(o.text(), /^\d+\.\d+\.\d+$/);
  });

  it("sem comando mostra a ajuda e sai diferente de 0", async () => {
    const o = capture();
    assert.equal(await main([], { out: o.sink, env: {}, colors: false }), 1);
  });

  it("sem API key sai 1 com mensagem clara", async () => {
    const e = capture();
    const code = await main(["listen", "-f", "http://localhost:3000/w"], { err: e.sink, out: () => {}, env: {}, colors: false });
    assert.equal(code, 1);
    assert.match(e.text(), /falta a API key/);
  });

  it("sem --forward-to (e sem --print-only) sai 1", async () => {
    const e = capture();
    const code = await main(["listen"], { err: e.sink, out: () => {}, env: { BZAPPER_API_KEY: "bz_live_x" }, colors: false });
    assert.equal(code, 1);
    assert.match(e.text(), /falta o destino/);
  });

  it("--forward-to que não é http(s) sai 1", async () => {
    const e = capture();
    const code = await main(["listen", "-f", "localhost:3000"], {
      err: e.sink,
      out: () => {},
      env: { BZAPPER_API_KEY: "bz_live_x" },
      colors: false,
    });
    assert.equal(code, 1);
    assert.match(e.text(), /precisa ser uma URL http/);
  });

  it("comando desconhecido sai 1", async () => {
    const e = capture();
    assert.equal(await main(["escutar"], { err: e.sink, out: () => {}, env: {}, colors: false }), 1);
    assert.match(e.text(), /comando desconhecido/);
  });

  it("de ponta a ponta: stream falso → POST assinado no app local → saída na tela", async () => {
    const api = await startSseServer();
    const local = await startServer(() => ({ status: 202 }));
    const o = capture();
    const envelope = sampleEnvelope();

    const stop = new AbortController();
    const running = main(
      ["listen", "-f", `${local.url}/webhooks`, "--api-key", "bz_live_teste", "--base-url", api.url, "--secret", SECRET],
      { out: o.sink, err: o.sink, env: {}, colors: false, signal: stop.signal, maxConnections: 1, stallMs: 0 },
    );
    const conn = await api.waitForConnection();
    conn.write("retry: 3000\n\n");
    conn.write(": ping\n\n");
    conn.write(webhookFrame(envelope));
    await waitUntil(() => local.requests.length === 1, 3000, "o POST no app local");
    conn.end();
    const code = await running;

    assert.equal(code, 0);
    const req = local.requests[0];
    assert.ok(verifyWebhook(SECRET, req.rawBody, String(req.headers["x-bzapper-signature"])));
    assert.equal(req.rawBody, JSON.stringify(envelope));
    const text = o.text();
    assert.match(text, /relay de webhooks para o localhost/);
    assert.match(text, new RegExp(`ouvindo.*${api.url.replace(/[.]/g, "\\.")}/webhooks/listen`));
    assert.match(text, /secret\s+whsec_teste_1234567890/);
    assert.match(text, /message\.received\s+evt_01HZX\s+→\s+202/);
    assert.match(text, /recebidos 1 · reenviados 1/);

    await local.close();
    await api.close();
  });

  it("gera e destaca um secret quando não se passa --secret", async () => {
    const api = await startSseServer();
    const o = capture();
    const stop = new AbortController();
    const running = main(["listen", "--print-only", "--api-key", "bz_live_teste", "--base-url", api.url], {
      out: o.sink,
      err: o.sink,
      env: {},
      colors: false,
      signal: stop.signal,
      maxConnections: 1,
      stallMs: 0,
    });
    (await api.waitForConnection()).end();
    assert.equal(await running, 0);
    assert.match(o.text(), /secret\s+whsec_/);
    assert.match(o.text(), /gerado agora/);
    assert.match(o.text(), /A assinatura só vale o que o secret vale/);
    await api.close();
  });

  it("credencial recusada: sai 1 dizendo o que conferir", async () => {
    const api = await startSseServer();
    api.fail(401, { code: "invalid_key", message: "Credencial inválida." });
    const o = capture();
    const stop = new AbortController();
    const code = await main(["listen", "--print-only", "--api-key", "bz_live_ruim", "--base-url", api.url], {
      out: () => {},
      err: o.sink,
      env: {},
      colors: false,
      signal: stop.signal,
      stallMs: 0,
    });
    assert.equal(code, 1);
    assert.match(o.text(), /credencial recusada pela API \(HTTP 401\)/);
    assert.match(o.text(), /Confira a API key/);
    await api.close();
  });

  it("base errada (404) sai 1 apontando a --base-url", async () => {
    const api = await startSseServer();
    api.fail(404, { code: "not_found" });
    const o = capture();
    const code = await main(["listen", "--print-only", "--api-key", "bz_live_x", "--base-url", api.url], {
      out: () => {},
      err: o.sink,
      env: {},
      colors: false,
      signal: new AbortController().signal,
      stallMs: 0,
    });
    assert.equal(code, 1);
    assert.match(o.text(), /--base-url/);
    await api.close();
  });
});

describe("linha impressa por evento", () => {
  const plain = {
    dim: (s: string) => s,
    bold: (s: string) => s,
    green: (s: string) => s,
    red: (s: string) => s,
    cyan: (s: string) => s,
    yellow: (s: string) => s,
  };
  const at = new Date(2026, 8, 22, 9, 5, 3);

  it("mostra hora, tipo, id, status e latência", () => {
    const line = deliveryLine(
      { eventId: "evt_1", eventType: "message.received", rawBody: "{}", status: 200, ms: 12 },
      plain,
      at,
    );
    assert.match(line, /^09:05:03\s+message\.received\s+evt_1\s+→\s+200 12ms$/);
  });

  it("distingue falha de transporte, filtrado e print-only", () => {
    const base = { eventId: "evt_1", eventType: "message.sent", rawBody: "{}" };
    assert.match(deliveryLine({ ...base, error: "ECONNREFUSED" }, plain, at), /falhou ECONNREFUSED/);
    assert.match(deliveryLine({ ...base, filtered: true }, plain, at), /ignorado \(--events\)/);
    assert.match(deliveryLine(base, plain, at), /só impressão/);
  });
});
