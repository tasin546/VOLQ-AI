import type { DiscoveredModel } from './types';

/**
 * Single source of truth for resolving live display names of AI models.
 * Looks up the model in the active model registry so admin renames apply dynamically
 * across the chat header, message author labels, sidebar titles, and model picker.
 *
 * If the model has been deleted or removed from connections, clearly returns:
 * "Deleted model (<model_id>)" rather than an unlabelled provider string.
 */
export function resolveModelDisplayName(
  models: DiscoveredModel[],
  connectionId?: string | null,
  modelId?: string | null
): string {
  if (!modelId) return 'Assistant';

  if (connectionId) {
    const exact = models.find((m) => m.connectionId === connectionId && m.id === modelId);
    if (exact) {
      return exact.name?.trim() || exact.id;
    }
  }

  const anyMatch = models.find((m) => m.id === modelId);
  if (anyMatch) {
    return anyMatch.name?.trim() || anyMatch.id;
  }

  return `Deleted model (${modelId})`;
}
