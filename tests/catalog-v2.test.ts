import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import {
  catalog,
  createAsset,
  medianComparable,
  appraise,
} from "../src/catalog";

test("real catalog contains hundreds of unique documented products with explicit pricing status", () => {
  assert.ok(catalog.length >= 200);
  assert.equal(new Set(catalog.map((i) => i.id)).size, catalog.length);
  assert.ok(new Set(catalog.map((i) => i.category)).size >= 7);
  assert.ok(
    catalog.every(
      (i) =>
        i.referenceValue > 0 &&
        i.referenceValue <= 25000 &&
        i.sources.length &&
        i.images.length &&
        i.observedAt,
    ),
  );
  assert.ok(
    catalog.every((i) =>
      i.pricingStatus.includes("no verified completed sales"),
    ),
  );
  assert.ok(
    catalog.every((i) => !i.sources.some((s) => s.kind === "completed-sale")),
  );
  assert.ok(catalog.filter((i) => i.referenceValue >= 50).length >= 12);
});

test("comparables use a median and appraisals multiply explained adjustments once", () => {
  assert.equal(medianComparable([720, 780, 810]), 780);
  assert.equal(medianComparable([619, 599, 599, 594, 594, 554]), 596.5);
  const a = appraise(
    780,
    [
      { label: "Condition", multiplier: 0.85, reason: "Visible wear" },
      { label: "Completeness", multiplier: 0.9, reason: "Missing accessory" },
    ],
    "Verified test",
  );
  assert.equal(a.value, 597);
  assert.throws(() => medianComparable([]));
  assert.throws(() => medianComparable([NaN]));
  assert.throws(() =>
    appraise(100, [{ label: "Invalid", multiplier: -1, reason: "No" }], ""),
  );
});

test("asset scenarios are deterministic, truthful, explainable and remain within public intervals", () => {
  for (const item of catalog)
    for (const n of [0, 0.2, 0.5, 0.7, 0.9, 0.999]) {
      const asset = createAsset(item, () => n),
        duplicate = createAsset(item, () => n);
      assert.deepEqual(asset, duplicate);
      assert.equal(
        asset.appraisal.value,
        Math.round(
          asset.appraisal.factors.reduce(
            (v, f) => v * f.multiplier,
            item.referenceValue,
          ),
        ),
      );
      assert.ok(
        asset.appraisal.inspection.includes(
          asset.appraisal.factors.find(
            (f) => f.label === "Functionality / defects",
          )!.reason,
        ),
      );
      assert.ok(
        asset.appraisal.value >= asset.item.estimate[0] &&
          asset.appraisal.value <= asset.item.estimate[1],
      );
      assert.ok(!("appraisal" in asset.item));
      assert.ok(!("value" in asset.item));
    }
  const original = structuredClone(catalog[0]);
  createAsset(catalog[0], () => 0.9);
  assert.deepEqual(catalog[0], original);
});

test("catalog images are local optimized files with reusable-rights attribution", async () => {
  for (const item of catalog) {
    const image = item.images[0];
    assert.ok(image.sourceUrl.startsWith("https://commons.wikimedia.org/"));
    assert.ok(image.credit && image.license);
    await access(`public${image.src}`);
    const data = await readFile(`public${image.src}`);
    assert.ok(data.length > 2000);
    assert.equal(data.subarray(8, 12).toString(), "WEBP");
  }
});
