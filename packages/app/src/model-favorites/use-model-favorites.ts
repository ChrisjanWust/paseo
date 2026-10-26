import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ModelFavorite } from "@getpaseo/protocol/messages";
import { useToast } from "@/contexts/toast-context";
import { useDaemonConfig } from "@/hooks/use-daemon-config";
import { useSessionStore } from "@/stores/session-store";
import { toErrorMessage } from "@/utils/error-messages";
import { modelFavoriteKey, toggleModelFavorite } from "./model-favorites";

const NO_FAVORITES: readonly ModelFavorite[] = [];

export interface ModelFavorites {
  /** In star order. May name models the host no longer offers. */
  favorites: readonly ModelFavorite[];
  isFavorite: (model: ModelFavorite) => boolean;
  toggle: (model: ModelFavorite) => void;
}

/**
 * Favourites are host-wide daemon config, so every client of a host shows the
 * same list. `null` while the config is loading and on daemons that predate
 * `modelFavorites`: an older daemon parses its config strictly and would drop
 * the key on write, so the picker shows no stars rather than ones that forget.
 */
export function useModelFavorites(serverId: string | null): ModelFavorites | null {
  const { t } = useTranslation();
  const toast = useToast();
  const { config, patchConfig } = useDaemonConfig(serverId);
  const isSupported = useSessionStore(
    (state) => state.sessions[serverId ?? ""]?.serverInfo?.features?.modelFavorites === true,
  );
  // A star flips on press; the saved list replaces it once the patch lands.
  const [pending, setPending] = useState<ModelFavorite[] | null>(null);
  const latestToggle = useRef(0);

  const favorites = pending ?? config?.modelFavorites ?? NO_FAVORITES;
  const favoriteKeys = useMemo(() => new Set(favorites.map(modelFavoriteKey)), [favorites]);

  const isFavorite = useCallback(
    (model: ModelFavorite) => favoriteKeys.has(modelFavoriteKey(model)),
    [favoriteKeys],
  );

  const save = useCallback(
    async (next: ModelFavorite[], toggleId: number) => {
      try {
        const saved = await patchConfig({ modelFavorites: next });
        if (!saved) {
          toast.error(t("modelSelector.favoritesSaveFailed"));
        }
      } catch (error) {
        toast.error(`${t("modelSelector.favoritesSaveFailed")}: ${toErrorMessage(error)}`);
      } finally {
        // An earlier save settling must not drop a later star's pending state.
        if (latestToggle.current === toggleId) {
          setPending(null);
        }
      }
    },
    [patchConfig, t, toast],
  );

  const toggle = useCallback(
    (model: ModelFavorite) => {
      const next = toggleModelFavorite(favorites, model);
      const toggleId = latestToggle.current + 1;
      latestToggle.current = toggleId;
      setPending(next);
      void save(next, toggleId);
    },
    [favorites, save],
  );

  return useMemo(() => {
    if (!isSupported || !config) {
      return null;
    }
    return { favorites, isFavorite, toggle };
  }, [config, favorites, isFavorite, isSupported, toggle]);
}
