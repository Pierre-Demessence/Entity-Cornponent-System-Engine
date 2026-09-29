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

import type { GameState, PileRef } from './game';
import type { Run } from './render';

import { EcsWorld } from '@pierre/ecs';
import { AssetLoader, audioBufferAsset, imageAsset, textAsset } from '@pierre/ecs/modules/asset-loader';
import { WebAudioProvider } from '@pierre/ecs/modules/audio';
import { aabbContainsPoint } from '@pierre/ecs/modules/collision';
import { DragDrop } from '@pierre/ecs/modules/drag-drop';
import { projectPointer } from '@pierre/ecs/modules/input';
import { addToPile, installPiles, moveAll, moveTop, pileSize, pileTop } from '@pierre/ecs/modules/pile';
import { RenderableDef, RenderOrderDef } from '@pierre/ecs/modules/render-canvas2d';
import { pick } from '@pierre/ecs/modules/rng';
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
  cardOf,
  cardPosition,
  cardRect,
  cardsIn,
  dealNewGame,
  dropRect,
  findFoundationFor,
  isWon,
  pileEntity,
  slotPosition,
  topCard,
} from './game';
import {
  BACKS_ATLAS,
  CARDS_ATLAS,
  renderFrame,
  syncLayout,
} from './render';

const slideUrls = [slide1Url, slide2Url, slide3Url];
const placeUrls = [place1Url, place2Url, place3Url];

/**
 * Pointer travel (canvas pixels) before a press becomes a drag, so a click or
 * a double-click on a card never starts one.
 */
const DRAG_THRESHOLD = 4;

/** Where a drop may land, in priority order: foundations before tableau columns. */
const DROP_TARGETS: readonly PileRef[] = [
  ...[0, 1, 2, 3].map((index): PileRef => ({ index, kind: 'foundation' })),
  ...[0, 1, 2, 3, 4, 5, 6].map((index): PileRef => ({ index, kind: 'tableau' })),
];

