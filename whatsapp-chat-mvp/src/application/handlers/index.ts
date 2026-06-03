import type { Conversation, Intent, Tenant } from "../../domain/types.js";
import {
  applyNameTemplate,
  isAffirmative,
  isNegative,
  todayInTimezone,
  isSameCalendarDay,
} from "../../domain/text.js";

export interface HandlerInput {
  tenant: Tenant;
  conversation: Conversation;
  bodyOriginal: string;
  bodyNormalized: string;
  profileName?: string;
}

export interface HandlerOutput {
  replyText: string;
  conversation: Conversation;
}

function setPrompt(conv: Conversation, prompt: string): Conversation {
  return {
    ...conv,
    context: { ...conv.context, lastPrompt: prompt },
  };
}

function resetIdle(conv: Conversation): Conversation {
  return {
    ...conv,
    step: "idle",
    context: {},
    unknownCount: 0,
  };
}

function handleGreeting(input: HandlerInput): HandlerOutput {
  const { tenant, conversation, profileName } = input;
  const today = todayInTimezone(tenant.timezone);
  const alreadyGreeted = isSameCalendarDay(
    conversation.lastGreetingDate,
    today,
    tenant.timezone,
  );

  if (!alreadyGreeted) {
    const text = applyNameTemplate(tenant.settings.welcome_message, profileName);
    const next: Conversation = {
      ...conversation,
      lastGreetingDate: new Date(),
      unknownCount: 0,
    };
    return { replyText: text, conversation: next };
  }

  return {
    replyText:
      "¡Hola de nuevo! Escribe *menú*, *pedido*, *reserva* o *ayuda*.",
    conversation: { ...conversation, unknownCount: 0 },
  };
}

function handleMenu(input: HandlerInput): HandlerOutput {
  return {
    replyText: input.tenant.settings.menu,
    conversation: resetIdle(input.conversation),
  };
}

function handleOrder(input: HandlerInput): HandlerOutput {
  const { conversation, bodyNormalized, bodyOriginal, tenant } = input;
  const s = tenant.settings;

  if (conversation.step === "idle") {
    const conv = setPrompt(
      { ...conversation, step: "awaiting_order", context: {} },
      "¿Qué deseas ordenar? Escribe los ítems.",
    );
    return {
      replyText: "¿Qué deseas ordenar? Escribe los ítems.",
      conversation: conv,
    };
  }

  if (conversation.step === "awaiting_order") {
    const draft = bodyOriginal.trim();
    const conv = setPrompt(
      {
        ...conversation,
        step: "order_confirm",
        context: { ...conversation.context, orderDraft: draft },
      },
      `Resumen de tu pedido:\n${draft}\n\n¿Confirmas? Responde *Sí* o *No*.`,
    );
    return {
      replyText: `Resumen de tu pedido:\n${draft}\n\n¿Confirmas? Responde *Sí* o *No*.`,
      conversation: conv,
    };
  }

  if (conversation.step === "order_confirm") {
    if (isAffirmative(bodyNormalized)) {
      return {
        replyText: "✅ Pedido registrado. ¡Gracias! Te contactaremos si hace falta.",
        conversation: resetIdle(conversation),
      };
    }
    if (isNegative(bodyNormalized)) {
      return {
        replyText: "Pedido cancelado. Cuando quieras, escribe *pedido* de nuevo.",
        conversation: resetIdle(conversation),
      };
    }
    return {
      replyText: conversation.context.lastPrompt ?? "¿Confirmas? *Sí* o *No*.",
      conversation,
    };
  }

  return handleMenu(input);
}

