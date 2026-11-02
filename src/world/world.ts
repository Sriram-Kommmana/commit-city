import {
  BackSide,
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DepthTexture,
  Float32BufferAttribute,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  LinearFilter,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Texture,
  UnsignedIntType,
  Vector2,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
  BufferGeometry,
  ColorManagement,
} from 'three';
import skyline from '../../content/skyline.json';
import projects from '../../content/projects.json';
import site from '../../content/site.json';
import leapSvg from '../art/leap.svg?raw';
import perchSvg from '../art/perch.svg?raw';
import { BUILDING_FRAG, BUILDING_VERT, COMIC_FRAG, COMIC_VERT, GROUND_FRAG, GROUND_VERT, SKY_FRAG, SKY_VERT } from './shaders';

// One keyframe of the camera's journey through the city. `p` is the scroll position, 0 to 1.
interface Key {
  p: number;
  pos: [number, number, number];
  look: [number, number, number];
  roll: number;
  fov: number;
}

// Colours are authored for the comic look, so skip three.js colour conversion.
ColorManagement.enabled = false;

const TOWER = new Vector3(20, 0, 20);
const TOWER_H = 226;

const PATH: Key[] = [
  { p: 0.0, pos: [19, 236.5, 33], look: [10, 228, -130], roll: 0, fov: 46 },
  { p: 0.05, pos: [22, 238, 24], look: [18, 200, -70], roll: -0.06, fov: 50 },
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
const cat = (a: number, b: number, c: number, d: number, t: number) =>
  0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t);

// On a phone the opening shot steps back and tilts up, so the character stands under the title.
const PORTRAIT_OPEN = { pos: new Vector3(25, 239, 45), look: new Vector3(25, 279, -130) };

function sample(p: number) {
  const q = Math.min(Math.max(p, 0), 1);
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

const svgTexture = (svg: string, width: number, height: number) =>
  new Promise<Texture>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = width;
      c.height = height;
      c.getContext('2d')!.drawImage(img, 0, 0, width, height);
      const tex = new CanvasTexture(c);
      resolve(tex);
    };
    img.onerror = reject;
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });

// Painted signs: neon billboards for skills, banners across the street for projects.
function signTexture(text: string, sub: string, bg: string, fg: string) {
  const c = document.createElement('canvas');
  c.width = 768;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = bg;
  g.fillRect(0, 0, 768, 256);
  g.lineWidth = 14;
  g.strokeStyle = '#07040e';
  g.strokeRect(7, 7, 754, 242);
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  let size = 120;
  g.font = `${size}px Anton, Impact, sans-serif`;
  while (g.measureText(text).width > 700 && size > 40) {
    size -= 6;
    g.font = `${size}px Anton, Impact, sans-serif`;
  }
  g.fillText(text.toUpperCase(), 384, sub ? 104 : 128);
  if (sub) {
    g.font = '44px Teko, sans-serif';
    g.fillText(sub, 384, 204);
  }
  const t = new CanvasTexture(c);
  return t;
}

export interface World {
  setCruise: (on: boolean) => void;
  setProgress: (p: number) => void;
  setPaused: (paused: boolean) => void;
  renderAt: (p: number) => void;
}

