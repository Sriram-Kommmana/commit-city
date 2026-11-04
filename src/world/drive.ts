import { type Group, type Mesh, Vector3 } from 'three';
import type { ChallengeRun, ChallengeUI, Challenges, Pin } from './challenges';
import { type Markers, PLOTS } from './districts';
import { POSE } from './rig';
import type { Shot } from './world';

// Story mode's map: the player drives the auto through the real city.
// Arcade handling, with buildings as simple boxes. Tapping a stop drives there on its own.

export interface Block {
  x: number;
  z: number;
  w: number;
  d: number;
  top: number;
}

export interface StopState {
  slug: string;
  done: boolean;
  next: boolean;
}

export type DriveKey = 'up' | 'down' | 'left' | 'right';

export interface DriveHooks {
  arrive: (slug: string) => void;
  word: (text: string) => void;
}

export interface DriveFrame {
  shot: Shot;
  frame: number;
  lean: number;
  heroAt: Vector3;
  heroScale: number;
  speed: number;
  /** True for the moment the screen splits into comic panels on arrival. */
  arriving: boolean;
  flash: number;
}

export interface Drive {
  start: (stops: StopState[], hooks: DriveHooks) => void;
  /** Hands the wheel back after a mission. */
  resume: (stops: StopState[]) => void;
  /** Parks at a stop, or wherever the auto is, and holds on an establishing shot. */
  park: (slug?: string) => void;
  stop: () => void;
  goTo: (slug: string) => void;
  press: (key: DriveKey, on: boolean) => void;
  isOn: () => boolean;
  state: () => { x: number; z: number; heading: number; speed: number; auto: boolean };
  marks: { slug: string; x: number; z: number; half: number; px: number; pz: number }[];
  shotAtPlot: () => Shot;
  shotStreet: () => Shot;
  /** Sets up a stop's challenge in the city. False if the stop has none. */
  challenge: (slug: string, ui: ChallengeUI) => boolean;
  /** Hands over the wheel for the challenge. */
  play: () => void;
  /** The challenge is over: park, but leave its things in place for the result. */
  endChallenge: () => void;
  clearChallenge: () => void;
  challengeTarget: () => Pin | null;
  challengePins: () => Pin[];
}

const MAX_SPEED = 58;
const RADIUS = 2.2;
const CELL = 40;
const START = { x: -40, z: -214, heading: 0 };

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b);
const smooth = (t: number) => t * t * (3 - 2 * t);

