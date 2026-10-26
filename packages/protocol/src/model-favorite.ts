import { z } from "zod";

/**
 * A model pinned to the top of the model picker. Unlike an agent profile it
 * carries no settings: picking a favourite selects the model exactly as its
 * catalog row would. Entries naming a provider or model the host no longer
 * offers are kept, so a favourite survives a provider being briefly disabled.
 */
export const ModelFavoriteSchema = z
  .object({
    provider: z.string(),
    modelId: z.string(),
  })
  .passthrough();

export type ModelFavorite = z.infer<typeof ModelFavoriteSchema>;
