export type Phase = "lobby" | "preview" | "auction" | "sold" | "finished";
export type Tier = "starter" | "collector" | "high-roller";
export interface Profile {
  id: string;
  nickname: string;
  bankroll: number;
  rating: number;
  wins: number;
  matches: number;
  totalProfit: number;
  biggestFlip: number;
  recoveryAt?: string | null;
}
export interface RoomSettings {
  maxPlayers: number;
  budget: number;
  lots: number;
  visibility: "private" | "public";
  bots: boolean;
  previewSeconds: number;
  auctionSeconds: number;
  resultSeconds: number;
}
export const defaultSettings: RoomSettings = {
  maxPlayers: 6,
  budget: 5000,
  lots: 8,
  visibility: "private",
  bots: false,
  previewSeconds: 10,
  auctionSeconds: 30,
  resultSeconds: 3,
};
export interface PriceSource {
  url: string;
  label: string;
  kind:
    "completed-sale" | "asking-price" | "retail-reference" | "curated-estimate";
  price?: number;
  observedAt: string;
  note: string;
}
export interface ProductImage {
  src: string;
  sourceUrl: string;
  credit: string;
  license: string;
  alt: string;
}
export interface PublicItem {
  id: string;
  brand: string;
  model: string;
  year: string;
  category: string;
  description: string;
  condition: string;
  completeness: string;
  authenticity: string;
  rarity: string;
  referenceValue: number;
  estimate: [number, number];
  sources: PriceSource[];
  pricingStatus: string;
  observedAt: string;
  images: ProductImage[];
  /** Public lot attributes only. Hidden test and maintenance results stay server-side. */
  lot?: {
    instanceId: string;
    catalogId: string;
    grade: string;
    packaging: string;
    storage: string;
    documentation: string;
    dropTier: "Everyday" | "Uncommon" | "Rare" | "Grail";
  };
}
export interface Appraisal {
  value: number;
  reference: number;
  factors: { label: string; multiplier: number; reason: string }[];
  inspection: string;
}
export interface Asset {
  item: PublicItem;
  appraisal: Appraisal;
}
export interface Purchase {
  id: string;
  item: PublicItem;
  paid: number;
  soldFor?: number;
  appraisal?: Appraisal;
}
export interface Participant {
  id: string;
  nickname: string;
  cash: number;
  ready: boolean;
  connected: boolean;
  bot: boolean;
  inspectionsLeft: number;
  purchases: Purchase[];
}
export interface Bid {
  sequence: number;
  playerId: string;
  nickname: string;
  amount: number;
  at: number;
}
export interface Standing {
  id: string;
  nickname: string;
  cash: number;
  collectionValue: number;
  netWorth: number;
  profit: number;
  returnPercent: number;
  purchases: Purchase[];
}
export interface DealerOffer {
  purchaseId: string;
  name: string;
  amount: number;
  expiresAt: number;
}
export interface Inspection {
  itemId: string;
  fact: string;
  range: [number, number];
  certainty: string;
}
export interface MarketSnapshot {
  roomId: string;
  matchId: string;
  hostId: string;
  mode: "practice" | "private" | "ranked";
  settings: RoomSettings;
  phase: Phase;
  round: number;
  players: Participant[];
  item: PublicItem | null;
  bid: Bid | null;
  bids: Bid[];
  closesAt: number;
  serverNow: number;
  extensions: number;
  maxExtensions: number;
  standings: Standing[];
  message: string;
  persistence: "pending" | "saved" | "unranked" | "failed";
}
export interface PrivateState {
  inspection: Inspection | null;
  offer: DealerOffer | null;
}
export type MarketCommand =
  | { type: "ready"; ready: boolean }
  | { type: "start" }
  | { type: "bid"; amount: number; requestId: string; round: number }
  | { type: "inspect" }
  | { type: "sell"; purchaseId: string }
  | { type: "rematch" };
export interface MarketAdapter {
  getServerNow?(): number;
  getSnapshot(): MarketSnapshot | null;
  getPrivate(): PrivateState;
  subscribe(fn: () => void): () => void;
  send(command: MarketCommand): void;
  leave(): void;
  readonly playerId: string;
  readonly status: string;
  readonly error: string | null;
}
export interface MatchHistory {
  id: string;
  at: string;
  mode: string;
  rank: number;
  profit: number;
  netWorth: number;
  budget: number;
  standings: Standing[];
}
