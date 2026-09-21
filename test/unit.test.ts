/** Testes unitários da SDK (além da conformidade): versão, rede, idempotência, bordas. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, beforeEach, describe, it } from "node:test";
import {
  Bzapper,
  BzapperError,
  BzapperPartner,
  CLIENT_ID,
  DEFAULT_BASE_URL,
  NetworkError,
  NotFoundError,
  RateLimitError,
  ServerError,
  VERSION,
} from "@bzapper/client";
import { closedPort, startServer } from "./helpers/server.js";
import type { TestServer } from "./helpers/server.js";

const PKG = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };
const noSleep = async () => {};

/** Espera a chamada falhar com BzapperError e o devolve. */
async function failure(pending: Promise<unknown>): Promise<BzapperError> {
  try {
    await pending;
  } catch (e) {
    assert.ok(e instanceof BzapperError, `esperava BzapperError, veio ${String(e)}`);
    return e;
  }
  return assert.fail("a chamada devia ter falhado");
}

/** fetch que registra os headers de cada tentativa e delega ao fetch global. */
function recordingFetch(): { fetch: typeof fetch; sent: Record<string, string>[] } {
  const sent: Record<string, string>[] = [];
  const f = ((url: string, init: RequestInit) => {
    sent.push({ ...(init.headers as Record<string, string>) });
    return fetch(url, init);
  }) as typeof fetch;
  return { fetch: f, sent };
}

let server: TestServer;
let bz: Bzapper;
before(async () => {
  server = await startServer();
});
after(() => server.close());
beforeEach(() => {
  server.reset();
  bz = new Bzapper({ apiKey: "bz_live_test", baseUrl: server.url, sleep: noSleep });
});

describe("versão", () => {
  it("VERSION == package.json == src/version.ts (o que o release-sdks.sh bumpa)", () => {
    assert.equal(VERSION, PKG.version);
    const src = readFileSync(new URL("../src/version.ts", import.meta.url), "utf8");
    const matches = [...src.matchAll(/VERSION = '([^']+)'/g)];
    assert.equal(matches.length, 1, "o regex do release precisa casar exatamente uma vez");
    assert.equal(matches[0]![1], PKG.version);
    assert.equal(CLIENT_ID, `bzapper-node/${PKG.version}`);
  });

  it("vai no X-Bzapper-Client e no User-Agent", async () => {
    server.setHandler(() => ({ status: 200, body: { data: [] } }));
    await bz.listWebhooks();
    assert.equal(server.requests[0]!.headers["x-bzapper-client"], `bzapper-node/${VERSION}`);
    assert.equal(server.requests[0]!.headers["user-agent"], `bzapper-node/${VERSION}`);
  });
});

describe("construtor", () => {
  it("chave vazia é erro imediato (não BzapperError)", () => {
    assert.throws(() => new Bzapper({ apiKey: "" }), (e: unknown) => e instanceof Error && !(e instanceof BzapperError));
    assert.throws(() => new BzapperPartner({ partnerSecret: "" }), (e: unknown) => !(e instanceof BzapperError));
  });

  it("URL base padrão é produção, sem rede na construção", () => {
    assert.equal(DEFAULT_BASE_URL, "https://api.bzapper.com.br");
    let calls = 0;
    new Bzapper({ apiKey: "k", fetch: (async () => { calls++; }) as unknown as typeof fetch });
    assert.equal(calls, 0);
  });

  it("maxRetries negativo é erro de argumento", () => {
    assert.throws(() => new Bzapper({ apiKey: "k", maxRetries: -1 }), TypeError);
  });

  it("locale e projectId viram Accept-Language e X-Project-Id", async () => {
    server.setHandler(() => ({ status: 200, body: {} }));
    const c = new Bzapper({ apiKey: "k", baseUrl: server.url, locale: "en", projectId: "p-1" });
    await c.getBrand();
    assert.equal(server.requests[0]!.headers["accept-language"], "en");
    assert.equal(server.requests[0]!.headers["x-project-id"], "p-1");
  });
});

describe("rede", () => {
  it("servidor fora do ar → NetworkError (status 0, NETWORK_ERROR, requestId enviado)", async () => {
    const port = await closedPort();
    const rec = recordingFetch();
    const c = new Bzapper({ apiKey: "k", baseUrl: `http://127.0.0.1:${port}`, sleep: noSleep, fetch: rec.fetch });
    const err = await failure(c.getInstance("abc"));
    assert.ok(err instanceof NetworkError);
    assert.equal(err.status, 0);
    assert.equal(err.statusCode, 0);
    assert.equal(err.code, "NETWORK_ERROR");
    assert.equal(rec.sent.length, 3, "1 tentativa + 2 novas (maxRetries padrão)");
    const ids = new Set(rec.sent.map((h) => h["X-Request-Id"]));
    assert.equal(ids.size, 1, "mesmo X-Request-Id em todas as tentativas");
    assert.equal(err.requestId, rec.sent[0]!["X-Request-Id"]);
  });

  it("timeout por tentativa → NetworkError; maxRetries: 0 desliga as novas tentativas", async () => {
    server.setHandler(() => "hang");
    const c = new Bzapper({ apiKey: "k", baseUrl: server.url, timeout: 50, maxRetries: 0, sleep: noSleep });
    const err = await failure(c.getInstance("abc"));
    assert.ok(err instanceof NetworkError);
    assert.equal(server.requests.length, 1);
  });
});

