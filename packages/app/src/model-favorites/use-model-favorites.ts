import { useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { ModelFavorite, MutableDaemonConfig } from "@getpaseo/protocol/messages";
import { useToast } from "@/contexts/toast-context";
import { daemonConfigQueryKey } from "@/data/daemon-config";
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
  const queryClient = useQueryClient();
  const { config, patchConfig } = useDaemonConfig(serverId);
  const isSupported = useSessionStore(
    (state) => state.sessions[serverId ?? ""]?.serverInfo?.features?.modelFavorites === true,
  );

  const favorites = config?.modelFavorites ?? NO_FAVORITES;
  const favoriteKeys = useMemo(() => new Set(favorites.map(modelFavoriteKey)), [favorites]);

  const isFavorite = useCallback(
    (model: ModelFavorite) => favoriteKeys.has(modelFavoriteKey(model)),
    [favoriteKeys],
  );

  const save = useCallback(
    async (next: ModelFavorite[]) => {
      try {
        if (await patchConfig({ modelFavorites: next })) {
          return;
        }
        toast.error(t("modelSelector.favoritesSaveFailed"));
      } catch (error) {
        toast.error(`${t("modelSelector.favoritesSaveFailed")}: ${toErrorMessage(error)}`);
      }
      // Drop the optimistic list for whatever the host actually saved.
      void queryClient.invalidateQueries({ queryKey: daemonConfigQueryKey(serverId) });
    },
    [patchConfig, queryClient, serverId, t, toast],
  );

  // The star flips through the host's cached config rather than local state:
  // every picker on this host reads that cache, and a star pressed before the
  // previous save returns builds on it instead of replacing it with a stale list.
  const toggle = useCallback(
    (model: ModelFavorite) => {
      const queryKey = daemonConfigQueryKey(serverId);
      const current = queryClient.getQueryData<MutableDaemonConfig>(queryKey);
      if (!current) {
        return;
      }
      const next = toggleModelFavorite(current.modelFavorites ?? NO_FAVORITES, model);
      queryClient.setQueryData(queryKey, { ...current, modelFavorites: next });
      void save(next);
    },
    [queryClient, save, serverId],
  );

  return useMemo(() => {
    if (!isSupported || !config) {
      return null;
    }
    return { favorites, isFavorite, toggle };
  }, [config, favorites, isFavorite, isSupported, toggle]);
}
