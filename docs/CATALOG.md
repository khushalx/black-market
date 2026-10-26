# Real-item catalog and valuation

The catalog contains 40 recognizable products across photography, gaming, technology, audio, watches, music, fashion, furniture, household equipment, and sport. The records are expandable typed data; `src/catalog/products.json` retains individual baseline rationales and image provenance. `src/catalog/index.ts` builds public information and creates a private appraisal once at match creation.

## What the prices mean

All money is fictional US dollars. Most baselines are **curated game estimates**, with an item-specific rationale and explicit `curated-estimate` source status. These are neither live quotes nor historical sales. No completed-sale records are claimed or fabricated. Market observation/review date: **26 October 2026**.

The Sony a6000 reference uses the median of three observed MPB asking examples: $529, $509 and $504, giving $509. Their source listing identifiers and URLs are retained. The Fujifilm X100 reference uses six good-condition MPB asking examples: $619, $599, $599, $594, $594 and $554; the median is $596.50, rounded to $597. These are selected retailer asking samples, not completed transactions or an exhaustive market survey. A separate 0.90 warranty adjustment accounts for the retailer warranty included in those asking listings.

Contextual new-retail references are retained for the Casio F-91W ($29.95), Tissot PRX quartz 40 mm ($450), and Squier Affinity Stratocaster ($319.99). New retail anchors are not used-item comparables; their used-game baselines are curated separately. Remaining items deliberately retain estimate status rather than manufacturing transaction evidence. Public source records are available at `/products/valuation.json`.

## How a scenario is appraised

The reference assumes the disclosed standard bundle, ordinary production edition, and no special collector or provenance premium. The model multiplies explicit factors and rounds to a whole fictional dollar once:

`appraisal = round(reference × exterior × functionality × warranty × listed completeness × edition/demand)`

Exterior condition is public: very good (1.10), good (1.00), or fair (0.80). The private bench-test scenario is working (1.00), a specified minor fault (0.82), or a specified material fault (0.55). Each of the forty models has its own concrete test result and defect descriptions. Accessories already excluded in the public bundle are not deducted again. The model has no surprise market multiplier, random post-sale punishment, or retroactive value change.

The public value interval is deliberately broad (roughly 39%–115% of reference), because no bench test is publicly promised. An inspection reveals a truthful scenario fact and a narrower indicative interval. Authentication is not guaranteed by a model photograph or a bench test; records explicitly communicate that limitation. Scenario condition and tests describe the fictional game asset, **not the physical object in the reference photograph**.

## Photography and rights

All photographs are model reference images from Wikimedia Commons, with source-page URL, creator attribution and license retained per product. Images are locally optimized WebP derivatives, resized proportionally without cropping or compositing. Public-domain, CC0, CC BY and CC BY-SA sources retain their applicable licenses; attribution and license links remain in the public item record. ShareAlike image derivatives remain under their source licenses. The source photographs are not relicensed as application code.

Some body-only camera photographs include a lens. Public descriptions explicitly exclude that lens from the lot. Other listings similarly state the precise included bundle; a reference photograph never adds an undisclosed accessory. This is a game, with no real assets offered for sale.

`scripts/catalog-assets.mjs` regenerates local derivatives from the official Wikimedia thumbnail service. The application does not depend on image hotlink availability at runtime. If a file fails, the UI should display an honest unavailable-photo fallback instead of substituting an unrelated image.

## Selected checked sources

- [Sony a6000 asking listings at MPB](https://www.mpb.com/en-us/product/sony-alpha-a6000)
- [Fujifilm X100 asking listings at MPB](https://www.mpb.com/en-us/product/fujifilm-x100)
- [Casio US watch catalog](https://www.casio.com/us/watches/casio/)
- [Tissot PRX 40 mm quartz](https://www.tissotwatches.com/en-us/T1374101140100.html)
- [Fender/Squier Affinity Stratocaster](https://www.fender.com/products/affinity-series-stratocaster)

Production catalog expansion should add licensed completed-sale datasets when available, currencies normalized to USD, item-level comparable selection rules, robust sample sizes, and scheduled price review. Current figures remain curated game references.
