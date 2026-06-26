/**
 * Webhook receiver for bZapper.
 *
 * Receives the raw request body, **verifies the HMAC-SHA256 signature**, parses
 * the envelope into a typed {@link WebhookEvent} and routes it to handlers
 * registered per event type. Zero third-party dependencies — uses Node's
 * built-in `crypto`.
 *
 * The API signs every delivery with `X-Bzapper-Signature: sha256=<hex>` where
 * the hex is `HMAC_SHA256(secret, raw_body)`. It also sends
 * `X-Bzapper-Event-Id` and `X-Bzapper-Event-Type`.
 *
 * Quickstart:
 * ```ts
 * import { Webhooks } from "@bzapper/client";
 *
 * const hooks = new Webhooks("whsec_..."); // the secret from createWebhook
 *
 * hooks.on("message.received", (event) => {
 *   console.log(event.sender?.name, event.payload.body);
 * });
 *
 * // In your HTTP endpoint — pass the RAW body and the X-Bzapper-Signature header.
 * await hooks.handle(rawBody, signature); // throws WebhookSignatureError if bad
 * ```
 *
 * Idempotency: each event carries a stable `event.id` — store processed ids
 * (Redis/DB) and skip duplicates; the API may retry deliveries.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

/** HTTP header carrying the `sha256=<hex>` HMAC signature. */
export const SIGNATURE_HEADER = "X-Bzapper-Signature";
/** HTTP header carrying the stable event id (for idempotency). */
export const EVENT_ID_HEADER = "X-Bzapper-Event-Id";
/** HTTP header carrying the event type. */
export const EVENT_TYPE_HEADER = "X-Bzapper-Event-Type";

/** All event types the API can deliver (for reference/autocomplete). */
export const EVENT_TYPES = [
  "message.received",
  "message.sent",
  "message.delivered",
  "message.read",
  "message.failed",
  "instance.connected",
  "instance.disconnected",
  "instance.banned",
  "instance.logged_out",
  "instance.warming",
  "instance.status",
  "group.joined",
  "group.participant_added",
  "group.participant_removed",
  "group.participant_promoted",
  "group.participant_demoted",
  "group.subject_changed",
  "group.description_changed",
] as const;

/** Raw HTTP body of a webhook delivery, as received (never re-serialized). */
export type RawBody = string | Buffer;

/** Raised when a webhook signature is missing or does not match. */
export class WebhookSignatureError extends Error {
  constructor(message = "invalid webhook signature") {
    super(message);
    this.name = "WebhookSignatureError";
  }
}

/** WhatsApp group context, when the event happened in a group. */
export interface WebhookGroup {
  jid?: string;
  name?: string;
}

/** Who sent/triggered the event (for message/group events). */
export interface WebhookSender {
  jid?: string;
  lid?: string;
  name?: string;
}

/** A parsed, typed webhook event (the delivered envelope). */
export interface WebhookEvent {
  /** Stable event id — use it for idempotency (the API may retry). */
  id: string;
  /** Event type, e.g. `message.received` (see {@link EVENT_TYPES}). */
  type: string;
  timestamp?: string;
  instanceId?: string;
  clientReference?: string;
  group?: WebhookGroup;
  sender?: WebhookSender;
  mentions: string[];
  payload: Record<string, unknown>;
  /** The original parsed JSON envelope (snake_case keys), untouched. */
  raw: Record<string, unknown>;
}

/** A webhook event handler. May be sync or async. */
export type WebhookHandler = (event: WebhookEvent) => void | Promise<void>;

function asBuffer(body: RawBody): Buffer {
  return typeof body === "string" ? Buffer.from(body, "utf8") : body;
}

/**
 * Return `true` iff `signature` matches the HMAC of the **raw** body.
 *
 * Timing-safe. Pass the exact bytes received — never the re-serialized JSON.
 */
export function verifyWebhook(
  secret: string,
  rawBody: RawBody,
  signature: string | undefined | null,
): boolean {
  if (!signature) return false;
  const digest = createHmac("sha256", secret).update(asBuffer(rawBody)).digest("hex");
  const expected = Buffer.from(`sha256=${digest}`, "utf8");
  const received = Buffer.from(signature, "utf8");
  // timingSafeEqual requires equal-length buffers; differing length => no match.
  if (expected.length !== received.length) return false;
  return timingSafeEqual(expected, received);
}

function toEvent(envelope: Record<string, unknown>): WebhookEvent {
  const g = envelope.group;
  const s = envelope.sender;
  const group =
    g && typeof g === "object"
      ? {
          jid: (g as Record<string, unknown>).jid as string | undefined,
          name: (g as Record<string, unknown>).name as string | undefined,
        }
      : undefined;
  const sender =
    s && typeof s === "object"
      ? {
          jid: (s as Record<string, unknown>).jid as string | undefined,
          lid: (s as Record<string, unknown>).lid as string | undefined,
          name: (s as Record<string, unknown>).name as string | undefined,
        }
      : undefined;
  const mentions = Array.isArray(envelope.mentions)
    ? (envelope.mentions as unknown[]).map(String)
    : [];
  const payload =
    envelope.payload && typeof envelope.payload === "object"
      ? (envelope.payload as Record<string, unknown>)
      : {};
  return {
    id: (envelope.event_id as string | undefined) ?? "",
    type: (envelope.event_type as string | undefined) ?? "",
    timestamp: envelope.timestamp as string | undefined,
    instanceId: envelope.instance_id as string | undefined,
    clientReference: envelope.client_reference as string | undefined,
    group,
    sender,
    mentions,
    payload,
    raw: envelope,
  };
}

