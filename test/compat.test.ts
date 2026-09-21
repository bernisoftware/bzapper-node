/**
 * Trava de compatibilidade: a superfície pública da 0.6.2 (publicada, com consumidores fixados)
 * continua existindo no artefato construído. Tudo do padrão r2 é aditivo.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as sdk from "@bzapper/client";

const EXPORTS_062 = [
  "Bzapper", "BzapperError", "BzapperPartner", "CONNECT_EVENT_TYPES", "EVENT_ID_HEADER", "EVENT_TYPES",
  "EVENT_TYPE_HEADER", "SIGNATURE_HEADER", "WebhookSignatureError", "Webhooks", "constructWebhookEvent",
  "createClient", "createPartnerClient", "isConnectEvent", "verifyWebhook",
];

const CLIENT_METHODS_062 = (
  "sendText sendOTP sendImage sendVideo sendDocument sendAudio sendSticker sendLocation sendContact sendPoll " +
  "sendReaction sendButtons sendList listScheduled cancelScheduled createCampaign listCampaigns getCampaign " +
  "addCampaignRecipients listCampaignRecipients startCampaign pauseCampaign resumeCampaign cancelCampaign " +
  "dryRunCampaign updateCampaign estimateCampaign listInstances createInstance getInstance connectInstance " +
  "disconnectInstance clearInstanceSession listKeys createKey revokeKey getUsage setProfile presenceChat " +
  "listConversations conversationHistory archiveChat pinChat markChat listGroups createGroup getGroup joinGroup " +
  "previewGroupInvite updateGroupParticipants leaveGroup groupInvite contactsCheck listContacts listProjects " +
  "createProject getBrand setBrand applyBrand listUsers inviteUser updateUserRole removeUser getAccountUsage " +
  "listAdvisories markAdvisoryRead listWebhooks createWebhook updateWebhook deleteWebhook testWebhook " +
  "webhookDeliveries triggerWebhook listConnectedApps revokeConnectedApp"
).split(" ");

const PARTNER_METHODS_062 = "me createConnectSession exchangeCode listConnections getConnection rotateConnectionKey revokeConnection".split(" ");

describe("compatibilidade com a 0.6.2", () => {
  it("todos os exports de runtime continuam", () => {
    const keys = new Set(Object.keys(sdk));
    const missing = EXPORTS_062.filter((k) => !keys.has(k));
    assert.deepEqual(missing, []);
  });

  it("todos os métodos do Bzapper e do BzapperPartner continuam", () => {
    const bz = new sdk.Bzapper({ apiKey: "k" }) as unknown as Record<string, unknown>;
    assert.deepEqual(CLIENT_METHODS_062.filter((m) => typeof bz[m] !== "function"), []);
    const partner = new sdk.BzapperPartner({ partnerSecret: "s" }) as unknown as Record<string, unknown>;
    assert.deepEqual(PARTNER_METHODS_062.filter((m) => typeof partner[m] !== "function"), []);
  });

  it("BzapperError: construtor e campos antigos continuam", () => {
    const e = new sdk.BzapperError({ code: "x", message: "m", statusCode: 418, locale: "pt-BR" });
    assert.equal(e.code, "x");
    assert.equal(e.message, "m");
    assert.equal(e.statusCode, 418);
    assert.equal(e.status, 418);
    assert.equal(e.locale, "pt-BR");
    assert.equal(e.name, "BzapperError");
    assert.ok(e instanceof Error);
  });

  it("factories continuam", () => {
    assert.ok(sdk.createClient({ apiKey: "k" }) instanceof sdk.Bzapper);
    assert.ok(sdk.createPartnerClient({ partnerSecret: "s" }) instanceof sdk.BzapperPartner);
  });
});
