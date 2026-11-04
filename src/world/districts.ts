import {
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  type Material,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  type Quaternion,
  RepeatWrapping,
  RingGeometry,
  type Scene,
  type Texture,
} from 'three';

// The five stops of story mode, as real places in the city. Roads run along multiples of 40,
// so a plot of one block is 25 wide and a plot of two blocks is 65 wide.
export interface Plot {
  x: number;
  z: number;
  half: number;
  /** Where the auto stops, on a road beside the plot. */
  mark: [number, number];
  /** The road junction nearest to the mark. */
  node: [number, number];
  /** Where the camera sits for the establishing shot, relative to the plot. */
  cam: [number, number, number];
  /** Height the establishing shot looks at. */
  lookY: number;
  /** Generic blocks this plot replaces. */
  cells: [number, number][];
}

const cellsOf = (xs: number[], zs: number[]) => xs.flatMap((x) => zs.map((z) => [x, z] as [number, number]));

export const PLOTS: Record<string, Plot> = {
  solvefx: { x: -100, z: -260, half: 12.5, mark: [-80, -260], node: [-80, -240], cam: [46, 24, -30], lookY: 24, cells: [[-100, -260]] },
  'ipl-auction': { x: 120, z: -240, half: 32.5, mark: [80, -240], node: [80, -240], cam: [-52, 42, 34], lookY: 12, cells: cellsOf([100, 140], [-260, -220]) },
  'repomind-ai': { x: 100, z: -380, half: 12.5, mark: [80, -380], node: [80, -360], cam: [-42, 30, -32], lookY: 20, cells: [[100, -380]] },
  clipper: { x: -100, z: -420, half: 12.5, mark: [-80, -420], node: [-80, -400], cam: [32, 9, 24], lookY: 6, cells: [[-100, -420]] },
  'mimic-hunt': { x: -160, z: -320, half: 32.5, mark: [-120, -320], node: [-120, -320], cam: [84, 34, 22], lookY: 14, cells: cellsOf([-180, -140], [-340, -300]) },
};

type SignPaint = (text: string, small: string, bg: string, fg: string, w?: number, h?: number) => CanvasTexture;

const INK = '#0c0716';

function paint(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  return new CanvasTexture(c);
}

// A grid of windows. `lit` picks which ones glow.
const windows = (bg: string, dark: string, glow: string, cols: number, rows: number, lit: (c: number, r: number) => boolean) =>
  paint(cols * 32, rows * 40, (g) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, cols * 32, rows * 40);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        g.fillStyle = lit(c, r) ? glow : dark;
        g.fillRect(c * 32 + 6, r * 40 + 7, 20, 26);
        g.strokeStyle = INK;
        g.lineWidth = 3;
        g.strokeRect(c * 32 + 6, r * 40 + 7, 20, 26);
      }
    }
  });

function kit(root: Group) {
  const flat = (color: string, side = 0) => new MeshBasicMaterial({ color, side });
  const tex = (map: Texture) => new MeshBasicMaterial({ map });
  const add = (mesh: Mesh, x: number, y: number, z: number) => {
    mesh.position.set(x, y, z);
    root.add(mesh);
    return mesh;
  };
  // A box standing on height y.
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, mat: Material) =>
    add(new Mesh(new BoxGeometry(w, h, d), mat), x, y + h / 2, z);
  // Printed on both faces, so the words are never mirrored from behind.
  const sign = (map: Texture, w: number, h: number, x: number, y: number, z: number, ry: number) => {
    for (const turn of [0, Math.PI]) {
      const s = add(new Mesh(new PlaneGeometry(w, h), tex(map)), x, y, z);
      s.rotation.y = ry + turn;
      s.translateZ(0.06);
    }
  };
  return { flat, tex, add, box, sign };
}

