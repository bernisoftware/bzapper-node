# @bzapper/client

SDK oficial do **bZapper** para Node/TypeScript — gateway de WhatsApp multi-tenant: conecte números, envie mensagens, gerencie instâncias, API keys e acompanhe o uso.

- ESM + types completos
- **Zero dependências de runtime** (usa `fetch` nativo do Node 18+)
- Erros tipados (`BzapperError` + subclasses por status) com `code` estável e `requestId`
- Novas tentativas automáticas seguras (`Idempotency-Key` em toda escrita) — padrão Berni Software
- Um método para cada operação pública da API (159), testado contra a suíte de conformidade

## Instalação

```bash
npm i @bzapper/client
```

Requer **Node 18+** (fetch nativo).

**Fixe a versão exata** no `package.json` (`"@bzapper/client": "0.8.1"`, sem `^`): cada release
declara nas notas se muda a superfície pública ou se é só aditiva.

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

## Autenticação

Crie a API key no painel do bZapper (**Configurações → API keys**) ou por código com
`bz.createKey(...)`. A key (`bz_live_...`) pertence a um **projeto** (números, inbox e stats são
isolados por projeto); para agir em outro projeto da conta, passe `projectId` (vai no header
`X-Project-Id`). Nunca exponha a key no navegador.

## Configuração

```ts
new Bzapper({
  apiKey: "bz_live_...",
  locale: "pt-BR",   // opcional → header Accept-Language (mensagens de erro traduzidas)
  timeout: 30_000,   // opcional, ms por tentativa (default 30000)
  maxRetries: 2,     // opcional, novas tentativas além da primeira (default 2; 0 desliga)
  projectId: "…",    // opcional → header X-Project-Id
  baseUrl: "http://localhost:8080", // opcional, só em dev/self-host
});
```

Toda requisição envia `Authorization: Bearer <apiKey>`, `Accept: application/json`,
`X-Bzapper-Client: bzapper-node/<versão>` (e o mesmo `User-Agent`), um `X-Request-Id` por
chamada, `Idempotency-Key` nas escritas, `Content-Type: application/json` (quando há corpo) e
`Accept-Language`/`X-Project-Id` quando configurados. Todo método aceita um **último argumento
opcional** `{ idempotencyKey?, timeout?, maxRetries?, signal? }`.

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

### Editar, apagar, encaminhar, marcar lido e agendar

```ts
await bz.editMessage(msg.message_id, { text: "Texto corrigido" });
await bz.revokeMessage(msg.message_id, { for_everyone: true });
await bz.forwardMessage({ instance_id: inst.id, to: "+5511988887777", from_chat: jid, wa_message_id: "3EB0…" });
await bz.markRead("3EB0…", { instance_id: inst.id, chat: jid });

// Qualquer envio aceita `scheduled_at` (RFC3339).
const s = await bz.sendText({ to: "+5511999999999", body: "Lembrete", scheduled_at: "2026-10-01T12:00:00Z" });
const { data: pending } = await bz.listScheduled({ limit: 50 });
await bz.cancelScheduled(s.scheduled_id!);
```

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
await bz.logoutInstance(inst.id);          // exige novo QR
await bz.clearInstanceSession(inst.id);    // pareamento travado: apaga a credencial do dispositivo

// Arquivar mantém o histórico; `archived: "1"` lista os arquivados.
await bz.archiveInstance(inst.id);
const archived = await bz.listInstances({ archived: "1" });
await bz.unarchiveInstance(inst.id);

// Rede, filtros de entrada e privacidade.
await bz.setInstanceProxy(inst.id, { proxy_url: "http://user:pass@proxy.example:8080" });
await bz.setInboundFilters(inst.id, { ignore_groups: true, ignore_status: true });
await bz.setPrivacy(inst.id, { setting: "last", value: "contacts" });

await bz.deleteInstance(inst.id); // encerra a sessão e remove
await bz.getHealth();             // { status: "ok", version }
```

### API oficial (WhatsApp Cloud API)

```ts
await bz.connectOfficialAccount({ waba_id: "…", phone_number_id: "…", access_token: "…" });
const official = await bz.getOfficialAccount();
await bz.disconnectOfficialAccount();
```

### Pools (rotação entre números)

```ts
const pool = await bz.createPool({ name: "Vendas", strategy: "health_weighted" });
await bz.addPoolNumber(pool.id, { instance_id: inst.id });
await bz.getPool(pool.id);
const { data: pools } = await bz.listPools();
await bz.sendText({ to: "+5511999999999", body: "Oi!", pool_id: pool.id });
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

