import { describe, expect, it } from "vitest";
import type {
  ProviderSelectionModelRow,
  ProviderSelectorProvider,
} from "@/provider-selection/provider-selection";
import { resolveFavoriteModelRows, toggleModelFavorite } from "./model-favorites";

function modelRow(provider: string, providerLabel: string, modelId: string, modelLabel: string) {
  return {
    favoriteKey: `${provider}:${modelId}`,
    provider,
    providerLabel,
    modelId,
    modelLabel,
    description: modelId,
  } satisfies ProviderSelectionModelRow;
}

const opus = modelRow("claude", "Claude", "claude-opus-5-5", "Opus 5.5");
const sonnet = modelRow("claude", "Claude", "claude-sonnet-5-5", "Sonnet 5.5");
const astra = modelRow("codex", "Codex", "gpt-6-astra", "GPT-6-Astra");

const claude: ProviderSelectorProvider = {
  id: "claude",
  label: "Claude",
  modelSelection: { kind: "models", rows: [opus, sonnet] },
};
const codex: ProviderSelectorProvider = {
  id: "codex",
  label: "Codex",
  modelSelection: { kind: "models", rows: [astra] },
};

describe("toggleModelFavorite", () => {
  it("appends a model that is not yet a favourite", () => {
    expect(
      toggleModelFavorite([{ provider: "claude", modelId: "claude-opus-5-5" }], {
        provider: "codex",
        modelId: "gpt-6-astra",
      }),
    ).toEqual([
      { provider: "claude", modelId: "claude-opus-5-5" },
      { provider: "codex", modelId: "gpt-6-astra" },
    ]);
  });

  it("removes a model that is already a favourite", () => {
    expect(
      toggleModelFavorite(
        [
          { provider: "claude", modelId: "claude-opus-5-5" },
          { provider: "codex", modelId: "gpt-6-astra" },
        ],
        { provider: "claude", modelId: "claude-opus-5-5" },
      ),
    ).toEqual([{ provider: "codex", modelId: "gpt-6-astra" }]);
  });

  it("treats the same model id under another provider as a different favourite", () => {
    expect(
      toggleModelFavorite([{ provider: "claude", modelId: "shared" }], {
        provider: "cursor",
        modelId: "shared",
      }),
    ).toHaveLength(2);
  });
});

describe("resolveFavoriteModelRows", () => {
  it("returns catalog rows in favourite order across providers", () => {
    expect(
      resolveFavoriteModelRows(
        [
          { provider: "codex", modelId: "gpt-6-astra" },
          { provider: "claude", modelId: "claude-opus-5-5" },
        ],
        [claude, codex],
      ),
    ).toEqual([astra, opus]);
  });

  it("skips favourites whose provider is not offered, such as on a live agent", () => {
    expect(
      resolveFavoriteModelRows(
        [
          { provider: "codex", modelId: "gpt-6-astra" },
          { provider: "claude", modelId: "claude-opus-5-5" },
        ],
        [claude],
      ),
    ).toEqual([opus]);
  });

  it("skips favourites whose model left the catalog or whose catalog failed", () => {
    const failing: ProviderSelectorProvider = {
      id: "muse",
      label: "Muse Code",
      modelSelection: { kind: "error", message: "offline" },
    };
    expect(
      resolveFavoriteModelRows(
        [
          { provider: "claude", modelId: "claude-opus-4-1" },
          { provider: "muse", modelId: "muse-wonder-1.0" },
        ],
        [claude, failing],
      ),
    ).toEqual([]);
  });

  it("draws a loading catalog's favourite by model id", () => {
    const loading: ProviderSelectorProvider = {
      id: "muse",
      label: "Muse Code",
      modelSelection: { kind: "loading" },
    };
    expect(
      resolveFavoriteModelRows([{ provider: "muse", modelId: "muse-wonder-1.0" }], [loading]),
    ).toEqual([
      {
        favoriteKey: "muse:muse-wonder-1.0",
        provider: "muse",
        providerLabel: "Muse Code",
        modelId: "muse-wonder-1.0",
        modelLabel: "muse-wonder-1.0",
      },
    ]);
  });

  it("draws a favourite listed twice once", () => {
    expect(
      resolveFavoriteModelRows(
        [
          { provider: "claude", modelId: "claude-opus-5-5" },
          { provider: "claude", modelId: "claude-opus-5-5" },
        ],
        [claude],
      ),
    ).toEqual([opus]);
  });
});
