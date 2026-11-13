export type Suit = "SPADES" | "HEARTS" | "DIAMONDS" | "CLUBS";
export type Pid = 0 | 1 | 2 | 3;
export type Phase = "loading" | "player" | "suit" | "bots" | "between" | "match" | "error";
export type Place = "south" | "west" | "north" | "east";

export interface Card {
  code: string;
  image: string;
  suit: Suit;
  value: string;
}

export interface LogEntry {
  id: number;
  text: string;
}

export interface Seat {
  id: Pid;
  name: string;
  place: Place;
  axis: string;
  bot: boolean;
}

export const TARGET = 100;
export const STORAGE_KEY = "oito-maluco-v1";
export const BACK_IMAGE = "https://deckofcardsapi.com/static/img/back.png";

export const SEATS: readonly Seat[] = [
  { id: 0, name: "Você", place: "south", axis: "Sul", bot: false },
  { id: 1, name: "Bia", place: "west", axis: "Oeste", bot: true },
  { id: 2, name: "Caio", place: "north", axis: "Norte", bot: true },
  { id: 3, name: "Duda", place: "east", axis: "Leste", bot: true },
];

export const SUIT_PT: Record<Suit, string> = {
  SPADES: "Espadas",
  HEARTS: "Copas",
  DIAMONDS: "Ouros",
  CLUBS: "Paus",
};

export const SUIT_SYM: Record<Suit, string> = {
  SPADES: "♠",
  HEARTS: "♥",
  DIAMONDS: "♦",
  CLUBS: "♣",
};

const SUITS: Suit[] = ["SPADES", "HEARTS", "DIAMONDS", "CLUBS"];
const SUIT_ORDER: Suit[] = ["SPADES", "HEARTS", "CLUBS", "DIAMONDS"];
const RANK_ORDER = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "0", "J", "Q", "K"];

const RANK_NAME: Record<string, string> = {
  A: "Ás",
  K: "Rei",
  Q: "Dama",
  J: "Valete",
  "0": "10",
};

export interface State {
  deckId: string;
  remaining: number;
  hands: [Card[], Card[], Card[], Card[]];
  discard: Card[];
  currentSuit: Suit;
  turn: Pid;
  phase: Phase;
  scores: [number, number, number, number];
  round: number;
  pendingDraw: number;
  passes: number;
  history: LogEntry[];
  logSeq: number;
  message: string;
  selected: string | null;
  roundWinner: Pid | null;
  matchWinner: Pid | null;
  callout: string | null;
}

export function emptyState(): State {
  return {
    deckId: "",
    remaining: 0,
    hands: [[], [], [], []],
    discard: [],
    currentSuit: "SPADES",
    turn: 0,
    phase: "loading",
    scores: [0, 0, 0, 0],
    round: 1,
    pendingDraw: 0,
    passes: 0,
    history: [],
    logSeq: 0,
    message: "Embaralhando o baralho…",
    selected: null,
    roundWinner: null,
    matchWinner: null,
    callout: null,
  };
}

export function isPid(n: number): n is Pid {
  return n === 0 || n === 1 || n === 2 || n === 3;
}

export function nextPid(p: Pid, step = 1): Pid {
  return ((p + step) % 4) as Pid;
}

export function topCard(state: State): Card | null {
  return state.discard[state.discard.length - 1] ?? null;
}

export function cardPoints(card: Card): number {
  const r = card.code[0];
  if (r === "8") return 50;
  if (r === "K" || r === "Q" || r === "J" || r === "0") return 10;
  if (r === "A") return 1;
  const n = Number(r);
  return Number.isFinite(n) ? n : 0;
}

export function handPoints(cards: Card[]): number {
  return cards.reduce((sum, card) => sum + cardPoints(card), 0);
}

export function cardName(card: Card): string {
  const rank = RANK_NAME[card.code[0]] ?? card.code[0];
  return `${rank} de ${SUIT_PT[card.suit]}`;
}

export function rankLabel(card: Card): string {
  return RANK_NAME[card.code[0]] ?? card.code[0];
}

export function isRed(suit: Suit): boolean {
  return suit === "HEARTS" || suit === "DIAMONDS";
}

export function sortHand(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => {
    const ds = SUIT_ORDER.indexOf(a.suit) - SUIT_ORDER.indexOf(b.suit);
    if (ds) return ds;
    return RANK_ORDER.indexOf(a.code[0]) - RANK_ORDER.indexOf(b.code[0]);
  });
}