function hostel(root: Group, paintSign: SignPaint) {
  const { flat, tex, box, sign } = kit(root);
  const face = windows('#128a99', '#0a3f52', '#ffc917', 7, 9, (c, r) => (c * 7 + r * 13) % 5 === 1 || (c === 3 && r === 2));
  box(24, 34, 20, 0, 0, 0, tex(face));
  box(25, 1.2, 21, 0, 34, 0, flat(INK));
  box(3, 5, 3, -7, 35, 3, flat(INK));
  sign(paintSign('THE HOSTEL', 'SolveFX was built here at 2 AM', '#ffc917', '#07040e'), 21, 7, 8, 41, 0, Math.PI / 2);
  box(0.6, 6, 0.6, 8, 35, -7, flat(INK));
  box(0.6, 6, 0.6, 8, 35, 7, flat(INK));
  // Washing on the line.
  box(0.2, 0.2, 18, 12.6, 15, 0, flat(INK));
  ['#ff2e88', '#fff4d6', '#17c4d6', '#ffc917'].forEach((color, i) => box(0.15, 3, 2.4, 12.7, 12, -6 + i * 4, flat(color)));
}

function ground(root: Group, paintSign: SignPaint) {
  const { flat, tex, add, box, sign } = kit(root);
  const crowd = paint(256, 64, (g) => {
    g.fillStyle = '#2a0f5e';
    g.fillRect(0, 0, 256, 64);
    const colors = ['#ff2e88', '#ffc917', '#fff4d6', '#17c4d6', '#7dff5e'];
    for (let y = 4; y < 64; y += 8) {
      for (let x = (y % 16) + 2; x < 256; x += 8) {
        g.fillStyle = colors[(x * 7 + y * 3) % 5];
        g.fillRect(x, y, 4, 4);
      }
    }
  });
  crowd.wrapS = RepeatWrapping;
  crowd.repeat.set(6, 1);
  const stands = add(new Mesh(new CylinderGeometry(32, 26, 13, 32, 1, true), new MeshBasicMaterial({ map: crowd, side: DoubleSide })), 0, 6.5, 0);
  void stands;
  add(new Mesh(new CylinderGeometry(32.6, 32.6, 1, 32, 1, true), flat('#ffc917', DoubleSide)), 0, 13.2, 0);
  const grass = paint(256, 256, (g) => {
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? '#1f9d57' : '#178a49';
      g.fillRect(0, i * 32, 256, 32);
    }
  });
  const field = add(new Mesh(new CircleGeometry(27, 32), tex(grass)), 0, 0.3, 0);
  field.rotation.x = -Math.PI / 2;
  box(3.4, 0.2, 15, 0, 0.3, 0, flat('#d9c58c'));
  for (const [x, z] of [[-25, -25], [25, -25], [-25, 25], [25, 25]]) {
    box(1.2, 38, 1.2, x, 0, z, flat(INK));
    box(9, 5, 1, x, 36, z, tex(windows(INK, '#fff4d6', '#fff4d6', 4, 2, () => true)));
    root.children[root.children.length - 1].rotation.y = Math.atan2(-x, -z);
  }
  sign(paintSign('CRICKET GROUND', 'IPL Auction: 323 players, 9 AI franchises', '#1f9d57', '#fff4d6'), 34, 11.3, -29, 22, 0, -Math.PI / 2);
  box(1, 16, 1, -29, 0, -14, flat(INK));
  box(1, 16, 1, -29, 0, 14, flat(INK));
}

function techStreet(root: Group, paintSign: SignPaint) {
  const { flat, tex, box, sign } = kit(root);
  const leds = windows('#07040e', '#0f3a45', '#17e4ff', 5, 16, (c, r) => (c * 11 + r * 5) % 7 < 3);
  const green = windows('#07040e', '#0f3a2a', '#7dff5e', 5, 12, (c, r) => (c * 5 + r * 3) % 4 === 0);
  box(9, 44, 9, -6, 0, -6, tex(leds));
  box(9, 32, 9, 7, 0, -5, tex(green));
  box(9, 24, 9, -5, 0, 7, tex(green));
  box(8, 14, 8, 7, 0, 7, tex(leds));
  sign(paintSign('TECH STREET', 'RepoMind watches codebases rot', '#17c4d6', '#07040e'), 22, 7.3, -12.8, 26, 0, -Math.PI / 2);
  // Neon gates over the road, so it feels like a street and not a lone building.
  for (const z of [-15, 15]) {
    box(1, 15, 1, -28.5, 0, z, flat('#17e4ff'));
    box(1, 15, 1, -11.5, 0, z, flat('#17e4ff'));
    box(18, 1.4, 1, -20, 15, z, flat('#ff2e88'));
  }
}

