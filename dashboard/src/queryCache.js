const entries = new Map();
const inFlight = new Map();
const generations = new Map();

function keyString(key) {
  return JSON.stringify(key);
}

export async function queryCached(key, staleTimeMs, query, { force = false } = {}) {
  const cacheKey = keyString(key);
  const cached = entries.get(cacheKey);
  if (!force && cached && Date.now() - cached.updatedAt < staleTimeMs) return cached.value;
  if (!force && inFlight.has(cacheKey)) return inFlight.get(cacheKey);

  const generation = generations.get(cacheKey) || 0;
  let pending;
  pending = Promise.resolve().then(query).then((value) => {
    if (!value?.error && (generations.get(cacheKey) || 0) === generation) {
      entries.set(cacheKey, { value, updatedAt: Date.now() });
    }
    return value;
  }).finally(() => {
    if (inFlight.get(cacheKey) === pending) inFlight.delete(cacheKey);
  });
  inFlight.set(cacheKey, pending);
  return pending;
}

export function setCachedQuery(key, value) {
  const cacheKey = keyString(key);
  generations.set(cacheKey, (generations.get(cacheKey) || 0) + 1);
  entries.set(cacheKey, { value, updatedAt: Date.now() });
}

export function invalidateCachedQueries(prefix) {
  for (const key of entries.keys()) {
    const parsed = JSON.parse(key);
    if (prefix.every((part, index) => parsed[index] === part)) {
      entries.delete(key);
      generations.set(key, (generations.get(key) || 0) + 1);
    }
  }
  for (const key of inFlight.keys()) {
    const parsed = JSON.parse(key);
    if (prefix.every((part, index) => parsed[index] === part)) {
      generations.set(key, (generations.get(key) || 0) + 1);
      inFlight.delete(key);
    }
  }
}
