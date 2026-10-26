import test from "node:test";
import assert from "node:assert/strict";
import { catalog, createAsset, LOT_PROFILES_PER_MODEL } from "../src/catalog";
import { InventoryDeck } from "../src/catalog/inventory";
import { familyProfiles } from "../src/catalog/families";
import expanded from "../src/catalog/expanded-products.json";
import review from "../src/catalog/photo-review.json";

function rng(seed = 42) {
  return () => { seed = (Math.imul(seed,1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}
test("room deck exhausts eligible models across rematches, balances categories and keeps dealing indefinitely", () => {
  const inventory = catalog.filter(i => i.referenceValue >= 25 && i.referenceValue <= 2500);
  const deck = new InventoryDeck(rng());
  const seen = new Set<string>();
  for (let i = 0; i < inventory.length; i++) {
    const [item] = deck.draw(1,5000);
    assert.ok(!seen.has(item.id),"Model repeated before the eligible catalog was exhausted");
    seen.add(item.id);
  }
  assert.equal(seen.size,inventory.length);
  for(let i = 0; i < 250; i++) {
    const hand = deck.draw(12,5000);
    assert.equal(new Set(hand.map(i=>i.id)).size,12);
    assert.ok(hand.every(i=>i.referenceValue <= 2500));
  }
  const fresh = new InventoryDeck(rng());
  const availableCategories = new Set(inventory.map(i=>i.category)).size;
  const hand = fresh.draw(Math.min(12,availableCategories),5000);
  assert.equal(new Set(hand.map(i=>i.category)).size,hand.length);
  assert.throws(()=>fresh.draw(12,1));
  assert.throws(()=>fresh.draw(0,5000));
  assert.throws(()=>new InventoryDeck(()=>1).draw(4,5000));
});
test("rare drop weights make grails rarer within the same category", () => {
  const pool = [100,300,800,2000].map((referenceValue,i)=>({...catalog[0],id:`test-${i}`,referenceValue}));
  const random = rng();
  const counts = [0,0,0,0];
  for(let i=0;i<5000;i++) counts[Number(new InventoryDeck(random,pool).draw(1,5000)[0].id.slice(-1))]++;
  assert.ok(counts[0]>counts[1] && counts[1]>counts[2] && counts[2]>counts[3]);
});
test("hidden bench and care rolls cannot leak through public descriptions, estimates or references", () => {
  for(const item of catalog) {
    const make = (bench:number,care:number) => {
      const rolls = [0.3,0.4,0.6,0.9,bench,care];
      return createAsset(item,()=>rolls.shift()!,"same-public-reference");
    };
    const pass = make(0,0), fail = make(0.99,0.99);
    assert.deepEqual(pass.item,fail.item);
    assert.notEqual(pass.appraisal.value,fail.appraisal.value);
    assert.notEqual(pass.appraisal.inspection,fail.appraisal.inspection);
  }
});
test("all 3456 profiles are reachable on one model without mutating its canonical identity", () => {
  const profiles = new Set<string>(), values = new Set<number>();
  const item = catalog[0], original = structuredClone(item);
  for(const grade of [0,0.1,0.3,0.6,0.8,0.9])
    for(let pack=0;pack<4;pack++) for(let storage=0;storage<4;storage++)
      for(let papers=0;papers<3;papers++) for(const bench of [0,0.5,0.8]) for(let care=0;care<4;care++) {
        const rolls = [grade,pack/4,storage/4,papers/3,bench,care/4];
        const asset = createAsset(item,()=>rolls.shift()!,"test-lot");
        profiles.add(JSON.stringify([asset.item.lot,asset.appraisal.inspection]));
        values.add(asset.appraisal.value);
        assert.equal(asset.item.id,item.id);
        assert.ok(asset.appraisal.value>=asset.item.estimate[0] && asset.appraisal.value<=asset.item.estimate[1]);
      }
  assert.equal(profiles.size,LOT_PROFILES_PER_MODEL);
  assert.ok(values.size>100);
  assert.deepEqual(item,original);
  assert.throws(()=>createAsset(item,()=>NaN));
  assert.throws(()=>createAsset({...item,id:"invented-model"}));
});
test("expanded models have explicit family checks and reviewed, distinct source photos", () => {
  assert.equal(expanded.length,review.approved.length);
  assert.equal(new Set(expanded.map(i=>i.image.source)).size,expanded.length);
  for(const product of expanded) {
    assert.ok(review.approved.includes(product.id));
    assert.ok(!(product.id in review.excluded));
    assert.ok(familyProfiles[product.family]?.checks.length===3);
    assert.ok(product.identitySource.startsWith("https://en.wikipedia.org/wiki/"));
  }
});
