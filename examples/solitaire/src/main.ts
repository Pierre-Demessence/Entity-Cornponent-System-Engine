/**
 * Solitaire (Klondike, draw-1) — example entry point.
 *
 * Wires the Kenney card atlas into the engine's Canvas2D sprite renderer,
 * deals a game, and drives it with pointer input:
 *
 * - click the stock to deal to the waste (empty stock recycles the waste),
 * - drag a face-up card (and the run beneath it) between tableau columns,
 * - drag a single card to a foundation, or double-click to auto-send it,
 * - illegal drops snap back; exposing a face-down tableau card flips it.
 *
 * Rendering proves the canvas renderer + `RenderOrderDef` under interactive
 * conditions: the dragged stack moves every frame and floats above all piles
 * via a render-order bump. Card SFX go through the audio module.
 */

import type { EntityId } from '@pierre/ecs';

import type { Card, GameState, PileRef } from './game';

import { EcsWorld } from '@pierre/ecs';
import { AssetLoader, audioBufferAsset, imageAsset, textAsset } from '@pierre/ecs/modules/asset-loader';
import { WebAudioProvider } from '@pierre/ecs/modules/audio';
import { RenderableDef, RenderOrderDef } from '@pierre/ecs/modules/render-canvas2d';
import { parseTexturePackerAtlas, TextureAtlasRegistry } from '@pierre/ecs/modules/texture-atlas';
import { PositionDef } from '@pierre/ecs/modules/transform';

import place1Url from '../../assets/kenney_boardgame-pack/Bonus/cardPlace1.ogg?url';
import place2Url from '../../assets/kenney_boardgame-pack/Bonus/cardPlace2.ogg?url';
import place3Url from '../../assets/kenney_boardgame-pack/Bonus/cardPlace3.ogg?url';
import slide1Url from '../../assets/kenney_boardgame-pack/Bonus/cardSlide1.ogg?url';
import slide2Url from '../../assets/kenney_boardgame-pack/Bonus/cardSlide2.ogg?url';
import slide3Url from '../../assets/kenney_boardgame-pack/Bonus/cardSlide3.ogg?url';
import backsSheetUrl from '../../assets/kenney_boardgame-pack/Spritesheets/playingCardBacks.png?url';
import backsXmlUrl from '../../assets/kenney_boardgame-pack/Spritesheets/playingCardBacks.xml?url';
// `?url` makes Vite fingerprint + emit each asset (and return its served URL).
// `new URL(..., import.meta.url)` does NOT reliably emit non-JS extensions in
// this setup, so the explicit `?url` import is the proven pattern (see the
// tilemap example's postmortem).
import cardsSheetUrl from '../../assets/kenney_boardgame-pack/Spritesheets/playingCards.png?url';
import cardsXmlUrl from '../../assets/kenney_boardgame-pack/Spritesheets/playingCards.xml?url';
import {
  canDropOnFoundation,
  canDropOnTableau,
  CANVAS_H,
  CANVAS_W,

  CARD_H,
  CARD_W,
  cardPosition,
  dealNewGame,
  findFoundationFor,

  isWon,
  pileArray,

  slotPosition,
} from './game';
import {
  BACKS_ATLAS,
  CARDS_ATLAS,
  renderFrame,
  syncLayout,
} from './render';

const slideUrls = [slide1Url, slide2Url, slide3Url];
const placeUrls = [place1Url, place2Url, place3Url];

interface Drag {
  cards: Card[];
  from: PileRef;
  grabX: number;
  grabY: number;
  pointerX: number;
  pointerY: number;
}

function makeWorld(): EcsWorld {
  const world = new EcsWorld();
  world.registerComponent(PositionDef);
  world.registerComponent(RenderableDef);
  world.registerComponent(RenderOrderDef);
  return world;
}