export function createDrive(parts: {
  auto: Group;
  van: Group;
  lights: [Mesh, Mesh];
  blocks: Block[];
  traffic: { x: number; z: number; v: number }[];
  markers: Markers;
  challenges: Challenges;
}): Drive {
  const { auto, van, lights, traffic, markers } = parts;
  auto.rotation.order = 'YXZ';

  // Buildings, bucketed by block so a collision check only looks at the few nearby.
  const grid = new Map<string, Block[]>();
  const keyOf = (x: number, z: number) => `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
  for (const b of parts.blocks) {
    for (let x = b.x - b.w / 2; ; x += CELL) {
      for (let z = b.z - b.d / 2; ; z += CELL) {
        const k = keyOf(Math.min(x, b.x + b.w / 2), Math.min(z, b.z + b.d / 2));
        if (!grid.has(k)) grid.set(k, []);
        if (!grid.get(k)!.includes(b)) grid.get(k)!.push(b);
        if (z >= b.z + b.d / 2) break;
      }
      if (x >= b.x + b.w / 2) break;
    }
  }
  const hit = (x: number, z: number, r: number, y = 0) => {
    for (let ix = -1; ix <= 1; ix += 2) {
      for (let iz = -1; iz <= 1; iz += 2) {
        for (const b of grid.get(keyOf(x + ix * r, z + iz * r)) ?? []) {
          if (y < b.top && Math.abs(x - b.x) < b.w / 2 + r && Math.abs(z - b.z) < b.d / 2 + r) return true;
        }
      }
    }
    return false;
  };

  // --- Route finding along the road grid, for the auto when it drives itself ---
  const plotList = Object.values(PLOTS);
  const closed = (x: number, z: number) => plotList.some((p) => Math.abs(x - p.x) < p.half && Math.abs(z - p.z) < p.half);
  const route = (fromX: number, fromZ: number, slug: string) => {
    const plot = PLOTS[slug];
    // Start from the junction ahead, so the auto doesn't turn round to reach one behind it.
    const snap = (v: number, dir: number) => {
      if (Math.abs(v - Math.round(v / CELL) * CELL) < 6 || Math.abs(dir) < 0.5) return Math.round(v / CELL) * CELL;
      return (dir > 0 ? Math.ceil(v / CELL) : Math.floor(v / CELL)) * CELL;
    };
    const start = `${snap(fromX, -Math.sin(heading))},${snap(fromZ, -Math.cos(heading))}`;
    const goal = `${plot.node[0]},${plot.node[1]}`;
    const parent = new Map<string, string | null>([[start, null]]);
    const queue = [start];
    while (queue.length && !parent.has(goal)) {
      const at = queue.shift()!;
      const [x, z] = at.split(',').map(Number);
      for (const [dx, dz] of [[CELL, 0], [-CELL, 0], [0, CELL], [0, -CELL]]) {
        const nx = x + dx;
        const nz = z + dz;
        const key = `${nx},${nz}`;
        if (parent.has(key) || Math.abs(nx) > 800 || nz < -900 || nz > 200 || closed(x + dx / 2, z + dz / 2)) continue;
        parent.set(key, at);
        queue.push(key);
      }
    }
    const path: [number, number][] = [plot.mark];
    for (let at: string | null | undefined = parent.has(goal) ? goal : null; at; at = parent.get(at)) {
      const [x, z] = at.split(',').map(Number);
      if (x !== plot.mark[0] || z !== plot.mark[1]) path.unshift([x, z]);
    }
    // Don't double back to a junction already behind the auto, when the next one is on this road.
    if (path.length > 1) {
      const [a, b] = path;
      const onRoad = Math.abs(fromX - a[0]) < 8 ? Math.abs(b[0] - a[0]) < 1 : Math.abs(fromZ - a[1]) < 8 && Math.abs(b[1] - a[1]) < 1;
      const between = Math.hypot(fromX - b[0], fromZ - b[1]) <= Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (onRoad && between) path.shift();
    }
    return path;
  };

  // --- State ---
  type Mode = 'off' | 'free' | 'arrive' | 'park';
  let mode: Mode = 'off';
  let hooks: DriveHooks = { arrive: () => undefined, word: () => undefined };
  let stops: StopState[] = [];
  let x = START.x;
  let z = START.z;
  let heading = START.heading;
  let slipHeading = heading;
  let speed = 0;
  let camYaw = heading;
  let boom = 1;
  let steerShown = 0;
  let pitch = 0;
  let shake = 0;
  let flash = 0;
  let clock = 0;
  let armed = true;
  let parkedAt: string | null = null;
  let run: ChallengeRun | null = null;
  let runLive = false;
  let arriveT = 0;
  let arriveFired = false;
  // Camera blends from wherever it was, so nothing ever cuts by accident.
  let blendFrom: Shot | null = null;
  let blendT = 0;
  let blendLen = 1;
  let lastShot: Shot | null = null;
  // Words get a cool-down, or they would fill the screen.
  const wordAt: Record<string, number> = {};
  const say = (text: string, gap: number) => {
    if ((wordAt[text] ?? -99) + gap > clock) return;
    wordAt[text] = clock;
    hooks.word(text);
  };
  const held: Record<DriveKey, boolean> = { up: false, down: false, left: false, right: false };
  let path: [number, number][] | null = null;
  let pathSlug = '';
  let pathStart = 0;
  let stuck = 0;
  let backOff = 0;
  const trail: { x: number; z: number; h: number }[] = [];
  const heroAt = new Vector3();

  const KEYS: Record<string, DriveKey> = {
    ArrowUp: 'up', KeyW: 'up',
    ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
  };
  const typing = (e: KeyboardEvent) => (e.target as HTMLElement).closest?.('input, textarea, [contenteditable]');
  const onKey = (e: KeyboardEvent) => {
    const k = KEYS[e.code];
    if (!k || mode === 'off' || typing(e)) return;
    e.preventDefault();
    press(k, e.type === 'keydown');
  };
  const press = (k: DriveKey, on: boolean) => {
    if (mode !== 'free') {
      held[k] = false;
      return;
    }
    held[k] = on;
    // Touching the controls always takes the wheel back.
    if (on) path = null;
  };
  const release = () => {
    held.up = held.down = held.left = held.right = false;
  };

  const blendInto = (seconds: number) => {
    blendFrom = lastShot;
    blendT = 0;
    blendLen = seconds;
  };

  const placeBehind = (mx: number, mz: number, h: number) => {
    trail.length = 0;
    for (let i = 24; i > 0; i--) trail.push({ x: mx + Math.sin(h) * i * 1.2, z: mz + Math.cos(h) * i * 1.2, h });
  };

  // --- The chase camera ---
  const chaseShot = (dt: number): Shot => {
    const t = Math.abs(speed) / MAX_SPEED;
    const yawGap = wrap(heading - camYaw);
    camYaw = wrap(camYaw + yawGap * (1 - Math.exp(-dt * 4.2)));
    const back = 17 + t * 3.5;
    const high = 8.8 + t * 1.2;
    const bx = Math.sin(camYaw) * back;
    const bz = Math.cos(camYaw) * back;
    // Pull in rather than end up inside a building.
    let want = 1;
    for (let k = 1; k > 0.2; k -= 0.1) {
      want = k;
      if (!hit(x + bx * k, z + bz * k, 1.2, high)) break;
    }
    boom = want < boom ? want : boom + (want - boom) * (1 - Math.exp(-dt * 3));
    const n = clock * 83;
    const kick = shake * 0.5;
    const pos = new Vector3(x + bx * boom + Math.sin(n) * kick, high + Math.cos(n * 1.3) * kick, z + bz * boom);
    const look = new Vector3(x - Math.sin(camYaw) * 12, 7, z - Math.cos(camYaw) * 12);
    return { pos, look, roll: -steerShown * 0.05 * t, fov: 60 + t * 16 };
  };

  const plotShot = (slug: string | null): Shot => {
    const p = slug ? PLOTS[slug] : null;
    const sway = Math.sin(clock * 0.3);
    if (!p) {
      return {
        pos: new Vector3(x + 18 + sway * 3, 9, z + 16),
        look: new Vector3(x, 5, z),
        roll: 0.03,
        fov: 52,
      };
    }
    const [cx, cy, cz] = p.cam;
    return {
      pos: new Vector3(p.x + cx + (cz / 10) * sway, cy, p.z + cz - (cx / 10) * sway),
      look: new Vector3(p.x + (p.mark[0] - p.x) * 0.3, p.lookY, p.z),
      roll: 0.04,
      fov: 50,
    };
  };

  // --- Handling ---
  const drive = (dt: number) => {
    let steer = (held.left ? 1 : 0) - (held.right ? 1 : 0);
    let throttle = (held.up ? 1 : 0) - (held.down ? 1 : 0);
    let limit = MAX_SPEED;

    if (path) {
      const goal = path[0];
      const dx = goal[0] - x;
      const dz = goal[1] - z;
      const dist = Math.hypot(dx, dz);
      if (dist < 8 && path.length > 1) path.shift();
      const diff = wrap(Math.atan2(-dx, -dz) - heading);
      steer = clamp(diff * 2.8, -1, 1);
      const nextTurn = path.length > 1 ? Math.abs(wrap(Math.atan2(-(path[1][0] - goal[0]), -(path[1][1] - goal[1])) - heading)) : 0;
      limit = Math.abs(diff) > 1 ? 13 : dist < 34 && nextTurn > 0.5 ? 23 : path.length === 1 && dist < 30 ? 20 : 50;
      throttle = Math.abs(speed) < limit ? 1 : 0;
      if (Math.abs(speed) > limit + 4) throttle = -0.7;
      // Reverses out if it ever noses into a wall.
      stuck = Math.abs(speed) < 2.5 ? stuck + dt : 0;
      if (stuck > 0.9) {
        stuck = 0;
        backOff = 0.8;
      }
      if (backOff > 0) {
        backOff -= dt;
        throttle = -1;
        steer = -steer;
      }
      // The story must never stall on a bad corner.
      if (clock - pathStart > 20) {
        park(pathSlug);
        hooks.arrive(pathSlug);
        return;
      }
    }

    // Whatever happens, never stay inside a building: step out to the nearest clear spot.
    if (hit(x, z, RADIUS)) {
      search: for (let r = 1; r < 30; r++) {
        for (let a = 0; a < 8; a++) {
          const ox = x + Math.cos((a * Math.PI) / 4) * r;
          const oz = z + Math.sin((a * Math.PI) / 4) * r;
          if (!hit(ox, oz, RADIUS)) {
            x = ox;
            z = oz;
            break search;
          }
        }
      }
    }

    const before = speed;
    if (throttle > 0) speed += (speed < 0 ? 62 : 32 * (1 - (speed / MAX_SPEED) * 0.55)) * throttle * dt;
    else if (throttle < 0) speed += (speed > 0 ? 72 : 24) * throttle * dt;
    else speed -= Math.sign(speed) * Math.min(Math.abs(speed), (10 + Math.abs(speed) * 0.25) * dt);
    speed = clamp(speed, -16, MAX_SPEED);
    if (before < 8 && speed >= 8 && throttle > 0) say('VROOOM!', 7);

    const grip = 1 - (Math.abs(speed) / MAX_SPEED) * 0.32;
    heading = wrap(heading + steer * 1.9 * Math.min(Math.abs(speed) / 12, 1) * Math.sign(speed || 1) * grip * dt);
    // With nobody steering, the auto settles back along the road.
    if (!steer && Math.abs(speed) > 8) {
      const axis = Math.round(heading / (Math.PI / 2)) * (Math.PI / 2);
      const off = wrap(axis - heading);
      if (Math.abs(off) < 0.35) heading += off * (1 - Math.exp(-dt * 2.4));
    }
    // The back end slides out a little in a fast corner.
    slipHeading = wrap(slipHeading + wrap(heading - slipHeading) * (1 - Math.exp(-dt * 8)));
    if (Math.abs(wrap(heading - slipHeading)) > 0.2 && speed > 30) say('SKRRRT!', 5);

    let vx = -Math.sin(slipHeading) * speed;
    let vz = -Math.cos(slipHeading) * speed;
    const nx = x + vx * dt;
    const nz = z + vz * dt;
    let crash = 0;
    // Against a wall the auto swings round to run along it, so it can never get wedged.
    let along: number | null = null;
    if (hit(nx, z, RADIUS)) {
      crash = Math.max(crash, Math.abs(vx));
      vx = 0;
      along = Math.cos(heading) > 0 ? 0 : Math.PI;
    } else x = nx;
    if (hit(x, nz, RADIUS)) {
      crash = Math.max(crash, Math.abs(vz));
      vz = 0;
      along = Math.sin(heading) > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else z = nz;
    if (crash > 0) speed = Math.sign(speed) * Math.max(Math.hypot(vx, vz), Math.min(Math.abs(speed), 9)) * 0.98;
    if (along !== null && speed > 0 && !path) {
      heading = wrap(heading + wrap(along - heading) * (1 - Math.exp(-dt * 6)));
      slipHeading = heading;
    }
    if (crash > 16) {
      speed *= 0.6;
      shake = 1;
      if (runLive && run?.crash) run.crash();
      else say('BONK!', 0.8);
      window.dispatchEvent(new Event('world:cut'));
    }

    // Traffic doesn't move aside.
    for (const c of traffic) {
      if (Math.abs(c.x - x) < 3 && Math.abs(c.z - z) < 5.2 && Math.abs(speed) > 4) {
        const pushed = x + Math.sign(x - c.x || 1) * 0.5;
        if (!hit(pushed, z, RADIUS)) x = pushed;
        speed *= 0.9;
        shake = Math.max(shake, 0.6);
        say('BEEP BEEP!', 2.5);
      }
    }

    pitch += (clamp((speed - before) / Math.max(dt, 0.001) / 260, -0.07, 0.11) - pitch) * (1 - Math.exp(-dt * 7));

    // Stops. A visited stop only triggers when asked for, so it can't trap the player on it.
    if (run) return;
    let inside = false;
    for (const s of stops) {
      const m = PLOTS[s.slug].mark;
      if (Math.hypot(m[0] - x, m[1] - z) > 9) continue;
      inside = true;
      const wanted = path && pathSlug === s.slug;
      if (path ? wanted : armed && !s.done) {
        arrive(s.slug);
        return;
      }
    }
    if (!inside) armed = true;
  };

  const arrive = (slug: string) => {
    mode = 'arrive';
    parkedAt = slug;
    path = null;
    arriveT = 0;
    arriveFired = false;
    flash = 0.5;
    release();
    window.dispatchEvent(new Event('world:cut'));
  };

  const park = (slug?: string) => {
    if (mode === 'off') return;
    if (slug && parkedAt === slug && (mode === 'arrive' || mode === 'park')) return;
    release();
    path = null;
    parkedAt = slug ?? null;
    if (slug) {
      const m = PLOTS[slug].mark;
      x = m[0];
      z = m[1];
      speed = 0;
      placeBehind(x, z, heading);
      flash = 0.4;
    }
    blendInto(slug ? 0.01 : 0.8);
    mode = 'park';
  };

  const updateVehicles = (dt: number, tick: number) => {
    auto.visible = true;
    const rumble = Math.sin(tick * 1.7) * 0.04 * Math.min(Math.abs(speed) / 12, 1);
    auto.position.set(x, rumble, z);
    steerShown += ((held.left ? 1 : 0) - (held.right ? 1 : 0) - steerShown) * (1 - Math.exp(-dt * 8));
    if (path) steerShown = clamp(wrap(heading - camYaw) * 2, -1, 1);
    auto.rotation.set(pitch, heading, -steerShown * Math.min(Math.abs(speed) / MAX_SPEED, 1) * 0.13);

    // The deadline follows the same road, a little way back.
    const last = trail[trail.length - 1];
    if (!last || Math.hypot(last.x - x, last.z - z) > 1.2) trail.push({ x, z, h: heading });
    if (trail.length > 30) trail.shift();
    const tail = trail[0];
    van.visible = true;
    van.position.x += (tail.x - van.position.x) * (1 - Math.exp(-dt * 5));
    van.position.z += (tail.z - van.position.z) * (1 - Math.exp(-dt * 5));
    van.rotation.y += wrap(tail.h - van.rotation.y) * (1 - Math.exp(-dt * 5));
    const blink = Math.floor(tick / 6) % 2 === 0;
    lights[0].visible = blink;
    lights[1].visible = !blink;
  };

  const blend = (shot: Shot, dt: number): Shot => {
    if (!blendFrom) return shot;
    blendT += dt / blendLen;
    if (blendT >= 1) {
      blendFrom = null;
      return shot;
    }
    const k = smooth(blendT);
    return {
      pos: blendFrom.pos.clone().lerp(shot.pos, k),
      look: blendFrom.look.clone().lerp(shot.look, k),
      roll: blendFrom.roll + (shot.roll - blendFrom.roll) * k,
      fov: blendFrom.fov + (shot.fov - blendFrom.fov) * k,
    };
  };

  const clearChallenge = () => {
    run?.dispose();
    run = null;
    runLive = false;
    if (mode !== 'off') markers.setVisible(true);
  };

  const self = {
    challenge: (slug: string, ui: ChallengeUI) => {
      clearChallenge();
      run = parts.challenges(slug, ui);
      return !!run;
    },
    play: () => {
      if (!run || mode === 'off') return;
      const f = run.from;
      x = f.x;
      z = f.z;
      heading = slipHeading = camYaw = f.heading;
      speed = 0;
      path = null;
      parkedAt = null;
      placeBehind(x, z, heading);
      markers.setVisible(false);
      blendInto(0.9);
      runLive = true;
      mode = 'free';
    },
    endChallenge: () => {
      runLive = false;
      park();
    },
    clearChallenge,
    challengeTarget: () => run?.target() ?? null,
    challengePins: () => run?.pins() ?? [],
    start: (list: StopState[], h: DriveHooks) => {
      hooks = h;
      stops = list;
      markers.setStops(list);
      markers.setVisible(true);
      x = START.x;
      z = START.z;
      heading = slipHeading = camYaw = START.heading;
      speed = 0;
      armed = true;
      parkedAt = null;
      placeBehind(x, z, heading);
      van.position.set(trail[0].x, 0, trail[0].z);
      van.rotation.set(0, heading, 0);
      // Starts high enough to see every column of light, then drops in behind the auto.
      lastShot = { pos: new Vector3(-30, 150, -70), look: new Vector3(-10, 0, -330), roll: 0.1, fov: 62 };
      blendInto(2.8);
      flash = 0.5;
      addEventListener('keydown', onKey);
      addEventListener('keyup', onKey);
      addEventListener('blur', release);
      mode = 'free';
    },
    resume: (list: StopState[]) => {
      clearChallenge();
      stops = list;
      markers.setStops(list);
      if (mode === 'off') return;
      armed = false;
      parkedAt = null;
      blendInto(0.9);
      mode = 'free';
    },
    park,
    stop: () => {
      if (mode === 'off') return;
      clearChallenge();
      mode = 'off';
      path = null;
      release();
      markers.setVisible(false);
      auto.rotation.set(0, 0, 0);
      van.rotation.set(0, 0, 0);
      removeEventListener('keydown', onKey);
      removeEventListener('keyup', onKey);
      removeEventListener('blur', release);
    },
    goTo: (slug: string) => {
      if (mode !== 'free' || run) return;
      release();
      path = route(x, z, slug);
      pathSlug = slug;
      pathStart = clock;
      stuck = backOff = 0;
    },
    press,
    isOn: () => mode !== 'off',
    state: () => ({ x, z, heading, speed, auto: !!path }),
    marks: Object.entries(PLOTS).map(([slug, p]) => ({ slug, x: p.mark[0], z: p.mark[1], half: p.half, px: p.x, pz: p.z })),
    shotAtPlot: () => plotShot(parkedAt),
    shotStreet: (): Shot => {
      // Low in front of the auto, with the character against the landmark.
      const p = parkedAt ? PLOTS[parkedAt] : null;
      const dir = Math.atan2((p ? p.x : x - 20) - x, (p ? p.z : z) - z);
      const sx = Math.sin(dir);
      const sz = Math.cos(dir);
      return {
        pos: new Vector3(x - sx * 13 + sz * 4, 1.4, z - sz * 13 - sx * 4),
        look: new Vector3(x + sx * 8, 9.5, z + sz * 8),
        roll: -0.14,
        fov: 62,
      };
    },
    update: (dtMs: number, tick: number): DriveFrame => {
      const dt = Math.min(dtMs, 50) / 1000;
      clock += dt;
      shake = Math.max(shake - dt * 3, 0);
      flash = Math.max(flash - dt * 3.2, 0);
      if (mode === 'free') drive(dt);
      else speed += (0 - speed) * (1 - Math.exp(-dt * 6));
      if (mode === 'arrive') {
        // Rolls to a stop on the mark.
        const m = PLOTS[parkedAt!].mark;
        x += (m[0] - x) * (1 - Math.exp(-dt * 5));
        z += (m[1] - z) * (1 - Math.exp(-dt * 5));
        arriveT += dt;
        if (!arriveFired && arriveT > 1) {
          arriveFired = true;
          hooks.arrive(parkedAt!);
        }
      }
      updateVehicles(dt, tick);
      markers.update(tick, x, z);
      run?.update(dt, tick, { x, z, heading, speed }, runLive && mode === 'free');

      const raw = mode === 'free' ? chaseShot(dt) : plotShot(parkedAt);
      const shot = blend(raw, dt);
      lastShot = shot;

      const moving = Math.abs(speed) > 3;
      const twos = Math.floor(tick / 2) % 2;
      let frame: number = moving ? POSE.surfBack : POSE.glance;
      if (mode !== 'free') frame = twos && moving ? POSE.surfB : POSE.surfA;
      heroAt.set(x + 0.2, 6.1 + (moving ? Math.sin(tick * 0.9) * 0.1 : 0), z);
      return {
        shot,
        frame,
        lean: mode === 'free' ? steerShown * 0.16 * Math.min(Math.abs(speed) / 30, 1) : 0,
        heroAt,
        heroScale: 7.1,
        speed: mode === 'free' ? (Math.abs(speed) / MAX_SPEED) ** 2 * 0.34 : 0,
        arriving: mode === 'arrive' && arriveT < 1.5,
        flash,
      };
    },
  };
  return self as Drive & { update: typeof self.update };
}
