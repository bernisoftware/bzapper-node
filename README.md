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

const bz = new Bzapper({ apiKey: "bz_live_..." });

await bz.sendText({ to: "+5511999999999", body: "Olá!" });
```

O `baseUrl` tem default de produção (`https://api.bzapper.com.br`) e é **opcional** —
informe apenas em dev/self-host: `new Bzapper({ apiKey: "bz_live_...", baseUrl: "http://localhost:8080" })`.

Também há uma factory equivalente:

```ts
import { createClient } from "@bzapper/client";
const bz = createClient({ apiKey: "bz_live_..." });
```

## Configuração

```ts
new Bzapper({
  apiKey: "bz_live_...",
  locale: "pt-BR",   // opcional → header Accept-Language
  timeout: 30_000,   // opcional, ms (default 30000)
  baseUrl: "http://localhost:8080", // opcional, só em dev/self-host
});
```

Toda requisição envia `Authorization: Bearer <apiKey>`, `Content-Type: application/json` (quando há corpo) e `Accept-Language: <locale>` (se informado).

## Mensagens

Todos os envios aceitam os campos comuns (`SendBase`): `to` (obrigatório, E.164 ou JID), `instance_id?`, `pool_id?`, `quoted_message_id?`, `quoted_participant?` (autor da mensagem citada — só em grupo, quando ela não está no histórico), `client_reference?`, `mentions?` (JIDs ou telefones). Todos retornam `{ message_id, status, client_reference? }`.

Retry seguro: passe `{ idempotencyKey }` como 2º argumento de qualquer envio. Repetir com a mesma chave em 24h devolve a MESMA resposta sem reenviar (409 `idempotency_in_progress` se a 1ª ainda roda; 422 `idempotency_key_reused` se o corpo mudou).

```ts
await bz.sendText({ to: "+5511999999999", body: "Pedido #42 confirmado" }, { idempotencyKey: "pedido-42" });
```

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

await bz.previewGroupInvite(inst.id, { code: "AbCdEf123456" }); // nome/tamanho SEM entrar
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

## bZapper Connect

Para **softwares parceiros**: o seu produto deixa os SEUS clientes assinarem o
bZapper Pro e conectarem o WhatsApp sem sair dele, e recebe uma API key
(`bz_live_...`) autorizada pelo cliente. O cliente continua sendo uma conta
bZapper direta; a conexão só funciona enquanto o Pro dele estiver pago.

O fluxo:

1. Seu **backend** cria uma sessão com o partner secret (`bz_partner_...`).
2. Seu **front** abre o componente com o `session_token`.
3. Ao concluir (Pro pago + número conectado), o componente emite um `code` de uso único (10 min).
4. Seu backend troca o `code` pela API key do cliente e guarda a key.
5. Dali em diante, use o `Bzapper` normal com essa key.

> O partner secret é **só de backend** — nunca o mande para o navegador.

### Backend (Express)