export function start(container: HTMLElement): () => void {
  container.innerHTML = '';

  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  canvas.style.cssText = `display:block;width:${CANVAS_W}px;height:${CANVAS_H}px;`
    + 'margin:0 auto;border-radius:10px;touch-action:none;cursor:pointer';
  const ctx2d = canvas.getContext('2d')!;

  const bar = document.createElement('div');
  bar.style.cssText = 'display:flex;gap:12px;align-items:center;justify-content:center;'
    + 'padding:10px;font:13px system-ui;color:#cde';

  const newDealBtn = document.createElement('button');
  newDealBtn.textContent = 'New deal';
  newDealBtn.style.cssText = 'padding:6px 14px;font:inherit;font-weight:600;color:#fff;'
    + 'background:#1f6b4f;border:1px solid #3fbf8f;border-radius:6px;cursor:pointer';

  const hint = document.createElement('span');
  hint.textContent = 'Loading cards…';

  bar.append(newDealBtn, hint);
  container.append(bar, canvas);

  const assetLoader = new AssetLoader();
  const abort = new AbortController();
  const audioCtx = new (window.AudioContext ?? (window as unknown as {
    webkitAudioContext: typeof AudioContext;
  }).webkitAudioContext)();

  let disposed = false;
  let world = makeWorld();
  let state: GameState | null = null;
  let drag: Drag | null = null;
  let audio: { place: string[]; provider: WebAudioProvider; slide: string[] } | null = null;
  let rafId = 0;

  const newDeal = (): void => {
    world = makeWorld();
    state = dealNewGame((): EntityId => world.createEntity());
    drag = null;
    hint.textContent = 'Click the stock to deal · drag to move · double-click to send to a foundation';
  };

  const playSfx = (kind: 'place' | 'slide'): void => {
    if (!audio)
      return;
    const ids = kind === 'slide' ? audio.slide : audio.place;
    const id = ids[Math.floor(Math.random() * ids.length)]!;
    try {
      audio.provider.play(id, { channel: 'sfx', volume: 0.6 });
    }
    catch {
      // A clip can fail if decoding was skipped; SFX is non-essential.
    }
  };

  // --- Input ---

  const toWorld = (event: PointerEvent | MouseEvent): { x: number; y: number } => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (CANVAS_W / rect.width),
      y: (event.clientY - rect.top) * (CANVAS_H / rect.height),
    };
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (!state || state.won)
      return;
    void audioCtx.resume();
    const point = toWorld(event);

    if (inSlot(point, slotPosition({ index: 0, kind: 'stock' }))) {
      dealFromStock(state, playSfx);
      return;
    }

    const hit = pickCard(state, point);
    if (!hit)
      return;
    const pile = pileArray(state, hit.pile);
    const card = pile[hit.index]!;
    if (!card.faceUp)
      return;
    if (hit.pile.kind === 'tableau' ? false : hit.index !== pile.length - 1)
      return; // only the top card of waste/foundation is draggable

    const cards = hit.pile.kind === 'tableau' ? pile.slice(hit.index) : [card];
    const origin = cardPosition(state, hit.pile, hit.index);
    drag = {
      cards,
      from: hit.pile,
      grabX: point.x - origin.x,
      grabY: point.y - origin.y,
      pointerX: point.x,
      pointerY: point.y,
    };
    canvas.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (!drag)
      return;
    const point = toWorld(event);
    drag.pointerX = point.x;
    drag.pointerY = point.y;
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (!drag || !state)
      return;
    if (canvas.hasPointerCapture(event.pointerId))
      canvas.releasePointerCapture(event.pointerId);
    resolveDrop(state, drag, playSfx);
    drag = null;
  };

  const onDoubleClick = (event: MouseEvent): void => {
    if (!state || state.won)
      return;
    const hit = pickCard(state, toWorld(event));
    if (!hit || hit.pile.kind === 'foundation' || hit.pile.kind === 'stock')
      return;
    const pile = pileArray(state, hit.pile);
    const card = pile[hit.index]!;
    if (!card.faceUp || hit.index !== pile.length - 1)
      return;
    const target = findFoundationFor(state, card);
    if (target === -1)
      return;
    pile.pop();
    state.foundations[target]!.push(card);
    flipExposed(hit.pile, state);
    playSfx('place');
    finishMove(state);
  };

  canvas.addEventListener('pointerdown', onPointerDown, { signal: abort.signal });
  canvas.addEventListener('pointermove', onPointerMove, { signal: abort.signal });
  canvas.addEventListener('pointerup', onPointerUp, { signal: abort.signal });
  canvas.addEventListener('pointercancel', onPointerUp, { signal: abort.signal });
  canvas.addEventListener('dblclick', onDoubleClick, { signal: abort.signal });
  newDealBtn.addEventListener('click', newDeal, { signal: abort.signal });

  function finishMove(s: GameState): void {
    if (isWon(s)) {
      s.won = true;
      hint.textContent = 'You win! Press “New deal” to play again.';
    }
  }

  function resolveDrop(
    s: GameState,
    d: Drag,
    sfx: (kind: 'place' | 'slide') => void,
  ): void {
    const center = {
      x: d.pointerX - d.grabX + CARD_W / 2,
      y: d.pointerY - d.grabY + CARD_H / 2,
    };
    const target = dropTarget(s, center, d);
    if (!target) {
      sfx('slide');
      return; // snap back: next layout restores positions
    }

    const source = pileArray(s, d.from);
    source.splice(source.length - d.cards.length, d.cards.length);
    pileArray(s, target).push(...d.cards);
    flipExposed(d.from, s);
    sfx('place');
    finishMove(s);
  }

  function dealFromStock(s: GameState, sfx: (kind: 'place' | 'slide') => void): void {
    if (s.stock.length > 0) {
      const card = s.stock.pop()!;
      card.faceUp = true;
      s.waste.push(card);
    }
    else {
      while (s.waste.length > 0) {
        const card = s.waste.pop()!;
        card.faceUp = false;
        s.stock.push(card);
      }
    }
    sfx('slide');
  }

  // --- Render loop ---

  const loop = (): void => {
    if (disposed)
      return;
    if (state) {
      syncLayout(world, state, drag);
      renderFrame(ctx2d, world, atlasesOrEmpty(), state);
    }
    rafId = requestAnimationFrame(loop);
  };

  let atlases: TextureAtlasRegistry | null = null;
  function atlasesOrEmpty(): TextureAtlasRegistry {
    return atlases ?? new TextureAtlasRegistry();
  }

  void (async () => {
    try {
      const [cardsImg, cardsXml, backsImg, backsXml, slideBufs, placeBufs] = await Promise.all([
        assetLoader.load(imageAsset(cardsSheetUrl), { signal: abort.signal }),
        assetLoader.load(textAsset(cardsXmlUrl), { signal: abort.signal }),
        assetLoader.load(imageAsset(backsSheetUrl), { signal: abort.signal }),
        assetLoader.load(textAsset(backsXmlUrl), { signal: abort.signal }),
        Promise.all(slideUrls.map(u =>
          assetLoader.load(audioBufferAsset(u, audioCtx), { signal: abort.signal }))),
        Promise.all(placeUrls.map(u =>
          assetLoader.load(audioBufferAsset(u, audioCtx), { signal: abort.signal }))),
      ]);
      if (disposed)
        return;

      atlases = new TextureAtlasRegistry()
        .add(CARDS_ATLAS, cardsImg, parseTexturePackerAtlas(cardsXml).frames)
        .add(BACKS_ATLAS, backsImg, parseTexturePackerAtlas(backsXml).frames);

      const clips: Record<string, AudioBuffer> = {};
      const slide = slideBufs.map((buf, i) => registerClip(clips, `slide${i}`, buf));
      const place = placeBufs.map((buf, i) => registerClip(clips, `place${i}`, buf));
      audio = { place, provider: new WebAudioProvider({ clips, context: audioCtx }), slide };

      newDeal();
      loop();
    }
    catch (error) {
      if (disposed)
        return;
      const message = error instanceof Error ? error.message : String(error);
      hint.style.color = '#f88';
      hint.textContent = `Failed to load: ${message}`;
      console.error('solitaire example:', error);
    }
  })();

  return () => {
    disposed = true;
    abort.abort();
    cancelAnimationFrame(rafId);
    audio?.provider.dispose();
    void audioCtx.close().catch(() => undefined);
    container.innerHTML = '';
  };
}