export function isLegal(card: Card, state: State): boolean {
  const top = topCard(state);
  if (!top) return true;
  if (state.pendingDraw > 0) return card.code[0] === "2";
  if (card.code[0] === "8") return true;
  if (card.code[0] === top.code[0]) return true;
  return card.suit === state.currentSuit;
}

export function legalCodes(state: State, player: Pid = 0): string[] {
  return state.hands[player].filter((card) => isLegal(card, state)).map((card) => card.code);
}

export function yourTurnMessage(state: State): string {
  if (state.pendingDraw > 0) {
    const hasTwo = state.hands[0].some((card) => card.code[0] === "2");
    return hasTwo
      ? `Compre ${state.pendingDraw} ou rebata com um 2.`
      : `Sem 2 na mão: compre ${state.pendingDraw} cartas.`;
  }
  if (!legalCodes(state, 0).length) return "Nenhuma carta serve. Compre uma.";
  const top = topCard(state);
  const rank = top ? rankLabel(top) : "";
  return `Combine ${SUIT_SYM[state.currentSuit]} ${SUIT_PT[state.currentSuit]} ou outro ${rank}. O 8 vale qualquer naipe.`;
}

function pushLog(state: State, text: string): State {
  const id = state.logSeq + 1;
  const history = [...state.history, { id, text }];
  if (history.length > 80) history.splice(0, history.length - 80);
  return { ...state, logSeq: id, history };
}

function cloneHands(hands: State["hands"]): State["hands"] {
  return hands.map((hand) => hand.slice()) as State["hands"];
}

export function createDeal(opts: {
  deckId: string;
  cards: Card[];
  remaining: number;
  scores: [number, number, number, number];
  round: number;
}): State {
  if (opts.cards.length < 29) throw new Error("O baralho não entregou cartas suficientes.");
  const hands: State["hands"] = [[], [], [], []];
  for (let i = 0; i < 28; i++) hands[i % 4].push(opts.cards[i]);
  for (let i = 0; i < 4; i++) hands[i] = sortHand(hands[i]);
  const top = opts.cards[28];
  let state: State = {
    ...emptyState(),
    deckId: opts.deckId,
    remaining: opts.remaining,
    hands,
    discard: [top],
    currentSuit: top.suit,
    turn: 0,
    phase: "player",
    scores: [...opts.scores],
    round: opts.round,
    message: "",
  };
  state = pushLog(state, `Rodada ${opts.round}. Aberta com ${cardName(top)}.`);
  return { ...state, message: yourTurnMessage(state) };
}

export function applyPlay(state: State, player: Pid, code: string, chosen?: Suit): State {
  const card = state.hands[player].find((item) => item.code === code);
  if (!card || !isLegal(card, state)) return state;
  const hands = cloneHands(state.hands);
  hands[player] = hands[player].filter((item) => item.code !== code);
  const discard = [...state.discard, card];
  let pendingDraw = state.pendingDraw;
  let currentSuit = card.suit;
  let turn = nextPid(player);
  let extra = "";
  let callout: string | null = null;
  const rank = card.code[0];

  if (rank === "8") {
    currentSuit = chosen || card.suit;
    pendingDraw = 0;
    extra = ` e pediu ${SUIT_PT[currentSuit]}`;
    callout = SUIT_SYM[currentSuit];
  } else if (rank === "A") {
    const skipped = nextPid(player);
    turn = nextPid(player, 2);
    extra = ` — ${SEATS[skipped].name} passa`;
    callout = "PULA";
  } else if (rank === "2") {
    pendingDraw += 2;
    extra = ` — ${SEATS[turn].name} compra ${pendingDraw}`;
    callout = `+${pendingDraw}`;
  }

  const wentOut = hands[player].length === 0;
  let scores = state.scores;
  let phase: Phase = turn === 0 ? "player" : "bots";
  let roundWinner: Pid | null = null;
  let matchWinner: Pid | null = null;
  if (wentOut) {
    const gained = hands.reduce((sum, hand, i) => (i === player ? sum : sum + handPoints(hand)), 0);
    scores = scores.map((score, i) => (i === player ? score + gained : score)) as State["scores"];
    roundWinner = player;
    matchWinner = scores[player] >= TARGET ? player : null;
    phase = matchWinner !== null ? "match" : "between";
    turn = player;
    pendingDraw = 0;
  }

  let next: State = {
    ...state,
    hands,
    discard,
    currentSuit,
    pendingDraw,
    turn,
    phase,
    scores,
    roundWinner,
    matchWinner,
    selected: null,
    passes: 0,
    callout,
  };
  next = pushLog(next, `${SEATS[player].name} jogou ${cardName(card)}${extra}.`);
  if (wentOut) {
    const gained = scores[player] - state.scores[player];
    next = pushLog(next, `${SEATS[player].name} bateu e soma ${gained} pontos.`);
    next = {
      ...next,
      message: matchWinner !== null
        ? `${SEATS[player].name} chegou a ${scores[player]} e vence a partida.`
        : `${SEATS[player].name} bateu. +${gained} pontos.`,
    };
  } else if (turn === 0) {
    next = { ...next, message: yourTurnMessage(next) };
  } else {
    next = { ...next, message: `${SEATS[turn].name} pensa a jogada…` };
  }
  return next;
}

