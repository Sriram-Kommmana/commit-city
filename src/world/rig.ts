// The character, drawn pose by pose with canvas ink into a sprite sheet. Poses change on twos, so the
// movement reads as hand-drawn animation rather than smooth 3D. The body is drawn here. The face is an
// illustration of the owner, cut out into src/art/face.webp, with drawn expressions on top when needed.
import faceUrl from '../art/face.webp?url';

type Limb = [number, number]; // upper and lower angle in degrees. 0 points down, positive swings right.
type Face = 'back' | 'laugh' | 'grin' | 'smirk' | 'worried' | 'shout';
type HandKind = 'fist' | 'open' | 'peace' | 'pocket';

interface Pose {
  rot?: number; // whole-body rotation in degrees
  lean?: number;
  armL: Limb;
  armR: Limb;
  legL: Limb;
  legR: Limb;
  head: Face;
  back?: boolean; // the body seen from behind. Defaults to whether the head is.
  hair?: number; // where the wind pushes the hair, in degrees. 0 is up, positive swings right.
  gust?: number;
  flap?: number; // where the wind throws the blazer tails. 0 hangs down.
  hands?: HandKind;
  armsFront?: boolean; // draw both arms over the torso
  bag?: boolean;
  nearLeft?: boolean; // the arm and leg on the left of the frame are the nearer ones
  size?: number;
  line?: boolean; // the right hand grips the commit line, fired from a gadget on the wrist
}

const INK = '#07040e';
const BLAZER = '#8f93b0';
const BLAZER_MID = '#62648a';
const BLAZER_DARK = '#2b2b48';
const BLAZER_LIGHT = '#bcbfd6';
const RIM = '#f2dfa8';
const SHIRT = '#fbf6ea';
const SHIRT_DARK = '#b9bdd6';
const TROUSER = '#3b3e63';
const TROUSER_MID = '#25263f';
const TROUSER_DARK = '#0e0e1a';
const TROUSER_LIGHT = '#6a6d94';
const SHOE = '#15131f';
const SHOE_MID = '#2c2a3c';
const SHOE_SHINE = '#9a9dc2';
const SOCK = '#d9bf8f';
const SKIN = '#d8966e';
const SKIN_DARK = '#9e5a42';
const SKIN_LIGHT = '#ebbc9c';
const BAG = '#d79a2e';
const BAG_MID = '#a8701c';
const BAG_DARK = '#5e3a0c';
const BAG_LIGHT = '#f4c565';
const HAIR = '#120e1a';
const HAIR_FADE = '#2a2030';
const HAIR_SHINE = '#5d5079';
const FRAME = '#35276b';
const MOUTH = '#3d0f18';
const TONGUE = '#c8505c';
const HEAD = 1.02;

// The cut-out face. Until it loads, or if it never does, the drawn head below stands in.
let face: HTMLImageElement | null = null;
let loading: Promise<void> | null = null;
export const prepareRig = () =>
  (loading ??= new Promise<void>((done) => {
    const img = new Image();
    img.onload = () => {
      face = img;
      done();
    };
    img.onerror = () => done();
    img.src = faceUrl;
  }));

const rad = (d: number) => (d * Math.PI) / 180;
const dir = (d: number): [number, number] => [Math.sin(rad(d)), Math.cos(rad(d))];
const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);

type Pt = [number, number, number?]; // the third value marks a sharp lock tip

// Where the light comes from in the pose's own rotated frame. Set once per pose.
let light: [number, number] = [0.6, -0.8];

// A closed curve through the midpoints, with sharp corners only at the marked tips.
function blob(g: CanvasRenderingContext2D, pts: Pt[]) {
  const mid = (a: Pt, b: Pt): [number, number] => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const n = pts.length;
  const start = mid(pts[n - 1], pts[0]);
  g.beginPath();
  g.moveTo(start[0], start[1]);
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const m = mid(p, pts[(i + 1) % n]);
    if (p[2]) {
      g.lineTo(p[0], p[1]);
      g.lineTo(m[0], m[1]);
    } else {
      g.quadraticCurveTo(p[0], p[1], m[0], m[1]);
    }
  }
  g.closePath();
}

// A tapered ink stroke, thick in the middle and sharp at both ends: the mark a brush makes.
function crescent(g: CanvasRenderingContext2D, x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, w: number) {
  g.beginPath();
  g.moveTo(x0, y0);
  g.quadraticCurveTo(cx, cy - w, x1, y1);
  g.quadraticCurveTo(cx, cy + w, x0, y0);
  g.closePath();
  g.fill();
}

// Thick-and-thin outline: the ink sits heavier on the side away from the light.
function inkShape(g: CanvasRenderingContext2D, shape: () => void, w = 3) {
  g.strokeStyle = INK;
  g.lineJoin = 'round';
  g.save();
  g.translate(-light[0] * 1.7, -light[1] * 1.7);
  shape();
  g.lineWidth = w * 1.6;
  g.stroke();
  g.restore();
  shape();
  g.lineWidth = w;
  g.stroke();
}

interface Cloth {
  base: string;
  mid: string;
  dark: string;
  shine: string;
  rim: string;
}
const SLEEVE: Cloth = { base: BLAZER, mid: BLAZER_MID, dark: BLAZER_DARK, shine: BLAZER_LIGHT, rim: RIM };
const PANTS: Cloth = { base: TROUSER, mid: TROUSER_MID, dark: TROUSER_DARK, shine: TROUSER_LIGHT, rim: TROUSER_LIGHT };

