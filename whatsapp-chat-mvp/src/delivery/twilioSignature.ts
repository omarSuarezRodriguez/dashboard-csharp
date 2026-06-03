import twilio from "twilio";
import { decryptSecret } from "../infrastructure/encryption.js";

export function validateTwilioSignature(
  authTokenEncrypted: string,
  encryptionKey: string,
  signature: string | undefined,
  url: string,
  params: Record<string, string>,
): boolean {
  if (!signature) return false;
  const authToken = decryptSecret(authTokenEncrypted, encryptionKey);
  return twilio.validateRequest(authToken, signature, url, params);
}
