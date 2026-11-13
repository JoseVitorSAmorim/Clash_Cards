import {
  BACK_IMAGE,
  SEATS,
  SUIT_PT,
  SUIT_SYM,
  TARGET,
  cardName,
  confirmLabel,
  drawLabel,
  handPoints,
  isRed,
  legalCodes,
  turnLabel,
  type Card,
  type Pid,
  type Place,
  type State,
  type Suit,
} from "@/game/model";

export interface View {
  render: (state: State, opts?: { locked?: boolean; deal?: boolean }) => void;
  layout: () => void;
  showRound: (state: State) => void;
  hideRound: () => void;
  showRules: (open: boolean) => void;
  cardRect: (player: Pid, code?: string) => DOMRect | null;
  topRect: () => DOMRect | null;
  stockRect: () => DOMRect | null;
  handRect: (player: Pid) => DOMRect | null;
  setCallout: (text: string | null) => void;
  destroy: () => void;
}

const SUIT_LIST: Suit[] = ["SPADES", "HEARTS", "DIAMONDS", "CLUBS"];

function safeImg(url: string, code: string): string {
  if (/^https:\/\/deckofcardsapi\.com\/static\/img\/[A-Z0-9]+\.png$/.test(url)) return url;
  if (/^[A-Z0-9]{2}$/.test(code)) return `https://deckofcardsapi.com/static/img/${code}.png`;
  return BACK_IMAGE;
}

