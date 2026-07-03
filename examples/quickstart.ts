/**
 * Quickstart do @bzapper/client.
 *
 * Rode com: `npx tsx examples/quickstart.ts` (ou compile e rode com node).
 *
 * Defina as variáveis de ambiente:
 *   BZAPPER_API_KEY   (ex.: bz_live_...)  — obrigatório
 *   BZAPPER_BASE_URL  (opcional; default = produção. Use só em dev/self-host)
 *   TO                (destino E.164, ex.: +5511999999999)
 */
import { Bzapper, BzapperError } from "@bzapper/client";

const bz = new Bzapper({
  apiKey: process.env.BZAPPER_API_KEY ?? "bz_live_xxx",
  baseUrl: process.env.BZAPPER_BASE_URL, // opcional: sem isto, aponta para produção
  locale: "pt-BR",
  timeout: 30_000,
});

const to = process.env.TO ?? "+5511999999999";

async function main() {
  try {
    // Hello world: envia um texto.
    const msg = await bz.sendText({ to, body: "Olá do @bzapper/client!" });
    console.log("Enfileirada:", msg.message_id, msg.status);

    // Lista instâncias e uso.
    const instances = await bz.listInstances();
    console.log(`Instâncias: ${instances.data.length}`);

    // Operações avançadas (precisam de um número específico).
    const instanceId = process.env.INSTANCE_ID ?? instances.data[0]?.id;
    if (instanceId) {
      // Presença "digitando…" — funciona inclusive em grupos (JID de grupo em `to`).
      const groupJid = process.env.GROUP_JID;
      if (groupJid) {
        await bz.presenceChat({ instance_id: instanceId, to: groupJid, state: "typing" });
        console.log("Presença enviada ao grupo:", groupJid);
      }

      const conversations = await bz.listConversations(instanceId);
      console.log(`Conversas: ${conversations.data.length}`);

      const groups = await bz.listGroups(instanceId);
      console.log(`Grupos: ${groups.data.length}`);
    }

    const usage = await bz.getUsage();
    console.log("Uso (total):", usage.total ?? 0);
  } catch (err) {
    if (err instanceof BzapperError) {
      // SEMPRE ramifique pelo `code` estável, nunca pelo texto.
      console.error(`[${err.statusCode}] ${err.code}: ${err.message}`);
      if (err.code === "rate_limited") {
        console.error("Aguarde antes de tentar novamente.");
      }
      return;
    }
    throw err;
  }
}

main();
