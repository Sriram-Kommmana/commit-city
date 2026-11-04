import {
  Box3,
  BoxGeometry,
  CanvasTexture,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  type Material,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  RepeatWrapping,
  RingGeometry,
  type Scene,
  SphereGeometry,
  type Texture,
} from 'three';
import data from '../../content/missions.json';

// The mansion stop is played at the wheel, in the city itself: furniture on the street, and one piece of it is me.
// (The other four stops are 2D arcade games, in src/game/games.)

type SignPaint = (text: string, small: string, bg: string, fg: string, w?: number, h?: number) => CanvasTexture;

export interface Car {
  x: number;
  z: number;
  heading: number;
  speed: number;
}

export interface Hud {
  big: string;
  small?: string;
  say?: string;
  /** Seconds left, and out of how many. Leave out for no clock. */
  clock?: number;
  of?: number;
}

export interface ChallengeUI {
  hud: (h: Hud) => void;
  say: (text: string) => void;
  word: (text: string) => void;
  end: (result: { passed: boolean; headline?: string }) => void;
}

export interface Pin {
  x: number;
  z: number;
  label: string;
  color: string;
}

export interface ChallengeRun {
  /** Where the auto starts, facing the action. */
  from: { x: number; z: number; heading: number };
  /** What the arrow points at, if anything. */
  target: () => Pin | null;
  pins: () => Pin[];
  update: (dt: number, tick: number, car: Car, live: boolean) => void;
  crash?: () => void;
  dispose: () => void;
}

export type Challenges = (slug: string, ui: ChallengeUI) => ChallengeRun | null;

const INK = '#07040e';
const YELLOW = '#ffc917';
const PINK = '#ff2e88';
const GREEN = '#7dff5e';
const CYAN = '#17e4ff';
const PAPER = '#fff4d6';
const RED = '#e5322d';

const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));
const near = (car: Car, x: number, z: number, r: number) => Math.hypot(car.x - x, car.z - z) < r;

function paint(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  return new CanvasTexture(c);
}