export function giveCards(state: State, player: Pid, cards: Card[], clearPending: boolean): State {
  if (!cards.length) return { ...state, pendingDraw: clearPending ? 0 : state.pendingDraw };
  const hands = cloneHands(state.hands);
  hands[player] = sortHand([...hands[player], ...cards]);
  const n = cards.length;
  const logged = pushLog(
    {
      ...state,
      hands,
      pendingDraw: clearPending ? 0 : state.pendingDraw,
      callout: n > 1 ? `+${n}` : null,
    },
    `${SEATS[player].name} comprou ${n} ${n === 1 ? "carta" : "cartas"}.`,
  );
  return logged;
}

export function passTurn(state: State): State {
  const passes = state.passes + 1;
  const stockDead = state.remaining <= 0 && state.discard.length <= 1;
  if (passes >= 4 && stockDead) return stalemate(pushLog(state, "Ninguém consegue jogar."));
  const turn = nextPid(state.turn);
  let next: State = {
    ...state,
    passes,
    turn,
    selected: null,
    phase: turn === 0 ? "player" : "bots",
    callout: null,
  };
  next = pushLog(next, `${SEATS[state.turn].name} passa a vez.`);
  next = {
    ...next,
    message: turn === 0 ? yourTurnMessage(next) : `${SEATS[turn].name} pensa a jogada…`,
  };
  return next;
}

function stalemate(state: State): State {
  const points = state.hands.map(handPoints);
  const min = Math.min(...points);
  const winners = points.flatMap((pts, i) => (pts === min ? [i] : []));
  if (winners.length !== 1 || !isPid(winners[0])) {
    return pushLog(
      {
        ...state,
        phase: "between",
        roundWinner: null,
        matchWinner: null,
        selected: null,
        turn: 0,
        message: "Rodada empatada. Ninguém pontua.",
      },
      "Empate: duas mãos com a mesma pontuação.",
    );
  }
  const winner = winners[0];
  const gained = points.reduce((sum, pts, i) => (i === winner ? sum : sum + pts), 0);
  const scores = state.scores.map((score, i) => (i === winner ? score + gained : score)) as State["scores"];
  const match = scores[winner] >= TARGET;
  return pushLog(
    {
      ...state,
      scores,
      phase: match ? "match" : "between",
      roundWinner: winner,
      matchWinner: match ? winner : null,
      selected: null,
      turn: winner,
      message: `${SEATS[winner].name} leva a rodada travada (+${gained}).`,
    },
    `${SEATS[winner].name} tinha a menor mão (${min} pts).`,
  );
}

export function bestSuit(cards: Card[]): Suit {
  const counts: Record<Suit, number> = { SPADES: 0, HEARTS: 0, DIAMONDS: 0, CLUBS: 0 };
  for (const card of cards) {
    if (card.code[0] === "8") continue;
    counts[card.suit] += 1;
  }
  let best: Suit = cards.find((card) => card.code[0] !== "8")?.suit ?? "SPADES";
  let n = -1;
  for (const suit of SUITS) {
    if (counts[suit] > n) {
      n = counts[suit];
      best = suit;
    }
  }
  return best;
}

