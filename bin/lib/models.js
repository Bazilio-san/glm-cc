// Model and endpoint registry.
//
// Two things are derived from a model id and cannot be guessed by Claude Code
// on its own:
//   * the `[1m]` suffix, which Claude Code requires to unlock a 1M-token
//     context window;
//   * CLAUDE_CODE_AUTO_COMPACT_WINDOW, the token count at which Claude Code
//     starts compacting the conversation history.
// Both come out of the context-window table below.

export const ENDPOINTS = [
  {
    id: 'global',
    label: 'Z.AI Global',
    baseUrl: 'https://api.z.ai/api/anthropic',
    modelsUrl: 'https://api.z.ai/api/coding/paas/v4/models',
    apiKeysUrl: 'https://z.ai/manage-apikey/apikey-list',
  },
  {
    id: 'china',
    label: 'Z.AI China (BigModel)',
    baseUrl: 'https://open.bigmodel.cn/api/anthropic',
    modelsUrl: 'https://open.bigmodel.cn/api/coding/paas/v4/models',
    apiKeysUrl: 'https://bigmodel.cn/usercenter/proj-mgmt/apikeys',
  },
];

export function findEndpoint (baseUrl) {
  return ENDPOINTS.find(e => e.baseUrl === baseUrl) || null;
}

/**
 * Where to ask for the model list / validate a key for a given Anthropic base
 * URL. Known endpoints are looked up; a custom URL is mapped by swapping the
 * `/api/anthropic` tail, and failing that by falling back to the host root.
 */
export function modelsUrlFor (baseUrl) {
  const known = findEndpoint(baseUrl);
  if (known) return known.modelsUrl;
  if (!baseUrl) return null;
  try {
    if (baseUrl.endsWith('/api/anthropic')) {
      return `${baseUrl.slice(0, -'/api/anthropic'.length)}/api/coding/paas/v4/models`;
    }
    return `${new URL(baseUrl).origin}/api/coding/paas/v4/models`;
  } catch {
    return null;
  }
}

/** Known model id -> context window in tokens. */
export const MODEL_CONTEXT_WINDOWS = {
  'glm-5.3-flash': 1_048_576,
  'glm-5.3': 1_048_576,
  'glm-5.2': 1_048_576,
  'glm-5.1': 200_000,
  'glm-5': 200_000,
  'glm-5-turbo': 204_800,
  'glm-4.7': 200_000,
  'glm-4.6': 200_000,
  'glm-4.5': 128_000,
  'glm-4.5-air': 128_000,
};

/** Safe context window for a model id that is not in the table. */
export const FALLBACK_CONTEXT_WINDOW = 200_000;

/** Claude Code needs this suffix to open a 1M-token context window. */
const ONE_MILLION_SUFFIX = /\[1m\]$/i;

export function stripSuffix (model) {
  return model ? String(model).replace(ONE_MILLION_SUFFIX, '') : '';
}

export function contextWindowFor (model) {
  const key = stripSuffix(model).toLowerCase();
  return MODEL_CONTEXT_WINDOWS[key] ?? FALLBACK_CONTEXT_WINDOW;
}

/** Append `[1m]` when the model's context window reaches one million tokens. */
export function formatForClaudeCode (model) {
  const bare = stripSuffix(model);
  if (!bare) return bare;
  return contextWindowFor(bare) >= 1_000_000 ? `${bare}[1m]` : bare;
}

export function formatTokens (n) {
  return Number(n).toLocaleString('en-US');
}

/** Human-readable context size, e.g. "1,048,576 tokens (1M)". */
export function describeContext (model) {
  const size = contextWindowFor(model);
  const known = Object.prototype.hasOwnProperty.call(MODEL_CONTEXT_WINDOWS, stripSuffix(model).toLowerCase());
  const short = size >= 1_000_000 ? ' (1M)' : '';
  return `${formatTokens(size)} tokens${short}${known ? '' : ', assumed'}`;
}
