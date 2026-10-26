import products from "./products.json";
import expandedProducts from "./expanded-products.json";
import { familyProfiles } from "./families";
import { createLot } from "./lot-generator";
export { appraise, collectibility, LOT_PROFILES_PER_MODEL } from "./lot-generator";
const productFamilies: Record<string,string> = Object.fromEntries(expandedProducts.map(p => [p.id,p.family]));
import type {
  Asset,
  PriceSource,
  PublicItem,
} from "../shared/market";

const observedAt = "2026-10-26";
const sources: Record<string, PriceSource[]> = {
  "sony-a6000": [
    {
      url: "https://www.mpb.com/en-us/product/sony-alpha-a6000/sku-4260218",
      label: "MPB SKU 4260218 · like new",
      kind: "asking-price",
      price: 529,
      observedAt,
      note: "Retailer asking example; warranty and accessories differ. Not a completed transaction.",
    },
    {
      url: "https://www.mpb.com/en-us/product/sony-alpha-a6000/sku-4247335",
      label: "MPB SKU 4247335 · excellent",
      kind: "asking-price",
      price: 509,
      observedAt,
      note: "Retailer asking example including six-month warranty. Not a completed transaction.",
    },
    {
      url: "https://www.mpb.com/en-us/product/sony-alpha-a6000/sku-4239804",
      label: "MPB SKU 4239804 · excellent",
      kind: "asking-price",
      price: 504,
      observedAt,
      note: "Retailer asking example. This is a three-listing reference sample, not a complete market survey.",
    },
  ],
  "fujifilm-x100": [619, 599, 599, 594, 594, 554].map((price, i) => ({
    url: "https://www.mpb.com/en-us/product/fujifilm-x100",
    label: `MPB good-condition listing · ${["4180007", "3938652", "4076910", "4046177", "4064943", "4183693"][i]}`,
    kind: "asking-price" as const,
    price,
    observedAt,
    note: "Observed good-condition retailer asking price; includes six-month warranty. Not a completed transaction.",
  })),
  "casio-f91w": [
    {
      url: "https://www.casio.com/us/watches/casio/",
      label: "Casio US F91W-1 · new retail",
      kind: "retail-reference",
      price: 29.95,
      observedAt,
      note: "New retail anchor, not a used-sale comparable. Used game baseline is curated at $25.",
    },
  ],
  "tissot-prx": [
    {
      url: "https://www.tissotwatches.com/en-us/T1374101140100.html",
      label: "Tissot PRX 40 mm quartz · new retail",
      kind: "retail-reference",
      price: 450,
      observedAt,
      note: "Current new quartz retail anchor. Curated used-game baseline excludes box, papers and warranty.",
    },
  ],
  "squier-affinity": [
    {
      url: "https://www.fender.com/products/affinity-series-stratocaster",
      label: "Fender/Squier Affinity Stratocaster · new retail",
      kind: "retail-reference",
      price: 319.99,
      observedAt,
      note: "New current production retail anchor. Used scenario does not imply this finish or model-year price.",
    },
  ],
};

