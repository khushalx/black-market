"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  Globe2,
  Grid3X3,
  History,
  KeyRound,
  CircleHelp,
  WifiOff,
  X,
} from "lucide-react";
import {
  api,
  cancelQueue,
  connectRoom,
  joinQueue,
  resumeRoom,
  startPractice,
} from "../client/market-client";
import {
  defaultSettings,
  type MarketAdapter,
  type MatchHistory,
  type Profile,
  type RoomSettings,
} from "../shared/market";
import {
  CopyButton,
  ItemPhoto,
  Modal,
  ResultsBreakdown,
  initials,
  signed,
  usd,
} from "./market-components/ui";
import { RoomView } from "./market-components/room-view";
import { CatalogView } from "./market-components/catalog-view";
import { catalog } from "../catalog";
const homeObjects = ["fujifilm-x100", "nintendo-gameboy", "casio-f91w"].map(
  (id) => catalog.find((item) => item.id === id)!,
);

type Panel =
  | "create"
  | "join"
  | "profile"
  | "history"
  | "recover"
  | "recovery-code"
  | "about"
  | "catalog"
  | null;
type Queue = {
  status: string;
  roomId?: string;
  tier?: string;
  waitSeconds?: number;
};
export default function Home() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [nickname, setNickname] = useState("");
  const [adapter, setAdapter] = useState<MarketAdapter | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [service, setService] = useState<
    "checking" | "available" | "unavailable"
  >("checking");
  const [settings, setSettings] = useState<RoomSettings>(defaultSettings);
  const [code, setCode] = useState("");
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [recoveryInput, setRecoveryInput] = useState("");
  const [queue, setQueue] = useState<Queue | null>(null);
  const [history, setHistory] = useState<MatchHistory[]>([]);
  const [openRooms, setOpenRooms] = useState<
    | { roomId: string; players: number; maxPlayers: number; budget: number }[]
    | null
  >(null);
  const [selectedHistory, setSelectedHistory] = useState<MatchHistory | null>(
    null,
  );
  const queueConnecting = useRef(false);
  const activeAdapter = useRef<MarketAdapter | null>(null);
  useEffect(() => {
    activeAdapter.current = adapter;
  }, [adapter]);
  useEffect(() => {
    let active = true;
    void api<Profile>("me")
      .then(async (p) => {
        if (!active) return;
        setProfile(p);
        setNickname(p.nickname);
        setService("available");
        const room = await resumeRoom().catch(() => null);
        if (!active) {
          room?.leave();
          return;
        }
        if (room) setAdapter(room);
      })
      .catch((e: Error) => {
        if (!active) return;
        setService(
          /nickname|guest|401|session|account/i.test(e.message)
            ? "available"
            : "unavailable",
        );
      });
    void Promise.resolve().then(() => {
      if (!active) return;
      const roomCode = new URLSearchParams(window.location.search).get("room");
      if (roomCode) {
        setCode(roomCode.slice(0, 12).toUpperCase());
        setPanel("join");
      }
    });
    return () => {
      active = false;
    };
  }, []);
  const refreshProfile = useCallback(() => {
    void api<Profile>("me")
      .then((p) => {
        setProfile(p);
        setNickname(p.nickname);
      })
      .catch(() => {});
  }, []);
  const ensureIdentity = async () => {
    if (profile) return profile;
    if (nickname.trim().length < 2)
      throw new Error("Choose a nickname of at least two characters.");
    const result = await api<{ profile: Profile; recoveryCode: string | null }>(
      "guest",
      { nickname: nickname.trim() },
    );
    setProfile(result.profile);
    setNickname(result.profile.nickname);
    setService("available");
    if (result.recoveryCode) setRecoveryCode(result.recoveryCode);
    return result.profile;
  };
  const act = async (fn: () => Promise<void>) => {
    setError("");
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };
  const leave = useCallback(() => {
    activeAdapter.current?.leave();
    setAdapter(null);
    setError("");
    refreshProfile();
  }, [refreshProfile]);
  const openRoom = (action: "create" | "join") =>
    act(async () => {
      await ensureIdentity();
      const room = await connectRoom(
        action,
        action === "create"
          ? { settings }
          : { roomId: code.trim().toUpperCase() },
      );
      setAdapter(room);
      setPanel(null);
      setQueue(null);
    });
  const practice = () => {
    setError("");
    try {
      const room = startPractice(
        nickname.trim() || profile?.nickname || "Collector",
        { ...defaultSettings, visibility: "private", bots: true },
      );
      setAdapter(room);
      setPanel(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Practice could not start.");
    }
  };
  const startQueue = () =>
    act(async () => {
      await ensureIdentity();
      queueConnecting.current = false;
      setQueue(await joinQueue());
    });
  const isQueueing = queue !== null;
  useEffect(() => {
    if (!isQueueing) return;
    let active = true;
    const timer = setInterval(() => {
      if (queueConnecting.current) return;
      void joinQueue()
        .then(async (state) => {
          if (!active) return;
          setQueue(state);
          if (state.roomId) {
            queueConnecting.current = true;
            try {
              const room = await connectRoom("join", { roomId: state.roomId });
              if (!active) {
                room.leave();
                return;
              }
              setAdapter(room);
              setQueue(null);
            } catch (e) {
              if (active) {
                setError(
                  e instanceof Error
                    ? e.message
                    : "Could not claim matched seat.",
                );
                setQueue(null);
              }
            } finally {
              queueConnecting.current = false;
            }
          }
        })
        .catch((e: Error) => {
          if (active) {
            setError(e.message);
            setQueue(null);
          }
        });
    }, 1000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [isQueueing]);
  const openHistory = () =>
    act(async () => {
      setHistory(await api<MatchHistory[]>("history"));
      setSelectedHistory(null);
      setPanel("history");
    });
  const showRecovery = recoveryCode && !panel;
  return (
    <div className={"market-app " + (adapter ? "in-room" : "at-home")}>
      <header className="app-header">
        <button
          className="brand"
          onClick={() => {
            if (!adapter) setPanel(null);
          }}
          aria-label="Black Market"
        >
          <span>{adapter ? "BLACK MARKET" : "BM."}</span>
        </button>
        <nav aria-label="Main navigation">
          <button className="header-nav" aria-label="Catalog" onClick={() => setPanel("catalog")}><Grid3X3 size={17} /><span>Catalog</span></button>
          {profile && (
            <>
              <button
                className="header-nav"
                aria-label="History"
                onClick={() => void openHistory()}
              >
                <History size={17} />
                <span>History</span>
              </button>
              <button
                className="profile-button"
                onClick={() => setPanel("profile")}
              >
                <span className="monogram small">
                  {initials(profile.nickname)}
                </span>
                <span>{profile.nickname}</span>
              </button>
            </>
          )}
          <button
            className="icon-button help-button"
            aria-label="About Black Market"
            onClick={() => setPanel("about")}
          >
            <CircleHelp size={20} />
          </button>
        </nav>
      </header>
      {adapter ? (
        <RoomView adapter={adapter} leave={leave} finished={refreshProfile} />
      ) : (
        <main className="hub-page">
          <div className="hub-heading">
            <h1 aria-label="BLACK MARKET">
              BLACK<span>MARKET</span>
            </h1>
            <p>Real objects. Fictional dollars.</p>
          </div>
          <div className="hub-play-layout">
            <section className="home-play" aria-label="Play Black Market">
              <div className="alias-entry">
                <label htmlFor="nickname">
                  {profile ? "Playing as" : "Nickname"}
                </label>
                {profile ? (
                  <strong>{profile.nickname}</strong>
                ) : (
                  <input
                    id="nickname"
                    autoComplete="nickname"
                    maxLength={24}
                    placeholder="Your name"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                  />
                )}
              </div>
              {error && (
                <p className="status-banner error" role="alert">
                  {error}
                  <button
                    className="icon-button"
                    aria-label="Dismiss error"
                    onClick={() => setError("")}
                  >
                    <X size={16} />
                  </button>
                </p>
              )}
              {service === "unavailable" && (
                <p className="status-banner warning">
                  <WifiOff size={18} />
                  <span>Online is unavailable. Practice is ready.</span>
                </p>
              )}
              {queue ? (
                <div className="queue-panel">
                  <span className="eyebrow">Finding players</span>
                  <h2>
                    In the queue<span className="queue-pulse">.</span>
                  </h2>
                  <div className="queue-details">
                    <strong>
                      {queue.waitSeconds ?? 0}
                      <small>s</small>
                    </strong>
                    <span>
                      {queue.tier?.replaceAll("-", " ")}
                      <br />
                      3–6 players · 2 after a short wait
                    </span>
                  </div>
                  <button
                    className="button secondary full"
                    onClick={() =>
                      void act(async () => {
                        await cancelQueue();
                        setQueue(null);
                      })
                    }
                  >
                    Cancel <X size={17} />
                  </button>
                </div>
              ) : (
                <div className="home-actions">
                  <button
                    className="button primary full home-primary"
                    disabled={busy || service === "checking"}
                    onClick={() => void startQueue()}
                  >
                    Play online <ArrowUpRight size={25} />
                  </button>
                  <div className="home-secondary">
                    <button
                      className="button secondary"
                      disabled={busy}
                      onClick={() => {
                        setSettings(defaultSettings);
                        setPanel("create");
                      }}
                    >
                      Private room
                    </button>
                    <button
                      className="button secondary"
                      disabled={busy}
                      onClick={practice}
                    >
                      Practice
                    </button>
                  </div>
                  <div className="home-links">
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() => setPanel("join")}
                    >
                      Join with a code <ArrowRight size={14} />
                    </button>
                    {!profile && (
                      <button
                        className="text-button"
                        onClick={() => setPanel("recover")}
                      >
                        Recover account
                      </button>
                    )}
                  </div>
                  <p className="home-match-facts">
                    8 lots <span>·</span>{" "}
                    {profile && profile.bankroll >= 25000
                      ? "$50,000"
                      : profile && profile.bankroll >= 7500
                        ? "$15,000"
                        : "$5,000"}{" "}
                    each
                  </p>
                </div>
              )}
            </section>
            <div className="home-objects" aria-label="Objects from the catalog">
              {homeObjects.map((item, i) => (
                <figure className={"home-object object-" + i} key={item.id}>
                  <ItemPhoto item={item} />
                  <figcaption>
                    <span>0{i + 1}</span>
                    <span>
                      {item.brand}
                      <b>{item.model}</b>
                    </span>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </main>
      )}
      {!adapter && (
        <footer className="app-footer">
          <span>Fictional dollars. No real money.</span>
          <button className="text-button" onClick={() => setPanel("about")}>
            How to play <ArrowUpRight size={14} />
          </button>
        </footer>
      )}
      {(panel || showRecovery) && (
        <Modal
          title={
            showRecovery || panel === "recovery-code"
              ? "Keep your recovery key."
              : {
                  create: "Private room",
                  join: "Join a room",
                  profile: "Your profile",
                  history: selectedHistory ? "Match receipt" : "Match history",
                  recover: "Recover account",
                  about: "How to play",
                  catalog: "The catalog",
                }[panel as Exclude<Panel, "recovery-code" | null>]
          }
          subtitle={
            showRecovery || panel === "recovery-code"
              ? "Save this somewhere private"
              : undefined
          }
          close={() => {
            if (showRecovery || panel === "recovery-code")
              setRecoveryCode(null);
            setPanel(null);
          }}
          wide={panel === "catalog" || (panel === "history" && !!selectedHistory)}
        >
          {panel === "catalog" && <CatalogView />}
          {(showRecovery || panel === "recovery-code") && (
            <>
              <p className="body-copy">
                This key restores your guest identity and saved career on
                another browser. We only show it now. Anyone with the key can
                recover your account.
              </p>
              <div className="recovery-key">{recoveryCode}</div>
              <CopyButton
                value={recoveryCode ?? ""}
                label="Copy recovery key"
              />
              <p className="fine-print">
                Recovery rotates your key and signs out older sessions. Store
                the new key after each recovery.
              </p>
              <button
                className="button primary full"
                onClick={() => {
                  setRecoveryCode(null);
                  setPanel(null);
                }}
              >
                I’ve saved my key <Check size={17} />
              </button>
            </>
          )}
          {panel === "create" && (
            <form
              className="settings-form"
              onSubmit={(e) => {
                e.preventDefault();
                void openRoom("create");
              }}
            >
              <p className="body-copy">Equal starting cash. Unranked.</p>
              {!profile && (
                <label>
                  Your nickname
                  <input
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    minLength={2}
                    maxLength={24}
                    required
                    placeholder="Name at the table"
                  />
                </label>
              )}
              <div className="field-pair">
                <label>
                  Players
                  <select
                    value={settings.maxPlayers}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        maxPlayers: Number(e.target.value),
                      })
                    }
                  >
                    {[2, 3, 4, 5, 6].map((v) => (
                      <option key={v} value={v}>
                        {v} players
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Match cash
                  <select
                    value={settings.budget}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        budget: Number(e.target.value),
                      })
                    }
                  >
                    {[5000, 15000, 50000].map((v) => (
                      <option key={v} value={v}>
                        {usd(v)} each
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="field-pair">
                <label>
                  Lots
                  <select
                    value={settings.lots}
                    onChange={(e) =>
                      setSettings({ ...settings, lots: Number(e.target.value) })
                    }
                  >
                    {[4, 8, 12].map((v) => (
                      <option key={v} value={v}>
                        {v} lots
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Visibility
                  <select
                    value={settings.visibility}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        visibility: e.target
                          .value as RoomSettings["visibility"],
                      })
                    }
                  >
                    <option value="private">Private · invite only</option>
                    <option value="public">Public · discoverable</option>
                  </select>
                </label>
              </div>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={settings.bots}
                  onChange={(e) =>
                    setSettings({ ...settings, bots: e.target.checked })
                  }
                />
                <span>
                  <b>Fill empty seats with bots</b>
                  <small>Simulated opponents. No ranked progression.</small>
                </span>
              </label>
              <details className="timing-settings">
                <summary>
                  Timing options <ChevronDown size={16} />
                </summary>
                <div className="timing-fields">
                  <label>
                    Preview (seconds)
                    <input
                      type="number"
                      min="3"
                      max="30"
                      value={settings.previewSeconds}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          previewSeconds: Number(e.target.value),
                        })
                      }
                    />
                  </label>
                  <label>
                    Auction (seconds)
                    <input
                      type="number"
                      min="5"
                      max="90"
                      value={settings.auctionSeconds}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          auctionSeconds: Number(e.target.value),
                        })
                      }
                    />
                  </label>
                  <label>
                    Result (seconds)
                    <input
                      type="number"
                      min="2"
                      max="15"
                      value={settings.resultSeconds}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          resultSeconds: Number(e.target.value),
                        })
                      }
                    />
                  </label>
                </div>
              </details>
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <button className="button primary full" disabled={busy}>
                {busy ? "Creating room…" : "Create room"}
                <ArrowRight size={18} />
              </button>
            </form>
          )}
          {panel === "join" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void openRoom("join");
              }}
              className="settings-form"
            >
              <p className="body-copy">Enter your room’s invite code.</p>
              <label>
                Room code
                <input
                  className="code-input"
                  maxLength={12}
                  placeholder="A1B2C3"
                  value={code}
                  onChange={(e) =>
                    setCode(e.target.value.toUpperCase().replace(/\s/g, ""))
                  }
                  autoComplete="off"
                />
              </label>
              {!profile && (
                <label>
                  Your nickname
                  <input
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    minLength={2}
                    maxLength={24}
                    placeholder="Name at the table"
                  />
                </label>
              )}
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <button
                className="button primary full"
                disabled={busy || code.trim().length < 4}
              >
                {busy ? "Joining room…" : "Join room"}
                <ArrowRight size={18} />
              </button>
            </form>
          )}
          {panel === "join" && (
            <section className="open-rooms">
              <button
                className="text-button"
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    await ensureIdentity();
                    setOpenRooms(
                      await api<
                        {
                          roomId: string;
                          players: number;
                          maxPlayers: number;
                          budget: number;
                        }[]
                      >("rooms"),
                    );
                  })
                }
              >
                <Globe2 size={16} />
                Browse public friends rooms
              </button>
              {openRooms &&
                (openRooms.length ? (
                  openRooms.map((room) => (
                    <button
                      className="open-room-row"
                      key={room.roomId}
                      disabled={busy}
                      onClick={() =>
                        void act(async () => {
                          await ensureIdentity();
                          const next = await connectRoom("join", {
                            roomId: room.roomId,
                          });
                          setAdapter(next);
                          setPanel(null);
                        })
                      }
                    >
                      <span>
                        <b>{room.roomId}</b>
                        <small>
                          {room.players}/{room.maxPlayers} collectors ·{" "}
                          {usd(room.budget)} each
                        </small>
                      </span>
                      <span>
                        Join <ArrowRight size={14} />
                      </span>
                    </button>
                  ))
                ) : (
                  <p className="fine-print">
                    No public friends rooms are waiting right now. Create one,
                    or use ranked matchmaking.
                  </p>
                ))}
            </section>
          )}
          {panel === "profile" && profile && (
            <>
              <div className="profile-summary">
                <span className="monogram large">
                  {initials(profile.nickname)}
                </span>
                <div>
                  <h3>{profile.nickname}</h3>
                  <span>Persistent guest identity</span>
                </div>
              </div>
              <div className="profile-stat-grid">
                <div>
                  <span>Career bankroll</span>
                  <b>{usd(profile.bankroll)}</b>
                </div>
                <div>
                  <span>Skill rating</span>
                  <b>{profile.rating}</b>
                </div>
                <div>
                  <span>Ranked matches</span>
                  <b>{profile.matches}</b>
                </div>
                <div>
                  <span>Wins</span>
                  <b>{profile.wins}</b>
                </div>
                <div>
                  <span>Average match profit</span>
                  <b>
                    {usd(
                      profile.matches
                        ? Math.round(profile.totalProfit / profile.matches)
                        : 0,
                    )}
                  </b>
                </div>
                <div>
                  <span>Best successful flip</span>
                  <b>{usd(profile.biggestFlip)}</b>
                </div>
              </div>
              <p className="fine-print">
                Career bankroll controls matchmaking tier. Match cash is fixed
                and equal for everyone in a room. Practice and friends rooms do
                not increase ranked statistics.
              </p>
              <form
                className="settings-form profile-rename"
                onSubmit={(e) => {
                  e.preventDefault();
                  void act(async () => {
                    const p = await api<Profile>("profile", { nickname });
                    setProfile(p);
                  });
                }}
              >
                <label>
                  Nickname
                  <input
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    maxLength={24}
                    minLength={2}
                  />
                </label>
                <button
                  className="button secondary"
                  disabled={busy || !!adapter}
                >
                  Save nickname
                </button>
              </form>
              {profile.bankroll <= 3500 && (
                <button
                  className="button secondary full"
                  disabled={busy}
                  onClick={() =>
                    void act(async () =>
                      setProfile(await api<Profile>("bankroll/recover", {})),
                    )
                  }
                >
                  Free bankroll recovery to $5,000
                </button>
              )}
              <p className="fine-print">
                Recovery is free below $3,500, at most once every 24 hours.
                Career bankroll cannot fall below $3,000.
              </p>
              <p className="fine-print">
                Keep your private recovery key before signing out. It is
                required to restore this guest identity.
              </p>
              <button
                className="button subtle full"
                disabled={busy || !!adapter}
                onClick={() =>
                  void act(async () => {
                    await api("logout", {});
                    setProfile(null);
                    setNickname("");
                    setPanel(null);
                  })
                }
              >
                Sign out
              </button>
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
            </>
          )}
          {panel === "history" &&
            (selectedHistory ? (
              <>
                <button
                  className="text-button back-link"
                  onClick={() => setSelectedHistory(null)}
                >
                  ← All matches
                </button>
                <p className="body-copy">
                  {new Date(selectedHistory.at).toLocaleString()} ·{" "}
                  {selectedHistory.mode} · {usd(selectedHistory.budget)}{" "}
                  starting cash
                </p>
                <ResultsBreakdown standings={selectedHistory.standings} />
              </>
            ) : (
              <div className="history-list">
                {history.length ? (
                  history.map((match) => (
                    <button
                      className="history-row"
                      key={match.id}
                      onClick={() => setSelectedHistory(match)}
                    >
                      <span className="history-rank">#{match.rank}</span>
                      <span>
                        <b>
                          {match.mode === "ranked"
                            ? "Ranked match"
                            : "Friends match"}
                        </b>
                        <small>
                          {new Date(match.at).toLocaleDateString()} ·{" "}
                          {usd(match.netWorth)} final wealth
                        </small>
                      </span>
                      <strong
                        className={match.profit >= 0 ? "positive" : "negative"}
                      >
                        {signed(match.profit)}
                      </strong>
                      <ArrowRight size={16} />
                    </button>
                  ))
                ) : (
                  <div className="empty-state">
                    <History size={30} />
                    <h3>No matches yet.</h3>
                    <p>Online results appear here. Practice is not saved.</p>
                  </div>
                )}
              </div>
            ))}
          {panel === "recover" && (
            <form
              className="settings-form"
              onSubmit={(e) => {
                e.preventDefault();
                void act(async () => {
                  const result = await api<{
                    profile: Profile;
                    recoveryCode: string;
                  }>("recover", { recoveryCode: recoveryInput.trim() });
                  setProfile(result.profile);
                  setNickname(result.profile.nickname);
                  setRecoveryCode(result.recoveryCode);
                  setRecoveryInput("");
                  setPanel(null);
                  setService("available");
                });
              }}
            >
              <p className="body-copy">
                Enter the private key saved when your guest identity was
                created. Successful recovery rotates the key and replaces older
                sessions.
              </p>
              <label>
                Recovery key
                <textarea
                  rows={3}
                  value={recoveryInput}
                  onChange={(e) => setRecoveryInput(e.target.value)}
                  placeholder="Paste your recovery key"
                  autoComplete="off"
                />
              </label>
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <button
                className="button primary full"
                disabled={busy || recoveryInput.trim().length < 16}
              >
                Recover account <KeyRound size={18} />
              </button>
            </form>
          )}
          {panel === "about" && (
            <div className="about-content">
              <p className="body-copy">
                Buy real objects with fictional dollars. Everyone starts with
                equal cash.
              </p>
              <h3>Bid.</h3>
              <p>
                Check condition and references. You have two private inspections
                per match. Bids must rise by at least $25. Late bids add five
                seconds, up to three times.
              </p>
              <h3>Finish first.</h3>
              <p>
                Your final net worth is cash plus the appraised value of your
                collection. The highest total wins.
              </p>
              <h3>Your career.</h3>
              <p>
                Ranked matches update your career bankroll and skill rating.
                Private rooms and practice do not. Your recovery key restores
                your saved identity.
              </p>
              <p className="fine-print">
                All dollars are fictional. No payments, withdrawals, cash prizes
                or paid top-ups. Reference prices and final game appraisals are
                separate; each lot includes sources and photo credits.
              </p>
              <details className="home-credits">
                <summary>Homepage photography</summary>
                {homeObjects.map((item) => (
                  <div className="source-card" key={item.id}>
                    <p>{item.images[0].credit}</p>
                    <span>{item.images[0].license}</span>
                    <a
                      href={item.images[0].sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Original photograph <ArrowUpRight size={14} />
                    </a>
                  </div>
                ))}
              </details>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