function makeWorld(): EcsWorld {
  const world = new EcsWorld();
  world.registerComponent(PositionDef);
  world.registerComponent(RenderableDef);
  world.registerComponent(RenderOrderDef);
  installPiles(world);
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
  let state: GameState | null = null;
  let audio: { place: string[]; provider: WebAudioProvider; slide: string[] } | null = null;
  let rafId = 0;

  // The run's top-left follows the pointer; the drop is tested at the dragged
  // card's centre, so a card counts as over a pile when most of it is.
  const drag = new DragDrop<Run, PileRef>({
    threshold: DRAG_THRESHOLD,
    accepts: (target, run) => canDrop(state!, run, target),
    contains: (target, point) => aabbContainsPoint(dropRect(state!, target), point),
    probe: s => ({ x: s.position.x + CARD_W / 2, y: s.position.y + CARD_H / 2 }),
    targets: () => DROP_TARGETS,
  });

  const newDeal = (): void => {
    state = dealNewGame(makeWorld());
    drag.cancel();
    hint.textContent = 'Click the stock to deal · drag to move · double-click to send to a foundation';
  };

  const playSfx = (kind: 'place' | 'slide'): void => {
    if (!audio)
      return;
    const ids = kind === 'slide' ? audio.slide : audio.place;
    const id = pick(ids)!;
    try {
      audio.provider.play(id, { channel: 'sfx', volume: 0.6 });
    }
    catch {
      // A clip can fail if decoding was skipped; SFX is non-essential.
    }
  };

  // --- Input ---

  const toWorld = (event: PointerEvent | MouseEvent): { x: number; y: number } =>
    projectPointer(event, canvas);

  const onPointerDown = (event: PointerEvent): void => {
    if (!state || state.won)
      return;
    void audioCtx.resume();
    const point = toWorld(event);

    if (aabbContainsPoint(cardRect(slotPosition({ index: 0, kind: 'stock' })), point)) {
      dealFromStock(state, playSfx);
      return;
    }

    const hit = pickCard(state, point);
    if (!hit)
      return;
    const pile = cardsIn(state, hit.pile);
    if (!cardOf(state, pile[hit.index]!).faceUp)
      return;
    if (hit.pile.kind !== 'tableau' && hit.index !== pile.length - 1)
      return; // only the top card of waste/foundation is draggable

    // A tableau card drags the whole run above it.
    const run: Run = { cards: pile.slice(hit.index), from: hit.pile };
    drag.begin(run, point, cardPosition(state, hit.pile, hit.index));
    canvas.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent): void => {
    drag.move(toWorld(event));
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (!drag.session || !state)
      return;
    if (canvas.hasPointerCapture(event.pointerId))
      canvas.releasePointerCapture(event.pointerId);
    const drop = drag.end(toWorld(event));
    if (!drop)
      return; // a click, not a drag
    if (!drop.target) {
      playSfx('slide');
      return; // snap back: next layout restores positions
    }
    const { cards, from } = drop.payload;
    moveTop(state.world, pileEntity(state, from), pileEntity(state, drop.target), cards.length);
    flipExposed(from, state);
    playSfx('place');
    finishMove(state);
  };

  const onPointerCancel = (event: PointerEvent): void => {
    if (canvas.hasPointerCapture(event.pointerId))
      canvas.releasePointerCapture(event.pointerId);
    drag.cancel();
  };

  const onDoubleClick = (event: MouseEvent): void => {
    if (!state || state.won)
      return;
    const hit = pickCard(state, toWorld(event));
    if (!hit || hit.pile.kind === 'foundation' || hit.pile.kind === 'stock')
      return;
    const pile = cardsIn(state, hit.pile);
    const id = pile[hit.index]!;
    const card = cardOf(state, id);
    if (!card.faceUp || hit.index !== pile.length - 1)
      return;
    const target = findFoundationFor(state, card);
    if (target === -1)
      return;
    addToPile(state.world, state.foundations[target]!, id);
    flipExposed(hit.pile, state);
    playSfx('place');
    finishMove(state);
  };

  canvas.addEventListener('pointerdown', onPointerDown, { signal: abort.signal });
  canvas.addEventListener('pointermove', onPointerMove, { signal: abort.signal });
  canvas.addEventListener('pointerup', onPointerUp, { signal: abort.signal });
  canvas.addEventListener('pointercancel', onPointerCancel, { signal: abort.signal });
  canvas.addEventListener('dblclick', onDoubleClick, { signal: abort.signal });
  newDealBtn.addEventListener('click', newDeal, { signal: abort.signal });

  function finishMove(s: GameState): void {
    if (isWon(s)) {
      s.won = true;
      hint.textContent = 'You win! Press “New deal” to play again.';
    }
  }

  function dealFromStock(s: GameState, sfx: (kind: 'place' | 'slide') => void): void {
    if (pileSize(s.world, s.stock) > 0) {
      const [id] = moveTop(s.world, s.stock, s.waste);
      cardOf(s, id!).faceUp = true;
    }
    else {
      // Turning the waste over reverses it: its top card becomes the stock's bottom.
      for (const id of moveAll(s.world, s.waste, s.stock, { reverse: true }))
        cardOf(s, id).faceUp = false;
    }
    sfx('slide');
  }

  // --- Render loop ---

  const loop = (): void => {
    if (disposed)
      return;
    if (state) {
      syncLayout(state, drag.session);
      renderFrame(ctx2d, atlasesOrEmpty(), state);
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

/** Topmost card whose rect contains `point`, searching exposed cards. */
function pickCard(
  state: GameState,
  point: { x: number; y: number },
): { index: number; pile: PileRef } | null {
  for (let t = 0; t < 7; t++) {
    const pile: PileRef = { index: t, kind: 'tableau' };
    for (let i = cardsIn(state, pile).length - 1; i >= 0; i--) {
      if (aabbContainsPoint(cardRect(cardPosition(state, pile, i)), point))
        return { index: i, pile };
    }
  }
  const piles: PileRef[] = [
    { index: 0, kind: 'waste' },
    ...[0, 1, 2, 3].map((index): PileRef => ({ index, kind: 'foundation' })),
  ];
  for (const pile of piles) {
    const size = cardsIn(state, pile).length;
    if (size > 0 && aabbContainsPoint(cardRect(slotPosition(pile)), point))
      return { index: size - 1, pile };
  }
  return null;
}

/** Whether `run` may land on `target` under Klondike rules. */
function canDrop(state: GameState, run: Run, target: PileRef): boolean {
  const first = cardOf(state, run.cards[0]!);
  if (target.kind === 'foundation')
    return run.cards.length === 1 && canDropOnFoundation(first, topCard(state, target));
  if (run.from.kind === 'tableau' && run.from.index === target.index)
    return false;
  return canDropOnTableau(first, topCard(state, target));
}

/** Flip the newly-exposed top card of a tableau pile face-up. */
function flipExposed(from: PileRef, state: GameState): void {
  if (from.kind !== 'tableau')
    return;
  const top = pileTop(state.world, pileEntity(state, from));
  if (top !== undefined)
    cardOf(state, top).faceUp = true;
}
