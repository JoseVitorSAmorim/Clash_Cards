import * as api from "@/game/api";
import { DeckError } from "@/game/api";
import {
  BACK_IMAGE,
  SEATS,
  applyPlay,
  bestSuit,
  botMove,
  canDraw,
  clearSave,
  createDeal,
  emptyState,
  giveCards,
  isLegal,
  loadState,
  passTurn,
  saveState,
  yourTurnMessage,
  type Card,
  type Pid,
  type State,
  type Suit,
} from "@/game/model";
import { createView, flyCard, placeRotation, type View } from "@/game/view";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function messageOf(error: unknown): string {
  if (error instanceof DeckError || error instanceof Error) return error.message || "Falha no baralho.";
  return "Não foi possível falar com o baralho.";
}

function makeAudio() {
  let ctx: AudioContext | null = null;
  const ensure = () => {
    const Ctx = window.AudioContext;
    if (!Ctx) return null;
    if (!ctx) ctx = new Ctx();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  };
  return {
    unlock: ensure,
    play(kind: "play" | "draw" | "win" | "no") {
      const audioCtx = ensure();
      if (!audioCtx) return;
      const now = audioCtx.currentTime;
      const tone = (freq: number, at: number, dur: number, gain = 0.035) => {
        const osc = audioCtx.createOscillator();
        const amp = audioCtx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(freq, now + at);
        amp.gain.setValueAtTime(0.0001, now + at);
        amp.gain.exponentialRampToValueAtTime(gain, now + at + 0.02);
        amp.gain.exponentialRampToValueAtTime(0.0001, now + at + dur);
        osc.connect(amp);
        amp.connect(audioCtx.destination);
        osc.start(now + at);
        osc.stop(now + at + dur + 0.02);
      };
      if (kind === "play") tone(520, 0, 0.14);
      else if (kind === "draw") tone(330, 0, 0.12, 0.028);
      else if (kind === "no") tone(170, 0, 0.12, 0.03);
      else {
        tone(523, 0, 0.12);
        tone(659, 0.09, 0.12);
        tone(784, 0.18, 0.2);
      }
    },
  };
}

