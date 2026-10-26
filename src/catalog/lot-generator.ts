import type { Appraisal, Asset, PublicItem } from "../shared/market";

export const lotGrades = [
  { name: "Excellent", text: "Excellent exterior; only minimal handling marks.", multiplier: 1.12 },
  { name: "Very good", text: "Very good exterior; light handling marks.", multiplier: 1.04 },
  { name: "Good", text: "Good exterior; ordinary visible wear.", multiplier: 0.97 },
  { name: "Fair", text: "Fair exterior; visible scuffs and finish wear.", multiplier: 0.88 },
  { name: "Worn", text: "Worn exterior; substantial cosmetic wear.", multiplier: 0.76 },
  { name: "Project", text: "Heavily worn exterior; restoration may be worthwhile.", multiplier: 0.65 },
] as const;
const packaging = [
  { name: "Unboxed", suffix: "", multiplier: 1 },
  { name: "Boxed", suffix: " Matching retail box included; box authenticity is not certified.", multiplier: 1.06 },
  { name: "Item only", suffix: "", multiplier: 0.86 },
  { name: "Protected", suffix: " Protective storage packaging included; not an original manufacturer box.", multiplier: 1.04 },
] as const;
const storage = [
  { name: "Display kept", text: "Kept for display with limited handling.", multiplier: 1.02 },
  { name: "Carefully stored", text: "Stored with protective packing.", multiplier: 1 },
  { name: "Regularly used", text: "Regular use with ordinary handling.", multiplier: 0.98 },
  { name: "Long-term storage", text: "Stored on a shelf for an extended period.", multiplier: 0.94 },
] as const;
const documents = [
  { name: "No paperwork", text: "No purchase or service paperwork.", multiplier: 0.96 },
  { name: "Operating notes", text: "Basic operating notes; no authentication certificate.", multiplier: 1 },
  { name: "Guide + test record", text: "Operating guide and a game-scenario test record; provenance is not independently certified.", multiplier: 1.02 },
] as const;
const care = [
  { text: "No additional maintenance issue was found.", multiplier: 1 },
  { text: "Routine preventative maintenance is due; allow for cleaning and adjustment.", multiplier: 0.94 },
  { text: "Model-appropriate cleaning was completed for this bench test.", multiplier: 1.02 },
  { text: "Model-appropriate preventative maintenance is documented in this fictional scenario.", multiplier: 1.04 },
] as const;

// A profile is a combination of real, disclosed attributes, not a renamed model.
// Unique match/lot references allow the factory to issue instances indefinitely.
export const LOT_PROFILES_PER_MODEL = lotGrades.length * packaging.length * storage.length * documents.length * care.length * 3;
export type Collectibility = "Everyday" | "Uncommon" | "Rare" | "Grail";
export function collectibility(reference: number): Collectibility {
  return reference >= 1500 ? "Grail" : reference >= 500 ? "Rare" : reference >= 150 ? "Uncommon" : "Everyday";
}
export function appraise(reference: number, factors: Appraisal["factors"], inspection: string): Appraisal {
  if (!Number.isFinite(reference) || reference <= 0 || factors.some(f => !Number.isFinite(f.multiplier) || f.multiplier <= 0 || f.multiplier > 2))
    throw new Error("Invalid appraisal inputs.");
  return { reference, factors: structuredClone(factors), inspection, value: Math.max(1,Math.round(factors.reduce((value,f)=>value*f.multiplier,reference))) };
}
export function createLot(item: PublicItem, checks: readonly [string,string,string], random: () => number, instanceId: string, retailerWarranty: boolean): Asset {
  const choose = (length: number) => {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) throw Error("Inventory random source must return a number in [0, 1).");
    return Math.floor(value * length);
  };
  // Better exteriors are less frequent. The chosen grade remains public.
  const grade = lotGrades[[0,1,1,2,2,2,3,3,4,5][choose(10)]];
  const pack = packaging[choose(packaging.length)];
  const history = storage[choose(storage.length)];
  const papers = documents[choose(documents.length)];
  const benchRoll = choose(10);
  const bench = benchRoll < 5 ? 0 : benchRoll < 8 ? 1 : 2;
  const maintenance = care[choose(care.length)];
  const publicItem = structuredClone(item);
  publicItem.condition = grade.text + " Function and service findings are available by private inspection.";
  publicItem.completeness = pack.name === "Item only"
    ? "Main item only; no detachable accessories, packaging or test supplies. Built-in components remain included. Any detached equipment in the reference photo is excluded."
    : item.completeness + "." + pack.suffix;
  publicItem.rarity = collectibility(item.referenceValue) + " game drop tier; not a claim of a limited production run.";
  publicItem.lot = {
    instanceId, catalogId: item.id, grade: grade.name, packaging: pack.name,
    storage: history.name, documentation: papers.name,
    dropTier: collectibility(item.referenceValue),
  };
  const factors: Appraisal["factors"] = [
    { label: "Exterior condition", multiplier: grade.multiplier, reason: grade.text },
    { label: "Functionality / defects", multiplier: [1,0.82,0.55][bench], reason: checks[bench] },
    { label: "Retail warranty adjustment", multiplier: retailerWarranty ? 0.9 : 1, reason: retailerWarranty ? "Retail asking examples include a warranty; this asset has no retailer warranty." : "The curated used baseline assumes no retailer warranty." },
    { label: "Listed completeness", multiplier: pack.multiplier, reason: publicItem.completeness },
    { label: "Storage and handling", multiplier: history.multiplier, reason: history.text },
    { label: "Documentation", multiplier: papers.multiplier, reason: papers.text },
    { label: "Maintenance findings", multiplier: maintenance.multiplier, reason: maintenance.text },
  ];
  // Public intervals depend ONLY on public attributes and possible hidden findings.
  // Never encode the selected hidden result in an ID, image path, or public range.
  const visibleValue = item.referenceValue * grade.multiplier * pack.multiplier * history.multiplier * papers.multiplier * (retailerWarranty ? 0.9 : 1);
  publicItem.estimate = [
    Math.max(1, Math.floor(visibleValue * 0.55 * 0.94 / 5) * 5),
    Math.max(5, Math.ceil(visibleValue * 1.04 / 5) * 5),
  ];
  const inspection = checks[bench] + " " + maintenance.text + " Model identity is consistent; independent authenticity and future resale price are not certified.";
  return { item: publicItem, appraisal: appraise(item.referenceValue,factors,inspection) };
}