// A limb shaped like cloth over a body: fuller near the top, pinched inside a bend, with folds, a spotted black
// shadow on the side away from the light, print dots where shadow meets light, and a warm rim on the far edge.
function limb(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  [a, b]: Limb,
  len: [number, number],
  w: [number, number, number],
  cloth: Cloth,
) {
  const [ax, ay] = dir(a);
  const [bx, by] = dir(b);
  const mx = x + ax * len[0];
  const my = y + ay * len[0];
  const ex = mx + bx * len[1];
  const ey = my + by * len[1];
  const turn = ax * by - ay * bx;
  const inner = turn < 0 ? 1 : -1;
  const bend = Math.min(Math.abs(turn), 1);
  let jx = ay + by;
  let jy = -(ax + bx);
  const jl = Math.hypot(jx, jy) || 1;
  jx /= jl;
  jy /= jl;
  // Centre line, normal and half-width at five stations along the limb.
  const st: [number, number, number, number, number][] = [
    [x, y, ay, -ax, w[0] / 2],
    [x + ax * len[0] * 0.45, y + ay * len[0] * 0.45, ay, -ax, ((w[0] * 0.72 + w[1] * 0.28) / 2) * 1.05],
    [mx, my, jx, jy, w[1] / 2],
    [mx + bx * len[1] * 0.42, my + by * len[1] * 0.42, by, -bx, (w[1] * 0.5 + w[2] * 0.5) / 2],
    [ex, ey, by, -bx, w[2] / 2],
  ];
  const edge = (side: number, k = 1): Pt[] =>
    st.map(([px, py, nx, ny, h], i) => {
      const squeeze = i === 2 ? (side === inner ? 1 - bend * 0.28 : 1 + bend * 0.14) : 1;
      return [px + nx * h * side * k * squeeze, py + ny * h * side * k * squeeze];
    });
  const left = edge(1);
  const right = edge(-1).reverse();
  const outline: Pt[] = [
    ...left.slice(0, 4),
    [left[4][0], left[4][1], 1],
    [right[0][0], right[0][1], 1],
    ...right.slice(1),
    [x - ax * w[0] * 0.42, y - ay * w[0] * 0.42],
  ];
  const shape = () => blob(g, outline);
  inkShape(g, shape);
  g.fillStyle = cloth.base;
  shape();
  g.fill();
  // The side away from the light.
  const dark = (jx * light[0] + jy * light[1]) < 0 ? 1 : -1;
  const band = (from: number, to: number) => {
    const p = edge(dark, from);
    const q = edge(dark, to).reverse();
    g.beginPath();
    [...p, ...q].forEach((v, i) => (i ? g.lineTo(v[0], v[1]) : g.moveTo(v[0], v[1])));
    g.closePath();
  };
  g.save();
  shape();
  g.clip();
  g.fillStyle = cloth.mid;
  band(1.25, 0.12);
  g.fill();
  g.fillStyle = cloth.dark;
  band(1.25, 0.66);
  g.fill();
  // Print dots fading out into the light.
  g.fillStyle = cloth.mid;
  for (let seg = 0; seg < 2; seg++) {
    const [p0, p1] = seg ? [st[2], st[4]] : [st[0], st[2]];
    const l = len[seg];
    for (let t = 0; t <= 1; t += 4.6 / l) {
      const px = p0[0] + (p1[0] - p0[0]) * t;
      const py = p0[1] + (p1[1] - p0[1]) * t;
      const nx = p0[2] + (p1[2] - p0[2]) * t;
      const ny = p0[3] + (p1[3] - p0[3]) * t;
      const h = p0[4] + (p1[4] - p0[4]) * t;
      for (let row = 0; row < 4; row++) {
        const v = dark * (0.12 - row * 0.2 + (Math.round(t * l / 4.6) % 2) * 0.08);
        g.beginPath();
        g.arc(px + nx * h * v, py + ny * h * v, 1.45 - row * 0.3, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  // A soft sheen down the lit side.
  const shine = edge(-dark, 0.62);
  g.strokeStyle = cloth.shine;
  g.lineWidth = 1.5;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(shine[0][0], shine[0][1]);
  g.quadraticCurveTo(shine[1][0], shine[1][1], shine[2][0], shine[2][1]);
  g.moveTo(shine[3][0], shine[3][1]);
  g.lineTo(shine[4][0], shine[4][1]);
  g.stroke();
  // Folds gather on the inside of the bend, and a few run along the cloth.
  g.fillStyle = INK;
  const folds = Math.abs(a - b) > 14 ? 3 : 1;
  for (let i = 0; i < folds; i++) {
    const back = (i - 1) * 7;
    const fx = mx + ax * back;
    const fy = my + ay * back;
    const h = st[2][4];
    crescent(g, fx + jx * h * inner * 0.95, fy + jy * h * inner * 0.95, fx + jx * h * inner * 0.3 + bx * 4, fy + jy * h * inner * 0.3 + by * 4, fx - jx * h * inner * (0.2 - i * 0.14) + bx * 9, fy - jy * h * inner * (0.2 - i * 0.14) + by * 9, 1.5);
  }
  const lx = st[3][0];
  const ly = st[3][1];
  crescent(g, lx + st[3][2] * st[3][4] * 0.7, ly + st[3][3] * st[3][4] * 0.7, lx + bx * 3, ly + by * 3, lx - st[3][2] * st[3][4] * 0.1 + bx * 12, ly - st[3][3] * st[3][4] * 0.1 + by * 12, 1.1);
  g.restore();
  // A warm rim of reflected light on the shadow edge.
  const rim = edge(dark, 0.86);
  g.strokeStyle = cloth.rim;
  g.lineWidth = 1.3;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(rim[0][0], rim[0][1]);
  g.quadraticCurveTo(rim[1][0], rim[1][1], rim[2][0], rim[2][1]);
  g.quadraticCurveTo(rim[3][0], rim[3][1], rim[4][0], rim[4][1]);
  g.stroke();
  shape();
  g.strokeStyle = INK;
  g.lineWidth = 2.6;
  g.stroke();
  return { ex, ey, angle: b };
}

function strokeBoth(g: CanvasRenderingContext2D, w: number, path: () => void) {
  g.lineCap = 'round';
  g.strokeStyle = INK;
  g.lineWidth = w + 4.6;
  path();
  g.stroke();
}

function hand(g: CanvasRenderingContext2D, x: number, y: number, angle: number, kind: HandKind, flip: number) {
  g.save();
  g.translate(x, y);
  g.rotate(-rad(angle));
  // The shirt cuff, showing past the blazer sleeve.
  g.fillStyle = SHIRT;
  g.strokeStyle = INK;
  g.lineWidth = 2.6;
  g.lineJoin = 'round';
  g.beginPath();
  g.roundRect(-9.5, -2, 19, 9, 1.5);
  g.fill();
  g.stroke();
  g.fillStyle = SHIRT_DARK;
  g.fillRect(-8.2, -0.8, 5, 6.6);
  g.translate(0, 6);
  g.scale(flip, 1);
  const finger = (fx: number, fy: number, deg: number, len: number, w: number) => {
    const [dx, dy] = dir(deg);
    const path = () => {
      g.beginPath();
      g.moveTo(fx, fy);
      g.lineTo(fx + dx * len, fy + dy * len);
    };
    strokeBoth(g, w, path);
    g.strokeStyle = SKIN;
    g.lineWidth = w;
    path();
    g.stroke();
    // A line of shadow down one side of the finger.
    g.strokeStyle = SKIN_DARK;
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(fx - w * 0.28, fy + 2);
    g.lineTo(fx + dx * len - w * 0.28, fy + dy * len);
    g.stroke();
  };
  if (kind === 'open') {
    finger(-8, 15, -22, 15, 5.4);
    finger(-3, 17, -8, 19, 5.6);
    finger(3, 17, 7, 20, 5.6);
    finger(8, 15, 22, 16, 5.2);
  }
  if (kind === 'peace') {
    finger(-3, 16, -13, 30, 6);
    finger(4, 16, 13, 31, 6);
  }
  const palm = () => blob(g, [[-10, 1], [10, 1], [12.5, 11], [10.5, 21], [-9, 22], [-12.5, 11]]);
  inkShape(g, palm, 2.6);
  g.fillStyle = SKIN;
  palm();
  g.fill();
  g.save();
  palm();
  g.clip();
  g.fillStyle = SKIN_DARK;
  g.beginPath();
  g.ellipse(-11, 12, 8, 14, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = SKIN_LIGHT;
  g.beginPath();
  g.ellipse(5, 9, 4, 5, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();
  if (kind === 'fist' || kind === 'peace') {
    // Curled fingers.
    g.strokeStyle = INK;
    g.lineWidth = 1.8;
    g.lineCap = 'round';
    g.beginPath();
    for (const fx of kind === 'fist' ? [-6, -1, 4] : [-6, -1]) {
      g.moveTo(fx, 22);
      g.lineTo(fx - 0.5, 13);
    }
    g.stroke();
  }
  // Thumb, folded across the palm in a fist and held out otherwise.
  if (kind === 'open') finger(-11, 7, -58, 13, 5.8);
  else finger(-9, 8, 62, 13, 5.8);
  g.restore();
}

function shoe(g: CanvasRenderingContext2D, x: number, y: number, angle: number, flip: number) {
  g.save();
  g.translate(x, y);
  g.rotate(-rad(angle));
  g.scale(flip, 1);
  g.lineJoin = 'round';
  // A flash of sock above the oxford.
  g.fillStyle = SOCK;
  g.strokeStyle = INK;
  g.lineWidth = 2.6;
  g.beginPath();
  g.rect(-10, -14, 20, 11);
  g.fill();
  g.stroke();
  const upper = () => {
    g.beginPath();
    g.moveTo(-13, -5);
    g.lineTo(9, -5);
    g.quadraticCurveTo(15, 1, 26, 3);
    g.quadraticCurveTo(44, 6, 46, 14);
    g.lineTo(-16, 14);
    g.closePath();
  };
  inkShape(g, upper, 2.8);
  g.fillStyle = SHOE;
  upper();
  g.fill();
  g.save();
  upper();
  g.clip();
  g.fillStyle = SHOE_MID;
  g.beginPath();
  g.ellipse(30, 7, 15, 6, 0.1, 0, Math.PI * 2);
  g.ellipse(-2, 3, 11, 6, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();
  // Sole and heel.
  g.fillStyle = INK;
  g.beginPath();
  g.moveTo(-17, 13);
  g.lineTo(47, 13);
  g.quadraticCurveTo(46, 17.5, 40, 17.5);
  g.lineTo(11, 17.5);
  g.lineTo(9, 20);
  g.lineTo(-15, 20);
  g.closePath();
  g.fill();
  // Polish, toe-cap seam and laces.
  g.lineCap = 'round';
  g.fillStyle = SHOE_SHINE;
  crescent(g, 24, 5, 34, 6, 42, 12, 1.5);
  crescent(g, -9, -2, -4, 1, -2, 8, 1);
  g.strokeStyle = SHOE_SHINE;
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(24, 2.5);
  g.quadraticCurveTo(21, 8, 23, 13);
  for (let i = 0; i < 3; i++) {
    g.moveTo(9 + i * 3.4, -3 + i * 1.8);
    g.lineTo(5 + i * 3.4, 2.5 + i * 1.8);
  }
  g.stroke();
  g.restore();
}

// Pushes the upper part of the hair in the direction of the wind.
const blown = (wind: number, gust: number) => {
  const wx = Math.sin(rad(wind)) * gust;
  const wy = -Math.cos(rad(wind)) * gust;
  return ([x, y, tip]: Pt): Pt => {
    const f = clamp01((-y - 8) / 48);
    return [x + wx * f * 15, y + wy * f * 9, tip];
  };
};

// Traced from a three-quarter photo: full and wavy, low over the near temple, leaving a triangle of forehead.
const QUIFF: Pt[] = [
  [33, -11, 1], [39, -23], [44, -36], [40, -49], [31, -54], [28, -62, 1], [18, -60], [6, -65], [-6, -62],
  [-15, -68, 1], [-23, -58], [-35, -51], [-45, -39], [-49, -24], [-54, -14, 1], [-48, -7], [-43, 2], [-41, 12],
  [-34, 24, 1], [-31, 6], [-30, -2], [-20, -2], [-11, -7], [-6, -12], [-1, -21], [6, -22], [9, -30], [18, -32], [23, -28], [30, -30],
];
const QUIFF_BACK: Pt[] = [
  [-45, 10], [-51, -3], [-48, -14], [-54, -25], [-49, -36], [-45, -48], [-36, -50], [-30, -60], [-16, -58], [-8, -65],
  [4, -60], [20, -63], [32, -54], [41, -53], [46, -40], [52, -30], [50, -16], [53, -5], [47, 6], [40, 22], [22, 33], [0, 36], [-22, 33], [-38, 22],
];

function hairShine(g: CanvasRenderingContext2D, push: (p: Pt) => Pt, locks: number[][]) {
  g.fillStyle = HAIR_SHINE;
  for (const [x0, y0, cx, cy, x1, y1, w] of locks) {
    const [a, c, b] = [push([x0, y0]), push([cx, cy]), push([x1, y1])];
    crescent(g, a[0], a[1], c[0], c[1], b[0], b[1], w);
  }
}

function backOfHead(g: CanvasRenderingContext2D, wind: number, gust: number) {
  const push = blown(wind, gust);
  g.lineWidth = 4;
  g.strokeStyle = INK;
  g.fillStyle = SKIN;
  for (const x of [-44, 44]) {
    g.beginPath();
    g.ellipse(x, 9, 7, 11, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  }
  blob(g, QUIFF_BACK.map(push));
  g.fillStyle = HAIR;
  g.fill();
  g.stroke();
  // The tapered nape.
  g.fillStyle = HAIR_FADE;
  g.beginPath();
  g.moveTo(-40, 12);
  g.quadraticCurveTo(0, 24, 40, 12);
  g.quadraticCurveTo(30, 32, 0, 34);
  g.quadraticCurveTo(-30, 32, -40, 12);
  g.fill();
  hairShine(g, push, [
    [-40, -24, -26, -44, -6, -46, 3],
    [2, -50, 16, -54, 32, -44, 2.8],
    [-34, -8, -20, -30, 2, -30, 3.2],
    [6, -34, 22, -36, 40, -24, 2.8],
    [-26, 6, -10, -12, 12, -12, 3],
    [16, -14, 28, -14, 40, -4, 2.4],
  ]);
  // The warm rim on the left of the hair.
  g.strokeStyle = RIM;
  g.lineWidth = 2.6;
  g.lineCap = 'round';
  const a = push([-46, -8]);
  const c = push([-50, -30]);
  const b = push([-34, -49]);
  g.beginPath();
  g.moveTo(a[0], a[1]);
  g.quadraticCurveTo(c[0], c[1], b[0], b[1]);
  g.stroke();
}

const FACE: Pt[] = [[-30, -8], [-10, -22], [15, -33], [30, -29], [34, -12], [35, 2], [35, 13], [34, 23], [31, 34], [23, 45], [11, 49], [-4, 47], [-16, 39], [-26, 22], [-30, 6]];

function eyes(g: CanvasRenderingContext2D, kind: Face) {
  for (const [ex, ew] of [[5.5, 7.6], [29.5, 5.2]] as const) {
    if (kind === 'laugh') {
      // A proper laugh pushes the eyes into crescents.
      g.strokeStyle = INK;
      g.lineWidth = 2.8;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(ex - ew, 7);
      g.quadraticCurveTo(ex, -0.5, ex + ew, 7);
      g.stroke();
      continue;
    }
    const y = 5;
    const tall = kind === 'shout' ? 6 : kind === 'worried' ? 4.2 : 3.4;
    g.fillStyle = SHIRT;
    g.beginPath();
    g.moveTo(ex - ew, y);
    g.quadraticCurveTo(ex, y - tall * 1.6, ex + ew, y - 0.5);
    g.quadraticCurveTo(ex, y + tall, ex - ew, y);
    g.fill();
    g.fillStyle = INK;
    g.beginPath();
    g.arc(ex + (kind === 'shout' ? 0 : 1.2), y - 0.7, kind === 'shout' ? 2 : 3, 0, Math.PI * 2);
    g.fill();
    // The heavy upper lid.
    g.strokeStyle = INK;
    g.lineWidth = 2.4;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(ex - ew, y);
    g.quadraticCurveTo(ex, y - tall * 1.6, ex + ew, y - 0.5);
    g.stroke();
  }
}

function brows(g: CanvasRenderingContext2D, kind: Face) {
  const lift = kind === 'shout' ? -5 : kind === 'laugh' ? -2 : 0;
  const inner = kind === 'worried' ? -4 : kind === 'smirk' ? 1.5 : 0;
  const far = kind === 'smirk' ? -3 : 0;
  g.fillStyle = INK;
  crescent(g, -8, -5 + lift, 4, -10 + lift, 16, -6 + lift + inner, 2);
  crescent(g, 22, -7 + lift + inner + far, 28, -11 + lift + far, 35, -7 + lift + far, 1.7);
}

function glasses(g: CanvasRenderingContext2D) {
  const rims: [number, number, number, number][] = [[-6, -1, 23, 16.5], [21.5, -2, 15.5, 16.5]];
  // The arm running back to the ear, and the bridge.
  g.lineCap = 'round';
  for (const [w, color] of [[3.8, INK], [1.7, FRAME]] as const) {
    g.strokeStyle = color;
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(-6, 2);
    g.lineTo(-22, -2);
    g.moveTo(17, 2);
    g.quadraticCurveTo(19.2, 0, 21.5, 1);
    g.stroke();
  }
  for (const [x, y, w, h] of rims) {
    g.fillStyle = 'rgba(215, 232, 255, 0.16)';
    g.beginPath();
    g.roundRect(x, y, w, h, 2.2);
    g.fill();
    // A small glare in the top corner of the lens.
    g.save();
    g.clip();
    g.strokeStyle = 'rgba(255, 255, 255, 0.72)';
    g.lineWidth = 2;
    g.lineCap = 'butt';
    g.beginPath();
    g.moveTo(x + w - 1, y + 3.5);
    g.lineTo(x + w - 6, y + 11);
    g.stroke();
    g.restore();
    g.beginPath();
    g.roundRect(x, y, w, h, 2.2);
    g.strokeStyle = INK;
    g.lineWidth = 3.8;
    g.stroke();
    g.strokeStyle = FRAME;
    g.lineWidth = 1.7;
    g.stroke();
  }
}

function mustache(g: CanvasRenderingContext2D, smile: number) {
  // Two thin wings with a small gap under the nose. They lift at the ends with the smile.
  g.fillStyle = INK;
  g.beginPath();
  g.moveTo(22.6, 20.5);
  g.quadraticCurveTo(14, 20 - smile, 6, 28 - smile * 1.6);
  g.quadraticCurveTo(15, 25.5 - smile, 22.6, 24.6);
  g.closePath();
  g.moveTo(25, 20.5);
  g.quadraticCurveTo(30, 19.5 - smile, 33, 24 - smile * 1.4);
  g.quadraticCurveTo(29, 24 - smile, 25, 24.6);
  g.closePath();
  g.fill();
}

function mouth(g: CanvasRenderingContext2D, kind: Face) {
  g.strokeStyle = INK;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  if (kind === 'laugh' || kind === 'shout') {
    const shape = () => {
      g.beginPath();
      if (kind === 'laugh') {
        g.moveTo(5, 27);
        g.quadraticCurveTo(19, 28.5, 33, 24);
        g.quadraticCurveTo(31, 41, 20, 42.5);
        g.quadraticCurveTo(9, 43, 5, 27);
      } else {
        g.ellipse(20, 36, 8.5, 9.5, 0, 0, Math.PI * 2);
      }
      g.closePath();
    };
    shape();
    g.fillStyle = MOUTH;
    g.fill();
    g.save();
    g.clip();
    g.fillStyle = TONGUE;
    g.beginPath();
    g.ellipse(20, 44, 10, 6, 0, 0, Math.PI * 2);
    g.fill();
    // The upper teeth, which are most of what a big smile shows.
    g.fillStyle = SHIRT;
    g.fillRect(2, 20, 34, kind === 'laugh' ? 14 : 11);
    g.restore();
    shape();
    g.lineWidth = 2.6;
    g.stroke();
    return;
  }
  g.lineWidth = 2.6;
  g.beginPath();
  if (kind === 'grin') {
    g.moveTo(7, 27.5);
    g.quadraticCurveTo(19, 29, 32, 25);
    g.quadraticCurveTo(30, 35, 20, 36);
    g.quadraticCurveTo(11, 36, 7, 27.5);
    g.closePath();
    g.fillStyle = SHIRT;
    g.fill();
    g.stroke();
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(10, 32);
    g.quadraticCurveTo(20, 33, 30, 29.5);
  } else if (kind === 'smirk') {
    g.moveTo(10, 30);
    g.quadraticCurveTo(20, 33.5, 32, 25);
  } else {
    g.moveTo(11, 33);
    g.quadraticCurveTo(20, 28, 30, 31);
  }
  g.stroke();
}

// Short tapered strands growing out of the hair, so it moves with the wind even though the picture can't.
function windLocks(g: CanvasRenderingContext2D, wind: number, gust: number) {
  const wx = Math.sin(rad(wind));
  const wy = -Math.cos(rad(wind));
  g.fillStyle = HAIR;
  for (const [x, y, len] of [[-34, -32, 15], [-14, -44, 18], [10, -46, 17], [32, -34, 14]] as const) {
    const l = len * Math.min(gust, 1.5);
    crescent(g, x, y, x + wx * l * 0.5 - wy * 4, y + wy * l * 0.5 + wx * 4, x + wx * l, y + wy * l, 3.2);
  }
}

// Drawn expressions go over the smiling picture, in the same ink. Coordinates line up with the cut-out.
function expression(g: CanvasRenderingContext2D, kind: Face) {
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.strokeStyle = INK;
  g.fillStyle = SKIN;
  g.beginPath();
  g.ellipse(12, 30.5, 14, 6, -0.04, 0, Math.PI * 2);
  g.fill();
  if (kind === 'worried') {
    g.lineWidth = 2.4;
    g.beginPath();
    g.moveTo(5, 31);
    g.quadraticCurveTo(13, 26.5, 21, 30.5);
    g.stroke();
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(9, 34.5);
    g.quadraticCurveTo(13, 36, 17, 34.5);
    g.stroke();
    return;
  }
  // Open mouth.
  const open = () => {
    g.beginPath();
    g.ellipse(11, 33.6, 8, 9, 0, 0, Math.PI * 2);
  };
  open();
  g.fillStyle = MOUTH;
  g.fill();
  g.save();
  g.clip();
  g.fillStyle = TONGUE;
  g.beginPath();
  g.ellipse(11, 42.5, 8, 5, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = SHIRT;
  g.fillRect(1, 22, 20, 8);
  g.restore();
  open();
  g.lineWidth = 2.2;
  g.stroke();
  // Wide eyes behind the lenses.
  for (const [x, y, rx, ry] of [[1.6, 3.2, 6.4, 4], [27.2, 3.4, 4.8, 3.8]] as const) {
    g.fillStyle = SHIRT;
    g.beginPath();
    g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 1.4;
    g.stroke();
    g.fillStyle = INK;
    g.beginPath();
    g.arc(x + 0.8, y + 0.2, 2.4, 0, Math.PI * 2);
    g.fill();
    // The heavy upper lid.
    g.lineWidth = 2.2;
    g.beginPath();
    g.ellipse(x, y, rx, ry, 0, Math.PI * 1.08, Math.PI * 1.92);
    g.stroke();
  }
}

function head(g: CanvasRenderingContext2D, kind: Face, wind: number, gust: number) {
  g.lineJoin = 'round';
  g.strokeStyle = INK;
  if (kind === 'back') {
    backOfHead(g, wind, gust);
    return;
  }
  if (face) {
    if (gust >= 0.95) windLocks(g, wind, gust);
    g.drawImage(face, -64.25, -72.9, 125, 154.9);
    if (kind === 'shout' || kind === 'worried') expression(g, kind);
    return;
  }
  const push = blown(wind, gust);
  // Face, turned to the right of the frame.
  g.fillStyle = SKIN;
  blob(g, FACE);
  g.fill();
  g.save();
  g.clip();
  // Flat shadow on the near side of the jaw and under the hair. The light comes from the far side.
  g.fillStyle = SKIN_DARK;
  g.beginPath();
  g.moveTo(-34, -12);
  g.lineTo(-17, -8);
  g.quadraticCurveTo(-21, 14, -13, 28);
  g.quadraticCurveTo(-7, 40, 6, 54);
  g.lineTo(-40, 56);
  g.closePath();
  g.fill();
  // Light on the far cheek and the forehead.
  g.fillStyle = SKIN_LIGHT;
  g.beginPath();
  g.ellipse(31, 18, 3.4, 5, 0, 0, Math.PI * 2);
  g.fill();
  // Stubble on the chin and jaw, in print dots.
  g.fillStyle = 'rgba(22, 12, 20, 0.6)';
  for (let y = 30; y < 50; y += 2.6) {
    for (let x = -18 + (Math.round(y / 2.6) % 2) * 1.3; x < 36; x += 2.6) {
      if (Math.hypot((x - 13) / 21, (y - 28) / 16) < 1) continue;
      g.beginPath();
      g.arc(x, y, 0.72, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.restore();
  blob(g, FACE);
  g.strokeStyle = INK;
  g.lineWidth = 4.5;
  g.stroke();
  // Hair.
  blob(g, QUIFF.map(push));
  g.fillStyle = HAIR;
  g.fill();
  g.stroke();
  // The shorter hair at the side, then the ear in front of it.
  g.fillStyle = HAIR_FADE;
  g.beginPath();
  g.moveTo(-38, -10);
  g.quadraticCurveTo(-27, -11, -21, -5);
  g.quadraticCurveTo(-27, -2, -31, 4);
  g.quadraticCurveTo(-37, -2, -38, -10);
  g.fill();
  hairShine(g, push, [
    [-41, -14, -32, -34, -12, -44, 3],
    [-8, -47, 5, -52, 20, -46, 2.6],
    [-28, -8, -15, -22, 1, -31, 3],
    [6, -34, 17, -40, 31, -38, 2.6],
    [23, -55, 34, -52, 40, -35, 2.4],
    [-27, -54, -15, -60, -2, -58, 1.8],
  ]);
  // Ear.
  g.fillStyle = SKIN;
  g.strokeStyle = INK;
  g.lineWidth = 3.6;
  g.beginPath();
  g.ellipse(-31, 9, 7, 11.5, -0.1, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.lineWidth = 1.8;
  g.beginPath();
  g.arc(-31, 9, 3.6, 2, 5);
  g.stroke();
  eyes(g, kind);
  brows(g, kind);
  g.save();
  g.translate(-6, 0);
  // Nose: soft and rounded, with a shadow beneath it.
  g.fillStyle = SKIN_DARK;
  g.beginPath();
  g.moveTo(16, 18);
  g.quadraticCurveTo(24, 21, 31, 16);
  g.quadraticCurveTo(24, 17, 16, 18);
  g.fill();
  g.strokeStyle = INK;
  g.lineWidth = 2.2;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(26, 8);
  g.quadraticCurveTo(33, 14, 28.5, 17.5);
  g.quadraticCurveTo(24, 19, 22, 17);
  g.moveTo(19.5, 13);
  g.quadraticCurveTo(16.5, 16, 19, 18.5);
  g.stroke();
  const smiling = kind === 'laugh' || kind === 'grin';
  if (smiling) {
    // The cheek lifts with the smile.
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(5, 16);
    g.quadraticCurveTo(0, 23, 2.5, 31);
    g.stroke();
  }
  mouth(g, kind);
  mustache(g, kind === 'laugh' ? 2 : smiling ? 1 : 0);
  g.restore();
  g.save();
  if (kind === 'shout') {
    // Shock knocks the glasses crooked.
    g.translate(14, 8);
    g.rotate(-0.08);
    g.translate(-14, -9);
  }
  glasses(g);
  g.restore();
}

// The commit line launcher: a chunky yellow cuff with a cyan light, strapped over the shirt cuff.
function gadget(g: CanvasRenderingContext2D, x: number, y: number, angle: number) {
  g.save();
  g.translate(x, y);
  g.rotate(-rad(angle));
  g.fillStyle = '#ffc917';
  g.strokeStyle = INK;
  g.lineWidth = 2.6;
  g.beginPath();
  g.roundRect(-12, -13, 24, 12, 3);
  g.fill();
  g.stroke();
  g.fillStyle = '#17e4ff';
  g.beginPath();
  g.arc(0, -7, 3, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.restore();
}

// Where the gripping hand was last drawn, in canvas pixels.
let lastGrip: [number, number] | null = null;
const GRIPS = new Map<number, [number, number]>();
/** Where the line leaves the hand in a pose's cell, from 0 to 1 across and down, or null if the pose has no line. */
export const gripOf = (pose: number) => GRIPS.get(pose) ?? null;

const ARM: [number, number, number] = [30, 25, 18.5];
const LEG: [number, number, number] = [47, 34, 27];
const LEG_LEN: [number, number] = [88, 90];

function draw(g: CanvasRenderingContext2D, p: Pose) {
  const size = p.size ?? 1;
  const back = p.back ?? p.head === 'back';
  const flap = p.flap ?? 0;
  const hands = p.hands ?? 'open';
  const nearLeft = p.nearLeft ?? false;
  const rot = rad(p.rot ?? 0);
  // The light stays put in the scene, up and to the right, however the body is turned.
  light = [0.6 * Math.cos(rot) - 0.8 * Math.sin(rot), -0.6 * Math.sin(rot) - 0.8 * Math.cos(rot)];
  g.save();
  g.translate(256, 250);
  g.rotate(rot);
  g.scale(size, size);
  const lean = p.lean ?? 0;
  const [lx, ly] = dir(180 + lean); // the spine, from hip up to neck
  const T = 106;
  const nx = lx * T;
  const ny = ly * T;
  // A vector across the shoulders.
  const sx = -ly;
  const sy = lx;
  // A point on the body: a across the shoulders, b down the spine from the neck.
  const at = (a: number, b: number): [number, number] => [nx + sx * a - lx * b, ny + sy * a - ly * b];
  const turn = back ? 0 : 9; // the chest faces a little to the right, with the face
  const shadow = light[0] * sx + light[1] * sy > 0 ? -1 : 1; // which way across the chest is away from the light

  const brush = (color: string, w: number, ax: number, ab: number, cx: number, cb: number, ex: number, eb: number) => {
    const [x0, y0] = at(ax, ab);
    const [c0, c1] = at(cx, cb);
    const [x1, y1] = at(ex, eb);
    g.fillStyle = color;
    crescent(g, x0, y0, c0, c1, x1, y1, w);
  };
  const poly = (color: string, ...pts: [number, number][]) => {
    g.fillStyle = color;
    g.strokeStyle = INK;
    g.lineWidth = 2.4;
    g.lineJoin = 'round';
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    g.fill();
    g.stroke();
  };
  const line = (color: string, w: number, ...pts: [number, number][]) => {
    g.strokeStyle = color;
    g.lineWidth = w;
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.stroke();
  };
  const dots = (color: string, a0: number, a1: number, b0: number, b1: number, r: number) => {
    g.fillStyle = color;
    const step = 4.8;
    for (let b = b0; b < b1; b += step) {
      const odd = Math.round(b / step) % 2 ? step / 2 : 0;
      for (let a = Math.min(a0, a1) + odd; a < Math.max(a0, a1); a += step) {
        const fade = 1 - Math.abs(a - a0) / Math.abs(a1 - a0);
        const [x, y] = at(a, b);
        g.beginPath();
        g.arc(x, y, r * (0.35 + fade * 0.65), 0, Math.PI * 2);
        g.fill();
      }
    }
  };

  // Far limbs first. Each shoe goes on before its trouser leg, so the hem breaks over it.
  const leg = (x: number, angles: Limb, flip: number) => {
    const [ax, ay] = dir(angles[0]);
    const [bx, by] = dir(angles[1]);
    const ex = x + ax * LEG_LEN[0] + bx * LEG_LEN[1];
    const ey = 2 + ay * LEG_LEN[0] + by * LEG_LEN[1];
    shoe(g, ex, ey, angles[1], flip);
    limb(g, x, 2, angles, LEG_LEN, LEG, PANTS);
  };
  const flipL = p.legL[1] > 8 ? 1 : -1;
  const flipR = p.legR[1] < -8 ? -1 : 1;
  if (nearLeft) {
    leg(18, p.legR, flipR);
    leg(-18, p.legL, p.legL[0] > 20 ? 1 : flipL);
  } else {
    leg(-18, p.legL, flipL);
    leg(18, p.legR, flipR);
  }

  const arm = (x: number, angles: Limb, fingers: HandKind) => {
    const [ax, ay] = at(x * 0.95, 10);
    const a = limb(g, ax, ay, angles, [62, 58], ARM, SLEEVE);
    if (fingers !== 'pocket') hand(g, a.ex, a.ey, a.angle, fingers, x < 0 ? -1 : 1);
    if (p.line && x > 0) {
      gadget(g, a.ex, a.ey, a.angle);
      const grip = g.getTransform().transformPoint(new DOMPoint(a.ex + Math.sin(rad(a.angle)) * 15, a.ey + Math.cos(rad(a.angle)) * 15));
      lastGrip = [grip.x, grip.y];
    }
  };
  if (nearLeft) arm(46, p.armR, hands);
  else if (!p.armsFront) arm(-46, p.armL, hands);

  // The bag bulges out behind the shoulder when seen from the front.
  if (!back && p.bag !== false) {
    const bag = () => {
      const [ax, ay] = at(-50, 8);
      const [bx, by] = at(-68, 40);
      const [cx, cy] = at(-62, 84);
      const [dx, dy] = at(-40, 88);
      blob(g, [[ax, ay], [bx, by], [cx, cy], [dx, dy]]);
    };
    inkShape(g, bag);
    g.fillStyle = BAG;
    bag();
    g.fill();
    g.save();
    bag();
    g.clip();
    const [cx, cy] = at(-64, 60);
    g.fillStyle = BAG_DARK;
    g.beginPath();
    g.ellipse(cx, cy, 13, 42, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  // The blazer tails, thrown about by the wind. At rest they hang inside the hem.
  if (Math.abs(flap) > 28) {
    const [fx, fy] = dir(flap);
    const tail = 26 + (Math.min(Math.abs(flap), 120) / 120) * 28;
    for (const [a, c] of [[-44, -3], [3, 44]] as const) {
      const pa = at(a, T - 14);
      const pb = at(c, T - 14);
      const spread = a < 0 ? -6 : 6;
      const flagTail = () =>
        blob(g, [
          [pa[0], pa[1], 1],
          [pa[0] + fx * tail * 0.6 + sx * spread, pa[1] + fy * tail * 0.6 + sy * spread],
          [pa[0] + fx * tail + sx * spread, pa[1] + fy * tail + sy * spread, 1],
          [pb[0] + fx * tail * 0.92 + sx * spread, pb[1] + fy * tail * 0.92 + sy * spread, 1],
          [pb[0], pb[1], 1],
        ]);
      inkShape(g, flagTail);
      g.fillStyle = a * shadow > 0 ? BLAZER_DARK : BLAZER_MID;
      flagTail();
      g.fill();
    }
  }

  // Torso: sloped shoulders, a waist, and a hem that curves across the hips.
  const torsoPts: [number, number, number?][] = [
    [-26, -6], [-53, 2], [-59, 26], [-50, 66], [-47, T + 2], [-40, T + 8], [0, T + 12], [40, T + 8], [47, T + 2], [50, 66], [59, 26], [53, 2], [26, -6],
  ];
  const torso = () => blob(g, torsoPts.map(([a, b, tip]) => [...at(a, b), tip] as Pt));
  inkShape(g, torso, 3.2);
  g.fillStyle = BLAZER;
  torso();
  g.fill();
  g.save();
  torso();
  g.clip();
  // Shadow side of the chest, with a black spot where the arm meets the body.
  const edgeA = shadow * 70;
  const midA = shadow * 22;
  const shade = (color: string, inner: number, spot: number) => {
    g.fillStyle = color;
    g.beginPath();
    const [p0, p1, p2, p3] = [at(edgeA, -12), at(inner, -12), at(inner + shadow * spot, T / 2), at(inner, T + 14)];
    const [p4] = [at(edgeA, T + 14)];
    g.moveTo(p0[0], p0[1]);
    g.lineTo(p1[0], p1[1]);
    g.quadraticCurveTo(p2[0], p2[1], p3[0], p3[1]);
    g.lineTo(p4[0], p4[1]);
    g.closePath();
    g.fill();
  };
  shade(BLAZER_MID, midA, 8);
  dots(BLAZER_MID, midA, -shadow * 6, -6, T + 12, 1.8);
  shade(BLAZER_DARK, shadow * 46, 4);
  // A soft sheen across the lit shoulder.
  brush(BLAZER_LIGHT, 2.2, -shadow * 54, 8, -shadow * 34, -4, -shadow * 16, 2);
  brush(BLAZER_LIGHT, 1.8, -shadow * 50, 36, -shadow * 46, 58, -shadow * 44, 88);
  g.restore();
  torso();
  g.strokeStyle = INK;
  g.lineWidth = 2.8;
  g.stroke();

  g.lineCap = 'round';
  if (back) {
    // Centre seam, the vent at the hem, and folds across the shoulder blades and waist.
    line(INK, 2, at(0, 8), at(0, T + 10));
    brush(INK, 1.5, -42, 14, -24, 26, -10, 22);
    brush(INK, 1.5, 42, 14, 24, 26, 10, 22);
    brush(INK, 1.4, -48, 72, -30, 76, -14, 70);
    brush(INK, 1.4, 48, 72, 30, 76, 14, 70);
    // Backpack, with a top handle, a zip round the main compartment and a front pocket.
    const [bx, by] = at(0, 54);
    const u = (a: number, b: number): Pt => [bx + sx * a - lx * b, by + sy * a - ly * b];
    line(INK, 7, u(-12, -42), u(-8, -50), u(8, -50), u(12, -42));
    line(BAG_DARK, 3.4, u(-12, -42), u(-8, -50), u(8, -50), u(12, -42));
    const pack = () => blob(g, [u(-24, -42), u(-35, -18), u(-36, 30), u(-27, 42, ), u(27, 42), u(36, 30), u(35, -18), u(24, -42)]);
    inkShape(g, pack, 3);
    g.fillStyle = BAG;
    pack();
    g.fill();
    g.save();
    pack();
    g.clip();
    const packShade = (color: string, a: number) => {
      g.fillStyle = color;
      const pts = [u(shadow * 44, -48), u(shadow * a, -48), u(shadow * a, 48), u(shadow * 44, 48)];
      g.beginPath();
      pts.forEach((v, i) => (i ? g.lineTo(v[0], v[1]) : g.moveTo(v[0], v[1])));
      g.closePath();
      g.fill();
    };
    packShade(BAG_MID, 8);
    packShade(BAG_DARK, 25);
    g.fillStyle = BAG_LIGHT;
    const [h0, h1, h2] = [u(-shadow * 26, -24), u(-shadow * 24, -2), u(-shadow * 25, 18)];
    crescent(g, h0[0], h0[1], h1[0], h1[1], h2[0], h2[1], 2);
    g.restore();
    const zip = [u(-28, -14), u(0, -24), u(28, -14)];
    line(INK, 2.2, ...(zip as [number, number][]));
    const pocket = () => blob(g, [u(-24, 2), u(-25, 34), u(25, 34), u(24, 2)]);
    pocket();
    g.fillStyle = BAG_MID;
    g.fill();
    g.strokeStyle = INK;
    g.lineWidth = 2.6;
    g.stroke();
    line(INK, 1.8, u(-19, 9) as [number, number], u(19, 9) as [number, number]);
    line(BAG_LIGHT, 1.8, u(8, 10) as [number, number], u(8, 18) as [number, number]);
    // Shoulder straps.
    for (const side of [-1, 1]) {
      line(INK, 11, at(side * 30, 2), at(side * 27, 24));
      line(BAG_MID, 6.5, at(side * 30, 2), at(side * 27, 24));
      line(BAG_LIGHT, 1.4, at(side * 28.4, 3), at(side * 25.4, 23));
    }
  } else {
    // The white shirt with its shadow under the collar, then the lapels with their notch.
    const t = turn;
    poly(SHIRT, at(t - 17, -2), at(t + 17, -2), at(t + 4, 70), at(t - 4, 70));
    g.fillStyle = SHIRT_DARK;
    g.beginPath();
    for (const [i, q] of [at(t - 16, 0), at(t - 2, 16), at(t - 4, 68), at(t - 8, 40)].entries()) i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]);
    g.closePath();
    g.fill();
    line(INK, 1.3, at(t + 1, 20), at(t + 1, 64));
    for (const b of [30, 48]) {
      const [x, y] = at(t + 1, b);
      g.fillStyle = INK;
      g.beginPath();
      g.arc(x, y, 1.3, 0, Math.PI * 2);
      g.fill();
    }
    poly(BLAZER_MID, at(t - 16, -5), at(t - 33, 16), at(t - 25, 21), at(t - 31, 29), at(t - 3, 76), at(t - 7, 42));
    poly(BLAZER, at(t + 16, -5), at(t + 31, 16), at(t + 23, 21), at(t + 29, 29), at(t + 3, 76), at(t + 7, 42));
    brush(BLAZER_LIGHT, 1.2, t + 24, 21, t + 15, 42, t + 6, 66);
    // Where the blazer closes: the front edge, two buttons, pockets and the folds pulling from the button.
    const [e0, e1, e2] = [at(t + 2, 76), at(t + 6, 100), at(t + 22, T + 8)];
    g.strokeStyle = INK;
    g.lineWidth = 2.4;
    g.beginPath();
    g.moveTo(e0[0], e0[1]);
    g.quadraticCurveTo(e1[0], e1[1], e2[0], e2[1]);
    g.stroke();
    for (const b of [80, 94]) {
      const [x, y] = at(t - 3, b);
      g.fillStyle = INK;
      g.beginPath();
      g.arc(x, y, 2.7, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = BLAZER_LIGHT;
      g.beginPath();
      g.arc(x + 0.8, y - 0.8, 0.9, 0, Math.PI * 2);
      g.fill();
    }
    brush(INK, 1.4, t - 6, 80, t - 22, 74, t - 40, 58);
    brush(INK, 1.3, t - 6, 84, t - 24, 90, t - 42, 86);
    brush(INK, 1.2, t + 6, 80, t + 20, 76, t + 36, 62);
    line(INK, 2, at(-42, 92), at(-18, 95));
    line(INK, 2, at(t + 16, 95), at(t + 36, 92));
    line(INK, 1.7, at(t + 21, 42), at(t + 40, 40));
    if (p.bag !== false) {
      for (const side of [-1, 1]) {
        const a = side < 0 ? -41 : 45;
        line(INK, 10.5, at(a, 2), at(a - side * 3, 54));
        line(BAG_MID, 6, at(a, 2), at(a - side * 3, 54));
        line(BAG_LIGHT, 1.3, at(a + 1.4, 3), at(a - side * 3 + 1.4, 53));
      }
    }
  }

  const headAt = T + 50;
  const tilt = rad(-lean * 0.7);
  const facing = p.head !== 'back';
  // Neck. The face is turned, so the head sits a little to the right of it.
  g.lineCap = 'butt';
  const [hx, hy] = [lx * headAt, ly * headAt];
  const shift = facing ? 11 * HEAD : 0;
  line(INK, 37, at(0, 8), [hx, hy + 8]);
  line(back ? SKIN_DARK : SKIN, 30, at(0, 8), [hx, hy + 8]);
  if (!back) poly(SKIN_DARK, at(-13, -6), at(13 + turn * 0.5, -6), at(turn * 0.6, 13));

  if (nearLeft) arm(-46, p.armL, hands);
  else {
    if (p.armsFront) arm(-46, p.armL, hands);
    arm(46, p.armR, hands);
  }
  if (hands === 'pocket') {
    // Forearms go into the trouser pockets.
    line(INK, 3, at(-50, T - 4), at(-30, T + 6));
    line(INK, 3, at(50, T - 4), at(30, T + 6));
  }

  g.save();
  g.translate(hx, hy);
  g.rotate(tilt);
  g.translate(shift, 0);
  g.scale(HEAD, HEAD);
  head(g, p.head, p.hair ?? 0, p.gust ?? 0.5);
  g.restore();

  g.lineCap = 'butt';
  if (back) {
    // The collar of the blazer, with a line of shirt above it.
    line(INK, 13, at(-24, 0), at(24, 0));
    line(SHIRT, 7, at(-22, -2), at(22, -2));
    line(BLAZER_MID, 6, at(-24, 5), at(24, 5));
  } else {
    poly(SHIRT, at(turn - 22, -9), at(turn - 3, 9), at(turn - 14, 24), at(turn - 29, 6));
    poly(SHIRT, at(turn + 20, -9), at(turn + 3, 9), at(turn + 13, 24), at(turn + 27, 6));
    brush(SHIRT_DARK, 2.2, turn - 24, 3, turn - 15, 13, turn - 6, 10);
  }
  g.restore();
}

// A close-up of the face for the comic panels.
function closeUp(g: CanvasRenderingContext2D) {
  g.save();
  g.translate(256, 256);
  g.fillStyle = BLAZER;
  g.strokeStyle = INK;
  g.lineWidth = 7;
  g.beginPath();
  g.moveTo(-250, 260);
  g.quadraticCurveTo(-230, 150, -20, 142);
  g.quadraticCurveTo(190, 150, 240, 260);
  g.closePath();
  g.fill();
  g.stroke();
  g.fillStyle = BLAZER_DARK;
  g.beginPath();
  g.moveTo(-246, 256);
  g.quadraticCurveTo(-224, 160, -120, 150);
  g.quadraticCurveTo(-150, 200, -140, 256);
  g.closePath();
  g.fill();
  g.fillStyle = SHIRT;
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(-90, 140);
  g.lineTo(-10, 214);
  g.lineTo(72, 140);
  g.lineTo(48, 262);
  g.lineTo(-68, 262);
  g.closePath();
  g.fill();
  g.stroke();
  g.fillStyle = SKIN_DARK;
  g.beginPath();
  g.moveTo(-74, 110);
  g.lineTo(-10, 196);
  g.lineTo(56, 110);
  g.closePath();
  g.fill();
  g.scale(3.05, 3.05);
  g.translate(1, -6);
  head(g, 'shout', 0, 0.6);
  g.restore();
}

export const POSE = {
  stand: 0,
  standWind: 1,
  glance: 2,
  crouch: 3,
  push: 4,
  spread: 5,
  dive: 6,
  tumbleA: 7,
  tumbleB: 8,
  tumbleC: 9,
  flail: 10,
  land: 11,
  surfA: 12,
  surfB: 13,
  surfBack: 14,
  face: 15,
  sitA: 16,
  sitB: 17,
  rise: 18,
  swingA: 19,
  swingB: 20,
} as const;

const POCKETS: Limb = [-13, 24];
const POCKETS_R: Limb = [13, -24];

const POSES: (Pose | null)[] = [
  { armL: POCKETS, armR: POCKETS_R, legL: [-9, -4], legR: [12, 7], head: 'back', hands: 'pocket', armsFront: true, hair: 22, gust: 0.35, flap: 12 },
  { armL: POCKETS, armR: POCKETS_R, legL: [-9, -4], legR: [12, 7], head: 'back', hands: 'pocket', armsFront: true, hair: 42, gust: 0.75, flap: 30 },
  // The laugh over the shoulder, before the jump.
  { lean: 3, armL: POCKETS, armR: POCKETS_R, legL: [-9, -4], legR: [12, 7], head: 'laugh', back: true, hands: 'pocket', armsFront: true, hair: 34, gust: 0.7, flap: 24 },
  { lean: 4, armL: [-34, 12], armR: [34, -12], legL: [-62, 34], legR: [62, -34], head: 'back', hair: 24, gust: 0.6, flap: 8, size: 0.96 },
  { lean: 6, rot: 4, armL: [-128, -104], armR: [128, 104], legL: [-14, -24], legR: [20, 6], head: 'back', hair: 50, gust: 0.8, flap: 120 },
  { armL: [-112, -134], armR: [112, 134], legL: [-34, -14], legR: [34, 14], head: 'back', hair: 0, gust: 1.3, flap: 172 },
  { rot: 176, armL: [-150, -172], armR: [150, 172], legL: [-10, -24], legR: [12, 36], head: 'back', hair: 180, gust: 1.2, flap: 6 },
  { rot: 40, armL: [-132, -100], armR: [88, 142], legL: [-60, 6], legR: [48, -26], head: 'shout', hair: -40, gust: 1.3, flap: 140 },
  { rot: 145, armL: [-100, -68], armR: [132, 96], legL: [-48, -16], legR: [62, 26], head: 'back', hair: -145, gust: 1.2, flap: 35 },
  { rot: 256, armL: [-88, -150], armR: [96, 42], legL: [-26, -62], legR: [40, -6], head: 'shout', hair: 105, gust: 1.3, flap: -76 },
  { armL: [-146, -172], armR: [138, 176], legL: [-38, 28], legR: [44, -22], head: 'shout', hair: 0, gust: 1.5, flap: 176 },
  { lean: 20, armL: [-22, -8], armR: [64, 102], legL: [-64, 36], legR: [42, -40], head: 'back', hair: 0, gust: 0.9, flap: 160, size: 0.94 },
  { lean: 20, rot: 2, armL: [-68, -96], armR: [62, 108], legL: [-58, 34], legR: [46, -28], head: 'grin', back: true, hair: -62, gust: 1, flap: -74, size: 0.96 },
  { lean: 24, rot: 2, armL: [-74, -112], armR: [70, 96], legL: [-62, 30], legR: [44, -30], head: 'grin', back: true, hair: -80, gust: 1.2, flap: -88, size: 0.96 },
  { lean: 12, armL: [-60, -100], armR: [84, 152], legL: [-58, 34], legR: [46, -28], head: 'laugh', back: true, hair: -50, gust: 1, flap: -70, size: 0.96 },
  null, // the close-up
  // Sitting on the ledge with one knee up and an arm resting on it, as in the owner's photos.
  { lean: 5, nearLeft: true, armL: [19, 61], armR: [70, 116], legL: [53, -12], legR: [138, 29], head: 'laugh', hair: 28, gust: 0.5, flap: 4 },
  { lean: 5, nearLeft: true, armL: [19, 61], armR: [70, 118], legL: [53, -3], legR: [138, 29], head: 'laugh', hair: 42, gust: 0.9, flap: 14 },
  // Getting up.
  { lean: -8, armL: [-40, -16], armR: [40, 12], legL: [58, -22], legR: [-20, 18], head: 'back', hair: 30, gust: 0.6, flap: 12, size: 0.97 },
  // Swinging on the commit line: hanging from the right hand, then a look back over the shoulder.
  { lean: -6, armL: [-72, -44], armR: [166, 174], legL: [-4, 16], legR: [12, 32], head: 'back', hands: 'fist', line: true, hair: -30, gust: 1, flap: 150, size: 0.94 },
  { lean: -10, rot: -6, armL: [-98, -62], armR: [168, 176], legL: [-14, 12], legR: [10, 36], head: 'grin', back: true, hands: 'fist', line: true, hair: -52, gust: 1.1, flap: 160, size: 0.94 },
];

// The poses that fill the screen get their own sheet, at higher resolution.
export const SHARP_POSES: number[] = [POSE.sitA, POSE.sitB, POSE.face, POSE.glance, POSE.surfA, POSE.surfB];
export const SHARP_COLS = 3;
export const SHARP_ROWS = 2;

export function drawSharpSheet(cell: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = cell * SHARP_COLS;
  c.height = cell * SHARP_ROWS;
  const g = c.getContext('2d')!;
  const scale = cell / 512;
  SHARP_POSES.forEach((index, i) => {
    const pose = POSES[index];
    const x = (i % SHARP_COLS) * cell;
    const y = Math.floor(i / SHARP_COLS) * cell;
    g.save();
    g.beginPath();
    g.rect(x, y, cell, cell);
    g.clip();
    g.translate(x, y);
    g.scale(scale, scale);
    if (pose) draw(g, pose);
    else closeUp(g);
    g.restore();
  });
  return c;
}

export function drawSheet(cell: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = cell * SHEET_COLS;
  c.height = cell * SHEET_ROWS;
  const g = c.getContext('2d')!;
  const scale = cell / 512;
  POSES.forEach((pose, i) => {
    if (SHARP_POSES.includes(i)) return;
    g.save();
    g.beginPath();
    g.rect((i % SHEET_COLS) * cell, Math.floor(i / SHEET_COLS) * cell, cell, cell);
    g.clip();
    g.translate((i % SHEET_COLS) * cell, Math.floor(i / SHEET_COLS) * cell);
    g.scale(scale, scale);
    lastGrip = null;
    if (pose) draw(g, pose);
    else closeUp(g);
    g.restore();
    if (lastGrip) GRIPS.set(i, [lastGrip[0] / cell - (i % SHEET_COLS), lastGrip[1] / cell - Math.floor(i / SHEET_COLS)]);
  });
  return c;
}

export const SHEET_COLS = 5;
export const SHEET_ROWS = 5;

// Full-figure poses for story mode, which shows the character at rest over its panels.
const FIGURES: Record<string, Pose> = {
  smirk: { armL: POCKETS, armR: POCKETS_R, legL: [-9, -4], legR: [12, 7], head: 'smirk', hands: 'pocket', armsFront: true, hair: 18, gust: 0.25 },
  happy: { armL: [-56, -158], armR: [56, 158], legL: [-9, -4], legR: [12, 7], head: 'laugh', hands: 'peace', armsFront: true, hair: 18, gust: 0.25 },
  worried: { lean: 3, hands: 'fist', armL: POCKETS, armR: [30, -165], legL: [-9, -4], legR: [12, 7], head: 'worried', armsFront: true, hair: 12, gust: 0.2 },
  shocked: { armL: [-118, -152], armR: [118, 152], legL: [-12, -6], legR: [14, 8], head: 'shout', armsFront: true, hair: 0, gust: 0.9, flap: 6 },
  // Holding the lapels: the last pose of the story.
  proud: { hands: 'fist', armL: [-38, 58], armR: [38, -58], legL: [-11, -4], legR: [14, 7], head: 'grin', armsFront: true, bag: false, hair: 20, gust: 0.3 },
};

// Crops to the middle of the cell, which keeps the old portrait shape used by the story panels.
export function drawFigure(name: string, height = 900): HTMLCanvasElement {
  const c = document.createElement('canvas');
  const scale = height / 512;
  c.width = Math.round(400 * scale);
  c.height = height;
  const g = c.getContext('2d')!;
  g.scale(scale, scale);
  g.translate(-56, 0);
  draw(g, FIGURES[name] ?? FIGURES.smirk);
  return c;
}