await bz.updateGroup(group.jid, inst.id, { name: "Equipe", announce: true });
const fresh = await bz.groupInvite(group.jid, inst.id, { reset: true }); // revoga o link antigo
await bz.listJoinRequests(group.jid, inst.id);
await bz.updateJoinRequests(group.jid, inst.id, { participants: ["+5511988887777"], approve: true });
```

### Chats, etiquetas, bloqueio e chamadas

```ts
await bz.muteChat(jid, { instance_id: inst.id, on: true });
const label = await bz.createLabel({ instance_id: inst.id, name: "VIP" });
await bz.applyChatLabel(jid, { instance_id: inst.id, label_id: label.id!, apply: true });
await bz.listLabels(inst.id);
await bz.deleteLabel(label.id!, inst.id);

await bz.blockContact("5511988887777@s.whatsapp.net", { instance_id: inst.id });
await bz.getBlocklist(inst.id);
await bz.unblockContact("5511988887777@s.whatsapp.net", { instance_id: inst.id });

await bz.rejectCall({ instance_id: inst.id, call_from: "5511988887777@s.whatsapp.net", call_id: "…" });
```

### Contatos

```ts
const { data } = await bz.contactsCheck({
  instance_id: inst.id,
  phones: ["+5511988887777", "+5511977776666"],
});
for (const c of data) console.log(c.query, c.in_whatsapp, c.jid);
```

### Base de contatos (CRM), tags, grupos e supressão

O vínculo contato ↔ projeto/número é mantido **automaticamente** pela API; os filtros só leem.

```ts
const page = await bz.listContacts({ tags: ["vip"], status: "active", has_email: true, limit: 50 });
const contact = await bz.createContact({ phone: "+5511988887777", name: "Ana", email: "ana@exemplo.com" });
await bz.updateContact(contact.id!, { address: { city: "São Paulo", state: "SP" } });
await bz.getContactHistory(contact.id!, { limit: 20 });
await bz.addContactNote(contact.id!, { body: "Pediu retorno à tarde" });

await bz.createTag({ key: "vip", name: "VIP" });
await bz.mutateContactTags(contact.id!, { add: ["vip"] });
await bz.createContactGroup({ key: "clientes", name: "Clientes" });
await bz.mutateContactGroups(contact.id!, { add: ["clientes"] });

await bz.optOutContact(contact.id!);   // LGPD
await bz.optInContact(contact.id!);
await bz.createSuppression({ phone: "+5511977776666", reason: "pediu" });
await bz.deleteSuppression("+5511977776666");
await bz.deleteContact(contact.id!);
```

#### Importar em lote (`importContacts`)

Upsert por telefone, até **1000 linhas** por chamada. Linha ruim vai para `errors` e **não**
derruba o resto do lote; supresso/opt-out/bloqueado aparece em `skipped_rows` e não ressuscita.
Tags e grupos são criados sob demanda. Contato novo nasce `pending_validation` (precisa de
opt-in antes de campanha).

```ts
const rows = [
  { phone: "+5511988887777", name: "Ana", email: "ana@exemplo.com", tags: ["vip"], groups: ["clientes"] },
  { phone: "+5511977776666", name: "Bruno", address: { city: "São Paulo", state: "SP" } },
];

const dry = await bz.importContacts({ contacts: rows, dry_run: true }); // valida, não escreve
if (dry.failed === 0) {
  const res = await bz.importContacts({ contacts: rows });
  console.log(res.created, res.updated, res.skipped, res.failed);
  for (const row of res.skipped_rows ?? []) console.warn(row.index, row.phone, row.reason);
}
```

#### Exportar em CSV (`exportContacts`)

Aceita os **mesmos filtros** de `listContacts` (sem `offset`; `limit` é o teto de linhas) e é a
única rota da SDK que **não devolve JSON**: você recebe o **texto CSV cru** (`string`), pronto
para gravar em arquivo ou jogar no seu parser — sem streams para lembrar de fechar.

```ts
import { writeFile } from "node:fs/promises";

const csv = await bz.exportContacts({ tags: ["vip"], status: "active", limit: 50_000 });
await writeFile("contatos.csv", csv, "utf8");
// phone,name,email,status,source,tags,groups,created_at,last_activity_at
// +5511988887777,"Silva, Ana",ana@exemplo.com,active,import,vip;novo,clientes,2026-09-21T12:00:00Z,…
```

Tags e grupos vêm unidos por `;` e as datas em RFC 3339 (UTC). Campos com vírgula ou aspas vêm
escapados pelo padrão CSV — use um parser de verdade se for reimportar.

## Campanhas

```ts
const camp = await bz.createCampaign({
  name: "Black Friday",
  pacing_profile: "conservative",
  variations: [{ body: "Oi {nome}! {Oferta|Promoção} só hoje." }],
});
await bz.addCampaignRecipients(camp.id, { contact_filter: { tags: ["vip"] } });
await bz.getCampaignEligibility();          // números aptos (conexão + aquecimento)
const dry = await bz.dryRunCampaign(camp.id);
console.log(dry.estimated_human, dry.warnings);
await bz.startCampaign(camp.id);
await bz.pauseCampaign(camp.id);
await bz.resumeCampaign(camp.id);

