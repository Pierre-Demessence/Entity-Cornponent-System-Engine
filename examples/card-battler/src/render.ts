import type { EcsWorld, EntityId, Renderer } from '@pierre/ecs';

import type { GameState, Phase } from './game';

import {
  BlockDef,
  CardDefComp,
  EnemyIntentDef,
  EnemyTag,
  HealthDef,
  InDeckTag,
  InDiscardTag,
  InHandTag,
  PlayerTag,
} from './components';

/**
 * Render context for `DomRenderer`. Matches the shape of
 * `Canvas2DRenderContext`: a target handle + the world. We also carry
 * the `GameState` so the renderer can diff UI-only state (drag,
 * energy, phase, live pointer) without walking the world for things
 * that live naturally on GameState.
 */
export interface DomRenderContext {
  readonly root: HTMLElement;
  readonly state: GameState;
  readonly world: EcsWorld;
}

interface Zones {
  deckZone: HTMLElement;
  discardZone: HTMLElement;
  dragLayer: HTMLElement;
  endTurnButton: HTMLButtonElement;
  enemyIntentLabel: HTMLElement;
  enemyZone: HTMLElement;
  energyLabel: HTMLElement;
  handZone: HTMLElement;
  phaseLabel: HTMLElement;
  playerZone: HTMLElement;
  resetButton: HTMLButtonElement;
}

/**
 * DOM renderer implementing `Renderer<DomRenderContext>`.
 *
 * Strategy: entity-id → HTMLElement map. On each render:
 * - Mount the static zone skeleton on first render.
 * - Ensure an element exists for the player, the enemy, and every
 *   card entity. Create missing; remove orphans (entities no longer
 *   present in the world — relevant for Reset).
 * - Reparent each card element into its zone based on its current
 *   tag (`InHandTag` / `InDeckTag` / `InDiscardTag`). The browser
 *   handles the layout.
 * - Update text content (HP, energy, card name/cost), classes
 *   (playable, dragging), and transform for the dragged card.
 *
 * No virtual DOM, no keyed-child diffing — the entity-id map is
 * sufficient because entity-lifecycle maps 1:1 to DOM elements.
 *
 * The renderer writes `data-entity-id` on every interactive root
 * (cards, player, enemy), which the drag system uses for
 * `elementFromPoint` hit-testing.
 */
export class DomRenderer implements Renderer<DomRenderContext> {
  private readonly cardElements = new Map<EntityId, HTMLElement>();
  private enemyElement: HTMLElement | null = null;
  private mounted = false;
  private playerElement: HTMLElement | null = null;
  private zones!: Zones;

  /**
   * Called by the host to wire the End Turn and Reset buttons. Separated
   * from the constructor because handlers need `state`, `tickSource`,
   * and `resetGame` from `main.ts` — keeps the renderer renderer-pure.
   */
  bindButtons(handlers: { onEndTurn: () => void; onReset: () => void }): void {
    if (!this.mounted)
      throw new Error('bindButtons: renderer not mounted; call render() first');
    this.zones.endTurnButton.addEventListener('click', handlers.onEndTurn);
    this.zones.resetButton.addEventListener('click', handlers.onReset);
  }

  // --- Lifecycle --------------------------------------------------------