```ts
import express from "express";
import {
  Bzapper,
  BzapperError,
  BzapperPartner,
  Webhooks,
  isConnectEvent,
  type PartnerWebhookEvent,
} from "@bzapper/client";

const app = express();
const partner = new BzapperPartner({ partnerSecret: process.env.BZAPPER_PARTNER_SECRET! });

// 1) Cria a sessão do componente para o cliente logado no SEU produto.
app.post("/bzapper/session", express.json(), async (req, res) => {
  const user = req.user; // seu usuário autenticado
  const session = await partner.createConnectSession({
    external_id: user.id, // o id do cliente no SEU sistema (mesmo id = mesma conexão)
    customer: {
      name: user.name,
      email: user.email,
      phone: user.phone,     // opcional, E.164 — pré-preenche o número
      company: user.company, // opcional — vira o nome da conta/projeto
      country: "BR",         // opcional — define a moeda
    },
    locale: "pt-BR",
  });
  res.json({ session: session.session_token });
});

// 2) Troca o code emitido pelo componente pela API key do cliente.
app.post("/bzapper/exchange", express.json(), async (req, res) => {
  const connection = await partner.exchangeCode(req.body.code);
  // Guarde agora — a key não é mostrada de novo (use rotateConnectionKey se perder).
  await db.saveBzapperKey(connection.external_id, connection.id, connection.api_key);
  res.json({ status: connection.status });
});

// 3) Webhook do parceiro: mesma assinatura HMAC (X-Bzapper-Signature) dos webhooks
//    normais, com o segredo do webhook do parceiro. Toda entrega traz `connection`.
const hooks = new Webhooks(process.env.BZAPPER_PARTNER_WEBHOOK_SECRET!);

hooks.onAny(async (event) => {
  if (!isConnectEvent(event)) return; // mensagens/status dos números também chegam aqui
  const { connection } = event as PartnerWebhookEvent;
  switch (event.type) {
    case "connect.completed":
    case "connect.resumed":
      await db.setBzapperStatus(connection.externalId, "active");
      break;
    case "connect.suspended": // Pro do cliente sem pagamento — volta sozinho ao pagar
      await db.setBzapperStatus(connection.externalId, "suspended");
      break;
    case "connect.revoked": // encerrada — a key não vale mais
      await db.deleteBzapperKey(connection.externalId);
      break;
  }
});

app.post(
  "/webhooks/bzapper-partner",
  express.raw({ type: "application/json" }), // corpo CRU, obrigatório para a assinatura
  hooks.middleware(),
);

// 4) Usando a key do cliente: trate a suspensão (402) e a revogação (401).
app.post("/avisar", express.json(), async (req, res) => {
  const bz = new Bzapper({ apiKey: await db.getBzapperKey(req.user.id) });
  try {
    await bz.sendText({ to: req.body.to, body: req.body.text });
    res.sendStatus(202);
  } catch (err) {
    if (err instanceof BzapperError && err.code === "connect_suspended") {
      // 402: o Pro do cliente está sem pagamento. Peça para ele regularizar.
      return res.status(402).json({ error: "Regularize sua assinatura do bZapper." });
    }
    if (err instanceof BzapperError && err.code === "connect_revoked") {
      // 401: a conexão acabou. Ofereça conectar de novo (nova sessão).
      return res.status(409).json({ error: "Conecte o WhatsApp novamente." });
    }
    throw err;
  }
});

app.listen(3000);
```

### Front

```html
<script src="https://widget.bzapper.com.br/v1/connect.js"></script>
<script>
  async function conectarWhatsApp() {
    const { session } = await fetch("/bzapper/session", { method: "POST" }).then((r) => r.json());

    BzapperConnect.open({
      session,
      onComplete: ({ code }) =>
        fetch("/bzapper/exchange", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        }),
    });
  }
</script>
```

### Gerenciar conexões

```ts
const me = await partner.me(); // de quem é o partner secret

const { data } = await partner.listConnections({ status: "suspended" }); // ou { external_id }
const conn = await partner.getConnection(data[0].id); // status, conta, números

const rotated = await partner.rotateConnectionKey(conn.id); // nova key; a anterior para de valer
console.log(rotated.api_key);

await partner.revokeConnection(conn.id); // revoga a key (NÃO cancela o plano do cliente)
```

Estados da conexão (`status`): `pending_account`, `pending_payment`,
`pending_number`, `active`, `suspended` e `revoked`. Eventos entregues ao webhook
do parceiro: `connect.completed`, `connect.suspended`, `connect.resumed` e
`connect.revoked` (lista em `CONNECT_EVENT_TYPES`), além dos eventos normais
dos números das conexões ativas. O `event.connection` tem `id`, `externalId`,
`accountId`, `projectId` e `status`.

### Lado do cliente: apps conectados

Com a API key da própria conta, o cliente vê e desconecta os parceiros:

```ts
const { data: apps } = await bz.listConnectedApps(); // com partner_name / partner_logo_url
await bz.revokeConnectedApp(apps[0].id);             // admin; a key do parceiro para na hora
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
    // Key de bZapper Connect: "connect_suspended" (402) e "connect_revoked" (401).
  } else {
    throw err;
  }
}
```

## Exemplo rodável

Veja [`examples/quickstart.ts`](./examples/quickstart.ts).

## Licença

MIT © Berni Software