function handleReservation(input: HandlerInput): HandlerOutput {
  const { tenant, conversation, bodyNormalized, bodyOriginal } = input;
  const settings = tenant.settings;

  if (!settings.reservation_enabled) {
    return {
      replyText: "Por ahora no tomamos reservas por WhatsApp. Horario: " + settings.business_hours,
      conversation: resetIdle(conversation),
    };
  }

  if (conversation.step === "idle") {
    const conv = setPrompt(
      { ...conversation, step: "booking_date", context: {} },
      "¿Para qué fecha? (ej: hoy, mañana, 2026-06-10)",
    );
    return {
      replyText: "¿Para qué fecha? (ej: hoy, mañana, o AAAA-MM-DD)",
      conversation: conv,
    };
  }

  if (conversation.step === "booking_date") {
    const date = parseBookingDate(bodyNormalized, tenant.timezone);
    if (!date) {
      return {
        replyText: "No entendí la fecha. Prueba: hoy, mañana, o AAAA-MM-DD.",
        conversation,
      };
    }
    const conv = setPrompt(
      {
        ...conversation,
        step: "booking_time",
        context: { ...conversation.context, bookingDate: date },
      },
      "¿A qué hora? (ej: 19:30)",
    );
    return { replyText: "¿A qué hora? (ej: 19:30)", conversation: conv };
  }

  if (conversation.step === "booking_time") {
    const time = parseBookingTime(bodyOriginal);
    if (!time) {
      return {
        replyText: "Indica la hora en formato HH:MM (24h).",
        conversation,
      };
    }
    const cap = settings.reservation_capacity;
    const summary = `Reserva: ${conversation.context.bookingDate} a las ${time}, ${cap} personas máx. por turno.\n\n¿Confirmas? *Sí* o *No*.`;
    const conv = setPrompt(
      {
        ...conversation,
        step: "booking_confirm",
        context: { ...conversation.context, bookingTime: time },
      },
      summary,
    );
    return { replyText: summary, conversation: conv };
  }

  if (conversation.step === "booking_confirm") {
    if (isAffirmative(bodyNormalized)) {
      const { bookingDate, bookingTime } = conversation.context;
      return {
        replyText: `✅ Reserva confirmada para ${bookingDate} a las ${bookingTime}. ¡Te esperamos!`,
        conversation: resetIdle(conversation),
      };
    }
    if (isNegative(bodyNormalized)) {
      return {
        replyText: "Reserva cancelada. Escribe *reserva* cuando quieras intentar de nuevo.",
        conversation: resetIdle(conversation),
      };
    }
    return {
      replyText: conversation.context.lastPrompt ?? "¿Confirmas? *Sí* o *No*.",
      conversation,
    };
  }

  return handleMenu(input);
}

function handleHelp(input: HandlerInput): HandlerOutput {
  const { tenant, conversation } = input;
  const text =
    tenant.settings.help_text +
    "\n\nHorario: " +
    tenant.settings.business_hours +
    "\n\nOpciones: *menú*, *pedido*, *reserva*, *ayuda*";
  return { replyText: text, conversation: resetIdle(conversation) };
}

function handleUnknown(input: HandlerInput): HandlerOutput {
  const { conversation } = input;

  if (conversation.step !== "idle" && conversation.context.lastPrompt) {
    return {
      replyText: conversation.context.lastPrompt,
      conversation,
    };
  }

  const count = conversation.unknownCount + 1;
  const next = { ...conversation, unknownCount: count };

  if (count >= 2) {
    return {
      replyText:
        "No te entendí bien. Opciones:\n• *menú*\n• *pedido*\n• *reserva*\n• *ayuda*",
      conversation: { ...next, unknownCount: 0 },
    };
  }

  return {
    replyText: "No te entendí. Escribe *menú*, *pedido*, *reserva* o *ayuda*.",
    conversation: next,
  };
}

export function dispatchHandler(intent: Intent, input: HandlerInput): HandlerOutput {
  switch (intent) {
    case "greeting":
      return handleGreeting(input);
    case "menu":
      return handleMenu(input);
    case "order":
      return handleOrder(input);
    case "reservation":
      return handleReservation(input);
    case "help":
      return handleHelp(input);
    default:
      return handleUnknown(input);
  }
}

function parseBookingDate(text: string, timezone: string): string | null {
  const t = text.trim().toLowerCase();
  const today = todayInTimezone(timezone);
  if (t === "hoy" || t === "today") return today;
  if (t === "mañana" || t === "manana" || t === "tomorrow") {
    const d = new Date(today + "T12:00:00");
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  return null;
}

function parseBookingTime(text: string): string | null {
  const m = text.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}