  private mount(ctx: DomRenderContext): void {
    ctx.root.innerHTML = '';
    ctx.root.classList.add('cb-root');

    const enemyZone = createDiv('cb-enemy-zone');
    const playerZone = createDiv('cb-player-zone');
    const deckZone = createDiv('cb-deck-zone');
    deckZone.textContent = 'Deck';
    const discardZone = createDiv('cb-discard-zone');
    discardZone.textContent = 'Discard';
    const handZone = createDiv('cb-hand-zone');
    const dragLayer = createDiv('cb-drag-layer');

    const hud = createDiv('cb-hud');
    const phaseLabel = createDiv('cb-phase');
    const energyLabel = createDiv('cb-energy');
    const enemyIntentLabel = createDiv('cb-enemy-intent');
    const endTurnButton = document.createElement('button');
    endTurnButton.type = 'button';
    endTurnButton.className = 'cb-end-turn';
    endTurnButton.textContent = 'End Turn';
    const resetButton = document.createElement('button');
    resetButton.type = 'button';
    resetButton.className = 'cb-reset';
    resetButton.textContent = 'Reset';
    hud.append(phaseLabel, energyLabel, enemyIntentLabel, endTurnButton, resetButton);

    ctx.root.append(
      enemyZone,
      playerZone,
      deckZone,
      discardZone,
      handZone,
      hud,
      dragLayer,
    );

    this.zones = {
      deckZone,
      discardZone,
      dragLayer,
      endTurnButton,
      enemyIntentLabel,
      enemyZone,
      energyLabel,
      handZone,
      phaseLabel,
      playerZone,
      resetButton,
    };
    this.mounted = true;
  }

  render(ctx: DomRenderContext): void {
    if (!this.mounted)
      this.mount(ctx);

    this.renderActor(ctx, 'player');
    this.renderActor(ctx, 'enemy');
    this.renderCards(ctx);
    this.renderHud(ctx);
    this.renderOverlay(ctx);
  }

  // --- Actor (player / enemy) rendering ---------------------------------

  private renderActor(ctx: DomRenderContext, which: 'player' | 'enemy'): void {
    const tagDef = which === 'player' ? PlayerTag : EnemyTag;
    const tag = ctx.world.getTag(tagDef);
    const [actorId] = [...tag];
    if (actorId == null) {
      if (which === 'player')
        this.playerElement = null;
      else
        this.enemyElement = null;
      return;
    }

    let el = which === 'player' ? this.playerElement : this.enemyElement;
    if (!el) {
      el = createDiv(`cb-actor cb-actor--${which}`);
      el.setAttribute('data-entity-id', String(actorId));
      const nameEl = createDiv('cb-actor-name');
      nameEl.textContent = which === 'player' ? 'You' : 'Enemy';
      const hpEl = createDiv('cb-actor-hp');
      const blockEl = createDiv('cb-actor-block');
      el.append(nameEl, hpEl, blockEl);
      (which === 'player' ? this.zones.playerZone : this.zones.enemyZone).append(el);
      if (which === 'player')
        this.playerElement = el;
      else
        this.enemyElement = el;
    }
    else {
      // Entity ids persist across renders but flip on Reset; keep attr synced.
      el.setAttribute('data-entity-id', String(actorId));
    }

    const hp = ctx.world.getStore(HealthDef).get(actorId);
    const block = ctx.world.getStore(BlockDef).get(actorId);
    const hpEl = el.querySelector('.cb-actor-hp')!;
    const blockEl = el.querySelector('.cb-actor-block')!;
    hpEl.textContent = hp ? `HP ${hp.current} / ${hp.max}` : 'HP —';
    blockEl.textContent = block && block.amount > 0 ? `Block ${block.amount}` : '';
  }

  // --- Card rendering ---------------------------------------------------