export function botMove(state: State, player: Pid): { kind: "play"; code: string; suit?: Suit } | { kind: "draw" } {
  const hand = state.hands[player];
  const legal = hand.filter((card) => isLegal(card, state));
  if (!legal.length) return { kind: "draw" };
  if (state.pendingDraw > 0) return { kind: "play", code: legal[0].code };

  const eights = legal.filter((card) => card.code[0] === "8");
  const normal = legal.filter((card) => card.code[0] !== "8");
  if (hand.length === 1) {
    const only = normal[0] || eights[0];
    if (only.code[0] === "8") {
      return { kind: "play", code: only.code, suit: bestSuit(hand.filter((card) => card.code !== only.code)) };
    }
    return { kind: "play", code: only.code };
  }

  const nextCount = state.hands[nextPid(player)].length;
  if (nextCount <= 2) {
    const ace = normal.find((card) => card.code[0] === "A");
    if (ace) return { kind: "play", code: ace.code };
    const two = normal.find((card) => card.code[0] === "2");
    if (two && hand.length > 2) return { kind: "play", code: two.code };
  }

  const plain = normal.filter((card) => card.code[0] !== "A" && card.code[0] !== "2");
  const pool = plain.length ? plain : normal;
  if (pool.length) {
    const pick = [...pool].sort((a, b) => cardPoints(b) - cardPoints(a))[0];
    return { kind: "play", code: pick.code };
  }

  const eight = eights[0];
  return {
    kind: "play",
    code: eight.code,
    suit: bestSuit(hand.filter((card) => card.code !== eight.code)),
  };
}

export function canDraw(state: State): boolean {
  if (state.phase !== "player" || state.turn !== 0) return false;
  if (state.pendingDraw > 0) return true;
  return legalCodes(state, 0).length === 0;
}

export function canConfirm(state: State): boolean {
  if (state.phase === "between" || state.phase === "match") return true;
  if (state.phase !== "player" || !state.selected) return false;
  const card = state.hands[0].find((item) => item.code === state.selected);
  return !!card && isLegal(card, state);
}

export function confirmLabel(state: State): string {
  if (state.phase === "between") return "Próxima rodada";
  if (state.phase === "match") return "Nova partida";
  return "Confirmar Jogada";
}

export function drawLabel(state: State): string {
  if (state.pendingDraw > 1) return `Comprar ${state.pendingDraw}`;
  if (state.pendingDraw === 1) return "Comprar 1";
  return "Comprar";
}

export function turnLabel(state: State): string {
  if (state.phase === "loading") return "Embaralhando";
  if (state.phase === "error") return "Sem baralho";
  if (state.phase === "between") return "Fim da rodada";
  if (state.phase === "match") return "Partida encerrada";
  if (state.phase === "suit") return "Escolha o naipe";
  return state.turn === 0 ? "Sua vez" : `Vez de ${SEATS[state.turn].name}`;
}

function isSuit(value: unknown): value is Suit {
  return value === "SPADES" || value === "HEARTS" || value === "DIAMONDS" || value === "CLUBS";
}

function isCard(value: unknown): value is Card {
  if (!value || typeof value !== "object") return false;
  const card = value as Card;
  return typeof card.code === "string" && card.code.length >= 2 && isSuit(card.suit) && typeof card.image === "string";
}

export function saveState(state: State): void {
  try {
    const payload = {
      version: 1,
      ...state,
      selected: state.phase === "suit" ? state.selected : null,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* armazenamento cheio ou bloqueado */
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function loadState(): State | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<State> & { version?: number };
    if (data.version !== 1 || typeof data.deckId !== "string" || !data.deckId) return null;
    if (!Array.isArray(data.hands) || data.hands.length !== 4) return null;
    if (!data.hands.every((hand) => Array.isArray(hand) && hand.every(isCard))) return null;
    if (!Array.isArray(data.discard) || !data.discard.every(isCard)) return null;
    if (!isSuit(data.currentSuit) || !isPid(Number(data.turn))) return null;
    if (!Array.isArray(data.scores) || data.scores.length !== 4) return null;
    const phase = data.phase;
    const allowed: Phase[] = ["player", "suit", "bots", "between", "match"];
    if (!phase || !allowed.includes(phase)) return null;
    return {
      ...emptyState(),
      ...data,
      hands: data.hands.map((hand) => hand.slice()) as State["hands"],
      discard: data.discard.slice(),
      scores: data.scores.map((n) => Number(n) || 0) as State["scores"],
      history: Array.isArray(data.history) ? data.history.slice(-80) : [],
      selected: typeof data.selected === "string" ? data.selected : null,
      roundWinner: isPid(Number(data.roundWinner)) ? (data.roundWinner as Pid) : null,
      matchWinner: isPid(Number(data.matchWinner)) ? (data.matchWinner as Pid) : null,
      pendingDraw: Number(data.pendingDraw) || 0,
      passes: Number(data.passes) || 0,
      remaining: Number(data.remaining) || 0,
      round: Number(data.round) || 1,
      logSeq: Number(data.logSeq) || 0,
      callout: null,
    };
  } catch {
    return null;
  }
}