export function medianComparable(values: number[]): number {
  if (!values.length || values.some((v) => !Number.isFinite(v) || v <= 0))
    throw new Error("Comparable values must be positive finite numbers.");
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Curated monetary figures are game estimates, never invented sales records. */
export const catalog: PublicItem[] = [...products, ...expandedProducts].map((p) => {
  const referenceValue = p.id === "fujifilm-x100" ? 597 : p.referenceValue;
  const rationale =
    p.id === "fujifilm-x100"
      ? "Rounded median of six observed good-condition retailer asking examples: $619, $599, $599, $594, $594, $554. These are asking prices, include retailer warranty, and are not completed sales."
      : p.rationale;
  const itemSources: PriceSource[] = [
    ...(sources[p.id] ?? []),
    {
      url: `/products/valuation.json#${p.id}`,
      label: "Curated game valuation record",
      kind: "curated-estimate",
      price: referenceValue,
      observedAt,
      note:
        rationale + " Value is not a live quote or a guaranteed resale price.",
    },
  ];
  return {
    id: p.id,
    brand: p.brand,
    model: p.model,
    year: p.year,
    category: p.category,
    description: p.description,
    condition:
      "Used; exterior condition shown at preview. Bench test details available by inspection.",
    completeness: familyProfiles[productFamilies[p.id]]?.bundle ?? p.completeness,
    authenticity:
      "Model identification from reference photography; no independent authentication certificate.",
    rarity: "Standard production",
    referenceValue,
    estimate: [
      Math.floor((referenceValue * 0.39) / 5) * 5,
      Math.ceil((referenceValue * 1.15) / 5) * 5,
    ],
    sources: itemSources,
    pricingStatus: sources[p.id]?.some((s) => s.kind === "asking-price")
      ? "Game estimate anchored to asking prices · no verified completed sales"
      : "Curated game estimate · no verified completed sales",
    observedAt,
    images: [
      {
        src: `/products/${p.id}.webp`,
        sourceUrl: p.image.source,
        credit: p.image.artist + " · resized and converted to WebP; no crop",
        license:
          p.image.license +
          (p.image.licenseUrl ? ` · ${p.image.licenseUrl}` : ""),
        alt: `${p.brand} ${p.model} reference photograph`,
      },
    ],
  };
});

// Original scenario facts. These describe the in-game asset, not a photographed seller's physical item.
const checks: Record<string, [string, string, string]> = {
  "canon-5d-ii": [
    "Shutter, autofocus and card writing pass the bench test.",
    "The rear command dial intermittently misses inputs; shutter and card writing pass.",
    "The shutter occasionally sticks during burst shooting; professional repair is required.",
  ],
  "nikon-d7000": [
    "Both SD slots and autofocus pass the test.",
    "One SD slot fails; the other slot and shutter work.",
    "The mirror mechanism sticks after repeated releases.",
  ],
  "sony-a6000": [
    "Sensor, autofocus and electronic viewfinder pass the test.",
    "The eye sensor is intermittent; manual viewfinder switching works.",
    "The shutter produces intermittent dark frames; repair is required.",
  ],
  "fujifilm-x100": [
    "Fixed lens, leaf shutter and hybrid viewfinder pass the test.",
    "The command wheel skips occasional inputs; exposure is stable.",
    "The aperture blades stick; the lens module needs service.",
  ],
  "olympus-em10-ii": [
    "Sensor stabilization and shutter pass the test.",
    "The rear dial skips inputs; stabilization still works.",
    "The stabilization unit reports an error and does not engage.",
  ],
  "panasonic-gf1": [
    "Autofocus, shutter and flash pass the test.",
    "The flash requires a second attempt to rise; normal photography works.",
    "The shutter fails intermittently above 1/1000 second.",
  ],
  "canon-ae1-program": [
    "Meter, shutter timings and light seals pass the test.",
    "Light seals are deteriorating and require replacement.",
    "The shutter curtains intermittently fail to travel fully.",
  ],
  "nikon-f50": [
    "Film transport, meter and autofocus pass the test.",
    "The film door latch is loose but closes; replacement is recommended.",
    "Film advance intermittently jams; motor service is required.",
  ],
  "polaroid-sx70": [
    "A test film pack confirms motor, shutter and ejection operation.",
    "The rollers leave a repeatable mark and need cleaning or replacement.",
    "The ejection motor stalls with a fresh film pack.",
  ],
  "minolta-x700": [
    "Meter, shutter and film advance pass the test.",
    "The viewfinder display has a failed segment; metering still works.",
    "The shutter fails intermittently, consistent with ageing capacitors.",
  ],
  "nintendo-switch": [
    "Joy-Con, dock output and game-card reader pass the test.",
    "One Joy-Con exhibits stick drift; the console and dock pass.",
    "The console overheats and shuts down under sustained load.",
  ],
  "nintendo-gameboy": [
    "Screen, sound and cartridge contacts pass the test.",
    "The speaker is quiet; the headphone output works.",
    "The LCD has persistent vertical lines requiring repair.",
  ],
  "nintendo-ds-lite": [
    "Both screens, hinges and game slots pass the test.",
    "The top-screen hinge is loose; both displays still work.",
    "The upper display cuts out when the hinge moves.",
  ],
  "nintendo-3ds": [
    "Both screens, circle pad and game-card slot pass the test.",
    "The circle-pad cover is worn and needs replacement.",
    "The upper display backlight flickers and needs repair.",
  ],
  "sony-ps2-slim": [
    "A disc read and controller-port test passes.",
    "The lid sensor needs extra pressure to detect closure.",
    "The optical drive cannot reliably read game discs.",
  ],
  "sony-psp": [
    "UMD reading, controls and battery charging pass the test.",
    "The battery has reduced runtime; replacement is recommended.",
    "The UMD drive fails to read discs; digital system functions still work.",
  ],
  "xbox-360-pro": [
    "Disc drive and a sustained game test pass.",
    "The disc tray occasionally sticks; it opens with gentle assistance.",
    "The console fails a sustained heat test and shuts down.",
  ],
  "macintosh-classic": [
    "The CRT, floppy drive and memory test pass.",
    "The floppy drive does not eject reliably; service is needed.",
    "The analog board has leaking capacitors and needs refurbishment.",
  ],
  "commodore-64": [
    "A memory diagnostic and keyboard test pass using the replacement supply.",
    "One keyboard key needs repeated pressure; diagnostics otherwise pass.",
    "Memory diagnostics report a faulty RAM bank.",
  ],
  "raspberry-pi4": [
    "USB, HDMI, network and memory tests pass.",
    "One USB port is mechanically loose; the other ports work.",
    "The board resets under sustained load with a tested power supply.",
  ],
  "sony-wh1000xm3": [
    "ANC, Bluetooth and both audio channels pass.",
    "Battery runtime is materially reduced; ANC and audio work.",
    "One channel crackles when ANC is enabled.",
  ],
  "technics-sl1200": [
    "Speed lock, tonearm bearings and both channels pass.",
    "The pitch slider has a dead spot and needs cleaning or replacement.",
    "Tonearm bearings have play; professional adjustment is needed.",
  ],
  "audio-technica-m50": [
    "Both drivers and cable continuity pass.",
    "Ear pads are splitting; both drivers work.",
    "The fixed cable intermittently loses the left channel.",
  ],
  "casio-f91w": [
    "Display, buttons, alarm and timekeeping pass; no water-resistance guarantee.",
    "The resin strap is cracked and needs replacement.",
    "A display segment is failed; the module needs replacement.",
  ],
  "seiko-skx007": [
    "Automatic movement runs within the scenario tolerance; no pressure certification.",
    "The movement runs but is outside the scenario timing tolerance; service is advised.",
    "The movement stops intermittently and requires service.",
  ],
  "seiko-snk809": [
    "Automatic movement runs consistently; no factory accuracy certificate.",
    "The crown stem feels loose; setting still works.",
    "The movement loses substantial time and needs service.",
  ],
  "tissot-prx": [
    "Quartz movement, crown and clasp pass; no pressure certification.",
    "The battery is nearing end of life; replacement is needed.",
    "The crown does not reliably set the time; service is required.",
  ],
  "squier-affinity": [
    "Neck alignment, pickups and truss rod pass the test.",
    "The output jack crackles and needs replacement.",
    "The truss rod is seized and the neck has excessive relief.",
  ],
  "korg-microkorg": [
    "All keys, controls and audio outputs pass.",
    "One encoder skips values; keys and synthesis work.",
    "Several keys do not trigger and need contact repair.",
  ],
  "boss-ds1": [
    "Switch, controls and audio path pass.",
    "The footswitch needs firm pressure; the audio circuit works.",
    "The pedal intermittently loses audio when engaged.",
  ],
  "adidas-stan-smith": [
    "The pair matches the listed standard model; soles and seams are intact.",
    "The heel lining is worn through; soles remain usable.",
    "Sole separation is present and needs repair; authenticity remains uncertified.",
  ],
  "converse-allstar": [
    "Seams, toe caps and sole bonding are intact.",
    "Heel lining is worn and needs patching.",
    "The sole is separating from the upper.",
  ],
  "herman-miller-aeron": [
    "Tilt, height adjustment and mesh tension pass.",
    "One armrest pad is cracked; adjustment and mesh work.",
    "The gas cylinder sinks under load and requires replacement.",
  ],
  "kitchenaid-artisan": [
    "All speeds, attachment engagement and mixing test pass.",
    "The speed lever is stiff; all speeds still work.",
    "The drive slips under load and needs gearbox service.",
  ],
  "bialetti-moka": [
    "Valve, funnel and sealing surfaces pass a hot-water test.",
    "The rubber gasket is hardened and needs replacement.",
    "The safety valve is seized; the pot must not be used until replaced.",
  ],
  "wilson-prostaff": [
    "The frame has no detected cracks; grommets and grip are serviceable.",
    "The grommets are brittle and need replacement.",
    "A hairline frame crack is detected near the throat.",
  ],
  "nintendo-nes": [
    "Cartridge reading, controller and video output pass.",
    "The cartridge connector needs reseating before a reliable start.",
    "The cartridge connector fails repeated read tests.",
  ],
  "nintendo-snes": [
    "Cartridge reading, controller and audio/video output pass.",
    "One controller button has intermittent contact.",
    "Video output has persistent interference after cable substitution.",
  ],
  "nintendo-gamecube": [
    "Optical drive, controller and memory card pass.",
    "The controller stick has a worn neutral position.",
    "The optical drive fails to read a known-good disc.",
  ],
  "sega-genesis": [
    "Cartridge reading, controller and stereo output pass.",
    "The headphone volume slider crackles when moved.",
    "The video output drops intermittently with a known-good cable.",
  ],
};

/** Resolve only a checked model. All hidden findings are frozen before the first bid. */
export function createAsset(item: PublicItem, random: () => number = Math.random, instanceId = "sample-" + item.id): Asset {
  const product = catalog.find(p => p.id === item.id);
  const facts = checks[item.id] ?? familyProfiles[productFamilies[item.id]]?.checks;
  if (!product || !facts) throw new Error("Unknown curated product.");
  return createLot(product, facts, random, instanceId, sources[item.id]?.some(s => s.kind === "asking-price") ?? false);
}