// Imagem de cabeçalho (multipart).
import { fileFromPath } from "@bzapper/client";
const { url } = await bz.uploadCampaignMedia(await fileFromPath("./banner.png", "image/png"));
```

## Projetos, marca, conta e usuários

```ts
const proj = await bz.createProject({ name: "Loja 2" });
await bz.updateProject(proj.id, { name: "Loja SP", color: "#0a7" });
await bz.getProjectsHealth();                       // semáforo de números por projeto
await bz.setProjectBrand(proj.id, { about: "Atendimento Loja SP" });
await bz.uploadProjectLogo(proj.id, { content: bytes, filename: "logo.png", contentType: "image/png" });
await bz.uploadBrandLogo(await fileFromPath("./logo.png", "image/png"));

const me = await bz.getMe();
await bz.updateProfile({ name: "Ana", job_title: "Suporte" });
await bz.updateAccount({ name: "Minha Empresa" });
await bz.inviteUser({ email: "joao@exemplo.com", role: "agent" });
```

## Plano, add-ons e faturas

```ts
const ent = await bz.getMyEntitlements();
await bz.upgradePlan();                               // Pro no carrinho
await bz.changeAddon({ kind: "number", delta: 2 });   // +2 números
const cart = await bz.getAddonCart();
const { client_secret } = await bz.checkoutAddonCart({ save_card: true });
const { data: invoices } = await bz.listMyInvoices();
await bz.getPricing();
```

## API keys (self-serve)

```ts
const { data } = await bz.listKeys();

const created = await bz.createKey({ name: "CI", role: "agent" });
console.log(created.api_key); // guarde — mostrada só uma vez!

await bz.revokeKey(created.key.id);
```

### Rotacionar sem quebrar o deploy (`rotateKey`)

`rotateKey` cria uma chave **nova** (herda papel, escopos, projeto e nome) e mantém a **antiga**
funcionando por um período de carência — padrão 24 h, máximo 30 dias, `0` revoga na hora. Suba a
nova, troque o segredo onde a integração roda, e a antiga morre sozinha (depois do prazo ela
responde `401 key_expired`). Só admin; a chave crua vem uma única vez.

```ts
const rot = await bz.rotateKey(keyId, { revoke_in_seconds: 3600 }); // 1h de carência
console.log(rot.api_key);              // guarde — mostrada só uma vez!
console.log(rot.old_key_expires_at);   // quando a antiga para (null = revogada na hora)
console.log(rot.previous_key?.rotated_to === rot.key.id); // true
```

Chaves de parceiro (bZapper Connect) rotacionam pelo `partner.rotateConnectionKey`.

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

### Testar no localhost (`bzapper listen`)

O pacote traz um executável. Sem expor URL pública nenhuma, ele abre o stream de
eventos do seu projeto e **reenvia cada um ao seu servidor local**, assinado
igualzinho à produção (no espírito do `stripe listen`):

```bash
npx @bzapper/client listen --forward-to http://localhost:3000/webhooks/bzapper
```

```
bZapper v0.8.1 — relay de webhooks para o localhost
  ouvindo    https://api.bzapper.com.br/webhooks/listen
  reenviando http://localhost:3000/webhooks/bzapper
  secret     whsec_Hs3…

✓ conectado ao stream de eventos. Ctrl+C para sair.