function registerClip(clips: Record<string, AudioBuffer>, id: string, buf: AudioBuffer): string {
  clips[id] = buf;
  return id;
}

function inSlot(point: { x: number; y: number }, slot: { x: number; y: number }): boolean {
  return point.x >= slot.x && point.x <= slot.x + CARD_W
    && point.y >= slot.y && point.y <= slot.y + CARD_H;
}

/** Topmost card whose rect contains `point`, searching exposed cards. */
function pickCard(
  state: GameState,
  point: { x: number; y: number },
): { index: number; pile: PileRef } | null {
  for (let t = 0; t < 7; t++) {
    const column = state.tableau[t]!;
    for (let i = column.length - 1; i >= 0; i--) {
      if (inSlot(point, cardPosition(state, { index: t, kind: 'tableau' }, i)))
        return { index: i, pile: { index: t, kind: 'tableau' } };
    }
  }
  if (state.waste.length > 0
    && inSlot(point, slotPosition({ index: 0, kind: 'waste' }))) {
    return { index: state.waste.length - 1, pile: { index: 0, kind: 'waste' } };
  }
  for (let f = 0; f < 4; f++) {
    const pile = state.foundations[f]!;
    if (pile.length > 0 && inSlot(point, slotPosition({ index: f, kind: 'foundation' })))
      return { index: pile.length - 1, pile: { index: f, kind: 'foundation' } };
  }
  return null;
}

/** Pile under the dropped stack's centre that legally accepts it. */
function dropTarget(
  state: GameState,
  center: { x: number; y: number },
  drag: Drag,
): PileRef | null {
  if (drag.cards.length === 1) {
    for (let f = 0; f < 4; f++) {
      const pileRef: PileRef = { index: f, kind: 'foundation' };
      if (inSlot(center, slotPosition(pileRef))
        && canDropOnFoundation(drag.cards[0]!, state.foundations[f]!)) {
        return pileRef;
      }
    }
  }
  for (let t = 0; t < 7; t++) {
    if (t === drag.from.index && drag.from.kind === 'tableau')
      continue;
    const slot = slotPosition({ index: t, kind: 'tableau' });
    const column = state.tableau[t]!;
    const bottom = column.length === 0
      ? slot.y + CARD_H
      : cardPosition(state, { index: t, kind: 'tableau' }, column.length - 1).y + CARD_H;
    const inColumn = center.x >= slot.x && center.x <= slot.x + CARD_W
      && center.y >= slot.y && center.y <= bottom + 40;
    if (inColumn && canDropOnTableau(drag.cards[0]!, column))
      return { index: t, kind: 'tableau' };
  }
  return null;
}

/** Flip the newly-exposed top card of a tableau pile face-up. */
function flipExposed(from: PileRef, state: GameState): void {
  if (from.kind !== 'tableau')
    return;
  const top = state.tableau[from.index]!.at(-1);
  if (top && !top.faceUp)
    top.faceUp = true;
}