  private renderCard(ctx: DomRenderContext, id: EntityId, name: string): void {
    let el = this.cardElements.get(id);
    if (!el) {
      el = createDiv('cb-card');
      el.setAttribute('data-entity-id', String(id));
      const nameEl = createDiv('cb-card-name');
      const costEl = createDiv('cb-card-cost');
      const descEl = createDiv('cb-card-desc');
      el.append(costEl, nameEl, descEl);
      this.cardElements.set(id, el);
    }

    const card = ctx.world.getStore(CardDefComp).get(id);
    if (card) {
      el.querySelector('.cb-card-name')!.textContent = name;
      el.querySelector('.cb-card-cost')!.textContent = String(card.def.cost);
      el.querySelector('.cb-card-desc')!.textContent = card.def.description;
      el.title = `${card.def.name} — ${card.def.description} (cost ${card.def.cost})`;
    }

    // Resolve target zone.
    const inHand = ctx.world.getTag(InHandTag).has(id);
    const inDeck = ctx.world.getTag(InDeckTag).has(id);
    const inDiscard = ctx.world.getTag(InDiscardTag).has(id);
    const isDragging = ctx.state.drag?.cardId === id;

    const desiredParent = isDragging
      ? this.zones.dragLayer
      : inHand
        ? this.zones.handZone
        : inDeck
          ? this.zones.deckZone
          : inDiscard
            ? this.zones.discardZone
            : null;

    if (desiredParent && el.parentElement !== desiredParent)
      desiredParent.append(el);

    // Classes.
    const affordable = card ? card.def.cost <= ctx.state.energy : false;
    el.classList.toggle('cb-card--playable', inHand && affordable && ctx.state.phase === 'player');
    el.classList.toggle('cb-card--unaffordable', inHand && !affordable);
    el.classList.toggle('cb-card--dragging', isDragging);
    el.classList.toggle('cb-card--in-deck', inDeck);
    el.classList.toggle('cb-card--in-discard', inDiscard);
    el.classList.toggle('cb-card--in-hand', inHand && !isDragging);

    // Drag transform — only when dragging. Live pointer coords.
    if (isDragging) {
      const px = ctx.state.pointer.x;
      const py = ctx.state.pointer.y;
      el.style.left = `${px}px`;
      el.style.top = `${py}px`;
    }
    else {
      el.style.left = '';
      el.style.top = '';
    }
  }

  private renderCards(ctx: DomRenderContext): void {
    const present = new Set<EntityId>();
    const cardStore = ctx.world.getStore(CardDefComp);
    const inHand = ctx.world.getTag(InHandTag);
    const inDeck = ctx.world.getTag(InDeckTag);
    const inDiscard = ctx.world.getTag(InDiscardTag);

    for (const zoneTag of [inHand, inDeck, inDiscard]) {
      for (const id of zoneTag) {
        present.add(id);
        this.renderCard(ctx, id, cardStore.get(id)?.def.name ?? '?');
      }
    }

    // Remove orphans (post-reset, entity ids from prior run).
    for (const [id, el] of this.cardElements) {
      if (!present.has(id)) {
        el.remove();
        this.cardElements.delete(id);
      }
    }
  }

  // --- HUD + overlay ----------------------------------------------------

  private renderHud(ctx: DomRenderContext): void {
    this.zones.phaseLabel.textContent = phaseLabel(ctx.state.phase);
    this.zones.energyLabel.textContent = `Energy ${ctx.state.energy} / ${ctx.state.energyMax}`;
    const intent = ctx.world.getStore(EnemyIntentDef).get(ctx.state.enemyId);
    this.zones.enemyIntentLabel.textContent = intent
      ? `Enemy intends: ${intent.kind} ${intent.value}`
      : '';
    this.zones.endTurnButton.disabled = ctx.state.phase !== 'player';
    this.zones.resetButton.disabled = false;
    this.zones.deckZone.textContent = `Deck (${ctx.world.getTag(InDeckTag).size})`;
    this.zones.discardZone.textContent = `Discard (${ctx.world.getTag(InDiscardTag).size})`;
  }

  private renderOverlay(ctx: DomRenderContext): void {
    const existing = ctx.root.querySelector<HTMLDivElement>('.cb-overlay');
    if (ctx.state.phase === 'victory' || ctx.state.phase === 'defeat') {
      if (existing)
        return;
      const overlay = createDiv('cb-overlay');
      overlay.textContent = ctx.state.phase === 'victory' ? 'Victory!' : 'Defeat';
      ctx.root.append(overlay);
    }
    else {
      existing?.remove();
    }
  }
}

function phaseLabel(phase: Phase): string {
  switch (phase) {
    case 'player':
      return 'Your turn';
    case 'enemy':
      return 'Enemy turn';
    case 'victory':
      return 'Victory';
    case 'defeat':
      return 'Defeat';
  }
}

function createDiv(className: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = className;
  return el;
}
