import { SpriteClipRegistry } from '@pierre/ecs/modules/animation';
import { TextureAtlasRegistry } from '@pierre/ecs/modules/texture-atlas';

import { GHOST_COLORS, GHOST_KINDS } from './ghosts';
import { FRUIT_NAMES } from './levels';

/** Side of one square cell of the sprite sheet, in px; a sprite is drawn 2 tiles wide, so this is 1:1 at `TILE = 20`. */
export const FRAME = 40;
const COLUMNS = 10;
const DIRS = ['up', 'left', 'down', 'right'] as const;
const DEATH_FRAMES = 11;
const CENTRE = FRAME / 2;

/** Every frame name on the sheet, in sheet order. */
export function frameNames(): string[] {
  const names = ['pac-0', 'pac-1', 'pac-2'];
  for (let i = 0; i < DEATH_FRAMES; i++)
    names.push(`pac-death-${i}`);
  for (const kind of GHOST_KINDS) {
    for (const dir of DIRS) {
      for (const foot of [0, 1])
        names.push(`ghost-${kind}-${dir}-${foot}`);
    }
  }
  for (const tint of ['blue', 'white']) {
    for (const foot of [0, 1])
      names.push(`fright-${tint}-${foot}`);
  }
  for (const dir of DIRS)
    names.push(`eyes-${dir}`);
  for (const fruit of FRUIT_NAMES)
    names.push(`fruit-${fruit}`);
  return names;
}

/** The named animations the actors play, each a list of frames from the sheet. */
export function buildClips(): SpriteClipRegistry {
  const clips = new SpriteClipRegistry()
    .register('pac-move', { fps: 24, frames: ['pac-0', 'pac-1', 'pac-2', 'pac-1'], loop: true })
    .register('pac-idle', { fps: 1, frames: ['pac-1'], loop: true })
    .register('pac-death', { fps: 6, frames: Array.from({ length: DEATH_FRAMES }, (_, i) => `pac-death-${i}`), loop: false })
    .register('fright', { fps: 6, frames: ['fright-blue-0', 'fright-blue-1'], loop: true })
    .register('fright-flash', { fps: 8, frames: ['fright-blue-0', 'fright-white-1', 'fright-blue-1', 'fright-white-0'], loop: true });
  for (const dir of DIRS) {
    clips.register(`eyes-${dir}`, { fps: 1, frames: [`eyes-${dir}`], loop: true });
    for (const kind of GHOST_KINDS)
      clips.register(`${kind}-${dir}`, { fps: 8, frames: [`ghost-${kind}-${dir}-0`, `ghost-${kind}-${dir}-1`], loop: true });
  }
  return clips;
}

type Ctx = CanvasRenderingContext2D;

function pacman(ctx: Ctx, mouth: number): void {
  ctx.fillStyle = '#ffe600';
  ctx.beginPath();
  ctx.moveTo(CENTRE, CENTRE);
  ctx.arc(CENTRE, CENTRE, 16, mouth, Math.PI * 2 - mouth);
  ctx.closePath();
  ctx.fill();
}

function ghostBody(ctx: Ctx, color: string, foot: number): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(CENTRE, 18, 15, Math.PI, 0);
  ctx.lineTo(35, 34);
  for (let i = 0; i <= 6; i++)
    ctx.lineTo(35 - i * 5, (i + foot) % 2 === 0 ? 34 : 29);
  ctx.closePath();
  ctx.fill();
}

const DIR_VECTOR = { down: [0, 1], left: [-1, 0], right: [1, 0], up: [0, -1] } as const;

