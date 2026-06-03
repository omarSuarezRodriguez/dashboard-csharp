import { getPrisma } from "../src/infrastructure/prisma.js";

const tenant = await getPrisma().tenant.findFirst();
if (!tenant) throw new Error("no tenant");

const userPhone = "whatsapp:+573114621944";
try {
  await getPrisma().conversation.upsert({
    where: { tenantId_userPhone: { tenantId: tenant.id, userPhone } },
    create: {
      tenantId: tenant.id,
      userPhone,
      displayName: "Papa",
      step: "idle",
      context: {},
    },
    update: { displayName: "Papa" },
  });
  console.log("OK");
} catch (e) {
  console.error("FAIL", e);
}
await getPrisma().$disconnect();
