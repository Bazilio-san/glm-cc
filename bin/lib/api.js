// Talks to the provider's model-list route, which doubles as a key check:
// a 401 means the key is wrong, a network failure means the endpoint is
// unreachable, and a successful reply carries the list of usable model ids.

import { modelsUrlFor } from './models.js';

const TIMEOUT_MS = 30_000;

async function getJson (url, apiKey) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    });
    let body = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    return { response, body };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Check that the key works against the given endpoint.
 * Returns { valid, reason, message } where reason is one of
 * 'invalid_key' | 'unreachable' | 'bad_endpoint' | 'http_error'.
 */
export async function validateApiKey (apiKey, baseUrl) {
  const url = modelsUrlFor(baseUrl);
  if (!url) {
    return { valid: false, reason: 'bad_endpoint', message: `Cannot derive a model-list URL from ${baseUrl}` };
  }

  try {
    const { response } = await getJson(url, apiKey);
    if (response.status === 401 || response.status === 403) {
      return { valid: false, reason: 'invalid_key', message: 'The server rejected this API key' };
    }
    if (response.ok) return { valid: true };
    return {
      valid: false,
      reason: 'http_error',
      message: `Server answered HTTP ${response.status} ${response.statusText}`.trim(),
    };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'AbortError';
    return {
      valid: false,
      reason: 'unreachable',
      message: timedOut ? `No answer within ${TIMEOUT_MS / 1000} seconds` : String(error?.message || error),
    };
  }
}

/**
 * Fetch the model ids available on this plan.
 * Returns { models } on success, or { error } describing what went wrong.
 */
export async function listModels (apiKey, baseUrl) {
  const url = modelsUrlFor(baseUrl);
  if (!url) return { error: `Cannot derive a model-list URL from ${baseUrl}` };

  try {
    const { response, body } = await getJson(url, apiKey);
    if (response.status === 401 || response.status === 403) {
      return { error: 'The server rejected this API key' };
    }
    if (!response.ok) return { error: `Server answered HTTP ${response.status}` };

    const rows = Array.isArray(body?.data) ? body.data : null;
    if (!rows) return { error: 'The server replied in an unexpected shape' };

    const models = rows
      .map(row => (typeof row === 'string' ? row : row?.id))
      .filter(id => typeof id === 'string' && id.length > 0);

    return models.length > 0 ? { models } : { error: 'The server returned an empty model list' };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'AbortError';
    return { error: timedOut ? `No answer within ${TIMEOUT_MS / 1000} seconds` : String(error?.message || error) };
  }
}
