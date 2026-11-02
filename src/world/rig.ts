// The character, drawn pose by pose with canvas ink into one sprite sheet. Poses change on twos,
// so the movement reads as hand-drawn animation rather than smooth 3D.

type Limb = [number, number]; // upper and lower angle in degrees. 0 points down, positive swings right.

interface Pose {
  rot?: number; // whole-body rotation in degrees
  lean?: number;
  armL: Limb;
  armR: Limb;
  legL: Limb;
  legR: Limb;
  head: 'back' | 'glance' | 'side' | 'shout';
  hair?: number; // the way the wind pushes the hair, in degrees
  bag?: boolean;
  size?: number;
}

const INK = '#07040e';
const HOODIE = '#ffc917';
const HOODIE_DARK = '#e39a00';
const JEANS = '#2a3fa8';
const JEANS_DARK = '#16206a';
const SHOE = '#f03a2e';
const SOLE = '#fff4d6';
const SKIN = '#a9673c';
const SKIN_DARK = '#7d4624';
const BAG = '#17c4d6';
const BAG_DARK = '#0b8a9c';
const HAIR = '#0b0912';

const rad = (d: number) => (d * Math.PI) / 180;
const dir = (d: number): [number, number] => [Math.sin(rad(d)), Math.cos(rad(d))];

function limb(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  [a, b]: Limb,
  len: [number, number],
  w: number,
  color: string,
  shade: string,
) {
  const [ax, ay] = dir(a);
  const [bx, by] = dir(b);
  const mx = x + ax * len[0];
  const my = y + ay * len[0];
  const ex = mx + bx * len[1];
  const ey = my + by * len[1];
  const path = () => {
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(mx, my);
    g.lineTo(ex, ey);
  };
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = INK;
  g.lineWidth = w + 11;
  path();
  g.stroke();
  g.strokeStyle = color;
  g.lineWidth = w;
  path();
  g.stroke();
  // A flat shadow down one side of the limb.
  const off = w * 0.27;
  g.strokeStyle = shade;
  g.lineWidth = w * 0.3;
  g.lineCap = 'butt';
  g.beginPath();
  g.moveTo(x - ay * off, y + ax * off);
  g.lineTo(mx - ay * off, my + ax * off);
  g.lineTo(ex - by * off, ey + bx * off);
  g.stroke();
  return { ex, ey, angle: b };
}

function hand(g: CanvasRenderingContext2D, x: number, y: number) {
  g.fillStyle = SKIN;
  g.strokeStyle = INK;
  g.lineWidth = 5.5;
  g.beginPath();
  g.arc(x, y, 14, 0, Math.PI * 2);
  g.fill();
  g.stroke();
}

function shoe(g: CanvasRenderingContext2D, x: number, y: number, angle: number, flip: number) {
  g.save();
  g.translate(x, y);
  g.rotate(-rad(angle));
  g.scale(flip, 1);
  g.lineJoin = 'round';
  g.fillStyle = SHOE;
  g.strokeStyle = INK;
  g.lineWidth = 5.5;
  g.beginPath();
  g.moveTo(-17, -10);
  g.lineTo(15, -10);
  g.quadraticCurveTo(44, 6, 44, 20);
  g.lineTo(-20, 20);
  g.closePath();
  g.fill();
  g.stroke();
  g.strokeStyle = SOLE;
  g.lineWidth = 7;
  g.beginPath();
  g.moveTo(-17, 19);
  g.lineTo(42, 19);
  g.stroke();
  g.restore();
}

