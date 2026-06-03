export type Intent =
  | "greeting"
  | "menu"
  | "order"
  | "reservation"
  | "help"
  | "unknown";

export type Step =
  | "idle"
  | "awaiting_order"
  | "order_confirm"
  | "booking_date"
  | "booking_time"
  | "booking_confirm";

export interface TenantSettings {
  menu: string;
  welcome_message: string;
  business_hours: string;
  reservation_enabled: boolean;
  reservation_capacity: number;
  help_text: string;
}

export interface ConversationContext {
  orderDraft?: string;
  bookingDate?: string;
  bookingTime?: string;
  lastPrompt?: string;
}

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  language: string;
  timezone: string;
  twilioAccountSid: string;
  twilioAuthTokenEncrypted: string;
  twilioWhatsappTo: string;
  webhookBaseUrl: string;
  settings: TenantSettings;
  setupCompletedAt: Date | null;
  isActive: boolean;
}

export interface Conversation {
  tenantId: string;
  userPhone: string;
  step: Step;
  context: ConversationContext;
  unknownCount: number;
  lastGreetingDate: Date | null;
}

export const DEFAULT_SETTINGS: TenantSettings = {
  menu:
    "🍽 *La Casa del Sabor* — Menú\n\n" +
    "▸ *Entradas*\n" +
    "• Ceviche de pescado — $28.000\n" +
    "• Sopa del día — $18.000\n\n" +
    "▸ *Platos fuertes*\n" +
    "• Bandeja paisa — $42.000\n" +
    "• Pescado al horno — $38.000\n" +
    "• Pasta primavera — $32.000\n\n" +
    "▸ *Postres*\n" +
    "• Tres leches — $12.000\n" +
    "• Brownie con helado — $14.000\n\n" +
    "Escribe *pedido* para ordenar o *reserva* para una mesa.",
  welcome_message:
    "¡Hola {{name}}! 👋 Soy el asistente de *La Casa del Sabor*.\n\n" +
    "Puedo ayudarte con:\n" +
    "• *menú* — ver platos\n" +
    "• *pedido* — tomar tu orden\n" +
    "• *reserva* — reservar mesa\n" +
    "• *ayuda* — más información",
  business_hours: "Lun–Jue 11:30–22:00 | Vie–Sáb 11:30–23:00 | Dom 12:00–21:00",
  reservation_enabled: true,
  reservation_capacity: 6,
  help_text:
    "Soy tu asistente en WhatsApp. Comandos:\n" +
    "• *menú* — carta actual\n" +
    "• *pedido* — hacer un pedido\n" +
    "• *reserva* — reservar mesa\n" +
    "• *ayuda* — esta guía",
};

export function parseTenantSettings(raw: unknown): TenantSettings {
  const o = (raw && typeof raw === "object" ? raw : {}) as Partial<TenantSettings>;
  return {
    menu: o.menu ?? DEFAULT_SETTINGS.menu,
    welcome_message: o.welcome_message ?? DEFAULT_SETTINGS.welcome_message,
    business_hours: o.business_hours ?? DEFAULT_SETTINGS.business_hours,
    reservation_enabled: o.reservation_enabled ?? DEFAULT_SETTINGS.reservation_enabled,
    reservation_capacity: o.reservation_capacity ?? DEFAULT_SETTINGS.reservation_capacity,
    help_text: o.help_text ?? DEFAULT_SETTINGS.help_text,
  };
}
