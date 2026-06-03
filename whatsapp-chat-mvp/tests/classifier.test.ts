import { describe, expect, it } from "vitest";
import { RuleBasedClassifier } from "../src/application/classifier.js";

const classifier = new RuleBasedClassifier();

describe("RuleBasedClassifier", () => {
  it("detects greeting", () => {
    expect(
      classifier.classify({ bodyNormalized: "hola", step: "idle", language: "es" }),
    ).toBe("greeting");
  });

  it("forces order intent during awaiting_order", () => {
    expect(
      classifier.classify({
        bodyNormalized: "algo random",
        step: "awaiting_order",
        language: "es",
      }),
    ).toBe("order");
  });

  it("returns unknown for unrelated idle text", () => {
    expect(
      classifier.classify({
        bodyNormalized: "xyzqwerty",
        step: "idle",
        language: "es",
      }),
    ).toBe("unknown");
  });
});