export function mountGame(root: HTMLElement): () => void {
  let alive = true;
  let epoch = 0;
  let state: State = emptyState();
  let uiLock = 0;
  let apiChain: Promise<void> = Promise.resolve();
  const view: View = createView(root);
  const sound = makeAudio();
  const ac = new AbortController();
  const { signal } = ac;

  const mine = (token: number) => alive && epoch === token;

  const publish = () => {
    window.__oito = {
      ready: state.phase !== "loading",
      phase: state.phase,
      turn: state.turn,
      selected: state.selected,
      round: state.round,
      scores: [...state.scores],
    };
  };

  const render = (opts?: { deal?: boolean }) => {
    view.render(state, { locked: uiLock > 0, deal: opts?.deal });
    publish();
  };

  const track = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = apiChain.then(fn, fn);
    apiChain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };

  const persist = (token: number) => {
    if (mine(token) && state.deckId) saveState(state);
  };

  async function freshDeck(scores: State["scores"], round: number, note?: string): Promise<void> {
    const token = epoch;
    uiLock++;
    state = {
      ...emptyState(),
      scores: [scores[0], scores[1], scores[2], scores[3]],
      round,
      phase: "loading",
      message: note || "Embaralhando um baralho novo…",
    };
    render();
    try {
      const deck = await api.newShuffledDeck();
      if (!mine(token)) return;
      const drawn = await api.drawCards(deck.deckId, 29);
      if (!mine(token)) return;
      if (drawn.cards.length < 29) throw new DeckError("O baralho veio incompleto.");
      state = createDeal({
        deckId: deck.deckId,
        cards: drawn.cards,
        remaining: drawn.remaining,
        scores,
        round,
      });
      if (note) state = { ...state, message: `${note} ${state.message}` };
      void track(() => api.installHands(deck.deckId, state.hands, state.discard)).catch(() => undefined);
      uiLock = Math.max(0, uiLock - 1);
      persist(token);
      render({ deal: true });
    } catch (error) {
      if (!mine(token)) return;
      uiLock = Math.max(0, uiLock - 1);
      state = {
        ...emptyState(),
        phase: "error",
        scores: [scores[0], scores[1], scores[2], scores[3]],
        round,
        message: `${messageOf(error)} Toque em Novo jogo.`,
      };
      render();
    }
  }

  async function drawStock(token: number, n: number, player: Pid): Promise<Card[]> {
    const out: Card[] = [];
    let guard = 0;
    while (mine(token) && out.length < n && guard++ < 8) {
      if (state.remaining <= 0) {
        const top = state.discard[state.discard.length - 1];
        const rest = state.discard.slice(0, -1).map((card) => card.code);
        if (!top || !rest.length) break;
        try {
          const remaining = await track(() => api.recycleDiscard(state.deckId, rest));
          if (!mine(token)) return out;
          state = { ...state, remaining, discard: [top] };
          persist(token);
        } catch {
          break;
        }
        continue;
      }
      const take = Math.min(n - out.length, state.remaining);
      const res = await track(() => api.drawCards(state.deckId, take));
      if (!mine(token)) return out;
      state = { ...state, remaining: res.remaining };
      out.push(...res.cards);
      if (!res.cards.length) state = { ...state, remaining: 0 };
    }
    if (out.length && mine(token)) {
      void track(() => api.addToPile(state.deckId, `p${player}`, out.map((card) => card.code))).catch(() => undefined);
    }
    return out;
  }

  async function commitPlay(token: number, player: Pid, code: string, suit?: Suit): Promise<void> {
    const card = state.hands[player].find((item) => item.code === code);
    if (!card || !mine(token)) return;
    const from = view.cardRect(player, player === 0 ? code : undefined);
    state = applyPlay(state, player, code, suit);
    const deckId = state.deckId;
    void track(() => api.moveToDiscard(deckId, player, code)).catch(() => undefined);
    persist(token);
    render();
    const top = view.topRect();
    const node = root.querySelector<HTMLElement>("#om-top");
    if (node) node.style.visibility = "hidden";
    if (from && top) await flyCard(from, top, card.image, placeRotation(SEATS[player].place), 0);
    if (!mine(token)) return;
    if (node) node.style.visibility = "";
    sound.play(state.phase === "between" || state.phase === "match" ? "win" : "play");
    render();
    if (state.phase === "between" || state.phase === "match") view.showRound(state);
  }

  async function buy(token: number, player: Pid): Promise<void> {
    const penalty = state.pendingDraw > 0;
    const n = penalty ? Math.max(1, state.pendingDraw) : 1;
    const from = view.stockRect();
    const cards = await drawStock(token, n, player);
    if (!mine(token)) return;
    if (!cards.length) {
      state = { ...state, remaining: 0, discard: state.discard.slice(-1), pendingDraw: 0 };
      state = passTurn(state);
      persist(token);
      render();
      if (state.phase === "between" || state.phase === "match") view.showRound(state);
      return;
    }
    const answer =
      !penalty && cards.length === 1 && isLegal(cards[0], { ...state, pendingDraw: 0 }) ? cards[0] : null;
    state = giveCards(state, player, cards, true);
    if (answer && player !== 0) {
      state = { ...state, message: `${SEATS[player].name} comprou e pode responder.` };
      persist(token);
      render();
      const to = view.handRect(player);
      if (from && to) await flyCard(from, to, BACK_IMAGE, 0, placeRotation(SEATS[player].place));
      if (!mine(token)) return;
      sound.play("draw");
      await sleep(280);
      if (!mine(token) || !isLegal(answer, state)) return;
      const suit = answer.code[0] === "8" ? bestSuit(state.hands[player].filter((card) => card.code !== answer.code)) : undefined;
      await commitPlay(token, player, answer.code, suit);
      return;
    }
    if (answer && player === 0) {
      state = {
        ...state,
        phase: "player",
        turn: 0,
        selected: answer.code,
        message: "A carta comprada serve. Confirme a jogada ou escolha outra.",
      };
      persist(token);
      render();
      const to = view.cardRect(0, answer.code) ?? view.handRect(0);
      if (from && to) await flyCard(from, to, answer.image, 0, 0);
      if (!mine(token)) return;
      sound.play("draw");
      render();
      return;
    }
    state = passTurn(state);
    persist(token);
    render();
    const to = view.handRect(player);
    if (from && to) await flyCard(from, to, player === 0 ? cards[0].image : BACK_IMAGE, 0, placeRotation(SEATS[player].place));
    if (!mine(token)) return;
    sound.play("draw");
    if (state.phase === "between" || state.phase === "match") view.showRound(state);
  }

  async function runBots(token: number): Promise<void> {
    let guard = 0;
    while (mine(token) && guard++ < 48) {
      if (state.phase === "between" || state.phase === "match" || state.phase === "suit" || state.phase === "error") break;
      if (state.turn === 0) break;
      const player = state.turn;
      state = { ...state, message: `${SEATS[player].name} pensa a jogada…` };
      render();
      await sleep(1000);
      if (!mine(token) || state.turn !== player) return;
      const move = botMove(state, player);
      if (move.kind === "play") await commitPlay(token, player, move.code, move.suit);
      else await buy(token, player);
    }
    if (!mine(token)) return;
    if (state.turn === 0 && (state.phase === "bots" || state.phase === "player")) {
      state = { ...state, phase: "player", message: yourTurnMessage(state) };
      persist(token);
      render();
    }
  }

  async function onConfirm(): Promise<void> {
    if (!alive || uiLock > 0) return;
    const token = epoch;
    if (state.phase === "between") {
      view.hideRound();
      await nextRound(token);
      return;
    }
    if (state.phase === "match") {
      view.hideRound();
      await newGame();
      return;
    }
    if (state.phase !== "player" || !state.selected) return;
    const card = state.hands[0].find((item) => item.code === state.selected);
    if (!card || !isLegal(card, state)) {
      sound.play("no");
      state = { ...state, message: "Essa carta não entra agora." };
      render();
      return;
    }
    if (card.code[0] === "8") {
      state = { ...state, phase: "suit", selected: card.code, message: "O 8 é coringa. Escolha o naipe." };
      persist(token);
      render();
      return;
    }
    uiLock++;
    render();
    try {
      await commitPlay(token, 0, card.code);
      const phase = state.phase as State["phase"];
      if (mine(token) && state.turn !== 0 && phase !== "between" && phase !== "match") {
        await runBots(token);
      }
    } finally {
      if (mine(token)) {
        uiLock = Math.max(0, uiLock - 1);
        render();
      }
    }
  }

  async function onDraw(): Promise<void> {
    if (!alive || uiLock > 0 || !canDraw(state)) return;
    const token = epoch;
    uiLock++;
    render();
    try {
      await buy(token, 0);
      if (mine(token) && state.turn !== 0 && state.phase !== "between" && state.phase !== "match") {
        await runBots(token);
      }
    } catch (error) {
      if (!mine(token)) return;
      state = { ...state, phase: "error", message: messageOf(error) };
    } finally {
      if (mine(token)) {
        uiLock = Math.max(0, uiLock - 1);
        render();
      }
    }
  }

  async function onSuit(suit: Suit): Promise<void> {
    if (!alive || state.phase !== "suit" || !state.selected || uiLock > 0) return;
    const token = epoch;
    const code = state.selected;
    uiLock++;
    render();
    try {
      await commitPlay(token, 0, code, suit);
      const phase = state.phase as State["phase"];
      if (mine(token) && state.turn !== 0 && phase !== "between" && phase !== "match") {
        await runBots(token);
      }
    } finally {
      if (mine(token)) {
        uiLock = Math.max(0, uiLock - 1);
        render();
      }
    }
  }

  async function nextRound(token = epoch): Promise<void> {
    if (!mine(token) || uiLock > 0) return;
    const scores = state.scores;
    const round = state.round + 1;
    const deckId = state.deckId;
    const codes = [...state.hands.flat(), ...state.discard].map((card) => card.code);
    uiLock++;
    state = { ...state, phase: "loading", message: "Recolhendo as cartas…", selected: null };
    render();
    try {
      await apiChain;
      if (!mine(token)) return;
      const remaining = await api.gatherDeck(deckId, codes);
      if (!mine(token)) return;
      if (remaining < 29) throw new DeckError("curto");
      const drawn = await api.drawCards(deckId, 29);
      if (!mine(token)) return;
      if (drawn.cards.length < 29) throw new DeckError("curto");
      state = createDeal({ deckId, cards: drawn.cards, remaining: drawn.remaining, scores, round });
      void track(() => api.installHands(deckId, state.hands, state.discard)).catch(() => undefined);
      uiLock = Math.max(0, uiLock - 1);
      persist(token);
      render({ deal: true });
    } catch {
      if (!mine(token)) return;
      uiLock = Math.max(0, uiLock - 1);
      apiChain = Promise.resolve();
      await freshDeck(scores, round, "Novo baralho para a próxima rodada.");
    }
  }

  async function newGame(): Promise<void> {
    epoch += 1;
    uiLock = 0;
    apiChain = Promise.resolve();
    view.hideRound();
    view.showRules(false);
    clearSave();
    await freshDeck([0, 0, 0, 0], 1);
  }

  function shake(code: string): void {
    const slot = root.querySelector<HTMLElement>(`[data-code="${CSS.escape(code)}"]`)?.parentElement;
    if (!slot) return;
    slot.classList.remove("is-shake");
    void slot.offsetWidth;
    slot.classList.add("is-shake");
  }

  function selectCard(code: string): void {
    if (!alive || uiLock > 0 || state.phase !== "player" || state.turn !== 0) return;
    const card = state.hands[0].find((item) => item.code === code);
    if (!card) return;
    if (!isLegal(card, state)) {
      sound.play("no");
      shake(code);
      state = { ...state, message: "Essa carta não combina com a mesa." };
      render();
      return;
    }
    state = {
      ...state,
      selected: state.selected === code ? null : code,
    };
    state = { ...state, message: state.selected ? "Carta selecionada. Confirme a jogada." : yourTurnMessage(state) };
    render();
  }

  root.addEventListener(
    "click",
    (event) => {
      const target = event.target as HTMLElement;
      if (target.closest("#om-new")) {
        void newGame();
        return;
      }
      if (target.closest("#om-rules")) {
        view.showRules(true);
        return;
      }
      if (target.closest("#om-rules-close") || target.id === "om-rules-modal") {
        view.showRules(false);
        return;
      }
      if (target.closest("#om-log-btn")) {
        root.querySelector("#om-log")?.classList.toggle("is-open");
        return;
      }
      if (target.closest("#om-log-close")) {
        root.querySelector("#om-log")?.classList.remove("is-open");
        return;
      }
      if (target.closest("#om-round-close")) {
        view.hideRound();
        return;
      }
      if (target.closest("#om-round-go")) {
        void onConfirm();
        return;
      }
      if (target.closest("#om-confirm")) {
        void onConfirm();
        return;
      }
      if (target.closest("#om-draw")) {
        void onDraw();
        return;
      }
      const suitBtn = target.closest<HTMLElement>("[data-suit]");
      if (suitBtn?.dataset.suit) {
        void onSuit(suitBtn.dataset.suit as Suit);
        return;
      }
      const cardBtn = target.closest<HTMLElement>("[data-code]");
      if (cardBtn?.dataset.code && cardBtn.closest('[data-player="0"]')) selectCard(cardBtn.dataset.code);
    },
    { signal },
  );

  root.addEventListener("pointerdown", () => sound.unlock(), { signal });

  window.addEventListener(
    "keydown",
    (event) => {
      if (!alive || uiLock > 0) return;
      if (event.key === "Escape") {
        view.showRules(false);
        view.hideRound();
        return;
      }
      if (state.phase === "suit" && event.key === "Enter") return;
      if (state.phase !== "player" && state.phase !== "between" && state.phase !== "match") return;
      if (event.key === "Enter") {
        event.preventDefault();
        void onConfirm();
        return;
      }
      if ((event.key === "c" || event.key === "C") && canDraw(state)) {
        void onDraw();
        return;
      }
      if (state.phase !== "player") return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      const legal = state.hands[0].filter((card) => isLegal(card, state));
      if (!legal.length) return;
      event.preventDefault();
      const index = legal.findIndex((card) => card.code === state.selected);
      const dir = event.key === "ArrowRight" ? 1 : -1;
      const next = legal[(index + dir + legal.length) % legal.length];
      state = { ...state, selected: next.code, message: "Carta selecionada. Confirme a jogada." };
      render();
    },
    { signal },
  );

  window.addEventListener("resize", () => view.layout(), { signal });

  const boot = async () => {
    const token = epoch;
    render();
    const saved = loadState();
    if (!saved) {
      await freshDeck([0, 0, 0, 0], 1);
      return;
    }
    state = saved;
    render();
    try {
      const remaining = await api.pingDeck(saved.deckId);
      if (!mine(token)) return;
      state = { ...state, remaining };
      persist(token);
      render();
      if (state.phase === "between" || state.phase === "match") view.showRound(state);
      else if (state.phase === "suit") render();
      else if (state.turn !== 0) await runBots(token);
    } catch {
      if (!mine(token)) return;
      await freshDeck(saved.scores, saved.round, "A partida salva expirou.");
    }
  };

  void boot();

  return () => {
    alive = false;
    epoch += 1;
    ac.abort();
    view.destroy();
    delete window.__oito;
  };
}

declare global {
  interface Window {
    __oito?: {
      ready: boolean;
      phase: string;
      turn: number;
      selected: string | null;
      round: number;
      scores: number[];
    };
  }
}
