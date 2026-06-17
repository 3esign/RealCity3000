export const VISION_SUPPORTED_PROVIDERS = new Set([
  'local',
  'openrouter',
  'openai',
  'gemini',
  'groq',
  'anthropic'
]);

export const TEXT_SUPPORTED_PROVIDERS = new Set([
  'local',
  'openrouter',
  'openai',
  'gemini',
  'groq',
  'anthropic',
  'deepseek'
]);

export const FEATURE_LABELS = {
  vision: 'Vision Intelligence',
  mayor: 'AI Mayor',
  history: 'Historical Research'
};

export function getFeatureProvider(state, feature) {
  if (!state) return 'local';

  if (state.aiUseUniversal) {
    return state.aiProvider || 'local';
  }

  return state[`${feature}Provider`] || state.aiProvider || 'local';
}

export function getFeatureApiKey(state, feature) {
  if (!state) return '';

  if (state.aiUseUniversal) {
    return state.aiKeys?.universal || '';
  }

  return state.aiKeys?.[feature] || '';
}

export function isProviderSupportedForFeature(provider, feature) {
  if (feature === 'vision') {
    return VISION_SUPPORTED_PROVIDERS.has(provider);
  }

  return TEXT_SUPPORTED_PROVIDERS.has(provider);
}

export function resolveFeatureConfig(state, feature) {
  const provider = getFeatureProvider(state, feature);
  const apiKey = getFeatureApiKey(state, feature);
  const supported = isProviderSupportedForFeature(provider, feature);
  const ready = provider === 'local' || Boolean(apiKey);

  return {
    feature,
    provider,
    apiKey,
    supported,
    ready
  };
}