describe("idempotência", () => {
  it("idempotencyKey do usuário vai como veio, e se repete nas novas tentativas", async () => {
    let n = 0;
    server.setHandler(() => (++n === 1 ? { status: 503, body: { code: "unavailable" } } : { status: 202, body: { message_id: "m", status: "queued" } }));
    const res = await bz.sendText({ to: "+5511999999999", body: "oi" }, { idempotencyKey: "pedido-4471" });
    assert.equal(res.message_id, "m");
    assert.equal(server.requests.length, 2);
    for (const r of server.requests) assert.equal(r.headers["idempotency-key"], "pedido-4471");
  });

  it("idempotencyKey vale em qualquer escrita (não só envios)", async () => {
    server.setHandler(() => ({ status: 201, body: { id: "c1" } }));
    await bz.createContact({ phone: "+5511999999999" }, { idempotencyKey: "crm-9" });
    assert.equal(server.requests[0]!.headers["idempotency-key"], "crm-9");
  });

  it("escrita sem chave recebe uma gerada; leitura não recebe", async () => {
    server.setHandler(() => ({ status: 200, body: {} }));
    await bz.applyBrand();
    await bz.getBrand();
    assert.match(String(server.requests[0]!.headers["idempotency-key"]), /^[0-9a-f-]{36}$/);
    assert.equal(server.requests[1]!.headers["idempotency-key"], undefined);
  });
});

describe("erros e novas tentativas", () => {
  it("Retry-After (segundos, teto 60) define a espera", async () => {
    const sleeps: number[] = [];
    const c = new Bzapper({ apiKey: "k", baseUrl: server.url, sleep: async (ms) => void sleeps.push(ms) });
    server.setHandler(() => ({ status: 429, headers: { "Retry-After": "120" }, body: { code: "rate_limited", message: "x" } }));
    const err = await failure(c.listWebhooks());
    assert.ok(err instanceof RateLimitError);
    assert.equal(err.retryAfter, 120);
    assert.deepEqual(sleeps, [60_000, 60_000]);
  });

  it("500 não é tentado de novo; corpo e locale ficam no erro", async () => {
    server.setHandler(() => ({ status: 500, body: { code: "internal_error", message: "boom", locale: "pt-BR" } }));
    const err = await failure(bz.listWebhooks());
    assert.ok(err instanceof ServerError);
    assert.equal(server.requests.length, 1);
    assert.equal(err.locale, "pt-BR");
    assert.equal(err.message, "boom");
    assert.deepEqual(err.body, { code: "internal_error", message: "boom", locale: "pt-BR" });
  });

  it("subclasses herdam da base (instanceof) e o `error` do corpo é fallback do code", async () => {
    server.setHandler(() => ({ status: 404, body: { error: "gone" } }));
    const err = await failure(bz.getInstance("x"));
    assert.ok(err instanceof NotFoundError && err instanceof BzapperError && err instanceof Error);
    assert.equal(err.code, "gone");
    assert.equal(err.name, "NotFoundError");
  });
});

describe("caminho e query", () => {
  it("segmento é percent-encoded; JID passa codificado", async () => {
    server.setHandler(() => ({ status: 204 }));
    await bz.archiveChat("120363@g.us", { instance_id: "i", on: true });
    await bz.deleteWebhook("a/b c");
    assert.equal(server.requests[0]!.path, "/chats/120363%40g.us/archive");
    assert.equal(server.requests[1]!.path, "/webhooks/a%2Fb%20c");
  });

  it("id vazio, '.' e '..' → TypeError sem requisição", async () => {
    for (const id of ["", ".", ".."]) {
      await assert.rejects(() => bz.getContact(id), TypeError);
    }
    assert.equal(server.requests.length, 0);
  });

  it("Date vira ISO 8601 UTC com Z; listas viram CSV; booleanos true/false", async () => {
    server.setHandler(() => ({ status: 200, body: { data: [] } }));
    await bz.listContacts({
      created_after: new Date(Date.UTC(2026, 8, 21, 12, 0, 0)),
      tags: ["vip", "novo"],
      has_email: false,
    });
    assert.deepEqual(Object.fromEntries(server.requests[0]!.queryPairs), {
      created_after: "2026-09-21T12:00:00Z",
      tags: "vip,novo",
      has_email: "false",
    });
  });

  it("2xx não-JSON → INVALID_RESPONSE; 204 → undefined", async () => {
    server.setHandler(() => ({ status: 200, body: "<html>" }));
    const err = await failure(bz.getBrand());
    assert.equal(err.code, "INVALID_RESPONSE");
    assert.equal(err.status, 200);
    server.setHandler(() => ({ status: 204 }));
    assert.equal(await bz.deleteContact("c1"), undefined);
  });
});

describe("upload multipart", () => {
  it("envia o arquivo como multipart/form-data no campo `file`", async () => {
    server.setHandler(() => ({ status: 200, body: { url: "https://cdn/x.png" } }));
    const res = await bz.uploadCampaignMedia({ content: new Uint8Array([1, 2, 3]), filename: "x.png", contentType: "image/png" });
    assert.equal(res.url, "https://cdn/x.png");
    const r = server.requests[0]!;
    assert.match(String(r.headers["content-type"]), /^multipart\/form-data; boundary=/);
    assert.match(r.rawBody, /name="file"; filename="x.png"/);
    assert.match(r.rawBody, /Content-Type: image\/png/);
  });
});
