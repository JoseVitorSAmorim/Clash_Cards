import type { Card, Suit } from "@/game/model";

const BASE = "https://deckofcardsapi.com/api/deck";
const SUIT_BY: Record<string, Suit> = {
  S: "SPADES",
  H: "HEARTS",
  D: "DIAMONDS",
  C: "CLUBS",
};

interface RawCard {
  code: string;
  image?: string;
  images?: { png?: string; svg?: string };
  value?: string;
  suit?: string;
}

interface DeckBody {
  success?: boolean;
  error?: string;
  deck_id?: string;
  remaining?: number | string;
  cards?: RawCard[];
}

export class DeckError extends Error {}

function normalize(raw: RawCard): Card {
  const code = String(raw.code || "").toUpperCase();
  const fromCode = SUIT_BY[code.slice(-1)] ?? "SPADES";
  const suit = (
    raw.suit === "SPADES" ||
    raw.suit === "HEARTS" ||
    raw.suit === "DIAMONDS" ||
    raw.suit === "CLUBS"
      ? raw.suit
      : fromCode
  ) as Suit;
  const image =
    raw.images?.png ||
    raw.image ||
    `https://deckofcardsapi.com/static/img/${code}.png`;
  return { code, image, suit, value: String(raw.value || code) };
}

async function getJson(url: string): Promise<DeckBody> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new DeckError("Sem conexão com o baralho.");
  }
  let data: DeckBody = {};
  try {
    data = (await res.json()) as DeckBody;
  } catch {
    throw new DeckError("Resposta inválida do baralho.");
  }
  if (!res.ok || data.success === false) {
    throw new DeckError(data.error || "O baralho recusou o pedido.");
  }
  return data;
}

function remainingOf(data: DeckBody): number {
  const n = Number(data.remaining);
  return Number.isFinite(n) ? n : 0;
}

function cardsQuery(codes: string[]): string {
  return codes.filter(Boolean).join(",");
}

export async function newShuffledDeck(): Promise<{ deckId: string; remaining: number }> {
  const data = await getJson(`${BASE}/new/shuffle/?deck_count=1`);
  if (!data.deck_id) throw new DeckError("A API não devolveu um baralho.");
  return { deckId: data.deck_id, remaining: remainingOf(data) };
}

export async function pingDeck(deckId: string): Promise<number> {
  const data = await getJson(`${BASE}/${deckId}/draw/?count=0`);
  return remainingOf(data);
}

export async function drawCards(deckId: string, count: number): Promise<{ cards: Card[]; remaining: number }> {
  const data = await getJson(`${BASE}/${deckId}/draw/?count=${count}`);
  return {
    cards: (data.cards ?? []).map(normalize),
    remaining: remainingOf(data),
  };
}

export async function shuffleDeck(deckId: string): Promise<number> {
  const data = await getJson(`${BASE}/${deckId}/shuffle/?remaining=true`);
  return remainingOf(data);
}

export async function addToPile(deckId: string, pile: string, codes: string[]): Promise<void> {
  if (!codes.length) return;
  await getJson(`${BASE}/${deckId}/pile/${pile}/add/?cards=${cardsQuery(codes)}`);
}

export async function drawFromPile(deckId: string, pile: string, codes: string[]): Promise<void> {
  if (!codes.length) return;
  await getJson(`${BASE}/${deckId}/pile/${pile}/draw/?cards=${cardsQuery(codes)}`);
}

export async function returnLoose(deckId: string, codes: string[]): Promise<void> {
  if (!codes.length) return;
  await getJson(`${BASE}/${deckId}/return/?cards=${cardsQuery(codes)}`);
}

export async function returnPile(deckId: string, pile: string): Promise<void> {
  await getJson(`${BASE}/${deckId}/pile/${pile}/return/`);
}

export async function installHands(
  deckId: string,
  hands: Card[][],
  discard: Card[],
): Promise<void> {
  await Promise.all([
    ...hands.map((hand, i) => addToPile(deckId, `p${i}`, hand.map((c) => c.code))),
    addToPile(deckId, "descarte", discard.map((c) => c.code)),
  ]);
}

export async function moveToDiscard(deckId: string, player: number, code: string): Promise<void> {
  try {
    await drawFromPile(deckId, `p${player}`, [code]);
  } catch {
    /* carta já fora da pilha da mão */
  }
  try {
    await addToPile(deckId, "descarte", [code]);
  } catch {
    /* descarte já sincronizado */
  }
}

export async function recycleDiscard(deckId: string, rest: string[]): Promise<number> {
  if (!rest.length) return 0;
  try {
    await drawFromPile(deckId, "descarte", rest);
  } catch {
    /* segue para devolver pelo código */
  }
  await returnLoose(deckId, rest);
  return shuffleDeck(deckId);
}

export async function gatherDeck(deckId: string, codes: string[]): Promise<number> {
  const piles = ["p0", "p1", "p2", "p3", "descarte"];
  for (const pile of piles) {
    try {
      await returnPile(deckId, pile);
    } catch {
      /* pilha vazia ou inexistente */
    }
  }
  if (codes.length) {
    try {
      await returnLoose(deckId, codes);
    } catch {
      /* cartas já voltaram com as pilhas */
    }
  }
  return shuffleDeck(deckId);
}