export async function startWorld(canvas: HTMLCanvasElement, opts: { still?: boolean } = {}): Promise<World> {
  const renderer = new WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
  renderer.setClearColor(new Color('#14082f'));
  renderer.outputColorSpace = 'srgb-linear';
  const isPhone = matchMedia('(max-width: 760px)').matches;
  let pixelScale = Math.min(devicePixelRatio || 1, isPhone ? 1.25 : 1.5);

  const camera = new PerspectiveCamera(50, 1, 0.8, 2400);
  const scene = new Scene();
  const sunDir = new Vector3(0.1, 0.1, -1).normalize();
  const time = { value: 0 };

  // --- Sky ---
  const sky = new Mesh(
    new SphereGeometry(2200, 32, 20),
    new ShaderMaterial({ side: BackSide, depthWrite: false, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, uniforms: { uSunDir: { value: sunDir } } }),
  );
  scene.add(sky);

  // --- Ground ---
  const camUniform = { value: new Vector3() };
  const ground = new Mesh(
    new PlaneGeometry(4000, 4000),
    new ShaderMaterial({ vertexShader: GROUND_VERT, fragmentShader: GROUND_FRAG, uniforms: { uCam: camUniform } }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.z = -300;
  scene.add(ground);

  // --- City. Real repos become the gold towers; the rest of the city is scenery. ---
  const rand = rng(90210);
  const flight: Vector3[] = [];
  for (let p = 0.03; p <= 0.8; p += 0.002) flight.push(sample(p).pos);
  const blocked = (x: number, z: number, half: number, h: number) => {
    // Lowers any building that would sit in the camera's way.
    let limit = h;
    for (const f of flight) {
      if (Math.abs(f.x - x) < half + 12 && Math.abs(f.z - z) < half + 12) limit = Math.min(limit, Math.max(f.y - 9, 0));
    }
    return limit;
  };
  type B = { x: number; z: number; w: number; d: number; h: number; hero: number; name?: string };
  const list: B[] = [];
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
    const lim = i === 0 ? h : blocked(x, z, 12, h);
    list.push({ x, z, w: i === 0 ? 22 : 20, d: i === 0 ? 22 : 20, h: Math.max(lim, 8), hero: 1, name: r.name });
  });
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
        const ox = count === 1 ? 0 : (n === 0 ? -6.5 : 6.5);
        const tall = rand();
        let h = (14 + Math.pow(tall, 2.4) * 120) * (1.15 - Math.min(dist, 1) * 0.55);
        h = blocked(x + ox, z, Math.max(w, d) / 2, h);
        if (h < 3) continue;
        list.push({ x: x + ox, z, w, d, h, hero: 0 });
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
  const m = new Matrix4();
  const dummy = new Object3D();
  list.forEach((b, i) => {
    dummy.position.set(b.x, 0, b.z);
    dummy.scale.set(b.w, b.h, b.d);
    dummy.updateMatrix();
    m.copy(dummy.matrix);
    city.setMatrixAt(i, m);
    seeds[i] = rand();
    heroes[i] = b.hero;
  });
  box.setAttribute('aSeed', new InstancedBufferAttribute(seeds, 1));
  box.setAttribute('aHero', new InstancedBufferAttribute(heroes, 1));
  city.frustumCulled = false;
  scene.add(city);

  // Roof dressing on the tallest tower, where the character stands.
  const flat = (hex: string) => new MeshBasicMaterial({ color: hex });
  const roof = new Group();
  const ink = flat('#0c0716');
  const parapet = flat('#ffc917');
  const addBox = (w: number, h: number, d: number, x: number, y: number, z: number, mat = ink) => {
    const b = new Mesh(new BoxGeometry(w, h, d), mat);
    b.position.set(x, y, z);
    roof.add(b);
    return b;
  };
  addBox(23, 2, 1.4, 0, 1, -11, parapet);
  addBox(23, 2, 1.4, 0, 1, 11, parapet);
  addBox(1.4, 2, 23, -11, 1, 0, parapet);
  addBox(1.4, 2, 23, 11, 1, 0, parapet);
  roof.position.set(TOWER.x, TOWER_H, TOWER.z);
  scene.add(roof);

  // --- The auto-rickshaw, seen from behind in the street chase ---
  const auto = new Group();
  const wheelGeo = new CylinderGeometry(0.62, 0.62, 0.4, 14);
  wheelGeo.rotateZ(Math.PI / 2);
  const yellow = flat('#ffc917');
  const addTo = (g: Group, geo: BufferGeometry, mat: MeshBasicMaterial, x: number, y: number, z: number) => {
    const o = new Mesh(geo, mat);
    o.position.set(x, y, z);
    g.add(o);
    return o;
  };
  addTo(auto, new BoxGeometry(2.5, 1.0, 3.8), ink, 0, 1.0, 0);
  addTo(auto, new BoxGeometry(2.3, 0.14, 3.0), yellow, 0, 1.56, 0.1);
  addTo(auto, new BoxGeometry(2.6, 0.32, 3.8), yellow, 0, 3.06, 0);
  addTo(auto, new BoxGeometry(2.4, 0.2, 3.3), ink, 0, 3.3, 0);
  for (const [x, z] of [[-1.15, 1.75], [1.15, 1.75], [-1.15, -1.75], [1.15, -1.75]]) {
    addTo(auto, new BoxGeometry(0.14, 1.6, 0.14), yellow, x, 2.2, z);
  }
  addTo(auto, wheelGeo, ink, -1.2, 0.62, 1.2);
  addTo(auto, wheelGeo, ink, 1.2, 0.62, 1.2);
  addTo(auto, wheelGeo, ink, 0, 0.62, -1.9);
  addTo(auto, new BoxGeometry(0.5, 0.26, 0.05), flat('#ff2030'), -0.85, 1.22, 1.93);
  addTo(auto, new BoxGeometry(0.5, 0.26, 0.05), flat('#ff2030'), 0.85, 1.22, 1.93);
  const plate = new Mesh(
    new PlaneGeometry(1.9, 0.62),
    new MeshBasicMaterial({ map: signTexture('COMMIT OK PLEASE', '', '#ffc917', '#07040e') }),
  );
  plate.position.set(0, 0.96, 1.92);
  auto.add(plate);
  // The driver, a flat ink shape through the open back of the cab.
  addTo(auto, new BoxGeometry(1.1, 1.2, 0.4), flat('#ffc917'), 0, 2.08, -0.7);
  addTo(auto, new BoxGeometry(0.72, 0.72, 0.5), flat('#0b0912'), 0, 2.92, -0.7);
  auto.visible = false;
  auto.scale.setScalar(1.2);
  scene.add(auto);

  // --- Signs ---
  await Promise.all([
    document.fonts.load('60px Anton').catch(() => undefined),
    document.fonts.load('40px Teko').catch(() => undefined),
  ]);
  const billboard = (text: string, sub: string, x: number, y: number, z: number, ry: number, w: number, bg: string, fg: string) => {
    const s = new Mesh(new PlaneGeometry(w, w / 3), new MeshBasicMaterial({ map: signTexture(text, sub, bg, fg) }));
    s.position.set(x, y, z);
    s.rotation.y = ry;
    scene.add(s);
  };
  const skillColors = [['#17c4d6', '#07040e'], ['#ff2e88', '#fff4d6'], ['#ffc917', '#07040e'], ['#7a2cff', '#fff4d6'], ['#f03a2e', '#fff4d6']];
  site.skills.forEach((g, i) => {
    const [bg, fg] = skillColors[i % skillColors.length];
    const side = i % 2 ? 1 : -1;
    billboard(g.group, g.items.slice(0, 3).map((s) => s.name).join(' · '), -38 + side * 21, 26 - i * 2.4, -128 - i * 30, -side * 1.12, 28, bg, fg);
  });
  projects
    .filter((p) => p.mission)
    .forEach((p, i) => {
      const [bg, fg] = skillColors[i % skillColors.length];
      const z = -270 - i * 48;
      billboard(p.title, p.district ?? '', -40, 15, z, 0, 27, bg, fg);
      const poleL = new Mesh(new BoxGeometry(0.6, 15, 0.6), ink);
      poleL.position.set(-53.5, 7.5, z);
      const poleR = poleL.clone();
      poleR.position.x = -26.5;
      scene.add(poleL, poleR);
    });

  // --- Character cut-outs, in the scene so the comic shader draws over them too ---
  const [leapTex, perchTex] = await Promise.all([svgTexture(leapSvg, 1040, 1240), svgTexture(perchSvg, 840, 1600)]);
  const cutout = (tex: Texture, w: number, h: number) =>
    new Mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({ map: tex, transparent: false, alphaTest: 0.5 }));
  const perch = cutout(perchTex, 7.6, 14.4);
  perch.position.set(TOWER.x + 6.4, TOWER_H + 8.8, TOWER.z - 9.6);
  scene.add(perch);
  const leap = cutout(leapTex, 5.2, 6.2);
  leap.visible = false;
  scene.add(leap);

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

  // --- Frame ---
  let goal = 0;
  let current = 0;
  let last = performance.now();
  let tick = 0;
  let paused = false;
  let cruise = false;
  let raf = 0;
  const pointer = new Vector2();
  addEventListener('pointermove', (e) => pointer.set(e.clientX / innerWidth - 0.5, e.clientY / innerHeight - 0.5), { passive: true });
  const forward = new Vector3();
  const up = new Vector3();
  const right = new Vector3();

  const draw = (p: number, speed: number, now: number) => {
    const s = sample(p);
    if (canvas.clientHeight > canvas.clientWidth) {
      const open = 1 - smooth(Math.min(p / 0.05, 1));
      s.pos.lerp(PORTRAIT_OPEN.pos, open);
      s.look.lerp(PORTRAIT_OPEN.look, open);
    }
    // A little mouse parallax on top of the path, strongest at the top of the tower.
    const lean = 1 - smooth(Math.min(p / 0.1, 1));
    camera.position.copy(s.pos);
    camera.position.x += pointer.x * 4 * lean;
    camera.position.y -= pointer.y * 2 * lean;
    camera.fov = s.fov + speed * 8;
    camera.updateProjectionMatrix();
    camera.up.set(Math.sin(s.roll), Math.cos(s.roll), 0).normalize();
    camera.lookAt(s.look);
    camUniform.value.copy(camera.position);
    time.value = now / 1000;
    sky.position.copy(camera.position);

    // Character: perched until the jump, then falling with us, on twos.
    camera.getWorldDirection(forward);
    up.copy(camera.up);
    perch.visible = p < 0.085;
    leap.visible = p >= 0.07 && p < 0.47;
    if (leap.visible) {
      const twos = Math.floor(tick / 2);
      right.crossVectors(forward, up).normalize();
      leap.position.copy(camera.position).addScaledVector(forward, 11);
      leap.position.addScaledVector(up, 0.4 + Math.sin(twos * 0.8) * 0.16);
      leap.position.addScaledVector(right, innerWidth > 760 ? 3 : 0);
      leap.quaternion.copy(camera.quaternion);
      leap.rotateZ(Math.sin(twos * 0.5) * 0.08 + 0.1);
    }

    // The auto, always just ahead of the camera in the street chase.
    auto.visible = p > 0.5 && p < 0.84;
    if (auto.visible) {
      auto.position.set(-43 + Math.sin(tick * 0.04) * 0.5, Math.sin(tick * 1.7) * 0.04, s.pos.z - 14);
    }

    comic.uniforms.uTick.value = tick;
    comic.uniforms.uSpeed.value = speed;
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(postScene, postCam);
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
    const speed = cruise ? 0 : Math.min(v * 1500 * inFall, 1);
    if (now - tickAt > 83) {
      tick++;
      tickAt = now;
    }
    draw(current, speed, now);
    // If this device can't keep up, draw fewer pixels rather than stutter.
    slowFrames = dt > 42 ? slowFrames + 1 : Math.max(slowFrames - 1, 0);
    if (slowFrames > 40 && pixelScale > 0.7) {
      pixelScale = Math.max(pixelScale * 0.8, 0.7);
      slowFrames = 0;
      resize();
    }
  };
  if (opts.still) {
    draw(0, 0, performance.now());
  } else {
    raf = requestAnimationFrame(loop);
  }

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
      draw(p, 0, performance.now());
    },
  };
}
