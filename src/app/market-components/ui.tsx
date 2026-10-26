/* eslint-disable @next/next/no-img-element -- Product photos are already optimized local WebP files with explicit rights metadata. */
import { useEffect, useId, useRef, useState } from "react";
import { ArrowUpRight, Check, Copy, ImageOff, X } from "lucide-react";
import type { PublicItem, Purchase, Standing } from "../../shared/market";

export const usd = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
export const signed = (value: number) =>
  `${value >= 0 ? "+" : "−"}${usd(Math.abs(value))}`;
export const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((v) => v[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

export function Modal({
  title,
  subtitle,
  children,
  close,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  close: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={`modal ${wide ? "modal-wide" : ""}`}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="modal-head">
        <div>
          {subtitle && <span className="eyebrow">{subtitle}</span>}
          <h2 id={titleId}>{title}</h2>
        </div>
        <button
          className="icon-button"
          onClick={close}
          aria-label="Close dialog"
        >
          <X size={21} />
        </button>
      </div>
      <div className="modal-content">{children}</div>
    </dialog>
  );
}
export function CopyButton({
  value,
  label = "Copy",
}: {
  value: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="button subtle compact"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        });
      }}
    >
      {copied ? <Check size={16} /> : <Copy size={16} />}
      {copied ? "Copied" : label}
    </button>
  );
}
export function ItemPhoto({
  item,
  small = false,
}: {
  item: PublicItem;
  small?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const img = item.images[0];
  return (
    <div className={`item-photo ${small ? "small-photo" : ""}`}>
      {img && !failed ? (
        <img
          src={img.src}
          alt={img.alt || `${item.brand} ${item.model}`}
          onError={() => setFailed(true)}
          loading={small ? "lazy" : "eager"}
        />
      ) : (
        <div className="photo-fallback">
          <ImageOff size={30} />
          <span>Photograph unavailable</span>
          <small>
            {item.brand} {item.model}
          </small>
        </div>
      )}
    </div>
  );
}
export function ItemDetails({ item }: { item: PublicItem }) {
  return (
    <>
      <p className="body-copy">{item.description}</p>
      <dl className="facts-list">
        {item.lot && <>
          <div><dt>Lot reference</dt><dd className="lot-reference">{item.lot.instanceId}</dd></div>
          <div><dt>Storage</dt><dd>{item.lot.storage}</dd></div>
          <div><dt>Paperwork</dt><dd>{item.lot.documentation}</dd></div>
          <div><dt>Game drop tier</dt><dd>{item.lot.dropTier}</dd></div>
        </>}
        <div>
          <dt>Brand & model</dt>
          <dd>
            {item.brand} {item.model}
          </dd>
        </div>
        <div>
          <dt>Year / edition</dt>
          <dd>{item.year}</dd>
        </div>
        <div>
          <dt>Condition</dt>
          <dd>{item.condition}</dd>
        </div>
        <div>
          <dt>Included</dt>
          <dd>{item.completeness}</dd>
        </div>
        <div>
          <dt>Authenticity</dt>
          <dd>{item.authenticity}</dd>
        </div>
        <div>
          <dt>Availability</dt>
          <dd>{item.rarity}</dd>
        </div>
      </dl>
      <p className="fine-print">
        The photograph identifies the product model. Read the lot description
        for included accessories and the actual condition of this game asset.
      </p>
      <h3 className="section-title">Photography & rights</h3>
      {item.images.map((img) => (
        <div className="source-card" key={img.src}>
          <p>{img.credit}</p>
          <span>{img.license}</span>
          <a href={img.sourceUrl} target="_blank" rel="noreferrer">
            Original photograph <ArrowUpRight size={14} />
          </a>
        </div>
      ))}
    </>
  );
}
export function PriceReferences({ item }: { item: PublicItem }) {
  return (
    <>
      <div className="reference-summary">
        <span className="eyebrow">Reference baseline</span>
        <strong>{usd(item.referenceValue)}</strong>
        <p>{item.pricingStatus}</p>
      </div>
      <p className="body-copy">
        Public estimate:{" "}
        <b>
          {usd(item.estimate[0])}–{usd(item.estimate[1])}
        </b>
        . The final game appraisal also accounts for this particular item’s
        condition and verified facts. A reference price is not a guaranteed
        resale offer.
      </p>
      <div className="source-list">
        {item.sources.map((source, i) => (
          <article className="source-card" key={`${source.url}-${i}`}>
            <div>
              <span className="source-kind">
                {source.kind.replaceAll("-", " ")}
              </span>
              {source.price !== undefined && <b>{usd(source.price)}</b>}
            </div>
            <h3>{source.label}</h3>
            <p>{source.note}</p>
            <span>Observed {source.observedAt}</span>
            {source.url && (
              <a href={source.url} target="_blank" rel="noreferrer">
                View source <ArrowUpRight size={14} />
              </a>
            )}
          </article>
        ))}
      </div>
      <p className="fine-print">
        Price observation date: {item.observedAt}. Curated estimates are
        game-design baselines, not fabricated transaction records or live market
        quotes.
      </p>
    </>
  );
}
export function PurchaseCard({
  purchase,
  reveal = false,
}: {
  purchase: Purchase;
  reveal?: boolean;
}) {
  return (
    <article className="purchase-card">
      <ItemPhoto item={purchase.item} small />
      <div>
        <span className="eyebrow">{purchase.item.category}</span>
        <h3>
          {purchase.item.brand} {purchase.item.model}
        </h3>
        {purchase.item.lot && <p className="fine-print">{purchase.item.lot.grade} · {purchase.item.lot.packaging} · {purchase.item.lot.storage}</p>}
        <p>
          Paid <b>{usd(purchase.paid)}</b>
          {purchase.soldFor !== undefined && (
            <>
              {" "}
              · Dealer sale <b>{usd(purchase.soldFor)}</b>
            </>
          )}
        </p>
        {reveal && purchase.appraisal ? (
          <>
            <p>
              Final appraisal <b>{usd(purchase.appraisal.value)}</b>{" "}
              <span
                className={
                  (purchase.soldFor ?? purchase.appraisal.value) >=
                  purchase.paid
                    ? "positive"
                    : "negative"
                }
              >
                {signed(
                  (purchase.soldFor ?? purchase.appraisal.value) -
                    purchase.paid,
                )}
              </span>
            </p>
            <details className="appraisal-details">
              <summary>How it was valued</summary>
              <p>Reference baseline: {usd(purchase.appraisal.reference)}</p>
              {purchase.appraisal.factors.map((f, i) => (
                <p key={i}>
                  <b>
                    {f.label} ×{f.multiplier.toFixed(2)}
                  </b>
                  <br />
                  {f.reason}
                </p>
              ))}
              <p>{purchase.appraisal.inspection}</p>
            </details>
          </>
        ) : (
          <p className="fine-print">Final appraisal sealed until settlement.</p>
        )}
      </div>
    </article>
  );
}
export function ResultsBreakdown({ standings }: { standings: Standing[] }) {
  return (
    <div className="standings-list">
      {standings.map((standing) => (
        <details className="standing-row" key={standing.id}>
          <summary>
            <span className="rank-number">
              {String(
                1 +
                  standings.filter((p) => p.netWorth > standing.netWorth)
                    .length,
              ).padStart(2, "0")}
            </span>
            <span className="standing-name">
              <b>{standing.nickname}</b>
              <small>
                {usd(standing.cash)} cash · {usd(standing.collectionValue)}{" "}
                assets
              </small>
            </span>
            <span className="standing-total">
              <b>{usd(standing.netWorth)}</b>
              <small className={standing.profit >= 0 ? "positive" : "negative"}>
                {signed(standing.profit)}
              </small>
            </span>
          </summary>
          <div className="standing-purchases">
            <div className="inline-stat">
              <span>Return on purchases</span>
              <b>{standing.returnPercent.toFixed(1)}%</b>
            </div>
            {standing.purchases.length ? (
              standing.purchases.map((p) => (
                <PurchaseCard key={p.id} purchase={p} reveal />
              ))
            ) : (
              <p className="empty-state">
                No purchases. All starting cash retained.
              </p>
            )}
          </div>
        </details>
      ))}
    </div>
  );
}
