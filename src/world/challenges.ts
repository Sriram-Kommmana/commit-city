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
  Sprite,
  SpriteMaterial,
  type Texture,
} from 'three';
import data from '../../content/missions.json';
import { PLOTS } from './districts';

// Each stop of story mode is played at the wheel, in the city itself: gates to drive through,
// paddles to grab, a bug to chase, a road to choose, furniture to ram.

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
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const near = (car: Car, x: number, z: number, r: number) => Math.hypot(car.x - x, car.z - z) < r;

function paint(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  return new CanvasTexture(c);
}

export function createChallenges(scene: Scene, sign: SignPaint): Challenges {
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
          } else if (o instanceof Sprite) (o.material as Material).dispose();
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

  // An arch over the road with its sign on the crossbar, like a finish line. `along` is the way traffic goes through.
  const arch = (parent: Group, x: number, z: number, along: 'x' | 'z', color: string, map: Texture, r = 6) => {
    const gt = gate(parent, x, z, color, r, 9);
    const frame = new Group();
    if (along === 'x') frame.rotation.y = Math.PI / 2;
    gt.g.add(frame);
    const postMat = new MeshBasicMaterial({ color });
    const ink = new MeshBasicMaterial({ color: INK });
    for (const side of [-1, 1]) {
      const post = new Mesh(new BoxGeometry(1.1, 11, 1.1), postMat);
      post.position.set(side * (r + 1.2), 5.5, 0);
      const foot = new Mesh(new BoxGeometry(2, 1, 2), ink);
      foot.position.set(side * (r + 1.2), 0.5, 0);
      frame.add(post, foot);
    }
    const width = r * 2 + 4.6;
    const bar = new Mesh(new BoxGeometry(width, 1.2, 1.2), ink);
    bar.position.y = 11;
    frame.add(bar);
    const img = map.image as HTMLCanvasElement;
    const tall = (width * img.height) / img.width;
    const signMat = new MeshBasicMaterial({ map });
    for (const turn of [0, Math.PI]) {
      const s = new Mesh(new PlaneGeometry(width, tall), signMat);
      s.position.y = 11.6 + tall / 2;
      s.rotation.y = turn;
      s.translateZ(0.7);
      frame.add(s);
    }
    return {
      ...gt,
      tint: (c: string) => {
        gt.tint(c);
        postMat.color.set(c);
      },
      sign: (next: Texture) => {
        signMat.map = next;
        signMat.needsUpdate = true;
      },
    };
  };

  // A sign that always faces the camera.
  const board = (parent: Group, map: Texture, w: number, y: number) => {
    const s = new Sprite(new SpriteMaterial({ map }));
    const img = map.image as HTMLCanvasElement;
    s.scale.set(w, (w * img.height) / img.width, 1);
    s.position.y = y;
    parent.add(s);
    return s;
  };

  // --- Stop 1, the hostel: three test cases against the clock ---
  const hostel = (ui: ChallengeUI): ChallengeRun => {
    const c = data.challenges.solvefx;
    const st = stage();
    // Up the road, left past the hostel's back, and left again down the mansion's side.
    const SPOTS: [number, number][] = [
      [-80, -305],
      [-100, -320],
      [-120, -278],
    ];
    const AXES = ['z', 'x', 'z'] as const;
    const signs = SPOTS.map((_, i) => [YELLOW, PINK].map((bg) => st.own(sign(c.tests[i][0], c.tests[i][1], bg, INK, 512, 170))));
    const gates = SPOTS.map(([x, z], i) => arch(st.root, x, z, AXES[i], i === 0 ? YELLOW : PINK, signs[i][i === 0 ? 0 : 1]));
    let next = 0;
    let time = 0;
    let lastCrash = -9;
    return {
      from: { x: -80, z: -258, heading: 0 },
      target: () => (next < SPOTS.length ? { x: SPOTS[next][0], z: SPOTS[next][1], label: c.tests[next][0], color: YELLOW } : null),
      pins: () => SPOTS.map(([x, z], i) => ({ x, z, label: String(i + 1), color: i < next ? GREEN : i === next ? YELLOW : PINK })),
      update: (dt, tick, car, live) => {
        const step = Math.floor(tick / 2);
        gates.forEach((gt, i) => {
          gt.beam.rotation.y = step * 0.14;
          gt.g.visible = i >= next;
        });
        if (!live || st.ended()) return;
        time += dt;
        const left = Math.max(c.seconds - time, 0);
        if (near(car, SPOTS[next][0], SPOTS[next][1], 6.5)) {
          next++;
          if (next === SPOTS.length) {
            st.finish(() => {
              ui.word(c.pass);
              ui.end({ passed: true, headline: fill(c.won, { time: time.toFixed(1) }) });
            });
            return;
          }
          gates[next].tint(YELLOW);
          gates[next].sign(signs[next][0]);
          ui.word(c.ok);
        }
        if (left <= 0) {
          st.finish(() => {
            ui.word(c.tle);
            ui.end({ passed: false, headline: c.lost });
          });
        }
        ui.hud({ big: fill(c.goal, { n: next + 1 }), small: c.tests[next][1], clock: left, of: c.seconds });
      },
      crash: () => {
        if (time - lastCrash < 1.2) return;
        lastCrash = time;
        ui.word(c.crash);
      },
      dispose: st.dispose,
    };
  };

  // --- Stop 2, the cricket ground: a bidding war, one paddle at a time ---
  const auction = (ui: ChallengeUI): ChallengeRun => {
    const c = data.challenges['ipl-auction'];
    const a = data.auction;
    const st = stage();
    // The roads round the ground.
    const LOOP: [number, number][] = [];
    for (const z of [-280, -260, -240, -220, -200]) LOOP.push([80, z], [160, z]);
    for (const x of [100, 120, 140]) LOOP.push([x, -280], [x, -200]);
    const paddle = st.own(
      paint(256, 320, (g) => {
        g.fillStyle = INK;
        g.fillRect(108, 210, 40, 104);
        g.beginPath();
        g.arc(128, 112, 102, 0, Math.PI * 2);
        g.fillStyle = YELLOW;
        g.fill();
        g.lineWidth = 14;
        g.strokeStyle = INK;
        g.stroke();
        g.fillStyle = INK;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.font = '92px Anton, Impact, sans-serif';
        g.fillText('+₹1', 128, 98);
        g.font = '44px Teko, sans-serif';
        g.fillText('CRORE', 128, 168);
      }),
    );
    const pad = gate(st.root, 80, -280, GREEN, 5, 15);
    const sprite = board(pad.g, paddle, 9, 12);
    let spot: [number, number] = [80, -280];
    let bid = a.start;
    let leader = a.rivals[0];
    let rivalIn = 2;
    let time = 0;
    // The next paddle goes somewhere ahead, far enough to need driving to.
    const respawn = (car: Car) => {
      const fx = -Math.sin(car.heading);
      const fz = -Math.cos(car.heading);
      const options = LOOP.filter(([x, z]) => {
        const d = Math.hypot(x - car.x, z - car.z);
        return d > 24 && d < 62 && (x !== spot[0] || z !== spot[1]);
      })
        .map((p) => ({ p, ahead: ((p[0] - car.x) * fx + (p[1] - car.z) * fz) / Math.hypot(p[0] - car.x, p[1] - car.z) }))
        .sort((m, n) => n.ahead - m.ahead);
      spot = options[Math.floor(Math.random() * Math.min(3, options.length))]?.p ?? LOOP[(LOOP.indexOf(spot) + 5) % LOOP.length];
      pad.g.position.set(spot[0], 0, spot[1]);
    };
    return {
      from: { x: 80, z: -238, heading: 0 },
      target: () => ({ x: spot[0], z: spot[1], label: 'Next paddle', color: GREEN }),
      pins: () => [{ x: spot[0], z: spot[1], label: '₹', color: GREEN }],
      update: (dt, tick, car, live) => {
        const step = Math.floor(tick / 2);
        pad.beam.rotation.y = step * 0.14;
        sprite.position.y = 12 + (step % 2) * 0.5;
        if (!live || st.ended()) return;
        time += dt;
        const left = Math.max(c.seconds - time, 0);
        if (near(car, spot[0], spot[1], 6.5)) {
          if (bid + a.step <= a.purse) {
            bid += a.step;
            leader = 'you';
            rivalIn = 1.3 + Math.random() * 0.9;
            ui.word(c.bid);
          }
          respawn(car);
        }
        // Rivals answer every bid until they reach their limit, so a quick driver always wins.
        if (leader === 'you' && bid < c.rivalLimit) {
          rivalIn -= dt;
          if (rivalIn <= 0) {
            bid += a.step;
            leader = a.rivals[bid % a.rivals.length];
            ui.word(c.outbid);
          }
        }
        if (left <= 0) {
          st.finish(() => {
            ui.word(c.sold);
            ui.end({ passed: true, headline: leader === 'you' ? a.won : a.lost });
          });
        }
        ui.hud({ big: `₹${bid} Cr`, small: leader === 'you' ? c.youLead : fill(c.theyLead, { team: leader }), clock: left, of: c.seconds });
      },
      dispose: st.dispose,
    };
  };

  // --- Stop 3, tech street: chase the drift down before it gets away ---
  const drift = (ui: ChallengeUI): ChallengeRun => {
    const c = data.challenges['repomind-ai'];
    const st = stage();
    const B = { x0: 0, x1: 160, z0: -480, z1: -320 };
    const plots = Object.values(PLOTS);
    const closed = (x: number, z: number) => plots.some((p) => Math.abs(x - p.x) < p.half && Math.abs(z - p.z) < p.half);
    const bug = new Group();
    st.root.add(bug);
    const body = new Mesh(new BoxGeometry(4.6, 4.6, 4.6), new MeshBasicMaterial({ color: RED }));
    body.position.y = 4.2;
    const core = new Mesh(new BoxGeometry(2.2, 2.2, 2.2), new MeshBasicMaterial({ color: YELLOW }));
    core.position.y = 4.2;
    bug.add(body, core);
    const halo = gate(bug, 0, 0, RED, 4.6, 18);
    board(halo.g, st.own(sign(c.label, c.labelSmall, RED, PAPER, 512, 170)), 10, 13);
    // Starts just up the street, already on the run.
    let from: [number, number] = [80, -400];
    let to: [number, number] = [80, -440];
    let t = 0.3;
    let time = 0;
    let stall = 0;
    // At each junction it takes the road that gets it furthest from the auto, more or less.
    const choose = (car: Car) => {
      const options = [
        [40, 0],
        [-40, 0],
        [0, 40],
        [0, -40],
      ]
        .map(([dx, dz]) => [to[0] + dx, to[1] + dz] as [number, number])
        .filter(([nx, nz]) => nx >= B.x0 && nx <= B.x1 && nz >= B.z0 && nz <= B.z1 && !closed((nx + to[0]) / 2, (nz + to[1]) / 2));
      const fresh = options.filter(([nx, nz]) => nx !== from[0] || nz !== from[1]);
      const pool = fresh.length ? fresh : options;
      let best = pool[0];
      let score = -1;
      for (const p of pool) {
        const s = Math.hypot(p[0] - car.x, p[1] - car.z) + Math.random() * 30;
        if (s > score) {
          score = s;
          best = p;
        }
      }
      from = to;
      to = best;
    };
    const where = () => ({ x: from[0] + (to[0] - from[0]) * t, z: from[1] + (to[1] - from[1]) * t });
    return {
      from: { x: 80, z: -378, heading: 0 },
      target: () => ({ ...where(), label: c.label, color: RED }),
      pins: () => [{ ...where(), label: '!', color: RED }],
      update: (dt, tick, car, live) => {
        const step = Math.floor(tick / 2);
        // A glitch, on twos.
        body.rotation.set(step * 0.7, step * 1.1, 0);
        body.scale.setScalar(stall > 0 ? 1 + (step % 2) * 0.35 : step % 3 === 0 ? 1.2 : 1);
        core.rotation.set(-step * 0.9, step * 0.5, 0);
        halo.beam.rotation.y = step * 0.2;
        if (live && !st.ended()) {
          time += dt;
          const here = where();
          const dist = Math.hypot(here.x - car.x, here.z - car.z);
          // It glitches in place for a moment at every junction, which is the player's chance to close in.
          const v = stall > 0 ? 0 : dist < 30 ? c.fast : dist > 70 ? c.slow : c.speed;
          stall = Math.max(stall - dt, 0);
          t += (v * dt) / 40;
          if (t >= 1) {
            t = 0;
            stall = 0.45;
            choose(car);
          }
          if (dist < 7) {
            st.finish(() => {
              ui.word(c.caught);
              ui.end({ passed: true, headline: c.won });
            });
          } else if (time >= c.seconds) {
            st.finish(() => {
              ui.word(c.away);
              ui.end({ passed: false, headline: c.lost });
            });
          }
          ui.hud({ big: c.health, small: c.commit, clock: Math.max(c.seconds - time, 0), of: c.seconds });
        }
        const at = where();
        bug.position.set(at.x, st.ended() ? 0 : Math.abs(Math.sin(step * 0.9)) * 0.6, at.z);
        bug.visible = !(st.ended() && near(car, at.x, at.z, 7));
      },
      dispose: st.dispose,
    };
  };

  // --- Stop 4, the film market: a fork in the road, one moment down each way ---
  const film = (ui: ChallengeUI): ChallengeRun => {
    const c = data.challenges.clipper;
    const m = data.clipper;
    const st = stage();
    const ROADS: [number, number][] = [
      [-112, -440],
      [-80, -476],
      [-48, -440],
    ];
    const picks = c.picks.map((i) => m.moments[i]);
    const best = Math.max(...picks.map((p) => p.score));
    const AXES = ['x', 'z', 'x'] as const;
    const gates = ROADS.map(([x, z], i) => arch(st.root, x, z, AXES[i], PINK, st.own(sign(picks[i].title, `${mmss(picks[i].start)} into the interview`, PINK, PAPER, 640, 200)), 7));
    let picked = -1;
    return {
      from: { x: -80, z: -416, heading: 0 },
      target: () => null,
      pins: () => ROADS.map(([x, z], i) => ({ x, z, label: String(i + 1), color: picked < 0 ? PINK : picks[i].score === best ? YELLOW : PINK })),
      update: (_dt, tick, car, live) => {
        for (const g of gates) g.beam.rotation.y = Math.floor(tick / 2) * 0.14;
        if (!live || picked >= 0) return;
        const i = ROADS.findIndex(([x, z]) => near(car, x, z, 7));
        if (i < 0) {
          ui.hud({ big: c.goal, small: c.hint });
          return;
        }
        picked = i;
        // Every road shows its score.
        gates.forEach((g, j) => {
          const top = picks[j].score === best;
          g.tint(j === i ? CYAN : top ? YELLOW : PINK);
          g.sign(st.own(sign(`Score ${picks[j].score}`, picks[j].title, top ? YELLOW : PINK, top ? INK : PAPER, 640, 200)));
        });
        const score = picks[i].score === best ? c.won : fill(c.missed, { score: picks[i].score, best });
        st.finish(() => {
          ui.word(c.cut);
          ui.end({ passed: false, headline: `${score} ${c.reveal}` });
        });
      },
      dispose: st.dispose,
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
    // The mimic is a different piece each time, though never one right next to the start.
    const mimic = 2 + Math.floor(Math.random() * (SPOTS.length - 2));
    const eyeMat = new MeshBasicMaterial({ map: eyes, transparent: true, alphaTest: 0.5, side: DoubleSide });
    const props = SPOTS.map(([kind, x, z], i) => {
      const g = new Group();
      const mid = PROPS[kind](g);
      let look: Group | null = null;
      if (i === mimic) {
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
      g.rotation.y = (i * 1.7) % (Math.PI * 2);
      g.scale.setScalar(1.5);
      st.root.add(g);
      return { kind, g, look, home: [x, z] as [number, number], hit: false, vx: 0, vy: 0, vz: 0, spin: 0, gone: 0 };
    });
    let shots = c.shots;
    let note = c.hint;
    let time = 0;
    let shuffleAt = 3;
    const fly = (p: (typeof props)[number], car: Car, up: number, out: number) => {
      const dx = p.g.position.x - car.x;
      const dz = p.g.position.z - car.z;
      const len = Math.hypot(dx, dz) || 1;
      p.vx = (dx / len) * out - Math.sin(car.heading) * out * 0.5;
      p.vz = (dz / len) * out - Math.cos(car.heading) * out * 0.5;
      p.vy = up;
      p.spin = out ? 7 : 0;
    };
    return {
      from: { x: -120, z: -318, heading: 0 },
      target: () => null,
      pins: () => props.filter((p) => !p.hit).map((p) => ({ x: p.g.position.x, z: p.g.position.z, label: '?', color: PAPER })),
      update: (dt, tick, car, live) => {
        const step = Math.floor(tick / 2);
        const me = props[mimic];
        // The tell: a blink every couple of seconds, only when the auto is close enough to see it.
        if (me.look) {
          const blink = (tick % 30) < 4;
          me.look.visible = st.ended() ? true : blink && near(car, me.g.position.x, me.g.position.z, 75);
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
        if (!live || st.ended()) return;
        time += dt;
        // When nobody's close, it shuffles a little. Another tell, for the patient.
        if (time > shuffleAt) {
          shuffleAt = time + 2.5 + Math.random() * 2;
          if (!near(car, me.g.position.x, me.g.position.z, 22)) {
            me.g.position.x = me.home[0] + (Math.random() - 0.5) * 2.4;
            me.g.position.z = me.home[1] + (Math.random() - 0.5) * 2.4;
            me.g.rotation.y += (Math.random() - 0.5) * 1.2;
          }
        }
        if (Math.abs(car.speed) > 2) {
          for (const p of props) {
            if (p.hit || !near(car, p.g.position.x, p.g.position.z, 5.4)) continue;
            p.hit = true;
            shots -= 1;
            if (p === me) {
              fly(p, car, 16, 0);
              st.finish(() => {
                ui.word(c.found);
                ui.end({ passed: true, headline: m.found });
              });
              return;
            }
            fly(p, car, 17, 16);
            note = m.misses[(c.shots - shots - 1) % m.misses.length];
            ui.word(c.decoy);
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
    solvefx: hostel,
    'ipl-auction': auction,
    'repomind-ai': drift,
    clipper: film,
    'mimic-hunt': hunt,
  };
  return (slug, ui) => ALL[slug]?.(ui) ?? null;
}
