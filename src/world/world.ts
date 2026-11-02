import {
  BackSide,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  ColorManagement,
  CylinderGeometry,
  DepthTexture,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  LinearFilter,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  UnsignedIntType,
  Vector2,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import skyline from '../../content/skyline.json';
import projects from '../../content/projects.json';
import site from '../../content/site.json';
import { drawSheet, POSE } from './rig';
import { BUILDING_FRAG, BUILDING_VERT, COMIC_FRAG, COMIC_VERT, GROUND_FRAG, GROUND_VERT, SKY_FRAG, SKY_VERT } from './shaders';

// Colours are authored for the comic look, so skip three.js colour conversion.
ColorManagement.enabled = false;

interface Key {
  p: number;
  pos: [number, number, number];
  look: [number, number, number];
  roll: number;
  fov: number;
}

interface Shot {
  pos: Vector3;
  look: Vector3;
  roll: number;
  fov: number;
}

const TOWER = new Vector3(20, 0, 20);
const TOWER_H = 226;
const LEDGE = new Vector3(TOWER.x + 6.4, TOWER_H + 2, TOWER.z - 9.6);

// The camera's journey through the city. `p` is the scroll position, 0 to 1.
const PATH: Key[] = [
  { p: 0.0, pos: [19, 236.5, 33], look: [10, 228, -130], roll: 0, fov: 46 },
  { p: 0.06, pos: [21, 238, 36], look: [14, 222, -130], roll: -0.04, fov: 46 },
  { p: 0.09, pos: [24, 243, 20], look: [20, 196, -70], roll: 0.04, fov: 54 },
  { p: 0.13, pos: [21, 226, 8], look: [20, 120, -24], roll: 0.5, fov: 74 },
  { p: 0.24, pos: [14, 118, -12], look: [2, 10, -60], roll: 2.2, fov: 88 },
  { p: 0.36, pos: [-14, 58, -66], look: [-34, 18, -150], roll: 4.9, fov: 82 },
  { p: 0.46, pos: [-38, 22, -120], look: [-40, 12, -230], roll: 6.283, fov: 70 },
  { p: 0.56, pos: [-40, 8.5, -210], look: [-40, 6, -310], roll: 6.283, fov: 62 },
  { p: 0.76, pos: [-40, 7.5, -470], look: [-40, 5.5, -570], roll: 6.283, fov: 64 },
  { p: 0.86, pos: [-44, 74, -620], look: [-44, 60, -900], roll: 6.283, fov: 62 },
  { p: 1.0, pos: [-34, 128, -770], look: [14, 92, -60], roll: 6.283, fov: 44 },
];

const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.min(Math.max(t, 0), 1);
const range = (v: number, a: number, b: number) => clamp01((v - a) / (b - a));
const cat = (a: number, b: number, c: number, d: number, t: number) =>
  0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t);

// On a phone the opening shot steps back and tilts up, so the character stands under the title.
const PORTRAIT_OPEN = { pos: new Vector3(25, 239, 45), look: new Vector3(25, 279, -130) };

function sample(p: number): Shot {
  const q = clamp01(p);
  let i = 0;
  while (i < PATH.length - 2 && q > PATH[i + 1].p) i++;
  const k1 = PATH[i];
  const k2 = PATH[i + 1];
  const k0 = PATH[Math.max(i - 1, 0)];
  const k3 = PATH[Math.min(i + 2, PATH.length - 1)];
  const t = (q - k1.p) / (k2.p - k1.p);
  const v = (f: (k: Key) => number) => cat(f(k0), f(k1), f(k2), f(k3), t);
  return {
    pos: new Vector3(v((k) => k.pos[0]), v((k) => k.pos[1]), v((k) => k.pos[2])),
    look: new Vector3(v((k) => k.look[0]), v((k) => k.look[1]), v((k) => k.look[2])),
    roll: k1.roll + (k2.roll - k1.roll) * smooth(t),
    fov: k1.fov + (k2.fov - k1.fov) * smooth(t),
  };
}

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// A painted sign. `small` is a line under the main text.
function signTexture(text: string, small: string, bg: string, fg: string, w = 768, h = 256) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.lineWidth = h * 0.055;
  g.strokeStyle = '#07040e';
  g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, w - g.lineWidth, h - g.lineWidth);
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  let size = h * 0.47;
  g.font = `${size}px Anton, Impact, sans-serif`;
  while (g.measureText(text).width > w * 0.91 && size > 14) {
    size -= 4;
    g.font = `${size}px Anton, Impact, sans-serif`;
  }
  g.fillText(text.toUpperCase(), w / 2, small ? h * 0.4 : h * 0.5);
  if (small) {
    let s2 = h * 0.17;
    g.font = `${s2}px Teko, sans-serif`;
    while (g.measureText(small).width > w * 0.92 && s2 > 12) {
      s2 -= 2;
      g.font = `${s2}px Teko, sans-serif`;
    }
    g.fillText(small, w / 2, h * 0.8);
  }
  return new CanvasTexture(c);
}

// Half-plane helper for comic panels: the side of line P-Q that contains point I.
type Line = [number, number, number];
const NO_LINE: Line = [0, 0, 1];
function edge(px: number, py: number, qx: number, qy: number, ix: number, iy: number): Line {
  const a = qy - py;
  const b = px - qx;
  const c = -(a * px + b * py);
  return a * ix + b * iy + c >= 0 ? [a, b, c] : [-a, -b, -c];
}

export interface World {
  setCruise: (on: boolean) => void;
  setProgress: (p: number) => void;
  setPaused: (paused: boolean) => void;
  renderAt: (p: number) => void;
  /** Plays the opening shots, then calls back when the hero title should slam in. */
  playOpening: (onTitle: () => void, onDone: () => void) => void;
  skipOpening: () => void;
  speed: () => number;
}

