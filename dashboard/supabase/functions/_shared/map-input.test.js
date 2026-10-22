import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeLocationData,
  normalizeMapReference,
  parseGoogleMapsEmbed,
  parseGoogleMapsShortLink,
  safeLocationForRender,
} from "./map-input.js";

const validEmbed =
  "https://www.google.com/maps/embed?pb=sample-map-data";

test("extracts only the src from a Google Maps iframe and discards its HTML", () => {
  const source = `<iframe src="${validEmbed}" width="600" allowfullscreen onload="alert(1)"></iframe>`;
  assert.equal(parseGoogleMapsEmbed(source), validEmbed);
});

test("rejects untrusted embed hosts, protocols, duplicate src, and extra HTML", () => {
  assert.throws(
    () => parseGoogleMapsEmbed("<iframe src=\"https://iamavirus.com\"></iframe>"),
    /only https/i,
  );
  assert.throws(
    () => parseGoogleMapsEmbed("<iframe src=\"javascript:alert(1)\"></iframe>"),
    /https/i,
  );
  assert.throws(
    () =>
      parseGoogleMapsEmbed(
        `<iframe src="${validEmbed}" src="https://iamavirus.com"></iframe>`,
      ),
    /exactly one src/i,
  );
  assert.throws(
    () => parseGoogleMapsEmbed(`<iframe src="${validEmbed}"></iframe><script>`),
    /single iframe/i,
  );
  assert.throws(
    () => parseGoogleMapsEmbed("https://www.google.com.evil.test/maps/embed"),
    /only https/i,
  );
});

test("accepts only Google Maps short share links", () => {
  assert.equal(
    parseGoogleMapsShortLink("https://maps.app.goo.gl/abc_DEF-123"),
    "https://maps.app.goo.gl/abc_DEF-123",
  );
  assert.throws(
    () => parseGoogleMapsShortLink("https://iamavirus.com/abc"),
    /maps\.app\.goo\.gl/i,
  );
});

test("location block requires an address or a single map link", () => {
  assert.throws(() => normalizeLocationData({}), /add an address/i);
  assert.throws(
    () =>
      normalizeLocationData({
        address: "Kadıköy, İstanbul",
        map_url: "https://maps.app.goo.gl/abc",
        map_type: "embed",
      }),
    /only https/i,
  );
  assert.deepEqual(
    normalizeLocationData({ address: "  Kadıköy, İstanbul  " }),
    { address: "Kadıköy, İstanbul", map_url: null, map_type: null },
  );
  assert.deepEqual(
    normalizeLocationData({ map_url: validEmbed, map_type: "embed" }),
    { map_url: validEmbed, map_type: "embed", address: "" },
  );
});

test("invalid stored map URLs are not rendered", () => {
  assert.deepEqual(
    safeLocationForRender({
      address: "Kadıköy",
      map_url: "https://iamavirus.com",
      map_type: "embed",
    }),
    { address: "Kadıköy", map_url: null, map_type: null },
  );
});

test("legacy Google Maps query URLs remain valid for existing cards", () => {
  const legacy = "https://maps.google.com/?q=Kadikoy+Istanbul";
  assert.equal(normalizeMapReference("legacy", legacy), legacy);
  assert.equal(safeLocationForRender({ map_url: legacy, map_type: "legacy" }).map_url, legacy);
});
