# @bzapper/client

SDK oficial do **bZapper** para Node/TypeScript — gateway de WhatsApp multi-tenant: conecte números, envie mensagens, gerencie instâncias, API keys e acompanhe o uso.

- ESM + types completos
- **Zero dependências de runtime** (usa `fetch` nativo do Node 18+)
- Erro tipado `BzapperError` com `code` estável

## Instalação

```bash
npm i @bzapper/client
```

Requer **Node 18+** (fetch nativo).

## Hello world

```ts
import { Bzapper } from "@bzapper/client";

const bz = new Bzapper({
  baseUrl: "http://localhost:8080", // prod: https://api.bzapper.com.br
  apiKey: "bz_live_...",
});

await bz.sendText({ to: "+5511999999999", body: "Olá!" });
```

Também há uma factory equivalente:

```ts
import { createClient } from "@bzapper/client";
const bz = createClient({ baseUrl: "...", apiKey: "..." });
```

## Configuração

```ts
new Bzapper({
  baseUrl: "https://api.bzapper.com.br",
  apiKey: "bz_live_...",
  locale: "pt-BR",   // opcional → header Accept-Language
  timeout: 30_000,   // opcional, ms (default 30000)
});
```

Toda requisição envia `Authorization: Bearer <apiKey>`, `Content-Type: application/json` (quando há corpo) e `Accept-Language: <locale>` (se informado).

## Mensagens

Todos os envios aceitam os campos comuns (`SendBase`): `to` (obrigatório, E.164 ou JID), `instance_id?`, `pool_id?`, `quoted_message_id?`, `client_reference?`, `mentions?`. Todos retornam `{ message_id, status, client_reference? }`.

### Texto

```ts
await bz.sendText({ to: "+5511999999999", body: "Olá!" });
```

### Imagem

```ts
await bz.sendImage({
  to: "+5511999999999",
  media: { url: "https://example.com/foto.jpg", caption: "Veja isto" },
});
```

### Vídeo

```ts
await bz.sendVideo({
  to: "+5511999999999",
  media: { url: "https://example.com/video.mp4", caption: "Demo" },
});
```

### Documento

```ts
await bz.sendDocument({
  to: "+5511999999999",
  media: {
    url: "https://example.com/contrato.pdf",
    filename: "contrato.pdf",
    mimetype: "application/pdf",
  },
});
```

### Áudio (nota de voz com `ptt`)

```ts
await bz.sendAudio({
  to: "+5511999999999",
  media: { url: "https://example.com/audio.ogg", ptt: true },
});
```

### Sticker

```ts
await bz.sendSticker({
  to: "+5511999999999",
  media: { url: "https://example.com/sticker.webp" },
});
```

> **Mídia:** use `url` **ou** `base64`, nunca os dois.

### Localização

```ts
await bz.sendLocation({
  to: "+5511999999999",
  latitude: -23.5613,
  longitude: -46.6565,
  name: "Av. Paulista",
  address: "São Paulo, SP",
});
```

### Contato (vCard)

```ts
await bz.sendContact({
  to: "+5511999999999",
  contact_name: "Suporte bZapper",
  contact_vcard:
    "BEGIN:VCARD\nVERSION:3.0\nFN:Suporte\nTEL:+5511988887777\nEND:VCARD",
});
```

### Enquete

```ts
await bz.sendPoll({
  to: "+5511999999999",
  name: "Qual seu plano?",
  options: ["Free", "Pro", "Enterprise"],
  selectable_count: 1,
});
```

### Reação

`quoted_message_id` é obrigatório.

```ts
await bz.sendReaction({
  to: "+5511999999999",
  quoted_message_id: "WA_MESSAGE_ID",
  emoji: "👍",
});
```

### Botões

```ts
await bz.sendButtons({
  to: "+5511999999999",
  body: "Confirma o pedido?",
  footer: "bZapper",
  buttons: [
    { id: "yes", title: "Sim" },
    { id: "no", title: "Não" },
  ],
});
```

### Lista

```ts
await bz.sendList({
  to: "+5511999999999",
  body: "Escolha uma opção",
  button_text: "Abrir menu",
  footer: "bZapper",
  sections: [
    {
      title: "Planos",
      rows: [
        { id: "pro", title: "Pro", description: "R$ 99/mês" },
        { id: "ent", title: "Enterprise", description: "Sob consulta" },
      ],
    },
  ],
});
```

> **Caveat pétreo:** botões e listas **não são confiáveis** no WhatsApp (pior em grupos). A API **sempre** envia um **menu de texto numerado** equivalente como fallback — então o destinatário pode receber um texto numerado em vez de botões nativos.

## Instâncias (números)

```ts
const { data } = await bz.listInstances();

const inst = await bz.createInstance({
  phone: "+5511999999999",
  nickname: "Suporte",
  proxy_url: "http://user:pass@proxy.example:8080", // opcional
});

await bz.getInstance(inst.id);

// Conexão por QR (default) ou código de pareamento.
const qr = await bz.connectInstance(inst.id, "qr");
console.log(qr.qr_code);

const code = await bz.connectInstance(inst.id, "code");
console.log(code.pair_code);

await bz.disconnectInstance(inst.id);
```

### Perfil do número (white-label)

```ts
await bz.setProfile(inst.id, {
  display_name: "Suporte bZapper",
  status_message: "Atendimento 24/7",
  picture: "<base64>", // opcional
});
```

> `status_message` é confiável; `display_name` e `picture` são experimentais (o servidor pode responder `501`).

## Grupos, presença e conversas

As operações avançadas exigem um número específico. Note onde o `instance_id` vai: na **query** (grupos/conversas) ou no **body** (presença/chats/contatos) — o SDK já cuida disso pela assinatura de cada método.

### Presença (funciona em grupos!)

