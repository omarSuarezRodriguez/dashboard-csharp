import type { IntentClassifier, ClassifyContext } from "./ports.js";
import type { Intent } from "../domain/types.js";

const KEYWORDS: Record<Intent, string[]> = {
  greeting: ["hola", "buenos", "buenas", "hello", "hi", "hey"],
  menu: ["menu", "menú", "carta", "catalogo", "catálogo"],
  order: ["pedido", "orden", "ordenar", "comprar", "order", "quiero"],
  reservation: ["reserva", "reservar", "mesa", "booking", "book", "appointment"],
  help: ["ayuda", "help", "info", "soporte"],
  unknown: [],
};

const STEP_INTENT: Record<string, Intent> = {
  awaiting_order: "order",
  order_confirm: "order",
  booking_date: "reservation",
  booking_time: "reservation",
  booking_confirm: "reservation",
};

export class RuleBasedClassifier implements IntentClassifier {
  classify(ctx: ClassifyContext): Intent {
    const forced = STEP_INTENT[ctx.step];
    if (forced) return forced;

    const text = ctx.bodyNormalized;
    if (!text) return "unknown";

    for (const intent of [
      "greeting",
      "menu",
      "order",
      "reservation",
      "help",
    ] as Intent[]) {
      if (KEYWORDS[intent].some((kw) => text.includes(kw))) {
        return intent;
      }
    }

    return "unknown";
  }
}