function hairShape(g: CanvasRenderingContext2D, r: number, wind: number) {
  // Spiky hair, pushed in the direction of the wind.
  const spikes = 8;
  g.beginPath();
  for (let i = 0; i <= spikes * 2; i++) {
    const t = (i / (spikes * 2)) * Math.PI * 1.16 - Math.PI * 1.08;
    const long = i % 2 === 0;
    const len = long ? r * (1.14 + ((i * 7) % 5) * 0.035) : r * 0.96;
    const px = Math.cos(t) * len + (long ? Math.sin(rad(wind)) * r * 0.32 : 0);
    const py = Math.sin(t) * len - (long ? Math.cos(rad(wind)) * r * 0.14 : 0);
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  g.closePath();
}

function head(g: CanvasRenderingContext2D, kind: Pose['head'], wind: number) {
  const r = 32;
  g.lineJoin = 'round';
  g.strokeStyle = INK;
  g.lineWidth = 6;
  if (kind === 'back') {
    g.fillStyle = HAIR;
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    hairShape(g, r, wind);
    g.fill();
    g.stroke();
    g.fillStyle = SKIN;
    g.beginPath();
    g.ellipse(r - 2, 4, 8, 12, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.strokeStyle = '#ff5a2e';
    g.lineWidth = 3.5;
    g.beginPath();
    g.arc(0, 0, r - 7, -2.5, -0.5);
    g.stroke();
    return;
  }
  // Face, turned to the right of the frame.
  g.fillStyle = SKIN;
  g.beginPath();
  g.moveTo(-r, -6);
  g.quadraticCurveTo(-r, -r - 2, 2, -r - 2);
  g.quadraticCurveTo(r + 2, -r, r + 4, -2);
  g.quadraticCurveTo(r + 4, r * 0.8, 6, r + 6);
  g.quadraticCurveTo(-r * 0.8, r * 0.8, -r, -6);
  g.closePath();
  g.fill();
  g.stroke();
  // Shadow on the far cheek.
  g.fillStyle = SKIN_DARK;
  g.beginPath();
  g.moveTo(-r + 3, -6);
  g.quadraticCurveTo(-r * 0.7, r * 0.7, 4, r + 3);
  g.quadraticCurveTo(-r * 0.2, r * 0.4, -r * 0.34, -8);
  g.closePath();
  g.fill();
  g.strokeStyle = INK;
  // Ear.
  g.fillStyle = SKIN;
  g.beginPath();
  g.ellipse(-r + 1, 4, 8, 12, 0, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  // Hair.
  g.save();
  g.translate(-2, -13);
  hairShape(g, r * 0.96, wind);
  g.fillStyle = HAIR;
  g.fill();
  g.stroke();
  g.restore();
  const shout = kind === 'shout';
  // Eyes.
  for (const [ex, ew] of [[6, 9], [24, 7.5]] as const) {
    g.fillStyle = SOLE;
    g.lineWidth = 3.5;
    g.beginPath();
    g.ellipse(ex, -1, ew, shout ? 11 : 7.5, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillStyle = INK;
    g.beginPath();
    g.arc(ex + (shout ? 0 : 2.5), shout ? 1 : 0, shout ? 2.8 : 3.8, 0, Math.PI * 2);
    g.fill();
  }
  // Brows and mouth.
  g.lineWidth = 5.5;
  g.lineCap = 'round';
  g.beginPath();
  if (shout) {
    g.moveTo(-3, -17);
    g.lineTo(13, -20);
    g.moveTo(19, -20);
    g.lineTo(31, -17);
  } else {
    g.moveTo(-3, -12);
    g.lineTo(13, -14);
    g.moveTo(19, -17);
    g.lineTo(31, -12);
  }
  g.stroke();
  if (shout) {
    g.fillStyle = '#3d0f18';
    g.beginPath();
    g.ellipse(15, 20, 11, 10, 0, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 4;
    g.stroke();
    g.fillStyle = SOLE;
    g.fillRect(7, 12, 16, 4);
  } else {
    g.lineWidth = 4.5;
    g.beginPath();
    g.moveTo(3, 20);
    g.quadraticCurveTo(16, 26, 28, 13);
    g.stroke();
  }
}

function draw(g: CanvasRenderingContext2D, p: Pose) {
  const size = p.size ?? 1;
  g.save();
  g.translate(256, 250);
  g.rotate(rad(p.rot ?? 0));
  g.scale(size, size);
  const lean = p.lean ?? 0;
  const [lx, ly] = dir(180 + lean); // the spine, from hip up to neck
  const T = 106;
  const nx = lx * T;
  const ny = ly * T;
  // A vector across the shoulders.
  const sx = -ly;
  const sy = lx;

  // Far limbs first.
  const legB = limb(g, -16, 4, p.legL, [88, 92], 30, JEANS, JEANS_DARK);
  shoe(g, legB.ex, legB.ey, legB.angle, p.legL[1] > 8 ? 1 : -1);
  const legA = limb(g, 16, 4, p.legR, [88, 92], 30, JEANS, JEANS_DARK);
  shoe(g, legA.ex, legA.ey, legA.angle, p.legR[1] < -8 ? -1 : 1);

  const armB = limb(g, nx + sx * -39, ny + sy * -39, p.armL, [62, 60], 21, HOODIE, HOODIE_DARK);
  hand(g, armB.ex, armB.ey);

  // Torso.
  const torso = () => {
    g.beginPath();
    g.moveTo(nx + sx * -46, ny + sy * -46);
    g.quadraticCurveTo(nx, ny - 12, nx + sx * 46, ny + sy * 46);
    g.lineTo(sx * 34 + 2, sy * 34 + 10);
    g.quadraticCurveTo(0, 20, sx * -34 - 2, sy * -34 + 10);
    g.closePath();
  };
  g.lineJoin = 'round';
  g.fillStyle = HOODIE;
  g.strokeStyle = INK;
  g.lineWidth = 7;
  torso();
  g.fill();
  // Print dots on the shadow side, clipped to the body.
  g.save();
  torso();
  g.clip();
  g.fillStyle = '#b4176f';
  for (let dx = -62; dx < -2; dx += 8) {
    for (let dy = -130; dy < 28; dy += 8) {
      g.beginPath();
      g.arc(dx + (dy % 16 === 0 ? 4 : 0) + nx * 0.35, dy, 2.3, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.restore();
  torso();
  g.stroke();

  // Backpack, seen when the character is turned away.
  if (p.bag !== false) {
    g.fillStyle = BAG;
    g.lineWidth = 6;
    const bx = nx * 0.55;
    const by = ny * 0.55;
    g.beginPath();
    g.roundRect(bx - 25, by - 31, 50, 66, 12);
    g.fill();
    g.stroke();
    g.fillStyle = BAG_DARK;
    g.beginPath();
    g.roundRect(bx - 17, by + 1, 34, 24, 6);
    g.fill();
    g.stroke();
    g.strokeStyle = INK;
    g.lineWidth = 8;
    g.beginPath();
    g.moveTo(nx + sx * -26, ny + sy * -26);
    g.lineTo(bx - 22, by - 24);
    g.moveTo(nx + sx * 26, ny + sy * 26);
    g.lineTo(bx + 22, by - 24);
    g.stroke();
  }

  // Hood lump behind the neck.
  g.fillStyle = HOODIE_DARK;
  g.strokeStyle = INK;
  g.lineWidth = 6;
  g.beginPath();
  g.ellipse(nx, ny - 2, 29, 14, rad(-lean), 0, Math.PI * 2);
  g.fill();
  g.stroke();

  const armA = limb(g, nx + sx * 39, ny + sy * 39, p.armR, [62, 60], 21, HOODIE, HOODIE_DARK);
  hand(g, armA.ex, armA.ey);

  g.save();
  g.translate(lx * (T + 30), ly * (T + 30));
  g.rotate(rad(-lean * 0.7));
  head(g, p.head, p.hair ?? 0);
  g.restore();
  g.restore();
}

// A close-up of the face for the comic panels, with burst lines behind it.
function closeUp(g: CanvasRenderingContext2D) {
  g.save();
  g.translate(256, 256);
  g.fillStyle = HOODIE;
  g.strokeStyle = INK;
  g.lineWidth = 12;
  g.beginPath();
  g.moveTo(-190, 280);
  g.quadraticCurveTo(-170, 110, 0, 104);
  g.quadraticCurveTo(170, 110, 190, 280);
  g.closePath();
  g.fill();
  g.stroke();
  g.scale(4.1, 4.1);
  g.translate(-11, -8);
  head(g, 'shout', 8);
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
} as const;

const POSES: Pose[] = [
  { armL: [-10, -5], armR: [11, 5], legL: [-9, -4], legR: [12, 7], head: 'back', hair: 22 },
  { armL: [-12, -8], armR: [12, 8], legL: [-9, -4], legR: [12, 7], head: 'back', hair: 42 },
  { lean: 4, armL: [-10, -5], armR: [24, -26], legL: [-9, -4], legR: [12, 7], head: 'glance', hair: 34 },
  { lean: 4, armL: [-34, 12], armR: [34, -12], legL: [-62, 34], legR: [62, -34], head: 'back', hair: 24, size: 0.96 },
  { lean: 6, rot: 4, armL: [-128, -104], armR: [128, 104], legL: [-14, -24], legR: [20, 6], head: 'back', hair: 50 },
  { armL: [-112, -134], armR: [112, 134], legL: [-34, -14], legR: [34, 14], head: 'back', hair: 180 },
  { rot: 176, armL: [-150, -172], armR: [150, 172], legL: [-10, -24], legR: [12, 36], head: 'back', hair: 4 },
  { rot: 40, armL: [-132, -100], armR: [88, 142], legL: [-60, 6], legR: [48, -26], head: 'shout', hair: 200 },
  { rot: 145, armL: [-100, -68], armR: [132, 96], legL: [-48, -16], legR: [62, 26], head: 'back', hair: 12 },
  { rot: 256, armL: [-88, -150], armR: [96, 42], legL: [-26, -62], legR: [40, -6], head: 'shout', hair: 96 },
  { armL: [-146, -172], armR: [138, 176], legL: [-38, 28], legR: [44, -22], head: 'shout', hair: 180 },
  { lean: 20, armL: [-22, -8], armR: [64, 102], legL: [-64, 36], legR: [42, -40], head: 'back', hair: 180, size: 0.94 },
  { lean: 20, rot: 2, armL: [-68, -96], armR: [62, 108], legL: [-58, 34], legR: [46, -28], head: 'side', hair: -62, size: 0.96 },
  { lean: 24, rot: 2, armL: [-74, -112], armR: [70, 96], legL: [-62, 30], legR: [44, -30], head: 'side', hair: -80, size: 0.96 },
  { lean: 12, armL: [-60, -100], armR: [84, 152], legL: [-58, 34], legR: [46, -28], head: 'glance', hair: -50, size: 0.96 },
];

export function drawSheet(cell: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = cell * 4;
  const g = c.getContext('2d')!;
  const scale = cell / 512;
  POSES.forEach((pose, i) => {
    g.save();
    g.beginPath();
    g.rect((i % 4) * cell, Math.floor(i / 4) * cell, cell, cell);
    g.clip();
    g.translate((i % 4) * cell, Math.floor(i / 4) * cell);
    g.scale(scale, scale);
    draw(g, pose);
    g.restore();
  });
  g.save();
  g.beginPath();
  g.rect(3 * cell, 3 * cell, cell, cell);
  g.clip();
  g.translate(3 * cell, 3 * cell);
  g.scale(scale, scale);
  closeUp(g);
  g.restore();
  return c;
}
