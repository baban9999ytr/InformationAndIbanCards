import assert from "node:assert/strict";
import test from "node:test";
import { contrastRatio, paletteContrastIssues } from "./paletteApi.js";

test("curated palette contrast is calculated using WCAG relative luminance", () => {
  assert.equal(contrastRatio("#000000", "#FFFFFF"), 21);
  assert.ok(contrastRatio("#767676", "#FFFFFF") >= 4.5);
  assert.ok(contrastRatio("#777777", "#FFFFFF") < 4.5);
});

test("legacy palettes remain inspectable and low-contrast combinations are identified", () => {
  const legacyTokens = {
    background: "#FFFFFF",
    surface: "#FFFFFF",
    text: "#777777",
    primary: "#EAEAEA",
    accent: "#000000",
    muted: "#AAAAAA",
    button_text: "#FFFFFF",
  };

  const issues = paletteContrastIssues(legacyTokens);
  assert.deepEqual(
    issues.map(({ foreground, background }) => [foreground, background]),
    [["text", "background"], ["text", "surface"], ["button_text", "primary"]],
  );
});
