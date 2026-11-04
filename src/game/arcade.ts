import { drawFigure } from '../world/rig';

// A small 2D arcade frame for story mode's stops: one canvas, keys, taps, comic words,
// screen shake, a speech bubble and full-screen interruptions. Each game draws itself.

export interface Result {
  passed: boolean;
  headline?: string;
}

export interface Kit {
  /** Logical size. The shorter side is always 540 units. */
  W: number;
  H: number;
  g: CanvasRenderingContext2D;
  /** Seconds since the game started. */
  t: number;
  /** Arrow keys or WASD, as -1 to 1 on each axis. */
  stick: () => { x: number; y: number };
  /** True on the frame a key was pressed. Codes like 'Space', 'ArrowUp'. */
  pressed: (...codes: string[]) => boolean;
  /** Taps and clicks since the last frame, in logical units. */
  taps: { x: number; y: number }[];
  pointer: { x: number; y: number; down: boolean };
  touch: boolean;
  word: (text: string, x: number, y: number, color?: string, size?: number) => void;
  shake: (amount: number) => void;
  say: (text: string) => void;
  /** Covers the game with an HTML screen for a moment, then calls back. */
  interrupt: (html: string, className: string, ms: number, then?: () => void) => void;
  boom: () => void;
  figure: (mood: string) => HTMLCanvasElement;
  end: (result: Result) => void;
  /** For the automated tests only: shows game state when the page has the ?fixed test flag. */
  expose: (state: Record<string, unknown>) => void;
}

export interface Game {
  brief: string;
  how: string;
  howTouch: string;
  /** Returns the per-frame update, which also draws. */
  start: (k: Kit) => (dt: number) => void;
}

export const INK = '#07040e';
export const PAPER = '#fff4d6';
export const YELLOW = '#ffc917';
export const PINK = '#ff2e88';
export const CYAN = '#17e4ff';
export const GREEN = '#7dff5e';
export const RED = '#e5322d';
export const PURPLE = '#2a0f5e';
export const DISPLAY = 'Anton, Impact, sans-serif';
export const HAND = 'Kalam, "Comic Sans MS", cursive';
export const LABEL = 'Teko, "Arial Narrow", sans-serif';

const figures = new Map<string, HTMLCanvasElement>();
const figure = (mood: string) => {
  if (!figures.has(mood)) figures.set(mood, drawFigure(mood, 360));
  return figures.get(mood)!;
};