function eyes(ctx: Ctx, dir: (typeof DIRS)[number]): void {
  const [dx, dy] = DIR_VECTOR[dir];
  for (const x of [14, 26]) {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(x, 17, 4.5, 5.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2121ff';
    ctx.beginPath();
    ctx.arc(x + dx * 2.2, 17 + dy * 2.6, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function scaredFace(ctx: Ctx, color: string): void {
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.fillRect(12, 13, 4, 4);
  ctx.fillRect(24, 13, 4, 4);
  ctx.beginPath();
  ctx.moveTo(8, 27);
  for (let i = 1; i <= 6; i++)
    ctx.lineTo(8 + i * 4, i % 2 === 0 ? 27 : 23);
  ctx.stroke();
}

function disc(ctx: Ctx, x: number, y: number, r: number, fill: string): void {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function leaf(ctx: Ctx, x: number, y: number): void {
  ctx.fillStyle = '#3ecf4c';
  ctx.beginPath();
  ctx.ellipse(x, y, 6, 3, -0.5, 0, Math.PI * 2);
  ctx.fill();
}

function fruit(ctx: Ctx, name: string): void {
  switch (name) {
    case 'cherry':
      ctx.strokeStyle = '#3ecf4c';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(13, 28);
      ctx.quadraticCurveTo(18, 12, 26, 8);
      ctx.moveTo(27, 27);
      ctx.quadraticCurveTo(26, 14, 26, 8);
      ctx.stroke();
      disc(ctx, 13, 29, 7, '#ff1a1a');
      disc(ctx, 27, 28, 7, '#ff1a1a');
      break;
    case 'strawberry':
      ctx.fillStyle = '#ff2d55';
      ctx.beginPath();
      ctx.moveTo(8, 14);
      ctx.quadraticCurveTo(20, 8, 32, 14);
      ctx.quadraticCurveTo(30, 30, 20, 35);
      ctx.quadraticCurveTo(10, 30, 8, 14);
      ctx.fill();
      leaf(ctx, 20, 11);
      ctx.fillStyle = '#fff';
      for (const [x, y] of [[15, 18], [24, 19], [19, 25], [14, 26], [25, 27]] as const)
        ctx.fillRect(x, y, 2, 2);
      break;
    case 'orange':
      disc(ctx, CENTRE, 23, 12, '#ff9c00');
      leaf(ctx, 20, 10);
      break;
    case 'apple':
      disc(ctx, 15, 23, 10, '#ff1a1a');
      disc(ctx, 25, 23, 10, '#ff1a1a');
      leaf(ctx, 22, 9);
      break;
    default:
      disc(ctx, CENTRE, 23, 12, '#5fd35f');
      ctx.strokeStyle = '#c8f5c8';
      ctx.lineWidth = 1.5;
      for (const x of [14, 20, 26]) {
        ctx.beginPath();
        ctx.moveTo(x, 13);
        ctx.lineTo(x, 34);
        ctx.stroke();
      }
      break;
  }
}

function drawFrame(ctx: Ctx, name: string): void {
  const [group, a, b, c] = name.split('-') as [string, string?, string?, string?];
  if (group === 'pac') {
    if (a === 'death')
      pacman(ctx, Math.PI * (0.15 + 0.85 * (Number(b) / (DEATH_FRAMES - 1))));
    else
      pacman(ctx, [0.02, 0.2 * Math.PI, 0.38 * Math.PI][Number(a)]!);
  }
  else if (group === 'ghost') {
    ghostBody(ctx, GHOST_COLORS[a as keyof typeof GHOST_COLORS], Number(c));
    eyes(ctx, b as (typeof DIRS)[number]);
  }
  else if (group === 'fright') {
    const white = a === 'white';
    ghostBody(ctx, white ? '#fff' : '#2121ff', Number(b));
    scaredFace(ctx, white ? '#ff2a2a' : '#ffb8ae');
  }
  else if (group === 'eyes') {
    eyes(ctx, a as (typeof DIRS)[number]);
  }
  else {
    fruit(ctx, a!);
  }
}

/** Draws the whole sprite sheet once, procedurally, and registers every frame under the atlas name `sprites`. */
export function buildAtlas(doc: Document): TextureAtlasRegistry {
  const names = frameNames();
  const sheet = doc.createElement('canvas');
  sheet.width = COLUMNS * FRAME;
  sheet.height = Math.ceil(names.length / COLUMNS) * FRAME;
  const ctx = sheet.getContext('2d')!;
  const frames: Record<string, { h: number; w: number; x: number; y: number }> = {};
  names.forEach((name, i) => {
    const x = (i % COLUMNS) * FRAME;
    const y = Math.floor(i / COLUMNS) * FRAME;
    frames[name] = { h: FRAME, w: FRAME, x, y };
    ctx.save();
    ctx.translate(x, y);
    drawFrame(ctx, name);
    ctx.restore();
  });
  return new TextureAtlasRegistry().add('sprites', sheet, frames);
}
