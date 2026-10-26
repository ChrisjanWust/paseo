import type { ModelFavorite } from "@getpaseo/protocol/messages";
import {
  buildModelRowKey,
  type ProviderSelectionModelRow,
  type ProviderSelectorProvider,
} from "@/provider-selection/provider-selection";

export function modelFavoriteKey({ provider, modelId }: ModelFavorite): string {
  return `${provider}\u0000${modelId}`;
}

/** Removes the model if it is a favourite, otherwise appends it, so star order is list order. */
export function toggleModelFavorite(
  favorites: readonly ModelFavorite[],
  target: ModelFavorite,
): ModelFavorite[] {
  const key = modelFavoriteKey(target);
  const without = favorites.filter((favorite) => modelFavoriteKey(favorite) !== key);
  if (without.length < favorites.length) {
    return without;
  }
  return [...favorites, { provider: target.provider, modelId: target.modelId }];
}

/**
 * The picker rows for the favourites the given providers can serve, in
 * favourite order. A favourite whose provider is absent (disabled, or not the
 * live agent's provider) or whose model left the catalog is skipped rather than
 * drawn as a row that cannot be picked. While a catalog is still loading the
 * row falls back to the model id, so the section does not jump in on arrival.
 */
export function resolveFavoriteModelRows(
  favorites: readonly ModelFavorite[],
  providers: readonly ProviderSelectorProvider[],
): ProviderSelectionModelRow[] {
  const rows: ProviderSelectionModelRow[] = [];
  const seen = new Set<string>();
  for (const favorite of favorites) {
    const key = modelFavoriteKey(favorite);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const provider = providers.find((entry) => entry.id === favorite.provider);
    if (!provider) {
      continue;
    }
    const selection = provider.modelSelection;
    if (selection.kind === "models") {
      const row = selection.rows.find((entry) => entry.modelId === favorite.modelId);
      if (row) {
        rows.push(row);
      }
      continue;
    }
    if (selection.kind === "loading") {
      rows.push({
        favoriteKey: buildModelRowKey(favorite.provider, favorite.modelId),
        provider: favorite.provider,
        providerLabel: provider.label,
        modelId: favorite.modelId,
        modelLabel: favorite.modelId,
      });
    }
  }
  return rows;
}
