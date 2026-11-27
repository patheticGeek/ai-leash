import { describe, expect, it } from "vitest";
import { fitForWidth } from "./BoardBand";

describe("fitForWidth", () => {
  it("shows everything on a wide band", () => {
    expect(fitForWidth(1400)).toBe("wide");
    expect(fitForWidth(1040)).toBe("wide");
  });
  it("folds the tools away, then New task's label, as the band narrows", () => {
    expect(fitForWidth(1039)).toBe("narrow");
    expect(fitForWidth(820)).toBe("narrow");
    expect(fitForWidth(819)).toBe("tight");
    expect(fitForWidth(600)).toBe("tight");
  });
});
