import { describe, expect, it } from 'vitest';
import { resolveModelDisplayName } from '../lib/modelResolver';
import type { DiscoveredModel } from '../lib/types';

describe('resolveModelDisplayName single source of truth', () => {
  const models: DiscoveredModel[] = [
    {
      id: 'gpt-4o',
      name: 'GPT-4 Omni (Fast)',
      description: 'High intelligence model',
      icon: null,
      connectionId: 'conn-openai',
      connectionName: 'OpenAI Direct',
      connectionType: 'openai_compatible',
      isLocal: false,
      visibility: 'public',
    },
    {
      id: 'llama3:8b',
      name: 'Llama 3 8B Instruct',
      description: 'Meta open weights',
      icon: null,
      connectionId: 'conn-ollama',
      connectionName: 'Local Ollama',
      connectionType: 'ollama',
      isLocal: true,
      visibility: 'public',
    },
  ];

  it('resolves live display name when model exists in catalog', () => {
    expect(resolveModelDisplayName(models, 'conn-openai', 'gpt-4o')).toBe('GPT-4 Omni (Fast)');
    expect(resolveModelDisplayName(models, 'conn-ollama', 'llama3:8b')).toBe('Llama 3 8B Instruct');
  });

  it('matches across connections if connectionId is null or omitted', () => {
    expect(resolveModelDisplayName(models, null, 'gpt-4o')).toBe('GPT-4 Omni (Fast)');
  });

  it('returns clearly labelled fallback when model was deleted from registry', () => {
    expect(resolveModelDisplayName(models, 'conn-openai', 'legacy-davinci')).toBe(
      'Deleted model (legacy-davinci)'
    );
  });

  it('returns Assistant fallback when modelId is null or empty', () => {
    expect(resolveModelDisplayName(models, null, null)).toBe('Assistant');
  });
});
