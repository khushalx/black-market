import { useEffect, useReducer, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CircleHelp,
  ExternalLink,
  Eye,
  Ellipsis,
  History,
  Info,
  Package,
  Radio,
  Users,
  WifiOff,
} from "lucide-react";
import type {
  MarketAdapter,
  MarketSnapshot,
  RoomSettings,
} from "../../shared/market";
import {
  CopyButton,
  ItemDetails,
  ItemPhoto,
  Modal,
  PriceReferences,
  PurchaseCard,
  ResultsBreakdown,
  initials,
  signed,
  usd,
} from "./ui";

type Panel =
  | "lot-info"
  | "details"
  | "references"
  | "inspection"
  | "collection"
  | "bids"
  | "rules"
  | "leave"
  | null;
const modeLabel = (mode: MarketSnapshot["mode"]) =>
  ({
    practice: "Offline practice",
    private: "Friends room · unranked",
    ranked: "Ranked public match",
  })[mode];

export function RoomView({
  adapter,
  leave,
  finished,
}: {
  adapter: MarketAdapter;
  leave: () => void;
  finished: () => void;
}) {
  const [, update] = useReducer((v: number) => v + 1, 0);
  const [panel, setPanel] = useState<Panel>(null);
  const [increment, setIncrement] = useState(25);
  const [custom, setCustom] = useState("");
  const [customOpen, setCustomOpen] = useState(false);
  const [share, setShare] = useState("");
  useEffect(() => adapter.subscribe(update), [adapter]);
  const s = adapter.getSnapshot();
  const privateState = adapter.getPrivate();
  const phase = s?.phase;
  const persistence = s?.persistence;
  const round = s?.round;
  const isFinished = phase === "finished";
  useEffect(() => {
    queueMicrotask(() => {
      setCustom("");
      setCustomOpen(false);
      setPanel((previous) =>
        previous &&
        ["lot-info", "details", "references", "inspection", "bids"].includes(
          previous,
        )
          ? null
          : previous,
      );
    });
    const frame = requestAnimationFrame(() =>
      window.scrollTo({ top: 0, behavior: "instant" }),
    );
    return () => cancelAnimationFrame(frame);
  }, [round, isFinished]);
  useEffect(() => {
    if (phase === "finished" && persistence !== "pending") finished();
  }, [phase, persistence, finished]);
  if (!s)
    return (
      <main className="loading-page">
        <span className="loading-dot" />
        <h1>Connecting to your room</h1>
        <p>Reserving your seat and synchronizing the auction.</p>
        <button className="button subtle" onClick={leave}>
          Cancel
        </button>
      </main>
    );
  const you = s.players.find((p) => p.id === adapter.playerId);
  if (!you)
    return (
      <main className="loading-page">
        <h1>Synchronizing your seat</h1>
        <p>{adapter.error ?? "Waiting for the authoritative room snapshot."}</p>
        <button className="button subtle" onClick={leave}>
          Return to rooms
        </button>
      </main>
    );
  const host = s.hostId === you.id;
  const seconds = s.closesAt
    ? Math.max(0, Math.ceil((s.closesAt - (adapter.getServerNow?.() ?? s.serverNow)) / 1000))
    : 0;
  const current = s.bid?.amount ?? 0;
  const amount =
    customOpen && custom !== "" ? Number(custom) : current + increment;
  const leading = s.bid?.playerId === you.id;
  const connected = adapter.status === "connected";
  const valid =
    connected &&
    s.phase === "auction" &&
    !leading &&
    Number.isSafeInteger(amount) &&
    amount >= current + 25 &&
    amount <= you.cash;
  const bid = () => {
    if (valid)
      adapter.send({
        type: "bid",
        amount,
        requestId: crypto.randomUUID(),
        round: s.round,
      });
  };
  const invite = () => {
    const url = new URL(window.location.href);
    url.search = `room=${s.roomId}`;
    return url.toString();
  };
  const allReady = s.players.every((p) => p.ready && p.connected);
  const enough =
    s.players.filter((p) => !p.bot && p.connected).length >= 2 ||
    s.mode === "practice" ||
    s.settings.bots;
  const purchases = s.standings.flatMap((player) =>
    player.purchases.map((purchase) => ({
      player,
      purchase,
      profit:
        (purchase.soldFor ?? purchase.appraisal?.value ?? purchase.paid) -
        purchase.paid,
    })),
  );
  const best = [...purchases].sort((a, b) => b.profit - a.profit)[0];
  const worst = [...purchases].sort((a, b) => a.profit - b.profit)[0];
  const average = purchases.length
    ? (purchases.reduce((sum, p) => sum + p.profit, 0) /
        purchases.reduce((sum, p) => sum + p.purchase.paid, 0)) *
      100
    : 0;
  const itemTools = (
    <>
      <button onClick={() => setPanel("details")}>
        <Info size={16} />
        Details
      </button>
      <button onClick={() => setPanel("references")}>
        <Radio size={16} />
        References
      </button>
      <button
        disabled={
          !privateState.inspection &&
          (you.inspectionsLeft === 0 || s.phase === "sold")
        }
        onClick={() => {
          if (!privateState.inspection) adapter.send({ type: "inspect" });
          setPanel("inspection");
        }}
      >
        <Eye size={16} />
        {privateState.inspection
          ? "Your report"
          : "Inspect (" + you.inspectionsLeft + ")"}
      </button>
      <button onClick={() => setPanel("bids")}>
        <History size={16} />
        Bids <span>{s.bids.length}</span>
      </button>
    </>
  );
  return (
    <>
      <div className="room-toolbar">
        <div className="room-identity">
          <span
            className={`connection-dot ${connected ? "" : "offline-dot"}`}
          />
          <span>{modeLabel(s.mode)}</span>
          {s.mode !== "practice" && <b>{s.roomId}</b>}
        </div>
        <div className="toolbar-actions">
          <button
            className="text-button"
            aria-label="Rules"
            onClick={() => setPanel("rules")}
          >
            <CircleHelp size={16} />
            <span>Rules</span>
          </button>
          <button className="text-button" onClick={() => setPanel("leave")}>
            Leave room <ExternalLink size={14} />
          </button>
        </div>
      </div>
      {!connected && (
        <div className="status-banner warning">
          <WifiOff size={17} />
          <span>
            {adapter.status === "reconnecting"
              ? "Connection interrupted. Reconnecting to your reserved seat…"
              : "You are disconnected. Your accepted bids remain valid."}
          </span>
        </div>
      )}
      {adapter.error && (
        <p className="status-banner error" role="alert">
          {adapter.error}
        </p>
      )}
      {s.phase === "lobby" ? (
        <main className="lobby-page">
          <div className="page-intro">
            <h1>Your table.</h1>
            <p>
              {s.mode === "ranked"
                ? "Matched players. Equal starting cash."
                : s.mode === "practice"
                  ? "Ready when you are."
                  : "Invite your friends. Ready up."}
            </p>
          </div>
          <div className="lobby-layout">
            <section className="room-seats">
              <div className="section-heading">
                <h2>Players</h2>
                <span>
                  {s.players.length} / {s.settings.maxPlayers} seats
                </span>
              </div>
              <div className="seat-list">
                {s.players.map((p, i) => (
                  <div className="seat-row" key={p.id}>
                    <span className="seat-index">0{i + 1}</span>
                    <div className="seat-person">
                      <b>
                        {p.nickname}
                        {p.id === you.id && <small>You</small>}
                      </b>
                      <span>
                        {p.bot ? "Bot" : p.id === s.hostId ? "Host" : "Player"}
                      </span>
                    </div>
                    <span className={`ready-state ${p.ready ? "ready" : ""}`}>
                      {p.connected ? (
                        p.ready ? (
                          <>
                            <Check size={14} />
                            Ready
                          </>
                        ) : (
                          "Waiting"
                        )
                      ) : (
                        "Disconnected"
                      )}
                    </span>
                  </div>
                ))}
                {Array.from(
                  {
                    length: Math.max(
                      0,
                      s.settings.maxPlayers - s.players.length,
                    ),
                  },
                  (_, i) => (
                    <div className="seat-row empty-seat" key={`empty-${i}`}>
                      <span className="seat-index">
                        0{s.players.length + i + 1}
                      </span>
                      <span className="empty-seat-icon">
                        <Users size={19} />
                      </span>
                      <span>
                        {s.settings.bots ? "Bot at start" : "Open seat"}
                      </span>
                    </div>
                  ),
                )}
              </div>
              {s.mode !== "ranked" && s.mode !== "practice" && (
                <div className="invite-bar">
                  <div>
                    <span className="eyebrow">Invite code</span>
                    <strong>{s.roomId}</strong>
                  </div>
                  <CopyButton
                    value={typeof window === "undefined" ? s.roomId : invite()}
                    label="Copy invite"
                  />
                </div>
              )}
            </section>
            <aside className="lobby-summary">
              <div className="lobby-wallet">
                <span>Starting cash</span>
                <strong>
                  {usd(s.settings.budget)}
                  <small> each</small>
                </strong>
              </div>
              <details className="lobby-format">
                <summary>
                  {s.settings.lots} lots{" "}
                  <span>
                    Match format <ArrowUpRight size={14} />
                  </span>
                </summary>
                <dl className="facts-list">
                  <div>
                    <dt>Lots</dt>
                    <dd>{s.settings.lots}</dd>
                  </div>
                  <div>
                    <dt>Preview / bidding</dt>
                    <dd>
                      {s.settings.previewSeconds}s / {s.settings.auctionSeconds}
                      s
                    </dd>
                  </div>
                  <div>
                    <dt>Private inspections</dt>
                    <dd>2 per collector</dd>
                  </div>
                  <div>
                    <dt>Late bids</dt>
                    <dd>+5s · up to 3 times</dd>
                  </div>
                </dl>
              </details>
              <p className="fine-print">
                {s.mode === "ranked"
                  ? "Ranked · career progression enabled."
                  : "Unranked · no career progression."}{" "}
                Fictional dollars.
              </p>
              <div className="lobby-controls">
                <button
                  className={`button full ${you.ready ? "secondary" : "primary"}`}
                  disabled={!connected}
                  onClick={() =>
                    adapter.send({ type: "ready", ready: !you.ready })
                  }
                >
                  {you.ready ? (
                    <>
                      <Check size={17} /> Ready
                    </>
                  ) : (
                    "Ready up"
                  )}
                </button>
                {host && s.mode !== "ranked" && (
                  <button
                    className="button primary full"
                    disabled={!allReady || !enough || !connected}
                    onClick={() => adapter.send({ type: "start" })}
                  >
                    Start <ArrowRight size={18} />
                  </button>
                )}
                <p className="lobby-wait">
                  {!enough
                    ? "Waiting for a second player. Bot rooms can start solo."
                    : !allReady
                      ? "Waiting for everyone to be ready."
                      : s.mode === "ranked"
                        ? "Starting automatically."
                        : host
                          ? "Everyone is ready."
                          : "Waiting for the host to start."}
                </p>
              </div>
            </aside>
          </div>
        </main>
      ) : s.phase === "finished" ? (
        <main className="results-page">
          <div className="results-heading">
            <div>
              <span className="eyebrow">
                Final settlement · {s.settings.lots} lots
              </span>
              <h1>
                {s.standings.filter(
                  (p) => p.netWorth === s.standings[0]?.netWorth,
                ).length > 1
                  ? "Shared first place."
                  : `${s.standings[0]?.nickname} wins.`}
              </h1>
            </div>
            <div className="winner-worth">
              <span>Winning net worth</span>
              <strong>{usd(s.standings[0]?.netWorth ?? 0)}</strong>
            </div>
          </div>
          <details className="results-analysis">
            <summary>
              Match highlights <ArrowUpRight size={16} />
            </summary>
            <div className="results-metrics">
              <div>
                <span>Biggest profit</span>
                <b>{best ? signed(best.profit) : "No purchases"}</b>
                <small>
                  {best
                    ? `${best.player.nickname} · ${best.purchase.item.model}`
                    : "—"}
                </small>
              </div>
              <div>
                <span>Worst purchase</span>
                <b>{worst ? signed(worst.profit) : "No purchases"}</b>
                <small>
                  {worst
                    ? `${worst.player.nickname} · ${worst.purchase.item.model}`
                    : "—"}
                </small>
              </div>
              <div>
                <span>Average return</span>
                <b>{average.toFixed(1)}%</b>
                <small>Across all acquired items</small>
              </div>
              <div>
                <span>Top player</span>
                <b>{s.standings[0]?.nickname}</b>
                <small>
                  {signed(s.standings[0]?.profit ?? 0)} from starting cash
                </small>
              </div>
            </div>
          </details>
          <ResultsBreakdown standings={s.standings} />
          <div className="results-actions">
            {s.mode !== "ranked" && host && (
              <button
                className="button primary"
                disabled={s.mode !== "practice" && s.persistence !== "saved"}
                onClick={() => adapter.send({ type: "rematch" })}
              >
                Rematch <ArrowRight size={18} />
              </button>
            )}
            <button
              className={`button ${s.mode === "ranked" ? "primary" : "secondary"}`}
              onClick={leave}
            >
              Back to play
            </button>
            <button
              className="button subtle"
              onClick={() => {
                const text = `BLACK MARKET · ${s.standings.map((p, i) => `${i + 1}. ${p.nickname}: ${usd(p.netWorth)} (${signed(p.profit)})`).join(" · ")} · Fictional dollars`;
                void navigator.clipboard
                  .writeText(text)
                  .then(() => setShare("Result copied"));
              }}
            >
              {share || "Share result"}
            </button>
          </div>
          <p className="save-status">
            {s.mode === "practice"
              ? "Practice · result not saved."
              : s.persistence === "saved"
                ? "Saved to match history."
                : s.persistence === "failed"
                  ? "Saving was interrupted. The server is retrying; keep this room open."
                  : "Saving the authoritative result…"}
          </p>
        </main>
      ) : (
        <main className={"auction-page phase-" + s.phase}>
          <div className="match-heading">
            <div className="lot-heading">
              <h1>
                <span>Lot</span> {String(s.round).padStart(2, "0")}
                <small>/{String(s.settings.lots).padStart(2, "0")}</small>
              </h1>
              <span className={"phase-label " + s.phase}>
                <i />
                {s.phase === "preview"
                  ? "Preview"
                  : s.phase === "sold"
                    ? "Closed"
                    : "Bidding live"}
              </span>
            </div>
            <div
              className="match-progress"
              aria-label={"Lot " + s.round + " of " + s.settings.lots}
            >
              {Array.from({ length: s.settings.lots }, (_, i) => (
                <i className={i < s.round ? "active" : ""} key={i} />
              ))}
            </div>
            <div className="lot-actions">
              <button
                className="collection-link"
                onClick={() => setPanel("collection")}
              >
                <Package size={17} /> Collection{" "}
                <b>
                  {you.purchases.filter((p) => p.soldFor === undefined).length}
                </b>
              </button>
              <button
                className="mobile-lot-info"
                aria-label="Lot info"
                onClick={() => setPanel("lot-info")}
              >
                <Ellipsis size={22} />
              </button>
            </div>
          </div>
          <div className="auction-layout">
            <section className="product-stage">
              <div className="lot-photograph">
                {s.item && (
                  <ItemPhoto
                    key={String(s.round) + "-" + s.item.id}
                    item={s.item}
                  />
                )}
                {s.phase === "sold" && (
                  <div className="sold-stamp" key={s.round}>
                    {s.bid ? "Sold" : "Unsold"}
                    <span>{s.bid ? s.bid.nickname : "No bids"}</span>
                  </div>
                )}
              </div>
              <div className="photo-caption">
                <span>
                  {s.item?.category} <i>/</i> {s.item?.year}
                </span>
                <span>Reference photo</span>
              </div>
              <div className="item-tools">{itemTools}</div>
            </section>
            <section className="bid-panel">
              {s.item && (
                <>
                  <div className="product-heading">
                    <span className="product-brand">{s.item.brand}</span>
                    <h2>{s.item.model}</h2>
                    <p>{s.item.lot ? `${s.item.lot.grade} condition · ${s.item.lot.packaging}` : s.item.condition.split(".")[0].trim() + "."}</p>
                  </div>
                  <button
                    className="market-estimate"
                    onClick={() => setPanel("references")}
                    aria-label="View price references"
                  >
                    <span>Estimate</span>
                    <b>
                      {usd(s.item.estimate[0])}–{usd(s.item.estimate[1])}
                    </b>
                    <ArrowUpRight size={15} />
                  </button>
                </>
              )}
              <div className="price-and-clock">
                <div className="price-block">
                  <span className="eyebrow">
                    {s.phase === "sold" ? "Final bid" : "Current bid"}
                  </span>
                  <strong
                    className="current-price"
                    key={String(s.round) + "-" + current}
                  >
                    <span>$</span>
                    {usd(current).slice(1)}
                  </strong>
                </div>
                <div
                  className={
                    "auction-clock " +
                    (seconds <= 5 && s.phase === "auction" ? "urgent" : "")
                  }
                  aria-label={
                    seconds +
                    " seconds " +
                    (s.phase === "preview" ? "until bidding" : "remaining")
                  }
                >
                  <span className="eyebrow">
                    {s.phase === "preview"
                      ? "Opens in"
                      : s.phase === "sold"
                        ? s.round === s.settings.lots
                          ? "Results"
                          : "Next lot"
                        : "Time left"}
                  </span>
                  <strong>
                    {String(seconds).padStart(2, "0")}
                    <small>s</small>
                  </strong>
                </div>
              </div>
              <div
                className={"bid-leader " + (leading ? "you-lead" : "")}
                key={s.bid?.playerId ?? "none"}
              >
                <span className="leader-dot" />
                {s.bid
                  ? s.phase === "sold"
                    ? leading
                      ? "You won"
                      : s.bid.nickname + " won"
                    : leading
                      ? "You lead"
                      : s.bid.nickname + " leads"
                  : s.phase === "sold"
                    ? "No bids"
                    : "No bids · opens at $25"}
                {s.extensions > 0 && s.phase !== "sold" && (
                  <span className="overtime-note">
                    +{s.extensions * 5}s overtime
                  </span>
                )}
              </div>
              {s.phase === "sold" ? (
                <div className="sold-confirmation">
                  <span>Available cash</span>
                  <b>{usd(you.cash)}</b>
                </div>
              ) : (
                <div className="bid-dock">
                  <div className="wallet-line">
                    <span>Available cash</span>
                    <strong>{usd(you.cash)}</strong>
                  </div>
                  <div
                    className="increment-controls"
                    role="group"
                    aria-label="Bid increment"
                  >
                    {[25, 50, 100].map((n) => (
                      <button
                        className={
                          !customOpen && increment === n ? "selected" : ""
                        }
                        key={n}
                        onClick={() => {
                          setIncrement(n);
                          setCustomOpen(false);
                          setCustom("");
                        }}
                      >
                        +{usd(n)}
                      </button>
                    ))}
                    <button
                      className={customOpen ? "selected" : ""}
                      onClick={() => setCustomOpen(!customOpen)}
                      aria-expanded={customOpen}
                      aria-label="Custom bid amount"
                    >
                      Custom
                    </button>
                  </div>
                  {customOpen && !leading && (
                    <label className="custom-bid-label">
                      Total bid
                      <input
                        type="number"
                        inputMode="numeric"
                        min={current + 25}
                        max={you.cash}
                        step="1"
                        value={custom}
                        onChange={(e) => setCustom(e.target.value)}
                        placeholder={String(current + 25)}
                      />
                    </label>
                  )}
                  <button
                    className={
                      "button primary bid-button " +
                      (leading ? "leading-button" : "")
                    }
                    disabled={!valid}
                    onClick={bid}
                  >
                    <span className="bid-button-copy">
                      {s.phase === "preview" ? (
                        "Opens in " + seconds + "s"
                      ) : leading ? (
                        "You're leading"
                      ) : amount > you.cash ? (
                        "Insufficient cash"
                      ) : (
                        <>
                          Bid <b>{usd(amount)}</b>
                        </>
                      )}
                    </span>
                    <span className="paddle-mark">
                      {leading ? <Check size={24} /> : <ArrowRight size={27} />}
                    </span>
                  </button>
                  {leading && (
                    <span className="bid-obligation">
                      {usd(current)} committed · {usd(you.cash - current)} free
                    </span>
                  )}
                </div>
              )}
            </section>
          </div>
          <section className="player-strip" aria-label="Collectors and wallets">
            {s.players.map((p, i) => (
              <div
                key={p.id}
                className={
                  "player-chip " +
                  (s.bid?.playerId === p.id ? "leading-chip " : "") +
                  (p.id === you.id ? "you-chip " : "") +
                  (!p.connected ? "disconnected-chip" : "")
                }
              >
                <span className="bidder-number">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <b>
                    {p.nickname}
                    {p.id === you.id && <small>you</small>}
                    {p.bot && <small>bot</small>}
                  </b>
                  <span>
                    {usd(p.cash)}
                    {!p.connected && <small>offline</small>}
                  </span>
                </div>
                {s.bid?.playerId === p.id && (
                  <i className="bidder-leading" aria-label="Highest bidder" />
                )}
              </div>
            ))}
          </section>
          {privateState.offer && s.phase === "preview" && (
            <div className="dealer-offer">
              <div>
                <span className="eyebrow">
                  Dealer offer · expires this preview
                </span>
                <h3>{privateState.offer.name}</h3>
                <p>88% of appraisal. Sell now or keep it.</p>
              </div>
              <button
                className="button secondary"
                onClick={() =>
                  adapter.send({
                    type: "sell",
                    purchaseId: privateState.offer!.purchaseId,
                  })
                }
              >
                Sell for {usd(privateState.offer.amount)}
              </button>
              <button
                className="text-button"
                onClick={() => setPanel("collection")}
              >
                View item <ArrowRight size={15} />
              </button>
            </div>
          )}
        </main>
      )}
      <span className="sr-only" role="status">
        {s.message}
      </span>
      {panel && (
        <Modal
          title={
            {
              "lot-info": "Lot info",
              details: "Item details",
              references: "Price references",
              inspection: "Your private inspection",
              collection: "Your collection",
              bids: "Bid history",
              rules: "How the auction works",
              leave: "Leave this room?",
            }[panel]
          }
          subtitle={
            panel === "inspection"
              ? "Confidential · visible only to you"
              : undefined
          }
          close={() => setPanel(null)}
          wide={panel === "collection"}
        >
          {panel === "lot-info" && <div className="lot-menu">{itemTools}</div>}
          {panel === "details" && s.item && <ItemDetails item={s.item} />}
          {panel === "references" && s.item && (
            <PriceReferences item={s.item} />
          )}
          {panel === "inspection" &&
            (privateState.inspection ? (
              <>
                <div className="inspection-status">
                  <Check size={19} /> Verified inspection
                </div>
                <h3 className="inspection-fact">
                  {privateState.inspection.fact}
                </h3>
                <div className="reference-summary">
                  <span className="eyebrow">Indicative value interval</span>
                  <strong>
                    {usd(privateState.inspection.range[0])}–
                    {usd(privateState.inspection.range[1])}
                  </strong>
                </div>
                <p className="body-copy">{privateState.inspection.certainty}</p>
                <p className="fine-print">
                  {you.inspectionsLeft}{" "}
                  {you.inspectionsLeft === 1 ? "inspection" : "inspections"}{" "}
                  left. Reopen this report for free.
                </p>
              </>
            ) : (
              <p className="body-copy">
                {adapter.error ?? "Requesting your confidential report…"}
              </p>
            ))}
          {panel === "collection" &&
            (you.purchases.length ? (
              <div className="collection-list">
                {you.purchases.map((p) => (
                  <PurchaseCard key={p.id} purchase={p} />
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <Package size={30} />
                <h3>No purchases yet</h3>
                <p>{usd(you.cash)} available.</p>
              </div>
            ))}
          {panel === "bids" &&
            (s.bids.length ? (
              <ol className="bid-history">
                {[...s.bids].reverse().map((b) => (
                  <li key={b.sequence}>
                    <span className="monogram small">
                      {initials(b.nickname)}
                    </span>
                    <span>
                      <b>{b.nickname}</b>
                      <small>
                        Accepted #{b.sequence} ·{" "}
                        {new Date(b.at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </small>
                    </span>
                    <strong>{usd(b.amount)}</strong>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="empty-state">No accepted bids for this lot.</p>
            ))}
          {panel === "rules" && <Rules settings={s.settings} />}
          {panel === "leave" && (
            <>
              <p className="body-copy">
                {s.phase === "lobby" || s.phase === "finished"
                  ? "Your seat will be released. Saved match results stay in your history."
                  : "Your accepted bids remain binding. The auction continues and any winning purchase will still settle. Leaving does not restore spent match cash."}
              </p>
              <div className="dialog-actions">
                <button
                  className="button secondary"
                  onClick={() => setPanel(null)}
                >
                  Keep my seat
                </button>
                <button className="button primary" onClick={leave}>
                  Leave room
                </button>
              </div>
            </>
          )}
        </Modal>
      )}
    </>
  );
}
function Rules({ settings }: { settings: RoomSettings }) {
  return (
    <div className="rules-content">
      <section>
        <span>01</span>
        <div>
          <h3>Start on equal footing</h3>
          <p>
            Every collector receives {usd(settings.budget)} in fictional match
            cash. Your career bankroll is separate.
          </p>
        </div>
      </section>
      <section>
        <span>02</span>
        <div>
          <h3>Buy with a reason</h3>
          <p>
            Review references, condition and included accessories. Use two
            private inspections per match for additional truthful facts. Final
            appraisals reflect the asset’s actual condition.
          </p>
        </div>
      </section>
      <section>
        <span>03</span>
        <div>
          <h3>Bid within your cash</h3>
          <p>
            Raise at least $25. The server accepts bids in order, rejects
            overspending, and deducts the winner’s cash once. Late bids add five
            seconds, at most three times.
          </p>
        </div>
      </section>
      <section>
        <span>04</span>
        <div>
          <h3>Finish with the most wealth</h3>
          <p>
            After {settings.lots} lots, net worth is remaining cash plus the
            appraised value of held items. Profit is final wealth minus starting
            cash. Between selected lots, optional dealer offers let you trade
            value for liquidity.
          </p>
        </div>
      </section>
      <p className="fine-print">
        No real money, purchases, withdrawals, prizes or paid top-ups. Private
        and practice matches never award ranked progression.
      </p>
    </div>
  );
}