export async function startWorld(canvas: HTMLCanvasElement, opts: { still?: boolean; fixedQuality?: boolean } = {}): Promise<World> {
  const renderer = new WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
  renderer.setClearColor(new Color('#fff4d6'));
  renderer.outputColorSpace = 'srgb-linear';
  renderer.autoClear = false;
  const isPhone = matchMedia('(max-width: 760px)').matches;
  let pixelScale = Math.min(devicePixelRatio || 1, isPhone ? 1.25 : 1.5);
  let allowPanels = true;

  const camera = new PerspectiveCamera(50, 1, 0.5, 2400);
  const scene = new Scene();
  const sunDir = new Vector3(0.1, 0.1, -1).normalize();
  const time = { value: 0 };
  const rand = rng(90210);

  // --- Sky and ground ---
  const sky = new Mesh(
    new SphereGeometry(2200, 32, 20),
    new ShaderMaterial({ side: BackSide, depthWrite: false, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, uniforms: { uSunDir: { value: sunDir } } }),
  );
  scene.add(sky);
  const camUniform = { value: new Vector3() };
  const ground = new Mesh(
    new PlaneGeometry(4000, 4000),
    new ShaderMaterial({ vertexShader: GROUND_VERT, fragmentShader: GROUND_FRAG, uniforms: { uCam: camUniform } }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.z = -300;
  scene.add(ground);

  // --- City. Real repos become the gold towers; the rest of the city is scenery. ---
  const flight: Vector3[] = [];
  for (let p = 0.03; p <= 0.8; p += 0.002) flight.push(sample(p).pos);
  const clearance = (x: number, z: number, half: number, h: number) => {
    // Lowers any building that would sit in the camera's way.
    let limit = h;
    for (const f of flight) {
      if (Math.abs(f.x - x) < half + 12 && Math.abs(f.z - z) < half + 12) limit = Math.min(limit, Math.max(f.y - 9, 0));
    }
    return limit;
  };
  type B = { x: number; z: number; w: number; d: number; h: number; y0: number; hero: number };
  const list: B[] = [];
  const tanks: [number, number, number][] = [];
  const neon: { x: number; y: number; z: number; h: number; color: string }[] = [];
  const signs: { x: number; y: number; z: number; name: string; commits: number; w: number }[] = [];
  const repos = [...skyline.repos].sort((a, b) => b.commits - a.commits);
  const heroSpots: [number, number][] = [
    [20, 20], [-20, -60], [60, -60], [-60, -140], [20, -100], [-20, -180], [20, -220], [60, -140], [-60, -220], [60, -260],
    [-20, -300], [20, -340], [-60, -380], [-20, -420], [20, -460], [-60, -500], [-20, -540], [20, -580], [-60, -620], [60, -380], [60, -500],
  ];
  const taken = new Set<string>();
  repos.forEach((r, i) => {
    const [x, z] = heroSpots[i % heroSpots.length];
    const h = i === 0 ? TOWER_H : 34 + r.commits * 0.7;
    taken.add(`${x},${z}`);
    const lim = i === 0 ? h : clearance(x, z, 12, h);
    const size = i === 0 ? 22 : 20;
    list.push({ x, z, w: size, d: size, h: Math.max(lim, 8), y0: 0, hero: 1 });
    if (lim > 26 && i > 0) signs.push({ x, y: Math.max(lim, 8), z, name: r.name, commits: r.commits, w: size });
  });
  const neonColors = ['#ff2e88', '#17c4d6', '#ffc917', '#a64dff', '#ff5a2e'];
  for (let ix = -20; ix <= 20; ix++) {
    for (let iz = -24; iz <= 12; iz++) {
      const x = ix * 40 + 20;
      const z = iz * 40 + 20;
      if (taken.has(`${x},${z}`)) continue;
      const dist = Math.hypot(x, z + 240) / 700;
      const count = rand() > 0.42 ? 1 : 2;
      for (let n = 0; n < count; n++) {
        const w = count === 1 ? 14 + rand() * 11 : 8 + rand() * 4;
        const d = 14 + rand() * 11;
        const ox = count === 1 ? 0 : n === 0 ? -6.5 : 6.5;
        const tall = rand();
        let h = (14 + Math.pow(tall, 2.4) * 120) * (1.15 - Math.min(dist, 1) * 0.55);
        h = clearance(x + ox, z, Math.max(w, d) / 2, h);
        if (h < 3) continue;
        const bx = x + ox;
        list.push({ x: bx, z, w, d, h, y0: 0, hero: 0 });
        // Tall buildings step back near the top, so the skyline isn't just boxes.
        let top = h;
        if (h > 44 && rand() > 0.42) {
          const h2 = 8 + rand() * h * 0.28;
          const room = clearance(bx, z, Math.max(w, d) / 2, h + h2) - h;
          if (room > 3) {
            list.push({ x: bx, z, w: w * 0.68, d: d * 0.68, h: Math.min(h2, room), y0: h, hero: 0 });
            top = h + Math.min(h2, room);
          }
        }
        if (rand() > 0.55 && top < 170 && dist < 0.9) tanks.push([bx + (rand() - 0.5) * w * 0.4, top, z + (rand() - 0.5) * d * 0.4]);
        if (h > 28 && rand() > 0.58) {
          neon.push({
            x: bx + (rand() > 0.5 ? 1 : -1) * (w / 2 + 0.3),
            y: h * (0.35 + rand() * 0.3),
            z: z - d / 2 + 0.3,
            h: 6 + rand() * h * 0.3,
            color: neonColors[Math.floor(rand() * neonColors.length)],
          });
        }
      }
    }
  }

  const box = new BoxGeometry(1, 1, 1);
  box.translate(0, 0.5, 0);
  const buildingMat = new ShaderMaterial({
    vertexShader: BUILDING_VERT,
    fragmentShader: BUILDING_FRAG,
    uniforms: { uSunDir: { value: sunDir }, uTime: time },
  });
  const city = new InstancedMesh(box, buildingMat, list.length);
  const seeds = new Float32Array(list.length);
  const heroes = new Float32Array(list.length);
  const dummy = new Object3D();
  list.forEach((b, i) => {
    dummy.position.set(b.x, b.y0, b.z);
    dummy.scale.set(b.w, b.h, b.d);
    dummy.updateMatrix();
    city.setMatrixAt(i, dummy.matrix);
    seeds[i] = rand();
    heroes[i] = b.hero;
  });
  box.setAttribute('aSeed', new InstancedBufferAttribute(seeds, 1));
  box.setAttribute('aHero', new InstancedBufferAttribute(heroes, 1));
  city.frustumCulled = false;
  scene.add(city);

  // Black water tanks on rooftops, the most recognisable shape on an Indian skyline.
  const flat = (hex: string, side = 0) => new MeshBasicMaterial({ color: hex, side });
  const ink = flat('#0c0716');
  const tankMesh = new InstancedMesh(new CylinderGeometry(2.2, 2.2, 4.4, 9), ink, tanks.length);
  tanks.forEach(([x, y, z], i) => {
    dummy.position.set(x, y + 2.2, z);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    tankMesh.setMatrixAt(i, dummy.matrix);
  });
  tankMesh.frustumCulled = false;
  scene.add(tankMesh);

  // Vertical neon signs on building corners.
  const neonMesh = new InstancedMesh(new BoxGeometry(1.2, 1, 0.4), new MeshBasicMaterial(), neon.length);
  const tmpColor = new Color();
  neon.forEach((n, i) => {
    dummy.position.set(n.x, n.y, n.z);
    dummy.scale.set(1, n.h, 1);
    dummy.updateMatrix();
    neonMesh.setMatrixAt(i, dummy.matrix);
    neonMesh.setColorAt(i, tmpColor.set(n.color));
  });
  neonMesh.frustumCulled = false;
  scene.add(neonMesh);

  // Ledge of the tallest tower.
  const roof = new Group();
  const parapet = flat('#ffc917');
  const addRoof = (w: number, h: number, d: number, x: number, y: number, z: number) => {
    const b = new Mesh(new BoxGeometry(w, h, d), parapet);
    b.position.set(x, y, z);
    roof.add(b);
  };
  addRoof(23, 2, 1.4, 0, 1, -11);
  addRoof(23, 2, 1.4, 0, 1, 11);
  addRoof(1.4, 2, 23, -11, 1, 0);
  addRoof(1.4, 2, 23, 11, 1, 0);
  roof.position.set(TOWER.x, TOWER_H, TOWER.z);
  scene.add(roof);

  // --- Signs need the display fonts ---
  await Promise.all([document.fonts.load('60px Anton').catch(() => undefined), document.fonts.load('40px Teko').catch(() => undefined)]);

  const billboard = (text: string, sub: string, x: number, y: number, z: number, ry: number, w: number, bg: string, fg: string) => {
    const s = new Mesh(new PlaneGeometry(w, w / 3), new MeshBasicMaterial({ map: signTexture(text, sub, bg, fg), side: DoubleSide }));
    s.position.set(x, y, z);
    s.rotation.y = ry;
    scene.add(s);
    return s;
  };
  const skillColors = [['#17c4d6', '#07040e'], ['#ff2e88', '#fff4d6'], ['#ffc917', '#07040e'], ['#7a2cff', '#fff4d6'], ['#f03a2e', '#fff4d6']];
  site.skills.forEach((g, i) => {
    const [bg, fg] = skillColors[i % skillColors.length];
    const side = i % 2 ? 1 : -1;
    billboard(g.group, g.items.slice(0, 3).map((s) => s.name.replace('Amazon ', '')).join(' · '), -38 + side * 21, 26 - i * 2.4, -128 - i * 30, -side * 1.12, 28, bg, fg);
  });
  const signMat = (tex: CanvasTexture) => new MeshBasicMaterial({ map: tex, side: DoubleSide });
  const poles = new Group();
  projects
    .filter((p) => p.mission)
    .forEach((p, i) => {
      const [bg, fg] = skillColors[i % skillColors.length];
      const z = -270 - i * 48;
      billboard(p.title, p.district ?? '', -40, 15, z, 0, 27, bg, fg);
      for (const x of [-53.5, -26.5]) {
        const pole = new Mesh(new BoxGeometry(0.6, 15, 0.6), ink);
        pole.position.set(x, 7.5, z);
        poles.add(pole);
      }
    });
  scene.add(poles);
  // Rooftop signs naming each real repo, so the gold towers can be read as data.
  signs.forEach((s) => {
    const label = new Mesh(
      new PlaneGeometry(s.w * 1.3, s.w * 0.42),
      signMat(signTexture(s.name, `${s.commits} commits`, '#ffc917', '#07040e', 512, 164)),
    );
    label.position.set(s.x, s.y + s.w * 0.28, s.z + s.w * 0.25);
    scene.add(label);
  });
  const towerSign = new Mesh(new PlaneGeometry(19, 6.4), signMat(signTexture('DSACCPP', '280 commits. Tallest in town.', '#ff2e88', '#fff4d6')));
  towerSign.position.set(TOWER.x, 150, TOWER.z - 11.2);
  towerSign.rotation.y = Math.PI;
  scene.add(towerSign);

  // Street lamps and tangled overhead wires down the avenue.
  const lampCount = 34;
  const lampPole = new InstancedMesh(new BoxGeometry(0.34, 11, 0.34), ink, lampCount);
  const lampGlow = new InstancedMesh(new SphereGeometry(0.7, 8, 6), flat('#fff0a0'), lampCount);
  const wirePts: number[] = [];
  for (let i = 0; i < lampCount; i++) {
    const side = i % 2 ? -53 : -27;
    const z = -150 - i * 26;
    dummy.scale.set(1, 1, 1);
    dummy.position.set(side, 5.5, z);
    dummy.updateMatrix();
    lampPole.setMatrixAt(i, dummy.matrix);
    dummy.position.set(side, 11, z);
    dummy.updateMatrix();
    lampGlow.setMatrixAt(i, dummy.matrix);
    // Sagging wires, some crossing the road.
    const nx = side;
    const nz = z - 52;
    if (i < lampCount - 2) {
      for (let k = 0; k < 8; k++) {
        const a = k / 8;
        const b = (k + 1) / 8;
        const sag = (t: number) => 11 - Math.sin(t * Math.PI) * (1.2 + (i % 3) * 0.6);
        wirePts.push(side, sag(a), z + (nz - z) * a, nx, sag(b), z + (nz - z) * b);
      }
    }
    if (i % 3 === 0) {
      for (let k = 0; k < 8; k++) {
        const a = k / 8;
        const b = (k + 1) / 8;
        const ox = -80 - side;
        const sag = (t: number) => 11 - Math.sin(t * Math.PI) * 1.8;
        wirePts.push(side + ox * a, sag(a), z - 13 * a, side + ox * b, sag(b), z - 13 * b);
      }
    }
  }
  lampPole.frustumCulled = lampGlow.frustumCulled = false;
  scene.add(lampPole, lampGlow);
  const wireGeo = new BufferGeometry();
  wireGeo.setAttribute('position', new Float32BufferAttribute(wirePts, 3));
  const wires = new LineSegments(wireGeo, new LineBasicMaterial({ color: '#07040e' }));
  wires.frustumCulled = false;
  scene.add(wires);

  // Kites over the city, because of course.
  const kiteColors = ['#ff2e88', '#17c4d6', '#ffc917', '#7dff5e', '#f03a2e', '#fff4d6'];
  const kiteShape = new BufferGeometry();
  kiteShape.setAttribute('position', new Float32BufferAttribute([0, 2.6, 0, 1.9, 0, 0, 0, -2.6, 0, 0, 2.6, 0, 0, -2.6, 0, -1.9, 0, 0], 3));
  kiteShape.computeVertexNormals();
  const kites: { mesh: Mesh; x: number; y: number; z: number; seed: number }[] = [];
  for (let i = 0; i < 16; i++) {
    const mesh = new Mesh(kiteShape, flat(kiteColors[i % kiteColors.length], DoubleSide));
    const k = { mesh, x: -70 + rand() * 170, y: 200 + rand() * 70, z: -90 - rand() * 140, seed: rand() * 100 };
    kites.push(k);
    scene.add(mesh);
  }

  // --- Vehicles ---
  const wheelGeo = new CylinderGeometry(0.62, 0.62, 0.4, 14);
  wheelGeo.rotateZ(Math.PI / 2);
  const part = (g: Group, geo: BufferGeometry, mat: MeshBasicMaterial, x: number, y: number, z: number) => {
    const o = new Mesh(geo, mat);
    o.position.set(x, y, z);
    g.add(o);
    return o;
  };
  const yellow = flat('#ffc917');
  const auto = new Group();
  part(auto, new BoxGeometry(2.5, 1.0, 3.8), ink, 0, 1.0, 0);
  part(auto, new BoxGeometry(2.3, 0.14, 3.0), yellow, 0, 1.56, 0.1);
  part(auto, new BoxGeometry(2.6, 0.32, 3.8), yellow, 0, 3.06, 0);
  part(auto, new BoxGeometry(2.4, 0.2, 3.3), ink, 0, 3.3, 0);
  for (const [x, z] of [[-1.15, 1.75], [1.15, 1.75], [-1.15, -1.75], [1.15, -1.75]]) {
    part(auto, new BoxGeometry(0.14, 1.6, 0.14), yellow, x, 2.2, z);
  }
  part(auto, wheelGeo, ink, -1.2, 0.62, 1.2);
  part(auto, wheelGeo, ink, 1.2, 0.62, 1.2);
  part(auto, wheelGeo, ink, 0, 0.62, -1.9);
  part(auto, new BoxGeometry(0.5, 0.26, 0.05), flat('#ff2030'), -0.85, 1.22, 1.93);
  part(auto, new BoxGeometry(0.5, 0.26, 0.05), flat('#ff2030'), 0.85, 1.22, 1.93);
  part(auto, new SphereGeometry(0.34, 8, 6), flat('#fff0a0'), 0, 1.4, -2.0);
  const plate = new Mesh(new PlaneGeometry(1.9, 0.62), new MeshBasicMaterial({ map: signTexture('COMMIT OK PLEASE', '', '#ffc917', '#07040e') }));
  plate.position.set(0, 0.96, 1.92);
  auto.add(plate);
  part(auto, new BoxGeometry(1.1, 1.2, 0.4), yellow, 0, 2.08, -0.7);
  part(auto, new BoxGeometry(0.72, 0.72, 0.5), flat('#0b0912'), 0, 2.92, -0.7);
  auto.visible = false;
  auto.scale.setScalar(1.25);
  scene.add(auto);

  // The DEADLINE van, which chases the auto down the avenue.
  const van = new Group();
  part(van, new BoxGeometry(3.4, 3.2, 6.6), flat('#14082f'), 0, 2.3, 0);
  part(van, new BoxGeometry(3.45, 0.5, 6.65), flat('#f03a2e'), 0, 1.55, 0);
  part(van, wheelGeo, ink, -1.6, 0.62, 2);
  part(van, wheelGeo, ink, 1.6, 0.62, 2);
  part(van, wheelGeo, ink, -1.6, 0.62, -2);
  part(van, wheelGeo, ink, 1.6, 0.62, -2);
  const lightA = part(van, new BoxGeometry(1.4, 0.5, 0.8), flat('#ff2030'), -0.8, 4.1, 0.2);
  const lightB = part(van, new BoxGeometry(1.4, 0.5, 0.8), flat('#2060ff'), 0.8, 4.1, 0.2);
  const vanRear = new Mesh(new PlaneGeometry(3.3, 2.1), new MeshBasicMaterial({ map: signTexture('DEADLINE', 'Nov 6, 11:59 PM', '#f03a2e', '#fff4d6') }));
  vanRear.position.set(0, 2.5, 3.32);
  van.add(vanRear);
  const vanFront = new Mesh(new PlaneGeometry(3.3, 2.1), new MeshBasicMaterial({ map: signTexture('DEADLINE', 'Nov 6, 11:59 PM', '#f03a2e', '#fff4d6') }));
  vanFront.position.set(0, 2.5, -3.32);
  vanFront.rotation.y = Math.PI;
  van.add(vanFront);
  van.visible = false;
  scene.add(van);

  // Stunt ramp at the end of the avenue.
  const ramp = new Mesh(new BoxGeometry(11, 0.6, 16), new MeshBasicMaterial({ map: signTexture('JUMP', '', '#ffc917', '#07040e', 256, 256) }));
  ramp.position.set(-41, 2.6, -505);
  ramp.rotation.x = 0.34;
  scene.add(ramp);

  // Everyday traffic, as a few simple instanced shapes.
  const carCount = isPhone ? 44 : 90;
  const cars = { body: new InstancedMesh(new BoxGeometry(2.6, 1.4, 5.2), new MeshBasicMaterial(), carCount), top: new InstancedMesh(new BoxGeometry(2.3, 1.1, 2.6), flat('#14082f'), carCount), tail: new InstancedMesh(new BoxGeometry(2.3, 0.34, 5.28), flat('#ff2030'), carCount) };
  const carColors = ['#ffc917', '#ffc917', '#fff4d6', '#17c4d6', '#ff2e88', '#7a2cff', '#ff7a2e'];
  const traffic: { x: number; z: number; v: number; along: boolean }[] = [];
  for (let i = 0; i < carCount; i++) {
    const avenue = i < carCount * 0.42;
    const lanes = avenue ? [-33, -47] : [-120, -80, 0, 40, 80];
    const lane = lanes[Math.floor(rand() * lanes.length)] + (avenue ? 0 : rand() > 0.5 ? 7 : -7);
    // On the avenue, the far lane comes towards the camera and the near lane is slower traffic.
    const towards = avenue ? lane > -40 : rand() > 0.5;
    traffic.push({ x: lane, z: -100 - rand() * 760, v: (towards ? 1 : -1) * (24 + rand() * 18), along: true });
    cars.body.setColorAt(i, tmpColor.set(carColors[i % carColors.length]));
  }
  for (const m of [cars.body, cars.top, cars.tail]) {
    m.frustumCulled = false;
    scene.add(m);
  }

  // Speed streaks that rush past the camera during the fall.
  const streakCount = 90;
  const streaks = new InstancedMesh(new BoxGeometry(0.06, 0.06, 1), flat('#fff4d6'), streakCount);
  const streakData = Array.from({ length: streakCount }, () => ({ x: (rand() - 0.5) * 34, y: (rand() - 0.5) * 34, z: -rand() * 60 }));
  streaks.frustumCulled = false;
  scene.add(camera);
  camera.add(streaks);

  // --- The character ---
  const sheet = new CanvasTexture(drawSheet(isPhone ? 256 : 512));
  sheet.generateMipmaps = false;
  sheet.minFilter = LinearFilter;
  sheet.magFilter = LinearFilter;
  sheet.repeat.set(0.25, 0.25);
  const heroMat = new MeshBasicMaterial({ map: sheet, alphaTest: 0.5, side: DoubleSide });
  const hero = new Mesh(new PlaneGeometry(1, 1), heroMat);
  hero.renderOrder = 10;
  scene.add(hero);
  const setFrame = (i: number) => {
    sheet.offset.set((i % 4) * 0.25, 0.75 - Math.floor(i / 4) * 0.25);
  };

  // --- Comic pass ---
  const target = new WebGLRenderTarget(4, 4, { depthBuffer: true, minFilter: LinearFilter, magFilter: LinearFilter });
  target.depthTexture = new DepthTexture(4, 4, UnsignedIntType);
  const postScene = new Scene();
  const postGeo = new BufferGeometry();
  postGeo.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const comic = new ShaderMaterial({
    vertexShader: COMIC_VERT,
    fragmentShader: COMIC_FRAG,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      tColor: { value: target.texture },
      tDepth: { value: target.depthTexture },
      uRes: { value: new Vector2(4, 4) },
      uTick: { value: 0 },
      uSpeed: { value: 0 },
      uNear: { value: camera.near },
      uFar: { value: camera.far },
      uPx: { value: 1 },
      uFlash: { value: 0 },
      uSiren: { value: 0 },
      uPanels: { value: 0 },
      uClip: { value: [new Vector3(0, 0, 1), new Vector3(0, 0, 1), new Vector3(0, 0, 1)] },
    },
  });
  const tri = new Mesh(postGeo, comic);
  tri.frustumCulled = false;
  postScene.add(tri);
  const postCam = new PerspectiveCamera();

  const resize = () => {
    const w = canvas.clientWidth || innerWidth;
    const h = canvas.clientHeight || innerHeight;
    renderer.setPixelRatio(pixelScale);
    renderer.setSize(w, h, false);
    const pw = Math.floor(w * pixelScale);
    const ph = Math.floor(h * pixelScale);
    target.setSize(pw, ph);
    comic.uniforms.uRes.value.set(pw, ph);
    comic.uniforms.uPx.value = pixelScale;
    camera.aspect = w / h;
  };
  resize();
  let resizeTimer = 0;
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(resize, 120);
  });

  // --- Where the character, the auto and the van are at any point in the journey ---
  const forward = new Vector3();
  const up = new Vector3();
  const right = new Vector3();
  const charPos = new Vector3();
  const autoPos = new Vector3();
  const vanPos = new Vector3();
  let tick = 0;

  const frameFor = (p: number) => {
    if (p < 0.035) return Math.floor(tick / 8) % 2 ? POSE.standWind : POSE.stand;
    if (p < 0.06) return POSE.glance;
    if (p < 0.075) return POSE.crouch;
    if (p < 0.09) return POSE.push;
    if (p < 0.135) return POSE.spread;
    if (p < 0.26) return POSE.dive;
    if (p < 0.4) return POSE.tumbleA + Math.floor(p * 110) % 3;
    if (p < 0.475) return POSE.flail;
    if (p < 0.525) return POSE.land;
    if (p > 0.6 && p < 0.65) return POSE.surfBack;
    return Math.floor(tick / 2) % 2 ? POSE.surfA : POSE.surfB;
  };

  const place = (p: number, s: Shot, now: number) => {
    // Auto and van, which only exist from just before the landing to just after the jump.
    const carsOn = p > 0.43 && p < 0.92;
    auto.visible = carsOn;
    const swerve = Math.sin(now / 900) * 0.9 + Math.sin(now / 340) * 0.25;
    const camZ = s.pos.z;
    const stunt = range(p, 0.765, 0.86);
    const air = Math.sin(stunt * Math.PI);
    autoPos.set(-40 + swerve * (1 - stunt), 0.04 * Math.sin(tick * 1.7) + air * 46 + stunt * 8, camZ - 19 - stunt * 30);
    auto.position.copy(autoPos);
    auto.rotation.x = stunt > 0 ? (0.5 - stunt) * 0.7 : 0;
    auto.rotation.z = Math.sin(now / 900) * 0.04 + stunt * 0.5;
    auto.rotation.y = -Math.cos(now / 900) * 0.06;

    const vanOn = p > 0.55 && p < 0.8;
    van.visible = vanOn;
    const lag = range(p, 0.75, 0.8);
    vanPos.set(-44.5 + Math.sin(now / 1100) * 0.7, 0.03 * Math.sin(tick * 1.3), camZ - 8.5 + lag * 14);
    van.position.copy(vanPos);
    const blink = Math.floor(tick / 6) % 2 === 0;
    lightA.visible = blink;
    lightB.visible = !blink;

    // Character.
    camera.getWorldDirection(forward);
    right.crossVectors(forward, camera.up).normalize();
    up.crossVectors(right, forward);
    const scale = 15.5;
    if (p < 0.085) {
      charPos.copy(LEDGE);
      charPos.y += 5.4 + range(p, 0.07, 0.085) * 7;
      hero.scale.setScalar(scale);
    } else {
      const twos = Math.floor(tick / 2);
      const wide = canvas.clientWidth > 760 ? 3.1 : 0;
      charPos.copy(s.pos).addScaledVector(forward, 11);
      charPos.addScaledVector(up, 0.4 + Math.sin(twos * 0.8) * 0.16);
      charPos.addScaledVector(right, wide);
      // Comes in to land on the auto's roof.
      const roofY = autoPos.y + 6.1;
      const land = smooth(range(p, 0.43, 0.51));
      charPos.lerp(new Vector3(autoPos.x + 0.2, roofY, autoPos.z), land);
      hero.scale.setScalar(6.2 + land * 0.9);
    }
    hero.visible = p < 0.9;
    heroMat.depthTest = p < 0.085 || p > 0.46;
  };

  // --- Comic panels. Each beat splits the screen and shows the moment from several cameras. ---
  type View = { lines: Line[]; center?: [number, number]; shot?: (s: Shot) => Shot; frame?: number };
  interface Beat {
    from: number;
    to: number;
    views: View[];
  }
  const v3 = (x: number, y: number, z: number) => new Vector3(x, y, z);
  const BEATS: Beat[] = [
    {
      // The leap: wide shot, the face, and what the face is looking at.
      from: 0.092,
      to: 0.135,
      views: [
        { lines: [edge(0.66, 1, 0.46, 0, 0, 0.5)], center: [0.3, 0.5] },
        {
          lines: [edge(0.66, 1, 0.46, 0, 1, 0.5), edge(0, 0.58, 1, 0.48, 1, 1)],
          center: [0.8, 0.76],
          frame: POSE.face,
          shot: () => ({ pos: charPos.clone().add(v3(-1.4, 0.3, 7.4)), look: charPos.clone().add(v3(0, 0.5, 0)), roll: -0.16, fov: 40 }),
        },
        {
          lines: [edge(0.66, 1, 0.46, 0, 1, 0.5), edge(0, 0.58, 1, 0.48, 1, 0)],
          center: [0.76, 0.24],
          shot: () => ({ pos: charPos.clone().add(v3(0, -6, -4)), look: v3(charPos.x - 8, 0, charPos.z - 60), roll: 0.4, fov: 82 }),
        },
      ],
    },
    {
      // Mid-fall: a side shot alongside the tower.
      from: 0.29,
      to: 0.335,
      views: [
        { lines: [edge(0, 0.2, 1, 0.74, 0, 1)], center: [0.4, 0.72] },
        {
          lines: [edge(0, 0.2, 1, 0.74, 1, 0)],
          center: [0.66, 0.26],
          shot: () => ({ pos: charPos.clone().add(v3(12, -3, 8)), look: charPos.clone(), roll: 0.5, fov: 62 }),
        },
      ],
    },
    {
      // The landing: impact, wheels, and the auto coming straight at us.
      from: 0.5,
      to: 0.548,
      views: [
        { lines: [edge(0.38, 1, 0.28, 0, 0, 0.5)], center: [0.17, 0.5] },
        {
          lines: [edge(0.38, 1, 0.28, 0, 1, 0.5), edge(0.72, 1, 0.62, 0, 0, 0.5)],
          center: [0.5, 0.5],
          shot: () => ({ pos: autoPos.clone().add(v3(3.4, 0.6, 3)), look: autoPos.clone().add(v3(0, 1.6, -2)), roll: -0.2, fov: 58 }),
        },
        {
          lines: [edge(0.72, 1, 0.62, 0, 1, 0.5)],
          center: [0.84, 0.5],
          shot: () => ({ pos: autoPos.clone().add(v3(0.6, 2.6, -12)), look: autoPos.clone().add(v3(0, 3.6, 0)), roll: 0.1, fov: 46 }),
        },
      ],
    },
    {
      // Rear-view mirror: the DEADLINE van, seen from the auto's roof.
      from: 0.655,
      to: 0.705,
      views: [
        { lines: [edge(0.58, 1, 1, 0.5, 0, 0)] },
        {
          lines: [edge(0.58, 1, 1, 0.5, 1, 1)],
          center: [0.86, 0.84],
          shot: () => ({ pos: autoPos.clone().add(v3(-0.4, 4.4, 2.6)), look: vanPos.clone().add(v3(0, 2.4, 0)), roll: 0, fov: 38 }),
        },
      ],
    },
    {
      // The stunt: seen from below against the sun.
      from: 0.79,
      to: 0.83,
      views: [
        { lines: [edge(0, 0.46, 1, 0.56, 0, 1)], center: [0.5, 0.76] },
        {
          lines: [edge(0, 0.46, 1, 0.56, 0, 0)],
          center: [0.5, 0.24],
          shot: () => ({ pos: autoPos.clone().add(v3(-16, -12, 10)), look: autoPos.clone(), roll: -0.2, fov: 58 }),
        },
      ],
    },
  ];

  // --- Opening shots: a quick cut sequence that plays once, on load ---
  let openStart = -1;
  let openTitle: (() => void) | null = null;
  let openDone: (() => void) | null = null;
  let lastCut = -1;
  const OPENING = 3.3;
  const openingShot = (t: number): { s: Shot; cut: number; frame: number } => {
    if (t < 1.0) {
      // Street level, looking straight up the gold tower.
      const k = t / 1.0;
      return { cut: 0, frame: POSE.stand, s: { pos: v3(-6 + k * 5, 3 + k * 16, -46 + k * 10), look: v3(20, 150 + k * 110, 16), roll: 0.28 - k * 0.1, fov: 82 } };
    }
    if (t < 1.7) {
      // His sneakers on the edge, with the whole city far below.
      const k = (t - 1.0) / 0.7;
      return { cut: 1, frame: POSE.stand, s: { pos: v3(LEDGE.x - 5.4, LEDGE.y + 2.2 + k * 0.6, LEDGE.z + 7), look: v3(LEDGE.x + 3, LEDGE.y - 4, LEDGE.z - 40), roll: -0.1, fov: 42 } };
    }
    // Whip back to the hero shot.
    const k = smooth(clamp01((t - 1.7) / 1.3));
    const end = sample(0);
    const s = {
      pos: v3(LEDGE.x + 16, LEDGE.y + 30, LEDGE.z + 62).lerp(end.pos, k),
      look: v3(LEDGE.x, LEDGE.y + 2, LEDGE.z).lerp(end.look, k),
      roll: 0.34 * (1 - k),
      fov: 70 + (end.fov - 70) * k,
    };
    return { cut: 2, frame: POSE.stand, s };
  };

  // --- Frame ---
  let goal = 0;
  let current = 0;
  let last = performance.now();
  let paused = false;
  let cruise = false;
  let raf = 0;
  let flash = 0;
  let lastFlash = -9999;
  let lastBeat = -1;
  let speedNow = 0;
  const pointer = new Vector2();
  addEventListener('pointermove', (e) => pointer.set(e.clientX / innerWidth - 0.5, e.clientY / innerHeight - 0.5), { passive: true });

  const aim = (s: Shot) => {
    camera.position.copy(s.pos);
    camera.fov = s.fov;
    camera.updateProjectionMatrix();
    camera.up.set(Math.sin(s.roll), Math.cos(s.roll), 0).normalize();
    camera.lookAt(s.look);
    camera.updateMatrixWorld();
    camUniform.value.copy(camera.position);
    sky.position.copy(camera.position);
    hero.quaternion.copy(camera.quaternion);
  };

  const pass = (lines: Line[] | null) => {
    const clip = comic.uniforms.uClip.value as Vector3[];
    for (let i = 0; i < 3; i++) clip[i].set(...((lines && lines[i]) || NO_LINE));
    comic.uniforms.uPanels.value = lines ? 1 : 0;
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(postScene, postCam);
  };

  const updateWorld = (now: number, dt: number) => {
    time.value = now / 1000;
    // Kites sway.
    for (const k of kites) {
      const t = now / 1000 + k.seed;
      k.mesh.position.set(k.x + Math.sin(t * 0.5) * 6, k.y + Math.sin(t * 0.8) * 4, k.z);
      k.mesh.rotation.z = Math.sin(t * 1.1) * 0.5;
      k.mesh.rotation.y = 0.3 + Math.sin(t * 0.4) * 0.3;
    }
    // Traffic rolls along, on twos so it matches the drawn feel.
    if (tick !== lastTrafficTick) {
      lastTrafficTick = tick;
      traffic.forEach((c, i) => {
        c.z += c.v * 0.083 * 1.4;
        if (c.z > 40) c.z = -860;
        if (c.z < -860) c.z = 40;
        dummy.scale.set(1, 1, 1);
        dummy.rotation.set(0, 0, 0);
        dummy.position.set(c.x, 1.2, c.z);
        dummy.updateMatrix();
        cars.body.setMatrixAt(i, dummy.matrix);
        cars.tail.setMatrixAt(i, dummy.matrix);
        dummy.position.set(c.x, 2.4, c.z + 0.2);
        dummy.updateMatrix();
        cars.top.setMatrixAt(i, dummy.matrix);
      });
      cars.body.instanceMatrix.needsUpdate = true;
      cars.top.instanceMatrix.needsUpdate = true;
      cars.tail.instanceMatrix.needsUpdate = true;
    }
    void dt;
  };
  let lastTrafficTick = -1;

  const updateStreaks = (speed: number, dt: number) => {
    streaks.visible = speed > 0.04;
    if (!streaks.visible) return;
    streakData.forEach((d, i) => {
      d.z += dt * 0.09 * (0.4 + speed);
      if (d.z > -1) d.z = -60;
      dummy.position.set(d.x, d.y, d.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 2 + speed * 22);
      dummy.updateMatrix();
      streaks.setMatrixAt(i, dummy.matrix);
    });
    streaks.instanceMatrix.needsUpdate = true;
  };

  const draw = (p: number, speed: number, now: number, dt: number) => {
    updateWorld(now, dt);
    updateStreaks(speed, dt);
    let s = sample(p);
    if (canvas.clientHeight > canvas.clientWidth) {
      const open = 1 - smooth(Math.min(p / 0.05, 1));
      s.pos.lerp(PORTRAIT_OPEN.pos, open);
      s.look.lerp(PORTRAIT_OPEN.look, open);
    }

    // The opening overrides the scroll position while it plays.
    let inOpening = false;
    if (openStart >= 0) {
      const t = (now - openStart) / 1000;
      if (t < OPENING) {
        inOpening = true;
        const o = openingShot(t);
        s = o.s;
        if (o.cut !== lastCut) {
          lastCut = o.cut;
          flash = 0.55;
          lastFlash = now;
          window.dispatchEvent(new Event('world:cut'));
          if (o.cut === 2 && openTitle) {
            openTitle();
            openTitle = null;
          }
        }
      } else {
        openStart = -1;
        openDone?.();
        openDone = null;
      }
    }

    // A little mouse parallax on top of the path, strongest at the top of the tower.
    const lean = 1 - smooth(Math.min(p / 0.1, 1));
    if (!inOpening) {
      s.pos.x += pointer.x * 4 * lean;
      s.pos.y -= pointer.y * 2 * lean;
      s.fov += speed * 8;
    }

    aim(s);
    place(p, s, now);
    const frame = inOpening ? POSE.stand : frameFor(p);
    setFrame(frame);
    hero.position.copy(charPos);

    // Sirens wash the screen during the chase.
    comic.uniforms.uSiren.value = range(p, 0.56, 0.6) * (1 - range(p, 0.76, 0.8));
    comic.uniforms.uTick.value = tick;
    comic.uniforms.uSpeed.value = speed;

    // Find the comic beat, if any, and flash on the cut.
    const beatIndex = allowPanels && !inOpening ? BEATS.findIndex((b) => p >= b.from && p <= b.to) : -1;
    if (beatIndex !== lastBeat) {
      if (beatIndex >= 0 && now - lastFlash > 900) {
        lastFlash = now;
        flash = 0.4;
        window.dispatchEvent(new Event('world:cut'));
      }
      lastBeat = beatIndex;
    }
    comic.uniforms.uFlash.value = flash;
    flash = Math.max(flash - dt * 0.006, 0);

    if (beatIndex < 0) {
      pass(null);
      return;
    }
    // Paper shows through in the gutters between panels.
    renderer.setRenderTarget(null);
    renderer.clear();
    for (const view of BEATS[beatIndex].views) {
      const shot = view.shot ? view.shot(s) : s;
      const [cu, cv] = view.center ?? [0.5, 0.5];
      const W = canvas.clientWidth;
      const H = canvas.clientHeight;
      camera.setViewOffset(W, H, (0.5 - cu) * W, (cv - 0.5) * H, W, H);
      aim(shot);
      setFrame(view.frame ?? frame);
      pass(view.lines);
    }
    camera.clearViewOffset();
  };

  let tickAt = 0;
  let slowFrames = 0;
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    if (paused) return;
    const dt = Math.min(now - last, 100);
    last = now;
    // In story mode the city keeps rolling past behind the comic, down the avenue and back.
    if (cruise) goal = 0.56 + (0.5 - 0.5 * Math.cos(now / 26000)) * 0.2;
    const k = 1 - Math.exp(-dt * (cruise ? 0.0016 : 0.005));
    const before = current;
    current += (goal - current) * k;
    const v = Math.abs(current - before) / Math.max(dt, 1);
    const inFall = current > 0.07 && current < 0.5 ? 1 : 0.35;
    speedNow = cruise ? 0 : Math.min(v * 1500 * inFall, 1);
    if (now - tickAt > 83) {
      tick++;
      tickAt = now;
    }
    draw(current, speedNow, now, dt);
    // If this device can't keep up, draw fewer pixels and drop the extra cameras rather than stutter.
    slowFrames = dt > 42 ? slowFrames + 1 : Math.max(slowFrames - 1, 0);
    if (slowFrames > 40 && !opts.fixedQuality) {
      slowFrames = 0;
      if (allowPanels && pixelScale <= 0.8) allowPanels = false;
      if (pixelScale > 0.7) {
        pixelScale = Math.max(pixelScale * 0.8, 0.7);
        resize();
      }
    }
  };
  if (opts.still) draw(0, 0, performance.now(), 16);
  else raf = requestAnimationFrame(loop);
  void raf;

  return {
    setCruise: (on) => {
      cruise = on;
    },
    setProgress: (p) => {
      goal = p;
    },
    setPaused: (v) => {
      paused = v;
      if (!v) last = performance.now();
    },
    renderAt: (p) => {
      goal = p;
      current = p;
      tick++;
      draw(p, 0, performance.now(), 16);
    },
    playOpening: (onTitle, onDone) => {
      openTitle = onTitle;
      openDone = onDone;
      lastCut = -1;
      openStart = performance.now();
    },
    skipOpening: () => {
      if (openStart < 0) return;
      openStart = -1;
      openTitle?.();
      openDone?.();
      openTitle = null;
      openDone = null;
    },
    speed: () => speedNow,
  };
}