/**
 * Verify the signature and parse the body into a {@link WebhookEvent}.
 *
 * @throws {WebhookSignatureError} if the signature is missing or invalid.
 */
export function constructWebhookEvent(
  secret: string,
  rawBody: RawBody,
  signature: string | undefined | null,
): WebhookEvent {
  if (!verifyWebhook(secret, rawBody, signature)) {
    throw new WebhookSignatureError();
  }
  const text = typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");
  return toEvent(JSON.parse(text) as Record<string, unknown>);
}

/**
 * Minimal Express-style request, for {@link Webhooks.middleware}.
 *
 * The middleware needs the **raw** body — mount `express.raw({ type: "*\/*" })`
 * (or `type: "application/json"`) on the route so `req.body` is a Buffer.
 */
export interface WebhookRequest {
  body?: unknown;
  headers: Record<string, string | string[] | undefined>;
}

/** Minimal Express-style response, for {@link Webhooks.middleware}. */
export interface WebhookResponse {
  status(code: number): WebhookResponse;
  send(body?: unknown): unknown;
}

/**
 * Verifies, parses and routes incoming webhook deliveries to handlers.
 *
 * @example
 * ```ts
 * const hooks = new Webhooks(process.env.BZAPPER_WEBHOOK_SECRET!);
 * hooks.on("message.received", (e) => console.log(e.payload.body));
 * await hooks.handle(rawBody, signature);
 * ```
 */
export class Webhooks {
  readonly secret: string;
  private readonly handlers = new Map<string, WebhookHandler[]>();
  private readonly anyHandlers: WebhookHandler[] = [];

  /**
   * @param secret The webhook's signing secret (returned once by `createWebhook`).
   */
  constructor(secret: string) {
    if (!secret) throw new Error("Webhooks: `secret` is required.");
    this.secret = secret;
  }

  /** Register a handler for an event type. Returns `this` for chaining. */
  on(eventType: string, handler: WebhookHandler): this {
    const list = this.handlers.get(eventType);
    if (list) list.push(handler);
    else this.handlers.set(eventType, [handler]);
    return this;
  }

  /** Register a handler that runs for **every** event. Returns `this`. */
  onAny(handler: WebhookHandler): this {
    this.anyHandlers.push(handler);
    return this;
  }

  /** Verify + parse a delivery into a typed event (no dispatch). */
  constructEvent(rawBody: RawBody, signature: string | undefined | null): WebhookEvent {
    return constructWebhookEvent(this.secret, rawBody, signature);
  }

  /**
   * Verify, parse and dispatch a delivery to the matching handlers + `onAny`.
   *
   * Returns the parsed event (use `event.id` for idempotency — this method keeps
   * no internal state). Rejects with {@link WebhookSignatureError} if the
   * signature is invalid — do NOT process in that case.
   */
  async handle(rawBody: RawBody, signature: string | undefined | null): Promise<WebhookEvent> {
    const event = this.constructEvent(rawBody, signature);
    for (const h of this.handlers.get(event.type) ?? []) {
      await h(event);
    }
    for (const h of this.anyHandlers) {
      await h(event);
    }
    return event;
  }

  /**
   * Returns an Express-style middleware `(req, res, next)` that reads the raw
   * body, verifies + dispatches, then responds `200` (ok) or `400` (bad
   * signature / invalid payload).
   *
   * Requires the **raw** body — mount `express.raw({ type: "application/json" })`
   * on the webhook route so `req.body` is a `Buffer` (not a parsed object).
   *
   * ```ts
   * app.post(
   *   "/webhooks/bzapper",
   *   express.raw({ type: "application/json" }),
   *   hooks.middleware(),
   * );
   * ```
   */
  middleware() {
    return (req: WebhookRequest, res: WebhookResponse, next: (err?: unknown) => void): void => {
      const sigHeader = req.headers[SIGNATURE_HEADER.toLowerCase()] ?? req.headers[SIGNATURE_HEADER];
      const signature = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader;
      const body = req.body;
      const rawBody: RawBody | undefined =
        typeof body === "string" || Buffer.isBuffer(body) ? (body as RawBody) : undefined;

      if (rawBody === undefined) {
        res.status(400).send("webhook requires the raw body (use express.raw())");
        return;
      }

      this.handle(rawBody, signature)
        .then(() => {
          res.status(200).send();
        })
        .catch((err: unknown) => {
          if (err instanceof WebhookSignatureError) {
            res.status(400).send("invalid signature");
            return;
          }
          next(err);
        });
    };
  }
}
