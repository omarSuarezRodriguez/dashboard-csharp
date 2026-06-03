import type { Prisma } from "@prisma/client";
import type {
  ConversationRepository,
  MessageRepository,
  TenantRepository,
} from "../application/ports.js";
import type { Conversation, ConversationContext, Step, Tenant } from "../domain/types.js";
import { parseTenantSettings } from "../domain/types.js";
import { getPrisma } from "./prisma.js";

function mapTenant(row: {
  id: string;
  slug: string;
  name: string;
  language: string;
  timezone: string;
  twilioAccountSid: string;
  twilioAuthTokenEncrypted: string;
  twilioWhatsappTo: string;
  webhookBaseUrl: string;
  settings: unknown;
  setupCompletedAt: Date | null;
  isActive: boolean;
}): Tenant {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    language: row.language,
    timezone: row.timezone,
    twilioAccountSid: row.twilioAccountSid,
    twilioAuthTokenEncrypted: row.twilioAuthTokenEncrypted,
    twilioWhatsappTo: row.twilioWhatsappTo,
    webhookBaseUrl: row.webhookBaseUrl,
    settings: parseTenantSettings(row.settings),
    setupCompletedAt: row.setupCompletedAt,
    isActive: row.isActive,
  };
}

function mapConversation(row: {
  tenantId: string;
  userPhone: string;
  step: string;
  context: unknown;
  unknownCount: number;
  lastGreetingDate: Date | null;
}): Conversation {
  return {
    tenantId: row.tenantId,
    userPhone: row.userPhone,
    step: row.step as Step,
    context: (row.context ?? {}) as ConversationContext,
    unknownCount: row.unknownCount,
    lastGreetingDate: row.lastGreetingDate,
  };
}

export class PrismaTenantRepository implements TenantRepository {
  async findBySlug(slug: string): Promise<Tenant | null> {
    const row = await getPrisma().tenant.findUnique({ where: { slug } });
    return row ? mapTenant(row) : null;
  }

  async count(): Promise<number> {
    return getPrisma().tenant.count();
  }
}

export class PrismaConversationRepository implements ConversationRepository {
  async findOrCreate(tenantId: string, userPhone: string): Promise<Conversation> {
    const prisma = getPrisma();
    const existing = await prisma.conversation.findUnique({
      where: { tenantId_userPhone: { tenantId, userPhone } },
    });
    if (existing) return mapConversation(existing);

    const created = await prisma.conversation.create({
      data: { tenantId, userPhone, step: "idle", context: {} },
    });
    return mapConversation(created);
  }

  async save(conversation: Conversation): Promise<void> {
    await getPrisma().conversation.update({
      where: {
        tenantId_userPhone: {
          tenantId: conversation.tenantId,
          userPhone: conversation.userPhone,
        },
      },
      data: {
        step: conversation.step,
        context: conversation.context as Prisma.InputJsonValue,
        unknownCount: conversation.unknownCount,
        lastGreetingDate: conversation.lastGreetingDate,
      },
    });
  }
}

export class PrismaMessageRepository implements MessageRepository {
  async existsByTwilioSid(sid: string): Promise<boolean> {
    const row = await getPrisma().message.findUnique({
      where: { twilioMessageSid: sid },
      select: { id: true },
    });
    return !!row;
  }

  async saveInbound(params: {
    tenantId: string;
    userPhone: string;
    body: string;
    messageSid: string;
    intent?: string;
    stepBefore?: string;
    stepAfter?: string;
  }): Promise<void> {
    await getPrisma().message.create({
      data: {
        tenantId: params.tenantId,
        userPhone: params.userPhone,
        direction: "inbound",
        body: params.body,
        twilioMessageSid: params.messageSid,
        intent: params.intent,
        stepBefore: params.stepBefore,
        stepAfter: params.stepAfter,
      },
    });
  }

  async saveOutbound(params: {
    tenantId: string;
    userPhone: string;
    body: string;
    intent?: string;
    stepBefore?: string;
    stepAfter?: string;
  }): Promise<void> {
    await getPrisma().message.create({
      data: {
        tenantId: params.tenantId,
        userPhone: params.userPhone,
        direction: "outbound",
        body: params.body,
        intent: params.intent,
        stepBefore: params.stepBefore,
        stepAfter: params.stepAfter,
      },
    });
  }
}