`to` pode ser um **JID de grupo** — o indicador "digitando…" funciona em grupos.

```ts
// Presença num grupo
await bz.presenceChat({
  instance_id: inst.id,
  to: "120363000000000000@g.us", // JID de grupo
  state: "typing", // typing | recording | paused
});

// Também em 1:1
await bz.presenceChat({ instance_id: inst.id, to: "+5511999999999", state: "recording" });
```

### Conversas (inbox)

```ts
const { data: threads } = await bz.listConversations(inst.id);

const history = await bz.conversationHistory("120363000000000000@g.us", {
  instance_id: inst.id,
  before: "2026-06-01T00:00:00Z", // opcional, RFC3339
  limit: 100,                     // opcional, ≤ 200
});

await bz.archiveChat("120363000000000000@g.us", { instance_id: inst.id, on: true });
await bz.pinChat("120363000000000000@g.us", { instance_id: inst.id, on: true });
await bz.markChat("120363000000000000@g.us", { instance_id: inst.id, on: true }); // lido
```

### Grupos

```ts
const { data: groups } = await bz.listGroups(inst.id);

const group = await bz.createGroup(inst.id, {
  name: "Equipe bZapper",
  participants: ["+5511988887777", "+5511977776666"],
});

await bz.getGroup(group.jid, inst.id);

await bz.updateGroupParticipants(group.jid, inst.id, {
  action: "promote", // add | remove | promote | demote
  participants: ["+5511988887777"],
});

const invite = await bz.groupInvite(group.jid, inst.id);
console.log(invite.invite_link);

await bz.joinGroup(inst.id, { code: "AbCdEf123456" });
await bz.leaveGroup(group.jid, inst.id);
```

### Contatos

```ts
const { data } = await bz.contactsCheck({
  instance_id: inst.id,
  phones: ["+5511988887777", "+5511977776666"],
});
for (const c of data) console.log(c.query, c.in_whatsapp, c.jid);
```

## API keys (self-serve)

```ts
const { data } = await bz.listKeys();

const created = await bz.createKey({ name: "CI", role: "agent" });
console.log(created.api_key); // guarde — mostrada só uma vez!

await bz.revokeKey(created.key.id);
```

## Webhooks

**Gerencie** suas assinaturas de webhook:

```ts
const hook = await bz.createWebhook({
  url: "https://seuapp.com/webhooks/bzapper",
  event_types: ["message.received", "instance.banned"], // omita = todos os eventos
});
console.log(hook.secret); // segredo de assinatura — devolvido UMA vez, guarde agora

await bz.listWebhooks();
await bz.updateWebhook(hook.id, { active: false });        // pausar
await bz.updateWebhook(hook.id, { secret: "regenerate" }); // rotacionar segredo
await bz.deleteWebhook(hook.id);
```

**Receba e processe** as entregas — `Webhooks` verifica a assinatura HMAC,
parseia o envelope em um evento tipado e roteia para seus handlers (zero
dependências; usa o `crypto` nativo do Node):

```ts
import { Webhooks } from "@bzapper/client";

const hooks = new Webhooks(process.env.BZAPPER_WEBHOOK_SECRET!); // o secret do createWebhook

hooks.on("message.received", (event) => {
  console.log(event.sender?.name, event.payload.body);
});

hooks.on("instance.banned", (event) => {
  alert(event.instanceId);
});

// No seu endpoint HTTP. Passe o corpo CRU e o header X-Bzapper-Signature.
// Lança WebhookSignatureError se a assinatura for inválida — não processe nesse caso.
await hooks.handle(rawBody, signature);
```

O `event` tipado tem `id`, `type`, `timestamp`, `instanceId`,
`clientReference`, `group`, `sender`, `mentions`, `payload` e o `raw` original
(JSON do envelope, em snake_case). Use `event.id` para idempotência (a API pode
reentregar). Para uso de baixo nível há `verifyWebhook(secret, rawBody, signature)`
e `constructWebhookEvent(secret, rawBody, signature)`.

### Express

`Webhooks#middleware()` devolve um middleware estilo Express. Ele precisa do
**corpo cru**, então monte `express.raw()` na rota para que `req.body` seja um
`Buffer` (não um objeto já parseado):

```ts
import express from "express";
import { Webhooks } from "@bzapper/client";

const app = express();
const hooks = new Webhooks(process.env.BZAPPER_WEBHOOK_SECRET!);

hooks.on("message.received", (e) => console.log(e.payload.body));

app.post(
  "/webhooks/bzapper",
  express.raw({ type: "application/json" }), // entrega req.body como Buffer cru
  hooks.middleware(),                        // verifica, dispara e responde 200/400
);

app.listen(3000);
```

## Uso

```ts
const usage = await bz.getUsage({
  from: "2026-06-01T00:00:00Z",
  to: "2026-06-30T23:59:59Z",
});
console.log(usage.total, usage.delivery_rate);
```

## Tratamento de erro

Em qualquer resposta não-2xx o SDK lança `BzapperError`. **Ramifique sempre pelo `code`** (estável), nunca pelo `message` (texto traduzido).

```ts
import { Bzapper, BzapperError } from "@bzapper/client";

try {
  await bz.sendText({ to: "+5511999999999", body: "Olá!" });
} catch (err) {
  if (err instanceof BzapperError) {
    console.error(err.code);       // ex.: "not_connected", "rate_limited"
    console.error(err.statusCode); // ex.: 409, 429
    console.error(err.message);    // texto humano (não dê parse)

    if (err.code === "rate_limited") {
      // backoff e retry...
    }
  } else {
    throw err;
  }
}
```

## Exemplo rodável

Veja [`examples/quickstart.ts`](./examples/quickstart.ts).

## Licença

MIT © Berni Software
