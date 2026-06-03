import type { Conversation, Intent, Tenant } from "../domain/types.js";

export interface ClassifyContext {
  bodyNormalized: string;
  step: string;
  language: string;
}

export interface IntentClassifier {
  classify(ctx: ClassifyContext): Intent;
}

export interface InboundInput {
  tenant: Tenant;
  from: string;
  to: string;
  body: string;
  messageSid: string;
  profileName?: string;
  numMedia: number;
}

export interface ProcessResult {
  replyText: string;
  intent?: Intent;
  stepBefore?: string;
  stepAfter?: string;
}

export interface OutboundMessenger {
  send(tenant: Tenant, to: string, body: string): Promise<void>;
}

export interface MessageQueue {
  enqueue(job: unknown): Promise<void>;
}

export interface ConversationRepository {
  findOrCreate(tenantId: string, userPhone: string): Promise<Conversation>;
  save(conversation: Conversation): Promise<void>;
}

export interface MessageRepository {
  existsByTwilioSid(sid: string): Promise<boolean>;
  saveInbound(params: {
    tenantId: string;
    userPhone: string;
    body: string;
    messageSid: string;
    intent?: string;
    stepBefore?: string;
    stepAfter?: string;
    createdAt?: Date;
  }): Promise<void>;
  saveOutbound(params: {
    tenantId: string;
    userPhone: string;
    body: string;
    intent?: string;
    stepBefore?: string;
    stepAfter?: string;
    createdAt?: Date;
  }): Promise<void>;
}

export interface TenantRepository {
  findBySlug(slug: string): Promise<Tenant | null>;
  count(): Promise<number>;
}