export function createChallenges(scene: Scene, _sign: SignPaint): Challenges {
  // The same striped light as the stop markers, shorter.
  const beamTex = paint(64, 128, (g) => {
    const fade = g.createLinearGradient(0, 0, 0, 128);
    fade.addColorStop(0, 'rgba(255,255,255,0)');
    fade.addColorStop(1, 'rgba(255,255,255,0.86)');
    g.fillStyle = fade;
    for (let x = 0; x < 64; x += 16) g.fillRect(x, 0, 9, 128);
  });
  beamTex.wrapS = RepeatWrapping;
  beamTex.repeat.set(3, 1);

  // Everything one run puts in the city, removed in one go afterwards.
  const stage = () => {
    const root = new Group();
    scene.add(root);
    const textures: Texture[] = [];
    let ended = false;
    return {
      root,
      own: <T extends Texture>(t: T) => {
        textures.push(t);
        return t;
      },
      /** Runs once, the first time a run ends. */
      finish: (fn: () => void) => {
        if (ended) return;
        ended = true;
        fn();
      },
      ended: () => ended,
      dispose: () => {
        scene.remove(root);
        root.traverse((o) => {
          if (o instanceof Mesh) {
            o.geometry.dispose();
            (o.material as Material).dispose();
          }
        });
        for (const t of textures) t.dispose();
      },
    };
  };

  // A ring of light on the road, to drive through.
  const gate = (parent: Group, x: number, z: number, color: string, r = 5, height = 16) => {
    const g = new Group();
    g.position.set(x, 0, z);
    const beamMat = new MeshBasicMaterial({ map: beamTex, color, transparent: true, depthWrite: false, side: DoubleSide });
    const beam = new Mesh(new CylinderGeometry(r, r, height, 20, 1, true), beamMat);
    beam.position.y = height / 2;
    const ringMat = new MeshBasicMaterial({ color });
    const ring = new Mesh(new RingGeometry(r, r + 1.1, 28), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.3;
    g.add(beam, ring);
    parent.add(g);
    return {
      g,
      beam,
      tint: (c: string) => {
        beamMat.color.set(c);
        ringMat.color.set(c);
      },
    };
  };

  // --- Stop 5, the mansion: the furniture on the street, and one piece of it is me ---
  type Build = (g: Group) => number;
  const part = (g: Group, geo: BoxGeometry | CylinderGeometry | ConeGeometry | SphereGeometry, color: string, x: number, y: number, z: number) => {
    const mesh = new Mesh(geo, new MeshBasicMaterial({ color }));
    mesh.position.set(x, y, z);
    g.add(mesh);
    return mesh;
  };
  // Each returns the height of its middle, where the eyes go.
  const PROPS: Record<string, Build> = {
    chair: (g) => {
      for (const [x, z] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) part(g, new BoxGeometry(0.45, 2.2, 0.45), INK, x, 1.1, z);
      part(g, new BoxGeometry(3.3, 0.55, 3.3), PINK, 0, 2.4, 0);
      part(g, new BoxGeometry(3.3, 3.8, 0.55), PINK, 0, 4.4, -1.4);
      return 3.6;
    },
    crate: (g) => {
      part(g, new BoxGeometry(3.8, 3.8, 3.8), '#c98a3a', 0, 1.9, 0);
      part(g, new BoxGeometry(3.95, 0.5, 3.95), '#7a4a1c', 0, 1.9, 0);
      return 2.4;
    },
    lamp: (g) => {
      part(g, new CylinderGeometry(1.6, 1.8, 0.5, 14), INK, 0, 0.25, 0);
      part(g, new CylinderGeometry(0.28, 0.28, 4.6, 8), INK, 0, 2.6, 0);
      part(g, new CylinderGeometry(1.2, 2.5, 2.6, 14), YELLOW, 0, 5.6, 0);
      return 5.4;
    },
    barrel: (g) => {
      part(g, new CylinderGeometry(1.8, 1.8, 3.9, 14), '#8a4b2a', 0, 1.95, 0);
      part(g, new CylinderGeometry(1.88, 1.88, 0.3, 14), INK, 0, 0.9, 0);
      part(g, new CylinderGeometry(1.88, 1.88, 0.3, 14), INK, 0, 3, 0);
      return 2.5;
    },
    plant: (g) => {
      part(g, new CylinderGeometry(1.4, 1, 1.9, 12), '#ff5a2e', 0, 0.95, 0);
      [-0.5, 0.5, 0].forEach((tilt, i) => {
        const leaf = part(g, new ConeGeometry(0.9, 3.8, 6), '#1f9d57', tilt * 1.4, 3.6 + (i === 2 ? 0.6 : 0), 0);
        leaf.rotation.z = -tilt;
      });
      return 3.2;
    },
    stool: (g) => {
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        part(g, new BoxGeometry(0.4, 2.6, 0.4), INK, Math.cos(a) * 1.1, 1.3, Math.sin(a) * 1.1);
      }
      part(g, new CylinderGeometry(1.7, 1.7, 0.55, 14), CYAN, 0, 2.8, 0);
      return 2.6;
    },
    clock: (g) => {
      part(g, new BoxGeometry(2.4, 6.4, 1.7), '#4a2a90', 0, 3.2, 0);
      const face = part(g, new CylinderGeometry(0.95, 0.95, 0.25, 16), PAPER, 0, 5, 0.9);
      face.rotation.x = Math.PI / 2;
      return 3.6;
    },
    gnome: (g) => {
      part(g, new CylinderGeometry(1.1, 1.6, 2.6, 12), '#2f6fe0', 0, 1.3, 0);
      part(g, new SphereGeometry(0.9, 12, 10), '#f2c79a', 0, 3.1, 0);
      part(g, new ConeGeometry(0.95, 2.4, 12), RED, 0, 4.6, 0);
      part(g, new ConeGeometry(0.7, 1.5, 10), PAPER, 0, 2.4, 0.55).rotation.x = Math.PI;
      return 3;
    },
  };

  const hunt = (ui: ChallengeUI): ChallengeRun => {
    const c = data.challenges['mimic-hunt'];
    const m = data.mimic;
    const st = stage();
    // Along the mansion's front, and the roads either side of it.
    const SPOTS: [string, number, number][] = [
      ['barrel', -124, -298],
      ['chair', -116, -337],
      ['crate', -124, -352],
      ['plant', -140, -364],
      ['lamp', -166, -358],
      ['stool', -192, -365],
      ['clock', -150, -276],
      ['gnome', -178, -284],
    ];
    const eyes = st.own(
      paint(128, 64, (g) => {
        for (const x of [36, 92]) {
          g.fillStyle = PAPER;
          g.strokeStyle = INK;
          g.lineWidth = 6;
          g.beginPath();
          g.ellipse(x, 32, 20, 26, 0, 0, Math.PI * 2);
          g.fill();
          g.stroke();
          g.fillStyle = INK;
          g.beginPath();
          g.arc(x + 5, 36, 9, 0, Math.PI * 2);
          g.fill();
        }
      }),
    );
    const eyeMat = new MeshBasicMaterial({ map: eyes, transparent: true, alphaTest: 0.5, side: DoubleSide });
    type Prop = { kind: string; g: Group; look: Group | null; home: [number, number]; hit: boolean; vx: number; vy: number; vz: number; spin: number; gone: number; blink: number };
    const props: Prop[] = [];
    const makeProp = (kind: string, x: number, z: number, withEyes: boolean, turn: number) => {
      const g = new Group();
      const mid = PROPS[kind](g);
      let look: Group | null = null;
      if (withEyes) {
        // Eyes on every side, just proud of the surface, so walls still hide them.
        const box = new Box3().setFromObject(g);
        look = new Group();
        for (const [ex, ez, ry] of [
          [0, box.max.z + 0.06, 0],
          [0, box.min.z - 0.06, Math.PI],
          [box.max.x + 0.06, 0, Math.PI / 2],
          [box.min.x - 0.06, 0, -Math.PI / 2],
        ]) {
          const e = new Mesh(new PlaneGeometry(2.6, 1.3), eyeMat);
          e.position.set(ex, mid, ez);
          e.rotation.y = ry;
          look.add(e);
        }
        look.visible = false;
        g.add(look);
      }
      g.position.set(x, 0, z);
      g.rotation.y = turn;
      g.scale.setScalar(1.5);
      st.root.add(g);
      const p: Prop = { kind, g, look, home: [x, z], hit: false, vx: 0, vy: 0, vz: 0, spin: 0, gone: 0, blink: 0 };
      props.push(p);
      return p;
    };
    // The mimic is a different piece each time, though never one right next to the start.
    const mimic = 2 + Math.floor(Math.random() * (SPOTS.length - 2));
    SPOTS.forEach(([kind, x, z], i) => makeProp(kind, x, z, i === mimic, (i * 1.7) % (Math.PI * 2)));
    const me = props[mimic];

    // The radar: a ring of light somewhere round the mimic, like the real game's room sweeps.
    const sweep = gate(st.root, 0, 0, CYAN, 17, 5);
    sweep.g.visible = false;
    let sweepAt = 4;
    let sweepOff = 0;
    const confetti: { mesh: Mesh; vx: number; vy: number; vz: number }[] = [];

    let shots = c.shots;
    let note = c.hint;
    let time = 0;
    let fidgetAt = 2.5;
    let decoyed = false;
    const said = new Set<string>();
    const sayOnce = (key: string, text: string) => {
      if (said.has(key)) return;
      said.add(key);
      ui.say(text);
    };
    const fly = (p: Prop, car: Car, up: number, out: number) => {
      const dx = p.g.position.x - car.x;
      const dz = p.g.position.z - car.z;
      const len = Math.hypot(dx, dz) || 1;
      p.vx = (dx / len) * out - Math.sin(car.heading) * out * 0.5;
      p.vz = (dz / len) * out - Math.cos(car.heading) * out * 0.5;
      p.vy = up;
      p.spin = out ? 7 : 0;
    };
    // Out of sight means behind the auto, or far away.
    const unseen = (p: Prop, car: Car) => {
      const dx = p.g.position.x - car.x;
      const dz = p.g.position.z - car.z;
      const d = Math.hypot(dx, dz) || 1;
      return d > 70 || (dx * -Math.sin(car.heading) + dz * -Math.cos(car.heading)) / d < -0.15;
    };
    const free = (p: Prop) => !p.hit && !p.vy && !p.gone;

    return {
      from: { x: -120, z: -318, heading: 0 },
      target: () => null,
      pins: () => props.filter((p) => !p.hit).map((p) => ({ x: p.g.position.x, z: p.g.position.z, label: '?', color: PAPER })),
      update: (dt, tick, car, live) => {
        const step = Math.floor(tick / 2);
        // The tell: a blink every couple of seconds, when the auto is close enough to see it.
        for (const p of props) {
          if (!p.look) continue;
          p.blink = Math.max(p.blink - dt, 0);
          const blink = p === me ? tick % 30 < 4 : p.blink > 0;
          p.look.visible = st.ended() && p === me ? true : blink && near(car, p.g.position.x, p.g.position.z, 75);
        }
        // Thrown furniture tumbles away and drops out of sight.
        for (const p of props) {
          if (!p.vx && !p.vy && !p.vz) continue;
          p.g.position.x += p.vx * dt;
          p.g.position.y = Math.max(p.g.position.y + p.vy * dt, 0);
          p.g.position.z += p.vz * dt;
          p.vy -= 42 * dt;
          p.g.rotation.x += p.spin * dt;
          p.g.rotation.z += p.spin * 0.6 * dt;
          if (p.g.position.y === 0 && p.vy < 0) {
            p.vx = p.vy = p.vz = 0;
            if (p.hit && p !== me) p.gone = 1;
          }
        }
        for (const p of props) if (p.gone) p.g.visible = step % 2 === 0 && (p.gone += dt) < 1.6;
        for (let i = confetti.length - 1; i >= 0; i--) {
          const f = confetti[i];
          f.mesh.position.x += f.vx * dt;
          f.mesh.position.y += f.vy * dt;
          f.mesh.position.z += f.vz * dt;
          f.vy -= 30 * dt;
          f.mesh.rotation.x += dt * 9;
          if (f.mesh.position.y < 0) f.mesh.visible = false;
        }
        sweep.beam.rotation.y = step * 0.2;
        if (!live || st.ended()) return;
        time += dt;

        // Trust nothing: when you're not looking, the furniture moves.
        if (time > fidgetAt) {
          fidgetAt = time + 2 + Math.random() * 1.5;
          const hidden = props.filter((p) => free(p) && unseen(p, car));
          if (hidden.length >= 2 && Math.random() < 0.5) {
            // Two pieces swap places.
            const [a, b] = hidden.sort(() => Math.random() - 0.5);
            const ax = a.g.position.x;
            const az = a.g.position.z;
            a.g.position.x = b.g.position.x;
            a.g.position.z = b.g.position.z;
            b.g.position.x = ax;
            b.g.position.z = az;
            a.home = [a.g.position.x, a.g.position.z];
            b.home = [b.g.position.x, b.g.position.z];
            sayOnce('swap', c.lines.swap);
          } else if (hidden.length) {
            const p = hidden[Math.floor(Math.random() * hidden.length)];
            p.g.position.x = p.home[0] + (Math.random() - 0.5) * 4;
            p.g.position.z = p.home[1] + (Math.random() - 0.5) * 4;
            p.g.rotation.y += (Math.random() - 0.5) * 2;
            if (near(car, p.g.position.x, p.g.position.z, 50)) sayOnce('moved', c.lines.moved);
          }
        }

        // The radar sweep.
        if (time > sweepAt) {
          sweepAt = time + 8;
          sweepOff = time + 2.6;
          const a = Math.random() * Math.PI * 2;
          sweep.g.position.set(me.g.position.x + Math.cos(a) * 8, 0, me.g.position.z + Math.sin(a) * 8);
          sweep.g.visible = true;
          ui.word(c.radar);
          sayOnce('radar', c.lines.radar);
        }
        if (sweep.g.visible && time > sweepOff) sweep.g.visible = false;

        // Get close and it leaves a decoy behind, then slips away a little.
        if (!decoyed && near(car, me.g.position.x, me.g.position.z, 24)) {
          decoyed = true;
          const side = Math.random() < 0.5 ? -1 : 1;
          const alongX = Math.abs(me.home[1] - Math.round(me.home[1] / 40) * 40) < 8;
          const dx = alongX ? side * 13 : 0;
          const dz = alongX ? 0 : side * 13;
          const copy = makeProp(me.kind, me.g.position.x + dx, me.g.position.z + dz, true, me.g.rotation.y);
          copy.blink = 0.7;
          me.g.position.x -= dx * 0.25;
          me.g.position.z -= dz * 0.25;
          ui.word(c.decoyWord);
          ui.say(fill(c.lines.decoy, { prop: me.kind }));
        }

        if (Math.abs(car.speed) > 2) {
          for (const p of props) {
            if (p.hit || !near(car, p.g.position.x, p.g.position.z, 5.4)) continue;
            p.hit = true;
            shots -= 1;
            if (p === me) {
              fly(p, car, 16, 0);
              // Confetti, because finding me deserves it.
              const colors = [YELLOW, PINK, CYAN, GREEN];
              for (let i = 0; i < 40; i++) {
                const bit = new Mesh(new BoxGeometry(0.5, 0.5, 0.2), new MeshBasicMaterial({ color: colors[i % 4] }));
                bit.position.set(p.g.position.x, 4, p.g.position.z);
                st.root.add(bit);
                const a = Math.random() * Math.PI * 2;
                confetti.push({ mesh: bit, vx: Math.cos(a) * (6 + Math.random() * 10), vy: 12 + Math.random() * 14, vz: Math.sin(a) * (6 + Math.random() * 10) });
              }
              ui.say(c.lines.found);
              st.finish(() => {
                ui.word(c.found);
                ui.end({ passed: true, headline: m.found });
              });
              return;
            }
            fly(p, car, 17, 16);
            note = m.misses[(c.shots - shots - 1) % m.misses.length];
            ui.word(c.decoy);
            if (shots === 1) ui.say(c.lines.paranoid);
            window.dispatchEvent(new Event('world:cut'));
            if (shots === 0) {
              st.finish(() => {
                ui.word(c.out);
                ui.end({ passed: false, headline: fill(c.lost, { prop: me.kind }) });
              });
              return;
            }
          }
        }
        ui.hud({ big: fill(c.goal, { n: shots }), small: note });
      },
      dispose: st.dispose,
    };
  };

  const ALL: Record<string, (ui: ChallengeUI) => ChallengeRun> = {
    'mimic-hunt': hunt,
  };
  return (slug, ui) => ALL[slug]?.(ui) ?? null;
}
