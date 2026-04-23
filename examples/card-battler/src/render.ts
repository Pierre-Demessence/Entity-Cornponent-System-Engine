import type { EcsWorld, EntityId, Renderer } from '@pierre/ecs';

import type { GameState, Phase } from './game';

import { DomRenderableDef, DomRenderer as EcsDomRenderer } from '@pierre/ecs/modules/render-dom';
import { PositionDef } from '@pierre/ecs/modules/transform';

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
 * Card-battler wrapper around `@pierre/ecs/modules/render-dom`.
 *
 * The engine renderer now owns entity-id -> node bookkeeping,
 * `data-entity-id` mapping, and orphan cleanup. This wrapper keeps the
 * card-battler-specific zone layout and HUD reconciliation.
 */
export class DomRenderer implements Renderer<DomRenderContext> {
  private dragCardId: EntityId | null = null;
  private readonly entityRenderer = new EcsDomRenderer({
    reconcile: ({ entityId, node }) => {
      if (this.dragCardId === entityId)
        return;
      node.style.left = '';
      node.style.position = '';
      node.style.top = '';
    },
  });

  private mounted = false;
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

  private findNode(ctx: DomRenderContext, entityId: EntityId): HTMLElement | null {
    return ctx.root.querySelector<HTMLElement>(`[data-entity-id="${entityId}"]`);
  }

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

    this.dragCardId = ctx.state.drag?.cardId ?? null;
    this.syncRenderableState(ctx);
    this.entityRenderer.render({ root: ctx.root, world: ctx.world });

    this.renderActor(ctx, 'player');
    this.renderActor(ctx, 'enemy');
    this.renderCards(ctx);
    this.renderHud(ctx);
    this.renderOverlay(ctx);
  }

  private renderActor(ctx: DomRenderContext, which: 'player' | 'enemy'): void {
    const tagDef = which === 'player' ? PlayerTag : EnemyTag;
    const [actorId] = [...ctx.world.getTag(tagDef)];
    if (actorId == null)
      return;

    const el = this.findNode(ctx, actorId);
    if (!el)
      return;

    ensureActorStructure(el, which);
    const targetZone = which === 'player' ? this.zones.playerZone : this.zones.enemyZone;
    if (el.parentElement !== targetZone)
      targetZone.append(el);

    const hp = ctx.world.getStore(HealthDef).get(actorId);
    const block = ctx.world.getStore(BlockDef).get(actorId);
    const hpEl = el.querySelector<HTMLElement>('.cb-actor-hp');
    const blockEl = el.querySelector<HTMLElement>('.cb-actor-block');
    if (hpEl)
      hpEl.textContent = hp ? `HP ${hp.current} / ${hp.max}` : 'HP -';
    if (blockEl)
      blockEl.textContent = block && block.amount > 0 ? `Block ${block.amount}` : '';
  }

  // --- Actor (player / enemy) rendering ---------------------------------

  private renderCard(ctx: DomRenderContext, id: EntityId, name: string): void {
    const el = this.findNode(ctx, id);
    if (!el)
      return;

    ensureCardStructure(el);

    const card = ctx.world.getStore(CardDefComp).get(id);
    const nameEl = el.querySelector<HTMLElement>('.cb-card-name');
    const costEl = el.querySelector<HTMLElement>('.cb-card-cost');
    const descEl = el.querySelector<HTMLElement>('.cb-card-desc');
    if (card) {
      if (nameEl)
        nameEl.textContent = name;
      if (costEl)
        costEl.textContent = String(card.def.cost);
      if (descEl)
        descEl.textContent = card.def.description;
      el.title = `${card.def.name} - ${card.def.description} (cost ${card.def.cost})`;
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
  }

  // --- Card rendering ---------------------------------------------------

  private renderCards(ctx: DomRenderContext): void {
    const cardStore = ctx.world.getStore(CardDefComp);
    const zoneTags = [
      ctx.world.getTag(InHandTag),
      ctx.world.getTag(InDeckTag),
      ctx.world.getTag(InDiscardTag),
    ];

    for (const zoneTag of zoneTags) {
      for (const id of zoneTag) {
        this.renderCard(ctx, id, cardStore.get(id)?.def.name ?? '?');
      }
    }
  }

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

  // --- HUD + overlay ----------------------------------------------------

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

  private syncRenderableState(ctx: DomRenderContext): void {
    const domStore = ctx.world.getStore(DomRenderableDef);
    const posStore = ctx.world.getStore(PositionDef);
    const present = new Set<EntityId>();

    for (const playerId of ctx.world.getTag(PlayerTag)) {
      present.add(playerId);
      domStore.set(playerId, { className: 'cb-actor cb-actor--player' });
      posStore.set(playerId, { x: 0, y: 0 });
    }

    for (const enemyId of ctx.world.getTag(EnemyTag)) {
      present.add(enemyId);
      domStore.set(enemyId, { className: 'cb-actor cb-actor--enemy' });
      posStore.set(enemyId, { x: 0, y: 0 });
    }

    const zoneTags = [
      ctx.world.getTag(InHandTag),
      ctx.world.getTag(InDeckTag),
      ctx.world.getTag(InDiscardTag),
    ];
    for (const zoneTag of zoneTags) {
      for (const id of zoneTag) {
        present.add(id);
        const isDragging = ctx.state.drag?.cardId === id;
        domStore.set(id, { className: 'cb-card' });
        posStore.set(id, {
          x: isDragging ? ctx.state.pointer.x : 0,
          y: isDragging ? ctx.state.pointer.y : 0,
        });
      }
    }

    for (const [id] of domStore) {
      if (present.has(id))
        continue;
      domStore.delete(id);
      posStore.delete(id);
    }
  }
}

function ensureActorStructure(node: HTMLElement, which: 'player' | 'enemy'): void {
  if (node.querySelector('.cb-actor-name'))
    return;

  const nameEl = createDiv('cb-actor-name');
  nameEl.textContent = which === 'player' ? 'You' : 'Enemy';
  const hpEl = createDiv('cb-actor-hp');
  const blockEl = createDiv('cb-actor-block');
  node.append(nameEl, hpEl, blockEl);
}

function ensureCardStructure(node: HTMLElement): void {
  if (node.querySelector('.cb-card-name'))
    return;

  const costEl = createDiv('cb-card-cost');
  const nameEl = createDiv('cb-card-name');
  const descEl = createDiv('cb-card-desc');
  node.append(costEl, nameEl, descEl);
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
