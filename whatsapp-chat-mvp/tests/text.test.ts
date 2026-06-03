import { describe, expect, it } from "vitest";
import { isAffirmative, isNegative, truncateReply } from "../src/domain/text.js";

describe("text helpers", () => {
  it("recognizes yes/no", () => {
    expect(isAffirmative("Sí")).toBe(true);
    expect(isNegative("no")).toBe(true);
  });

  it("truncates long replies", () => {
    const long = "a".repeat(1700);
    expect(truncateReply(long).length).toBeLessThanOrEqual(1600);
  });
});