function filmMarket(root: Group, paintSign: SignPaint) {
  const { flat, tex, box, sign } = kit(root);
  const strip = paint(512, 64, (g) => {
    g.fillStyle = '#07040e';
    g.fillRect(0, 0, 512, 64);
    g.fillStyle = '#fff4d6';
    for (let x = 6; x < 512; x += 24) {
      g.fillRect(x, 5, 12, 9);
      g.fillRect(x, 50, 12, 9);
    }
    g.fillStyle = '#ff2e88';
    for (let x = 4; x < 512; x += 64) g.fillRect(x, 19, 56, 26);
  });
  box(24, 12, 22, 0, 0, 0, flat('#7a2cff'));
  box(24.4, 4, 22.4, 0, 12, 0, tex(strip));
  // A giant clapperboard on the roof.
  box(11, 7, 1, -3, 16, -4, flat('#fff4d6'));
  const clap = box(11, 1.6, 1, -3, 23.4, -4, flat(INK));
  clap.rotation.z = 0.32;
  sign(paintSign('FILM MARKET', 'Clipper finds the best minute', '#ff2e88', '#fff4d6'), 22, 7.3, 12.7, 9, 0, Math.PI / 2);
  // Striped stalls on the pavement.
  [-9, 0, 9].forEach((z, i) => {
    box(0.3, 3.6, 0.3, 12.3, 0, z - 3, flat(INK));
    box(0.3, 3.6, 0.3, 12.3, 0, z + 3, flat(INK));
    box(2, 0.5, 7.4, 12, 3.6, z, flat(['#ffc917', '#17c4d6', '#ff5a2e'][i]));
  });
}

function mansion(root: Group, paintSign: SignPaint) {
  const { flat, tex, add, box, sign } = kit(root);
  const front = windows('#123027', '#07140f', '#ffc917', 9, 4, (c, r) => c === 6 && r === 1);
  box(40, 20, 28, 0, 0, 0, tex(front));
  const roof = add(new Mesh(new ConeGeometry(25, 12, 4), flat('#2a0f5e')), 0, 26, 0);
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(1.14, 1, 0.8);
  for (const [x, z] of [[-22, -16], [22, -16], [-22, 16], [22, 16]]) {
    box(9, 28, 9, x, 0, z, tex(front));
    const cap = add(new Mesh(new ConeGeometry(7, 10, 4), flat('#ff2e88')), x, 33, z);
    cap.rotation.y = Math.PI / 4;
  }
  box(5, 9, 0.5, 20.3, 0, 0, flat('#ffc917')).rotation.y = Math.PI / 2;
  // A hedge all round, with a gap for the gate.
  box(1.6, 3, 64, -31.7, 0, 0, flat('#178a49'));
  box(64, 3, 1.6, 0, 0, -31.7, flat('#178a49'));
  box(64, 3, 1.6, 0, 0, 31.7, flat('#178a49'));
  box(1.6, 3, 24, 31.7, 0, -20, flat('#178a49'));
  box(1.6, 3, 24, 31.7, 0, 20, flat('#178a49'));
  box(1, 13, 1, 31, 0, -8, flat(INK));
  box(1, 13, 1, 31, 0, 8, flat(INK));
  sign(paintSign('THE MANSION', 'Mimic Hunt: the furniture might be a person', '#14082f', '#ffc917'), 22, 7.3, 31, 15, 0, Math.PI / 2);
}

export function buildDistricts(scene: Scene, paintSign: SignPaint) {
  const draw: Record<string, (root: Group, s: SignPaint) => void> = {
    solvefx: hostel,
    'ipl-auction': ground,
    'repomind-ai': techStreet,
    clipper: filmMarket,
    'mimic-hunt': mansion,
  };
  for (const [slug, plot] of Object.entries(PLOTS)) {
    const root = new Group();
    root.position.set(plot.x, 0, plot.z);
    draw[slug](root, paintSign);
    scene.add(root);
  }
}