function shell(): string {
  return `
    <div class="om">
      <header class="om-hud">
        <div class="om-brand">
          <p class="om-kicker" id="om-kicker">Rodada 1 · meta ${TARGET}</p>
          <h1>Oito Maluco</h1>
        </div>
        <div class="om-turn" aria-live="polite">
          <span>Turno</span>
          <strong id="om-turn">Embaralhando</strong>
        </div>
        <ol class="om-scores" id="om-scores"></ol>
        <div class="om-hud-actions">
          <button type="button" class="om-btn om-btn-ghost" id="om-rules">Regras</button>
          <button type="button" class="om-btn om-btn-ghost" id="om-log-btn">Jogadas</button>
          <button type="button" class="om-btn om-btn-gold" id="om-new">Novo jogo</button>
        </div>
      </header>
      <div class="om-stage">
        <div class="om-felt" id="om-felt">
          <section class="seat seat-n" data-seat="2"></section>
          <section class="seat seat-w" data-seat="1"></section>
          <section class="om-center">
            <div class="om-stock-wrap">
              <div class="om-stock" id="om-stock">
                <img src="${BACK_IMAGE}" alt="" class="shift" draggable="false" />
                <img src="${BACK_IMAGE}" alt="Monte para comprar" draggable="false" />
                <b id="om-remaining">0</b>
              </div>
              <span class="om-caption">Monte</span>
            </div>
            <div class="om-pile-wrap" id="om-pile"></div>
            <div class="om-flag" id="om-flag"></div>
            <p class="om-callout" id="om-callout" hidden></p>
          </section>
          <section class="seat seat-e" data-seat="3"></section>
          <section class="seat seat-s" data-seat="0"></section>
        </div>
        <aside class="om-log" id="om-log">
          <div class="om-log-head">
            <h2>Histórico</h2>
            <button type="button" class="om-btn om-btn-ghost om-log-close" id="om-log-close">Fechar</button>
          </div>
          <ol id="om-log-list"></ol>
        </aside>
      </div>
      <footer class="om-bar">
        <p class="om-hint" id="om-hint" aria-live="polite">Embaralhando o baralho…</p>
        <div class="om-actions" id="om-actions">
          <button type="button" class="om-btn om-btn-line" id="om-draw">Comprar</button>
          <button type="button" class="om-btn om-btn-gold" id="om-confirm" disabled>Confirmar Jogada</button>
        </div>
        <div class="om-suitbar" id="om-suitbar" hidden>
          <p>O 8 é coringa. Qual naipe segue?</p>
          <div class="om-suit-grid">
            ${SUIT_LIST.map((suit) => {
              const red = isRed(suit) ? " is-red" : "";
              return `<button type="button" class="om-suit${red}" data-suit="${suit}">${SUIT_SYM[suit]} ${SUIT_PT[suit]}</button>`;
            }).join("")}
          </div>
        </div>
      </footer>
      <div class="om-modal" id="om-round" hidden>
        <div class="om-sheet" role="dialog" aria-modal="true" aria-labelledby="om-round-title">
          <p class="om-kicker" id="om-round-kicker">Rodada</p>
          <h2 id="om-round-title">Fim da rodada</h2>
          <ul id="om-round-list"></ul>
          <p class="om-round-total" id="om-round-total"></p>
          <div class="om-sheet-actions">
            <button type="button" class="om-btn om-btn-ghost om-btn-ink" id="om-round-close">Fechar</button>
            <button type="button" class="om-btn om-btn-gold" id="om-round-go">Próxima rodada</button>
          </div>
        </div>
      </div>
      <div class="om-modal" id="om-rules-modal" hidden>
        <div class="om-sheet" role="dialog" aria-modal="true" aria-labelledby="om-rules-title">
          <p class="om-kicker">Mesa de quatro</p>
          <h2 id="om-rules-title">Como jogar</h2>
          <ul class="om-rules">
            <li>Toque uma carta da sua mão para selecionar. Ela só vai ao centro em <strong>Confirmar jogada</strong>.</li>
            <li>A carta precisa repetir o naipe pedido ou o valor do topo. O <strong>8</strong> é coringa e você escolhe o naipe.</li>
            <li>O <strong>ás</strong> pula o próximo. O <strong>2</strong> obriga a compra de 2 — dá para rebater com outro 2.</li>
            <li>Sem carta válida, compre uma. Se ela servir, pode jogá-la; senão a vez passa.</li>
            <li>Quem esvazia a mão leva os pontos dos outros: 8 vale 50, figuras e 10 valem 10, ás vale 1.</li>
            <li>A partida vai até ${TARGET} pontos, sempre no sentido horário.</li>
          </ul>
          <div class="om-sheet-actions">
            <button type="button" class="om-btn om-btn-gold" id="om-rules-close">Voltar à mesa</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function seatMarkup(index: number): string {
  const seat = SEATS[index];
  return `
    <div class="plaque">
      <span class="dot" aria-hidden="true"></span>
      <span class="who">${seat.name}</span>
      <span class="meta" data-meta="${index}">${seat.axis}</span>
    </div>
    <div class="hand" data-seat="${seat.place}" data-player="${index}"></div>
  `;
}

function renderHand(
  handEl: HTMLElement,
  cards: Card[],
  place: Place,
  interactive: boolean,
  mark: boolean,
  legal: Set<string>,
  selected: string | null,
): void {
  const sig = `${place}|${interactive ? "p" : "b"}|${cards.map((card) => card.code).join(",")}`;
  if (handEl.dataset.sig !== sig) {
    handEl.dataset.sig = sig;
    handEl.replaceChildren();
    const n = cards.length;
    const mid = (n - 1) / 2;
    cards.forEach((card, i) => {
      const slot = document.createElement("div");
      slot.className = "card-slot";
      const tilt = (i - mid) * Math.min(3.2, 24 / Math.max(n, 1));
      slot.style.setProperty("--tilt", `${tilt.toFixed(2)}deg`);
      slot.style.setProperty("--arc", `${(Math.abs(i - mid) * 1.35).toFixed(2)}px`);
      slot.style.zIndex = String(i + 1);
      const el = document.createElement(interactive ? "button" : "div");
      el.className = "card";
      if (interactive) {
        const btn = el as HTMLButtonElement;
        btn.type = "button";
        btn.dataset.code = card.code;
        const img = document.createElement("img");
        img.src = safeImg(card.image, card.code);
        img.alt = cardName(card);
        img.draggable = false;
        btn.append(img);
      } else {
        const img = document.createElement("img");
        img.src = BACK_IMAGE;
        img.alt = "";
        img.draggable = false;
        el.append(img);
      }
      slot.append(el);
      handEl.append(slot);
    });
  }
  handEl.querySelectorAll<HTMLElement>(".card-slot").forEach((slot) => {
    const code = slot.querySelector<HTMLElement>("[data-code]")?.dataset.code ?? "";
    const on = interactive && code === selected;
    slot.classList.toggle("is-selected", on);
    const card = slot.querySelector<HTMLElement>(".card");
    if (!card || !interactive) return;
    const ok = mark && legal.has(code);
    card.classList.toggle("is-legal", ok);
    card.classList.toggle("is-dim", mark && !legal.has(code));
    card.classList.toggle("is-selected", on);
    card.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

function renderPile(pile: HTMLElement, cards: Card[]): void {
  const shown = cards.slice(-3);
  const sig = shown.map((card) => card.code).join(",") || "empty";
  if (pile.dataset.sig === sig) return;
  pile.dataset.sig = sig;
  pile.replaceChildren();
  if (!shown.length) {
    const empty = document.createElement("div");
    empty.className = "om-table-empty";
    empty.textContent = "Mesa";
    pile.append(empty);
    return;
  }
  shown.forEach((card, index) => {
    const el = document.createElement("div");
    el.className = "om-table-card";
    const k = index - (shown.length - 1);
    el.style.setProperty("--k", String(k));
    if (index === shown.length - 1) el.id = "om-top";
    const img = document.createElement("img");
    img.src = safeImg(card.image, card.code);
    img.alt = index === shown.length - 1 ? cardName(card) : "";
    img.draggable = false;
    el.append(img);
    pile.append(el);
  });
}

export function createView(root: HTMLElement): View {
  root.replaceChildren();
  root.insertAdjacentHTML("afterbegin", shell());
  const q = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  SEATS.forEach((seat, index) => {
    q<HTMLElement>(`.seat[data-seat="${seat.id}"]`).innerHTML = seatMarkup(index);
  });

  const scoresEl = q<HTMLOListElement>("#om-scores");
  const logEl = q<HTMLOListElement>("#om-log-list");
  const logPanel = q<HTMLElement>("#om-log");
  let dealTimer = 0;

  function layout(): void {
    const probe = getComputedStyle(root);
    const cardW = parseFloat(probe.getPropertyValue("--card-w")) || 72;
    root.querySelectorAll<HTMLElement>(".hand").forEach((hand) => {
      const place = hand.dataset.seat;
      const vertical = place === "west" || place === "east";
      const slots = [...hand.querySelectorAll<HTMLElement>(":scope > .card-slot")];
      const n = slots.length;
      if (!n) return;
      const extent = cardW;
      const space = (vertical ? hand.clientHeight : hand.clientWidth) - 6;
      let step = extent * (vertical ? 0.4 : 0.48);
      if (n > 1 && extent + (n - 1) * step > space) {
        step = Math.max(14, (space - extent) / (n - 1));
      }
      const overlap = Math.max(0, extent - step);
      slots.forEach((slot, i) => {
        slot.style.marginLeft = !vertical && i ? `${-overlap}px` : "0px";
        slot.style.marginTop = vertical && i ? `${-overlap}px` : "0px";
      });
    });
  }

  function render(state: State, opts?: { locked?: boolean; deal?: boolean }): void {
    const locked = !!opts?.locked;
    q("#om-kicker").textContent = `Rodada ${state.round} · meta ${TARGET}`;
    q("#om-turn").textContent = turnLabel(state);
    q("#om-hint").textContent = state.message;
    q("#om-remaining").textContent = String(Math.max(0, state.remaining));

    scoresEl.replaceChildren();
    SEATS.forEach((seat) => {
      const li = document.createElement("li");
      li.className = "om-score";
      if (state.phase !== "loading" && state.phase !== "between" && state.phase !== "match" && state.turn === seat.id) {
        li.classList.add("is-turn");
      }
      const name = document.createElement("span");
      name.textContent = seat.name;
      const score = document.createElement("b");
      score.textContent = String(state.scores[seat.id]);
      li.append(name, score);
      scoresEl.append(li);
    });

    const legal = new Set(legalCodes(state, 0));
    const mark = state.phase === "player" && !locked;
    SEATS.forEach((seat) => {
      const section = q<HTMLElement>(`.seat[data-seat="${seat.id}"]`);
      const active =
        state.phase !== "loading" &&
        state.phase !== "error" &&
        state.phase !== "between" &&
        state.phase !== "match" &&
        state.turn === seat.id;
      section.classList.toggle("is-turn", active);
      const count = state.hands[seat.id].length;
      const meta = section.querySelector<HTMLElement>("[data-meta]");
      if (meta) {
        meta.textContent =
          seat.id === 0 && count
            ? `${count} · vale ${handPoints(state.hands[0])}`
            : `${seat.axis} · ${count}`;
      }
      const hand = section.querySelector<HTMLElement>(".hand");
      if (!hand) return;
      renderHand(
        hand,
        state.hands[seat.id],
        seat.place,
        seat.id === 0 && state.phase !== "loading",
        mark && seat.id === 0,
        legal,
        state.selected,
      );
    });

    renderPile(q("#om-pile"), state.discard);
    const flag = q("#om-flag");
    const suit = state.currentSuit;
    flag.className = `om-flag${isRed(suit) ? " is-red" : ""}`;
    flag.innerHTML = state.discard.length
      ? `<span class="pip">${SUIT_SYM[suit]}</span><span>${SUIT_PT[suit]}</span>`
      : "";

    const suitbar = q<HTMLElement>("#om-suitbar");
    const actions = q<HTMLElement>("#om-actions");
    const choosing = state.phase === "suit" && !locked;
    suitbar.hidden = !choosing;
    actions.hidden = choosing;

    const confirm = q<HTMLButtonElement>("#om-confirm");
    const draw = q<HTMLButtonElement>("#om-draw");
    confirm.textContent = confirmLabel(state);
    draw.textContent = drawLabel(state);
    const allowConfirm =
      !locked &&
      (state.phase === "between" ||
        state.phase === "match" ||
        (state.phase === "player" && !!state.selected && legal.has(state.selected)));
    confirm.disabled = !allowConfirm;
    draw.disabled = locked || state.phase !== "player" || (state.pendingDraw <= 0 && legal.size > 0);
    q<HTMLButtonElement>("#om-new").disabled = locked && state.phase === "loading";

    const sig = state.history.map((entry) => entry.id).join(",");
    if (logEl.dataset.sig !== sig) {
      logEl.dataset.sig = sig;
      logEl.replaceChildren();
      const rows = state.history.slice(-24);
      if (!rows.length) {
        const li = document.createElement("li");
        li.className = "is-empty";
        li.textContent = "As jogadas aparecem aqui.";
        logEl.append(li);
      } else {
        for (const entry of rows) {
          const li = document.createElement("li");
          li.textContent = entry.text;
          logEl.append(li);
        }
        logEl.scrollTop = logEl.scrollHeight;
      }
    }

    if (state.callout) setCallout(state.callout);
    if (opts?.deal) {
      root.classList.add("is-dealing");
      window.clearTimeout(dealTimer);
      dealTimer = window.setTimeout(() => root.classList.remove("is-dealing"), 900);
    }
    layout();
  }

  function setCallout(text: string | null): void {
    const el = q<HTMLElement>("#om-callout");
    if (!text) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    el.textContent = text;
  }

  function showRound(state: State): void {
    const modal = q<HTMLElement>("#om-round");
    const winner = state.roundWinner;
    q("#om-round-kicker").textContent = state.phase === "match" ? "Partida" : `Rodada ${state.round}`;
    q("#om-round-title").textContent = state.matchWinner !== null
      ? `${SEATS[state.matchWinner].name} vence`
      : winner === null
        ? "Rodada empatada"
        : `${SEATS[winner].name} bateu`;
    const list = q<HTMLUListElement>("#om-round-list");
    list.replaceChildren();
    let total = 0;
    SEATS.forEach((seat) => {
      const li = document.createElement("li");
      const pts = handPoints(state.hands[seat.id]);
      const note = document.createElement("span");
      note.textContent = seat.name;
      const value = document.createElement("b");
      if (winner === seat.id) value.textContent = "saiu";
      else {
        value.textContent = `${pts}`;
        total += pts;
      }
      li.append(note, value);
      list.append(li);
    });
    q("#om-round-total").textContent =
      winner === null
        ? "Ninguém soma pontos nesta rodada."
        : `${SEATS[winner].name} recebe ${total}. Placar: ${state.scores.join(" · ")}.`;
    const go = q<HTMLButtonElement>("#om-round-go");
    go.textContent = state.phase === "match" ? "Nova partida" : "Próxima rodada";
    modal.hidden = false;
  }

  function hideRound(): void {
    q<HTMLElement>("#om-round").hidden = true;
  }

  function showRules(open: boolean): void {
    q<HTMLElement>("#om-rules-modal").hidden = !open;
  }

  function cardRect(player: Pid, code?: string): DOMRect | null {
    const hand = root.querySelector<HTMLElement>(`.hand[data-player="${player}"]`);
    if (!hand) return null;
    if (code) {
      const btn = hand.querySelector<HTMLElement>(`[data-code="${code}"]`);
      if (btn) return btn.getBoundingClientRect();
    }
    const cards = hand.querySelectorAll(".card");
    const mid = cards[Math.floor((cards.length - 1) / 2)] as HTMLElement | undefined;
    return (mid ?? hand).getBoundingClientRect();
  }

  function topRect(): DOMRect | null {
    return (root.querySelector("#om-top") ?? root.querySelector("#om-pile"))?.getBoundingClientRect() ?? null;
  }

  function stockRect(): DOMRect | null {
    return root.querySelector("#om-stock")?.getBoundingClientRect() ?? null;
  }

  function handRect(player: Pid): DOMRect | null {
    return root.querySelector(`.hand[data-player="${player}"]`)?.getBoundingClientRect() ?? null;
  }

  function destroy(): void {
    window.clearTimeout(dealTimer);
  }

  logPanel.addEventListener("click", (event) => {
    if ((event.target as HTMLElement).id === "om-log") logPanel.classList.remove("is-open");
  });

  return {
    render,
    layout,
    showRound,
    hideRound,
    showRules,
    cardRect,
    topRect,
    stockRect,
    handRect,
    setCallout,
    destroy,
    toggleLog: (force?: boolean) => {
      logPanel.classList.toggle("is-open", force);
    },
  } as View & { toggleLog: (force?: boolean) => void };
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

export function flyCard(from: DOMRect, to: DOMRect, src: string, rotFrom: number, rotTo: number): Promise<void> {
  if (prefersReducedMotion() || from.width < 2 || to.width < 2) return Promise.resolve();
  const rotated = Math.abs(rotFrom) % 180 === 90;
  const destRotated = Math.abs(rotTo) % 180 === 90;
  const faceW = rotated ? from.height : from.width;
  const faceH = rotated ? from.width : from.height;
  const toW = destRotated ? to.height : to.width;
  const toH = destRotated ? to.width : to.height;
  const el = document.createElement("img");
  el.className = "om-flyer";
  el.alt = "";
  el.src = src;
  el.style.transition = "none";
  el.style.width = `${faceW}px`;
  el.style.height = `${faceH}px`;
  el.style.left = `${from.left + from.width / 2 - faceW / 2}px`;
  el.style.top = `${from.top + from.height / 2 - faceH / 2}px`;
  el.style.transform = `rotate(${rotFrom}deg)`;
  document.body.append(el);
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      el.remove();
      resolve();
    };
    requestAnimationFrame(() => {
      el.style.transition =
        "left 460ms cubic-bezier(.2,.75,.2,1), top 460ms cubic-bezier(.2,.75,.2,1), width 460ms cubic-bezier(.2,.75,.2,1), height 460ms cubic-bezier(.2,.75,.2,1), transform 460ms cubic-bezier(.2,.75,.2,1)";
      el.style.left = `${to.left + to.width / 2 - toW / 2}px`;
      el.style.top = `${to.top + to.height / 2 - toH / 2}px`;
      el.style.width = `${toW}px`;
      el.style.height = `${toH}px`;
      el.style.transform = `rotate(${rotTo}deg)`;
      el.addEventListener("transitionend", finish, { once: true });
      window.setTimeout(finish, 620);
    });
  });
}

export function placeRotation(place: Place): number {
  if (place === "north") return 180;
  if (place === "west") return 90;
  if (place === "east") return -90;
  return 0;
}
