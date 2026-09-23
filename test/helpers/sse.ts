/** Servidor SSE falso: finge o `GET /webhooks/listen` da API para os testes da CLI. */
import http from "node:http";
import type { AddressInfo } from "node:net";

export interface SseConnection {
  headers: http.IncomingHttpHeaders;
  path: string;
  /** Escreve um quadro cru (já com os `\n` que o teste quiser). */
  write(frame: string): void;
  /** Fecha esta conexão (simula queda do stream). */
  end(): void;
}

export interface SseTestServer {
  url: string;
  /** Uma entrada por requisição recebida (inclusive as recusadas). */
  connections: SseConnection[];
  /** Respostas de erro: enquanto definido, toda conexão recebe este status. */
  fail(status: number | undefined, body?: unknown): void;
  /** Espera até haver `n` conexões (ou estoura o tempo). */
  waitForConnection(n?: number, timeoutMs?: number): Promise<SseConnection>;
  close(): Promise<void>;
}

export async function startSseServer(): Promise<SseTestServer> {
  const connections: SseConnection[] = [];
  let failStatus: number | undefined;
  let failBody: unknown;

  const server = http.createServer((req, res) => {
    const path = req.url ?? "/";
    if (failStatus !== undefined) {
      connections.push({ headers: req.headers, path, write: () => {}, end: () => {} });
      const payload = failBody === undefined ? "" : JSON.stringify(failBody);
      res.writeHead(failStatus, { "Content-Type": "application/json" });
      res.end(payload);
      return;
    }
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    connections.push({
      headers: req.headers,
      path,
      write: (frame: string) => res.write(frame),
      end: () => res.end(),
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    connections,
    fail(status, body) {
      failStatus = status;
      failBody = body;
    },
    async waitForConnection(n = 1, timeoutMs = 3000) {
      const until = Date.now() + timeoutMs;
      for (;;) {
        const conn = connections[n - 1];
        if (conn) return conn;
        if (Date.now() > until) throw new Error(`nenhuma conexão #${n} em ${timeoutMs}ms`);
        await new Promise((r) => setTimeout(r, 5));
      }
    },
    close() {
      for (const c of connections) c.end();
      return new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

/** Monta o quadro que a API emite: `id` + `event: webhook.event` + `data`. */
export function webhookFrame(envelope: Record<string, unknown>, id = String(envelope.event_id ?? "")): string {
  return `id: ${id}\nevent: webhook.event\ndata: ${JSON.stringify(envelope)}\n\n`;
}

/** Envelope de exemplo, com a forma real da produção (snake_case). */
export function sampleEnvelope(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    event_id: "evt_01HZX",
    event_type: "message.received",
    timestamp: "2026-09-22T12:00:00Z",
    instance_id: "inst_1",
    sender: { jid: "5511999999999@s.whatsapp.net", phone: "+5511999999999", name: "Ana" },
    mentions: [],
    payload: { body: "olá" },
    ...overrides,
  };
}

/** Espera uma condição virar verdadeira (polling curto). */
export async function waitUntil(pred: () => boolean, timeoutMs = 3000, label = "condição"): Promise<void> {
  const until = Date.now() + timeoutMs;
  while (!pred()) {
    if (Date.now() > until) throw new Error(`tempo esgotado esperando ${label}`);
    await new Promise((r) => setTimeout(r, 5));
  }
}