14:02:11  message.received           evt_01HZX…  →  200 12ms
14:02:19  message.sent               evt_01HZY…  →  500 8ms
```

| Opção | |
|---|---|
| `-f`, `--forward-to <url>` | URL local que recebe os POSTs (obrigatória, salvo com `--print-only`) |
| `--api-key <key>` | a key `bz_live_…`; padrão `$BZAPPER_API_KEY` |
| `--base-url <url>` | base da API; padrão `$BZAPPER_BASE_URL` ou produção |
| `--project <id>` | projeto ativo (só para credencial de sessão — a API key já traz o seu) |
| `--events <a,b,c>` | só estes tipos (ex.: `message.received,message.sent`) |
| `--secret <whsec_…>` | segredo de assinatura; padrão: um novo, impresso ao iniciar |
| `--print-only` | não reenvia nada, só imprime o que chegar |
| `--help`, `--version` | |

**Não precisa de webhook cadastrado**: o stream espelha **todo** evento do
projeto, exista ou não uma assinatura — é justamente o modo de desenvolver antes
de ter URL pública. A key vai no header `Authorization`, nunca na URL.

Cada POST leva os **mesmos headers da produção** — `X-Bzapper-Signature:
sha256=<hmac do corpo cru>`, `X-Bzapper-Event-Id`, `X-Bzapper-Event-Type` e
`Content-Type: application/json` —, então o seu `Webhooks` valida o relay como
validaria a bZapper:

```ts
const hooks = new Webhooks(process.env.BZAPPER_WEBHOOK_SECRET!); // o secret que a CLI imprimiu
```

> ⚠️ **O secret é seu, não nosso.** Sem `--secret`, a CLI gera um na hora e o
> imprime: use-o no seu app durante o teste. A assinatura prova que o POST veio
> **desta CLI**, não da bZapper — ela vale exatamente o que o secret vale. Em
> produção, o secret é o do webhook cadastrado (`createWebhook`).

A conexão se reergue sozinha (backoff exponencial a partir do `retry` do
servidor, teto de 30 s); `Ctrl+C` sai limpo com um resumo. Credencial recusada
encerra na hora, com código de saída diferente de zero.

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

## Erros, novas tentativas e idempotência

Em qualquer resposta não-2xx o SDK lança `BzapperError` (ou uma subclasse). **Ramifique sempre
pelo `code`** (estável), nunca pelo `message` (texto traduzido).

| Status | Classe | |
|---|---|---|
| 400, 422 | `ValidationError` | corpo/parâmetro inválido |
| 401 | `AuthenticationError` | key inválida/revogada (`connect_revoked`) |
| 403 | `PermissionDeniedError` | `requiredScope` diz o escopo que faltou |
| 404 | `NotFoundError` | |
| 409 | `ConflictError` | ex.: `not_connected`, `idempotency_in_progress` |
| 429 | `RateLimitError` | `retryAfter` em segundos |
| 5xx | `ServerError` | |
| sem resposta | `NetworkError` | `status = 0`, `code = "NETWORK_ERROR"` |
| outro (ex.: 402) | `BzapperError` | ex.: `connect_suspended` |

Todas herdam de `BzapperError`, com: `code`, `message`, `status` (= `statusCode`), `locale`,
`requestId` (informe ao suporte), `retryAfter`, `requiredScope` e `body` (corpo decodificado).
Resposta 2xx que não é JSON vira `code = "INVALID_RESPONSE"`. Id de caminho vazio, `"."` ou `".."`
é recusado com `TypeError` antes de qualquer requisição.

```ts
import { Bzapper, BzapperError, RateLimitError } from "@bzapper/client";

try {
  await bz.sendText({ to: "+5511999999999", body: "Olá!" });
} catch (err) {
  if (err instanceof RateLimitError) {
    console.error(`aguarde ${err.retryAfter}s`);
  } else if (err instanceof BzapperError) {
    console.error(err.code, err.status, err.requestId); // ex.: "not_connected" 409 "a1b2…"
    // Key de bZapper Connect: "connect_suspended" (402) e "connect_revoked" (401).
  } else {
    throw err;
  }
}
```

**Novas tentativas:** o SDK tenta de novo sozinho em erro de rede/timeout, `429`, `502`, `503` e
`504` (nada mais — um `500` ou `4xx` volta na hora), até `maxRetries` vezes (padrão 2), esperando o
`Retry-After` (teto 60 s) ou `min(8, 0,5 × 2^n)` s + até 25% de jitter.

**Idempotência:** toda escrita (POST/PUT/PATCH/DELETE) leva um `Idempotency-Key` gerado por
chamada e **repetido** nas novas tentativas (com o mesmo `X-Request-Id`) — a API devolve a mesma
resposta sem refazer a operação (`Idempotent-Replayed: true`). Para tornar segura a repetição
entre execuções (um job que pode rodar duas vezes), passe a sua chave:

```ts
await bz.sendText({ to: "+5511999999999", body: "Pedido #42 confirmado" }, { idempotencyKey: "pedido-42" });
await bz.createContact({ phone: "+5511999999999" }, { idempotencyKey: "crm-import-42" });
```

## Exemplo rodável

Veja [`examples/quickstart.ts`](./examples/quickstart.ts).

## Licença

MIT © Berni Software
