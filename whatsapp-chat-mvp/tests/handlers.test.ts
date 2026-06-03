import { describe, expect, it } from "vitest";
import { dispatchHandler } from "../src/application/handlers/index.js";
import { DEFAULT_SETTINGS, type Conversation, type Tenant } from "../src/domain/types.js";

const tenant: Tenant = {
  id: "t1",
  slug: "demo",
  name: "Demo",
  language: "es",
  timezone: "UTC",
  twilioAccountSid: "AC",
  twilioAuthTokenEncrypted: "enc",
  twilioWhatsappTo: "whatsapp:+1",
  webhookBaseUrl: "https://x.com",
  settings: DEFAULT_SETTINGS,
  setupCompletedAt: new Date(),
  isActive: true,
};

const baseConversation: Conversation = {
  tenantId: "t1",
  userPhone: "whatsapp:+1",
  step: "idle",
  context: {},
  unknownCount: 0,
  lastGreetingDate: null,
};

describe("handlers", () => {
  it("starts order flow", () => {
    const out = dispatchHandler("order", {
      tenant,
      conversation: baseConversation,
      bodyOriginal: "pedido",
      bodyNormalized: "pedido",
    });
    expect(out.conversation.step).toBe("awaiting_order");
    expect(out.replyText).toContain("ordenar");
  });

  it("confirms order on sí", () => {
    const conv: Conversation = {
      ...baseConversation,
      step: "order_confirm",
      context: { orderDraft: "tacos x2", lastPrompt: "confirm?" },
    };
    const out = dispatchHandler("order", {
      tenant,
      conversation: conv,
      bodyOriginal: "sí",
      bodyNormalized: "sí",
    });
    expect(out.conversation.step).toBe("idle");
    expect(out.replyText).toContain("registrado");
  });

  it("unknown twice shows menu options", () => {
    const conv = { ...baseConversation, unknownCount: 1 };
    const out = dispatchHandler("unknown", {
      tenant,
      conversation: conv,
      bodyOriginal: "???",
      bodyNormalized: "???",
    });
    expect(out.replyText).toContain("menú");
  });
});
