import assert from "node:assert/strict";
import test from "node:test";
import { invalidateCachedQueries, queryCached } from "./queryCache.js";

test("identical in-flight reads are de-duplicated", async () => {
  const key = ["test-dedupe", crypto.randomUUID()];
  let calls = 0;
  const query = async () => {
    calls += 1;
    await Promise.resolve();
    return { data: "value", error: null };
  };

  const [first, second] = await Promise.all([
    queryCached(key, 1000, query),
    queryCached(key, 1000, query),
  ]);

  assert.equal(calls, 1);
  assert.equal(first, second);
});

test("failed responses are not cached", async () => {
  const key = ["test-error", crypto.randomUUID()];
  let calls = 0;
  const query = async () => {
    calls += 1;
    return { data: null, error: new Error("temporary") };
  };

  await queryCached(key, 60_000, query);
  await queryCached(key, 60_000, query);
  assert.equal(calls, 2);
});

test("invalidated in-flight requests cannot repopulate the cache", async () => {
  const key = ["test-invalidation", crypto.randomUUID()];
  let resolveFirst;
  let calls = 0;
  const firstQuery = () => {
    calls += 1;
    return new Promise((resolve) => { resolveFirst = resolve; });
  };

  const firstRequest = queryCached(key, 60_000, firstQuery);
  await Promise.resolve();
  invalidateCachedQueries(key);
  resolveFirst({ data: "stale", error: null });
  await firstRequest;

  const freshResult = await queryCached(key, 60_000, async () => {
    calls += 1;
    return { data: "fresh", error: null };
  });

  assert.equal(freshResult.data, "fresh");
  assert.equal(calls, 2);
});
