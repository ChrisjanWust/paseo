import { describe, expect, it } from "vitest";
import { isTargetLine, resolveTargetLineRange } from "./target-line";

describe("resolveTargetLineRange", () => {
  it("returns null without a line target", () => {
    expect(resolveTargetLineRange({}, 10)).toBeNull();
    expect(resolveTargetLineRange({ lineStart: 3 }, 0)).toBeNull();
  });

  it("targets a single line when there is no end", () => {
    expect(resolveTargetLineRange({ lineStart: 3 }, 10)).toEqual({ start: 3, end: 3 });
  });

  it("clamps the range to the document", () => {
    expect(resolveTargetLineRange({ lineStart: 8, lineEnd: 20 }, 10)).toEqual({
      start: 8,
      end: 10,
    });
    expect(resolveTargetLineRange({ lineStart: 40 }, 10)).toEqual({ start: 10, end: 10 });
  });

  it("ignores an end before the start", () => {
    expect(resolveTargetLineRange({ lineStart: 5, lineEnd: 2 }, 10)).toEqual({ start: 5, end: 5 });
  });
});

describe("isTargetLine", () => {
  it("includes both ends of the range", () => {
    const range = { start: 4, end: 6 };
    expect([3, 4, 5, 6, 7].map((line) => isTargetLine(range, line))).toEqual([
      false,
      true,
      true,
      true,
      false,
    ]);
    expect(isTargetLine(null, 4)).toBe(false);
  });
});
