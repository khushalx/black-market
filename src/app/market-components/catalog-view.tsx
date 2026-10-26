import { useState } from "react";
import { ArrowLeft, ArrowRight, Search } from "lucide-react";
import { catalog, collectibility, LOT_PROFILES_PER_MODEL } from "../../catalog";
import { ItemDetails, ItemPhoto, PriceReferences, usd } from "./ui";
import type { PublicItem } from "../../shared/market";

const categories = [...new Set(catalog.map((item) => item.category))].sort();
const categoryShelves = categories.map(category => catalog.filter(item => item.category === category));
const browseItems = Array.from({length: Math.max(...categoryShelves.map(shelf => shelf.length))}, (_,index) => categoryShelves.flatMap(shelf => shelf[index] ? [shelf[index]] : [])).flat();
export function CatalogView() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [tier, setTier] = useState("");
  const [limit, setLimit] = useState(24);
  const [selected, setSelected] = useState<PublicItem | null>(null);
  const filtered = browseItems.filter((item) =>
    (!category || item.category === category) &&
    (!tier || collectibility(item.referenceValue) === tier) &&
    `${item.brand} ${item.model} ${item.category}`.toLowerCase().includes(query.trim().toLowerCase()),
  );
  if (selected) return (
    <div className="catalog-detail">
      <button autoFocus className="text-button" onClick={() => setSelected(null)}><ArrowLeft size={16} /> Back to catalog</button>
      <div className="catalog-detail-heading"><span className="eyebrow">{selected.category}</span><h3>{selected.brand} {selected.model}</h3></div>
      <ItemPhoto key={selected.id} item={selected} />
      <ItemDetails item={selected} />
      <details className="appraisal-details"><summary>Game value & references</summary><PriceReferences item={selected} /></details>
    </div>
  );
  return (
    <div className="catalog-browser">
      <p className="catalog-intro"><strong>{catalog.length} real models.</strong> Hundreds of thousands of possible lots.</p>
      <p className="body-copy">{(catalog.length * LOT_PROFILES_PER_MODEL).toLocaleString("en-US")} condition, bundle and test combinations. Fresh lots keep coming across matches.</p>
      <div className="catalog-filters">
        <label className="catalog-search"><Search size={17} /><input aria-label="Search catalog" placeholder="Find a brand or model" value={query} onChange={(e) => { setQuery(e.target.value); setLimit(24); }} /></label>
        <label><span className="sr-only">Category</span><select aria-label="Category" value={category} onChange={(e) => { setCategory(e.target.value); setLimit(24); }}><option value="">All categories</option>{categories.map((c) => <option key={c}>{c}</option>)}</select></label>
        <label><span className="sr-only">Game drop tier</span><select aria-label="Game drop tier" value={tier} onChange={(e) => { setTier(e.target.value); setLimit(24); }}><option value="">All drop tiers</option>{["Everyday", "Uncommon", "Rare", "Grail"].map((t) => <option key={t}>{t}</option>)}</select></label>
      </div>
      <p className="fine-print catalog-count" aria-live="polite">{filtered.length} models · Values in fictional dollars</p>
      <div className="catalog-grid">
        {filtered.slice(0,limit).map((item) => <button className="catalog-item" key={item.id} onClick={() => setSelected(item)} aria-label={`View ${item.brand} ${item.model}`}><ItemPhoto item={item} small /><span className="catalog-item-brand">{item.brand}</span><strong>{item.model}</strong><span className="catalog-item-meta">{usd(item.referenceValue)} baseline <span>{collectibility(item.referenceValue)}</span></span></button>)}
      </div>
      {!filtered.length && <p className="empty-state">No models found. Try a different search or category.</p>}
      {filtered.length > limit && <button className="button secondary full" onClick={() => setLimit(limit + 24)}>More objects <ArrowRight size={17} /></button>}
      <p className="fine-print">Real product models; condition, bundle and test findings are fictional game scenarios. Drop tiers control game selection, not real-world production rarity. Each room cycles through eligible models before repeating them across rematches.</p>
    </div>
  );
}
