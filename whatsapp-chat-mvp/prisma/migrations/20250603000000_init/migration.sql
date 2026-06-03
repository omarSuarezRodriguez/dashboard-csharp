-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'es',
    "timezone" TEXT NOT NULL DEFAULT 'America/Mexico_City',
    "twilio_account_sid" TEXT NOT NULL,
    "twilio_auth_token_encrypted" TEXT NOT NULL,
    "twilio_whatsapp_to" TEXT NOT NULL,
    "webhook_base_url" TEXT NOT NULL,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "setup_completed_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "tenant_id" TEXT NOT NULL,
    "user_phone" TEXT NOT NULL,
    "step" TEXT NOT NULL DEFAULT 'idle',
    "context" JSONB NOT NULL DEFAULT '{}',
    "unknown_count" INTEGER NOT NULL DEFAULT 0,
    "last_greeting_date" DATE,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("tenant_id","user_phone")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "user_phone" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "twilio_message_sid" TEXT,
    "intent" TEXT,
    "step_before" TEXT,
    "step_after" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE INDEX "conversations_tenant_id_user_phone_idx" ON "conversations"("tenant_id", "user_phone");

-- CreateIndex
CREATE UNIQUE INDEX "messages_twilio_message_sid_key" ON "messages"("twilio_message_sid");

-- CreateIndex
CREATE INDEX "messages_tenant_id_user_phone_idx" ON "messages"("tenant_id", "user_phone");

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