/** Text with a thick ink outline, the house style for anything shouted. */
export function inked(g: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string, font = DISPLAY) {
  g.font = `${size}px ${font}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = size * 0.16;
  g.strokeStyle = INK;
  g.strokeText(text, x, y);
  g.fillStyle = color;
  g.fillText(text, x, y);
}

/** A comic box: flat fill, ink border, hard shadow. */
export function panel(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string, shadow = INK) {
  g.fillStyle = shadow;
  g.fillRect(x + 6, y + 6, w, h);
  g.fillStyle = fill;
  g.fillRect(x, y, w, h);
  g.lineWidth = 4;
  g.strokeStyle = INK;
  g.strokeRect(x, y, w, h);
}

export const clamp = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b);
export const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

/** Mounts a game into `host`. Returns a cleanup function. */
export function runArcade(host: HTMLElement, game: Game, hooks: { say: (text: string) => void; end: (r: Result) => void }) {
  host.innerHTML = '<canvas class="g-arcade__canvas"></canvas><div class="g-arcade__cover" hidden></div>';
  const canvas = host.querySelector('canvas')!;
  const cover = host.querySelector<HTMLElement>('.g-arcade__cover')!;
  const g = canvas.getContext('2d')!;
  const held = new Set<string>();
  const fresh = new Set<string>();
  const taps: { x: number; y: number }[] = [];
  const pointer = { x: 0, y: 0, down: false };
  const words: { text: string; x: number; y: number; color: string; size: number; age: number; rot: number }[] = [];
  let unit = 1;
  let shakeAmt = 0;
  let paused = false;
  let over = false;

  let dpr = 1;
  const resize = () => {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    unit = Math.min(r.width, r.height) / 540;
    kit.W = r.width / unit;
    kit.H = r.height / unit;
  };
  const toLogical = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / unit, y: (e.clientY - r.top) / unit };
  };

  const kit: Kit = {
    W: 960,
    H: 540,
    g,
    t: 0,
    stick: () => ({
      x: (held.has('ArrowRight') || held.has('KeyD') ? 1 : 0) - (held.has('ArrowLeft') || held.has('KeyA') ? 1 : 0),
      y: (held.has('ArrowDown') || held.has('KeyS') ? 1 : 0) - (held.has('ArrowUp') || held.has('KeyW') ? 1 : 0),
    }),
    pressed: (...codes) => codes.some((c) => fresh.has(c)),
    taps,
    pointer,
    touch: matchMedia('(pointer: coarse)').matches,
    word: (text, x, y, color = YELLOW, size = 54) => words.push({ text, x, y, color, size, age: 0, rot: (Math.random() - 0.5) * 0.3 }),
    shake: (amount) => {
      shakeAmt = Math.max(shakeAmt, amount);
    },
    say: hooks.say,
    interrupt: (html, className, ms, then) => {
      paused = true;
      cover.className = `g-arcade__cover ${className}`;
      cover.innerHTML = html;
      cover.hidden = false;
      window.setTimeout(() => {
        cover.hidden = true;
        cover.innerHTML = '';
        paused = false;
        last = performance.now();
        then?.();
      }, ms);
    },
    boom: () => window.dispatchEvent(new Event('world:cut')),
    figure,
    expose: (state) => {
      if (/[?&]fixed/.test(location.search)) (window as unknown as { __arcade: unknown }).__arcade = state;
    },
    end: (r) => {
      if (over) return;
      over = true;
      window.setTimeout(() => hooks.end(r), 900);
    },
  };

  const onKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement).closest?.('input, textarea')) return;
    if (/^(Arrow|Key[WASD]$|Space$|Enter$)/.test(e.code)) e.preventDefault();
    if (e.type === 'keydown') {
      if (!held.has(e.code)) fresh.add(e.code);
      held.add(e.code);
    } else held.delete(e.code);
  };
  const onDown = (e: PointerEvent) => {
    const p = toLogical(e);
    pointer.x = p.x;
    pointer.y = p.y;
    pointer.down = true;
    taps.push(p);
    canvas.setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent) => {
    const p = toLogical(e);
    pointer.x = p.x;
    pointer.y = p.y;
  };
  const onUp = () => {
    pointer.down = false;
  };
  const onBlur = () => held.clear();
  addEventListener('keydown', onKey);
  addEventListener('keyup', onKey);
  addEventListener('blur', onBlur);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.style.touchAction = 'none';
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  const step = game.start(kit);
  let last = performance.now();
  let raf = 0;
  let alive = true;
  const frame = (now: number) => {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (paused) return;
    kit.t += dt;
    g.setTransform(unit * dpr, 0, 0, unit * dpr, 0, 0);
    if (shakeAmt > 0) {
      g.translate((Math.random() - 0.5) * shakeAmt * 18, (Math.random() - 0.5) * shakeAmt * 18);
      shakeAmt = Math.max(shakeAmt - dt * 3, 0);
    }
    step(dt);
    // Comic words on top, popping in on twos.
    for (let i = words.length - 1; i >= 0; i--) {
      const w = words[i];
      w.age += dt;
      if (w.age > 0.9) {
        words.splice(i, 1);
        continue;
      }
      const s = w.age < 0.12 ? 1.6 - w.age * 5 : 1;
      g.save();
      g.translate(w.x, w.y - w.age * 30);
      g.rotate(w.rot);
      g.scale(s, s);
      g.globalAlpha = w.age > 0.7 ? (0.9 - w.age) / 0.2 : 1;
      inked(g, w.text, 0, 0, w.size, w.color);
      g.restore();
    }
    fresh.clear();
    taps.length = 0;
  };
  raf = requestAnimationFrame(frame);

  return () => {
    alive = false;
    cancelAnimationFrame(raf);
    ro.disconnect();
    removeEventListener('keydown', onKey);
    removeEventListener('keyup', onKey);
    removeEventListener('blur', onBlur);
  };
}
