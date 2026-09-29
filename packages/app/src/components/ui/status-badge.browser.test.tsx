import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { StatusBadge } from "./status-badge";

interface MountedBadge {
  root: Root;
  container: HTMLDivElement;
}

const mountedBadges: MountedBadge[] = [];

function mountBadge(variant: "success" | "warning" | "error" | "muted"): HTMLElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => root.render(<StatusBadge label="Status" variant={variant} />));
  mountedBadges.push({ root, container });

  const badge = container.firstElementChild;
  if (!(badge instanceof HTMLElement)) {
    throw new Error("StatusBadge did not render a badge element");
  }
  return badge;
}

afterEach(() => {
  for (const mounted of mountedBadges.splice(0)) {
    act(() => mounted.root.unmount());
    mounted.container.remove();
  }
});

function parseColor(value: string): { rgb: string; alpha: number } {
  const channels = value.match(/[\d.]+/g)?.map(Number) ?? [];
  return { rgb: channels.slice(0, 3).join(","), alpha: channels[3] ?? 1 };
}

describe("StatusBadge", () => {
  it("uses the neutral badge shell for the muted variant", () => {
    const style = getComputedStyle(mountBadge("muted"));

    expect(style.backgroundColor).toBe("rgb(228, 228, 231)");
    expect(style.borderColor).toBe("rgb(228, 228, 231)");
  });

  it.each([
    ["success", "21,128,61"],
    ["warning", "217,119,6"],
    ["error", "185,28,28"],
  ] as const)(
    "fills the %s variant with a translucent tint of its own status color",
    (variant, statusRgb) => {
      const fill = parseColor(getComputedStyle(mountBadge(variant)).backgroundColor);

      expect(fill.rgb).toBe(statusRgb);
      expect(fill.alpha).toBeGreaterThan(0);
      expect(fill.alpha).toBeLessThan(0.5);
    },
  );

  // The status color capped in lightness, so the label stays readable on its own tint.
  it.each([
    ["success", "rgb(0, 94, 40)"],
    ["warning", "rgb(116, 60, 0)"],
    ["error", "rgb(149, 0, 9)"],
    ["muted", "rgb(102, 102, 102)"],
  ] as const)("uses the %s tint foreground for its text", (variant, expectedColor) => {
    const badge = mountBadge(variant);
    const text = badge.lastElementChild;
    if (!(text instanceof HTMLElement)) {
      throw new Error("StatusBadge did not render its label");
    }

    expect(getComputedStyle(text).color).toBe(expectedColor);
  });
});