// --- The columns of light that mark each stop ---

const pinTexture = (label: string, bg: string, fg: string) =>
  paint(128, 128, (g) => {
    g.fillStyle = bg;
    g.strokeStyle = INK;
    g.lineWidth = 9;
    g.beginPath();
    g.arc(64, 64, 56, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillStyle = fg;
    g.font = '76px Anton, Impact, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(label, 64, 68);
  });

export interface Markers {
  setStops: (stops: { slug: string; done: boolean; next: boolean }[]) => void;
  setVisible: (on: boolean) => void;
  update: (tick: number, x: number, z: number) => void;
  face: (q: Quaternion) => void;
}

export function buildMarkers(scene: Scene): Markers {
  const beam = paint(128, 256, (g) => {
    const fade = g.createLinearGradient(0, 0, 0, 256);
    fade.addColorStop(0, 'rgba(255,255,255,0)');
    fade.addColorStop(1, 'rgba(255,255,255,0.82)');
    g.fillStyle = fade;
    for (let x = 0; x < 128; x += 32) g.fillRect(x, 0, 18, 256);
  });
  beam.wrapS = RepeatWrapping;
  beam.repeat.set(3, 1);
  const beamGeo = new CylinderGeometry(6, 6, 170, 18, 1, true);
  const ringGeo = new RingGeometry(7.4, 9, 28);
  const pinGeo = new PlaneGeometry(9, 9);
  const items = Object.entries(PLOTS).map(([slug, plot], i) => {
    const group = new Group();
    group.position.set(plot.mark[0], 0, plot.mark[1]);
    const pillarMat = new MeshBasicMaterial({ map: beam, color: '#ffc917', transparent: true, depthWrite: false, side: DoubleSide });
    const pillar = new Mesh(beamGeo, pillarMat);
    pillar.position.y = 85;
    const ringMat = new MeshBasicMaterial({ color: '#ffc917' });
    const ring = new Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.2;
    const number = pinTexture(String(i + 1), '#ffc917', '#07040e');
    const tick = pinTexture('✓', '#14082f', '#7dff5e');
    const pinMat = new MeshBasicMaterial({ map: number, transparent: true, alphaTest: 0.5 });
    const pin = new Mesh(pinGeo, pinMat);
    pin.position.y = 21;
    group.add(pillar, ring, pin);
    group.visible = false;
    scene.add(group);
    return { slug, group, pillar, ring, ringMat, pillarMat, pin, pinMat, number, tick, done: false, next: false };
  });
  return {
    setStops: (stops) => {
      for (const s of stops) {
        const item = items.find((i) => i.slug === s.slug);
        if (!item) continue;
        item.done = s.done;
        item.next = s.next;
        const color = s.done ? '#7dff5e' : s.next ? '#ffc917' : '#ff2e88';
        item.pillarMat.color.set(color);
        item.ringMat.color.set(color);
        item.pinMat.map = s.done ? item.tick : item.number;
        item.pinMat.needsUpdate = true;
      }
    },
    setVisible: (on) => {
      for (const i of items) i.group.visible = on;
    },
    // On twos, like everything else that's hand-drawn here.
    update: (tick, x, z) => {
      const step = Math.floor(tick / 2);
      for (const i of items) {
        i.pillar.rotation.y = step * 0.14;
        // From inside the column there's nothing to see but the column.
        const far = Math.hypot(i.group.position.x - x, i.group.position.z - z);
        i.pillar.visible = !i.done && far > 24;
        i.pin.visible = far > 24;
        // Stays a readable size however far away it is, like a marker on a map.
        i.pin.scale.setScalar(Math.min(Math.max(far / 70, 1), 4));
        const pulse = i.next ? 1 + (step % 4) * 0.09 : 1;
        i.ring.scale.set(pulse, pulse, 1);
        i.pin.position.y = 24 + (step % 2) * 0.5;
      }
    },
    face: (q) => {
      for (const i of items) i.pin.quaternion.copy(q);
    },
  };
}
