import { gsap } from 'gsap';
import './game.css';
import { drawFigure } from '../world/rig';
import autoSvg from '../art/auto.svg?raw';
import faceUrl from '../art/face.webp?url';
import type { Drive, DriveKey } from '../world/drive';
import type { ChallengeUI, Hud } from '../world/challenges';
import story from '../../content/story.json';
import data from '../../content/missions.json';
import projects from '../../content/projects.json';
import site from '../../content/site.json';
import { missions, type Result } from './missions';
import { createPhone, contactHtml } from './phone';
import { esc, txt, isTodo } from './util';

// Flow: intro -> map -> banner -> mission -> stamp -> card -> map -> ending. See docs/STATE_MACHINE.md.
const stops = data.stops as Record<string, { title: string; fare: number; at: number; say: string }>;
const projectOf = (slug: string) => projects.find((p) => p.slug === slug)!;

const RING = 'M180 190 C320 90 690 90 820 210 C930 320 920 650 810 790 C690 920 310 920 190 790 C80 650 70 300 180 190 Z';

// Districts on the map, in the same order as the stops.
const DISTRICTS: Record<string, string> = {
  solvefx: `<g transform="translate(62 18)"><rect width="120" height="84" fill="#2a0f5e" stroke="#ffc917" stroke-width="3"/>${[0, 1, 2, 3].map((i) => `<rect x="${12 + i * 26}" y="14" width="16" height="16" fill="#ffc917"/><rect x="${12 + i * 26}" y="46" width="16" height="16" fill="${i === 2 ? '#ffc917' : '#4a2a90'}"/>`).join('')}</g>`,
  'ipl-auction': `<g transform="translate(600 245)"><ellipse cx="120" cy="90" rx="124" ry="92" fill="#1f9d57" stroke="#ffc917" stroke-width="3"/><rect x="104" y="42" width="32" height="96" fill="#d9c58c"/><path d="M104 56 h32 M104 124 h32" stroke="#fff4d6" stroke-width="3"/></g>`,
  'repomind-ai': `<g transform="translate(610 610)" stroke="#ffc917" stroke-width="3">${[0, 1, 2].map((r) => [0, 1, 2].map((c) => `<rect x="${c * 46}" y="${r * 42}" width="38" height="34" fill="${(r + c) % 2 ? '#2a0f5e' : '#07040e'}"/>`).join('')).join('')}</g>`,
  clipper: `<g transform="translate(250 620)"><rect width="190" height="104" fill="#07040e" stroke="#ffc917" stroke-width="3"/>${[0, 1, 2, 3, 4].map((i) => `<rect x="${10 + i * 36}" y="8" width="24" height="12" fill="#fff4d6"/><rect x="${10 + i * 36}" y="84" width="24" height="12" fill="#fff4d6"/>`).join('')}<rect x="14" y="30" width="162" height="44" fill="#ff2e88"/></g>`,
  'mimic-hunt': `<g transform="translate(150 270)"><path d="M0 170 V70 L90 12 L180 70 V170 Z" fill="#2a0f5e" stroke="#ffc917" stroke-width="3"/><rect x="72" y="104" width="36" height="66" fill="#07040e" stroke="#ffc917" stroke-width="2"/><rect x="24" y="84" width="28" height="28" fill="#ffc917"/><rect x="128" y="84" width="28" height="28" fill="#4a2a90"/></g>`,
};
const LABELS: Record<string, [number, number, string]> = {
  solvefx: [122, 138, 'The Hostel'],
  'ipl-auction': [720, 236, 'Cricket Ground'],
  'repomind-ai': [676, 600, 'Tech Street'],
  clipper: [345, 748, 'Film Market'],
  'mimic-hunt': [240, 264, 'The Mansion'],
};

type Car = { x: number; z: number; heading: number };
type RadarPin = { x: number; z: number; label: string; color: string; fg?: string };

// A round radar centred on the auto, which always points up. Pins past the edge sit on the rim.
function drawRadar(g: CanvasRenderingContext2D, car: Car, plots: { px: number; pz: number; half: number; done: boolean }[], pins: RadarPin[]) {
  const R = g.canvas.width / 2;
  const scale = R / 150;
  g.clearRect(0, 0, R * 2, R * 2);
  g.save();
  g.beginPath();
  g.arc(R, R, R - 2, 0, Math.PI * 2);
  g.clip();
  g.fillStyle = '#14082f';
  g.fillRect(0, 0, R * 2, R * 2);
  g.translate(R, R);
  g.rotate(car.heading);
  // Roads along multiples of 40.
  g.strokeStyle = '#4a2a90';
  g.lineWidth = 15 * scale;
  for (let i = -5; i <= 5; i++) {
    const rx = (Math.round(car.x / 40) + i) * 40 - car.x;
    const rz = (Math.round(car.z / 40) + i) * 40 - car.z;
    g.beginPath();
    g.moveTo(rx * scale, -R * 2);
    g.lineTo(rx * scale, R * 2);
    g.moveTo(-R * 2, rz * scale);
    g.lineTo(R * 2, rz * scale);
    g.stroke();
  }
  for (const m of plots) {
    g.fillStyle = m.done ? '#1f6e4a' : '#d3126f';
    g.fillRect((m.px - m.half - car.x) * scale, (m.pz - m.half - car.z) * scale, m.half * 2 * scale, m.half * 2 * scale);
  }
  g.restore();
  const c = Math.cos(car.heading);
  const s = Math.sin(car.heading);
  for (const p of pins) {
    const dx = p.x - car.x;
    const dz = p.z - car.z;
    let sx = (dx * c - dz * s) * scale;
    let sy = (dx * s + dz * c) * scale;
    const len = Math.hypot(sx, sy);
    const room = R - 26;
    if (len > room) {
      sx *= room / len;
      sy *= room / len;
    }
    g.fillStyle = p.color;
    g.strokeStyle = '#07040e';
    g.lineWidth = 5;
    g.beginPath();
    g.arc(R + sx, R + sy, 22, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillStyle = p.fg ?? '#07040e';
    g.font = '30px Anton, Impact, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(p.label, R + sx, R + sy + 2);
  }
  g.fillStyle = '#fff4d6';
  g.strokeStyle = '#07040e';
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(R, R - 20);
  g.lineTo(R + 14, R + 15);
  g.lineTo(R, R + 7);
  g.lineTo(R - 14, R + 15);
  g.closePath();
  g.fill();
  g.stroke();
}

// The drivable city, when the 3D world is running. Otherwise story mode uses the drawn map.
const cityDrive = () => (window as unknown as { __world?: { drive: Drive | null } }).__world?.drive ?? null;

export function startGame(startAt?: string) {
  if (document.querySelector('.game')) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  gsap.globalTimeline.timeScale(reduced ? 50 : 1);

  const trigger = document.activeElement as HTMLElement | null;
  const root = document.createElement('div');
  root.className = 'game';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Commit City story mode');
  root.innerHTML = `
    <div class="g-hud">
      <div class="g-meter" aria-label="Fare meter"><span>Fare</span><b data-fare>₹000</b><small>₹1 = 1 commit</small></div>
      <button class="g-hud__btn" data-phone>📱 Phone<i data-unread hidden></i></button>
      <button class="g-hud__btn g-hud__exit" data-exit aria-label="Exit story mode and return to the portfolio">✕ Exit</button>
    </div>
    <div class="g-screen" tabindex="-1"></div>
    <div class="g-banner" aria-hidden="true"><i></i><b></b></div>`;
  // With the 3D city running, the story panels are windows onto it instead of paintings.
  root.classList.toggle('is-live', !!cityDrive());
  document.body.append(root);
  document.documentElement.classList.add('game-open');

  const screen = root.querySelector<HTMLElement>('.g-screen')!;
  const banner = root.querySelector<HTMLElement>('.g-banner')!;
  const fareEl = root.querySelector<HTMLElement>('[data-fare]')!;
  const unread = root.querySelector<HTMLElement>('[data-unread]')!;

  const done = new Set<string>();
  const receipt = { fare: 0 };
  let current = data.order[0];
  let cleanup: (() => void) | void;
  let carAt = stops[current].at - 0.05; // parked just before the first marker, so it stays visible

  // Fail-safe: if animation frames stall, snap to the final state instead of staying offset.
  const settle = (el: Element) =>
    window.setTimeout(() => {
      gsap.killTweensOf(el);
      gsap.set(el, { clearProps: 'transform' });
    }, 450);

  let alive = true;
  const later = (ms: number, fn: () => void) => window.setTimeout(() => alive && fn(), ms);

  const mount = (html: string) => {
    cleanup?.();
    cleanup = undefined;
    screen.innerHTML = html;
    screen.scrollTop = 0;
    screen.focus({ preventScroll: true });
    gsap.fromTo(screen, { x: 24 }, { x: 0, duration: 0.22, ease: 'steps(4)' });
    settle(screen);
  };

  // The story panels use the same drawing as the 3D world, cached as one image per mood.
  const figures = new Map<string, string>();
  const character = (mood: string) => {
    if (!figures.has(mood)) figures.set(mood, drawFigure(mood, 640).toDataURL());
    return `<img class="hero-char" src="${figures.get(mood)}" alt="" />`;
  };

  const addFare = (n: number) => {
    const from = receipt.fare;
    receipt.fare += n;
    const o = { v: from };
    gsap.to(o, {
      v: receipt.fare,
      duration: 0.9,
      ease: 'steps(14)',
      onUpdate: () => (fareEl.textContent = `₹${String(Math.round(o.v)).padStart(3, '0')}`),
    });
  };

  // --- Intro ---
  const intro = (i = 0) => {
    const p = story.intro[i];
    const art =
      p.scene === 'auto'
        ? `<div class="g-panel__auto">${autoSvg}</div>`
        : p.scene === 'call'
          ? `<div class="g-call" aria-hidden="true"><b>Unknown caller</b><span>📞</span></div>`
          : `<div class="g-panel__moon" aria-hidden="true"></div>`;
    mount(`
      <article class="g-panel">
        <p class="caption">${esc(p.caption)}</p>
        <div class="g-panel__art">
          ${art}
          <div class="g-panel__char">${character(p.mood)}</div>
          <p class="g-bubble">${esc(p.line)}</p>
          ${p.caller ? `<p class="g-bubble g-bubble--caller">“${esc(p.caller)}”</p>` : ''}
        </div>
        <div class="g-next"><button class="btn btn--yellow" data-next>${i < story.intro.length - 1 ? 'Next panel' : 'Get in the auto'} →</button>
        <button class="g-skip" data-skip>Skip intro</button></div>
      </article>`);
    screen.querySelector<HTMLElement>('[data-next]')!.onclick = () =>
      i < story.intro.length - 1 ? intro(i + 1) : map();
    screen.querySelector<HTMLElement>('[data-skip]')!.onclick = () => map();
    screen.querySelector<HTMLElement>('[data-next]')!.focus();
  };

  // --- The drive: the same city as the portfolio, with the player at the wheel ---
  // The next stop to suggest. One the player just skipped goes to the back of the queue.
  const skipped = new Set<string>();
  const nextStop = () => data.order.find((s) => !done.has(s) && !skipped.has(s)) ?? data.order.find((s) => !done.has(s));
  const stopStates = () => {
    const next = nextStop();
    return data.order.map((slug) => ({ slug, done: done.has(slug), next: slug === next }));
  };
  const placeName = (slug: string) => LABELS[slug][2];
  const driveHooks = {
    arrive: (slug: string) => {
      carAt = stops[slug].at;
      intoMission(slug);
    },
    word: (text: string) => pop(text),
  };

  const driveScreen = (drive: Drive, line?: string) => {
    const say = line ?? (done.size >= 3 ? story.mapAfterThree : done.size ? story.driveNext : story.driveIdle);
    unread.hidden = done.size < 3;
    root.classList.add('is-driving');
    mount(`
      <div class="g-drive">
        <div class="g-drive__next" data-next-wrap><i data-arrow aria-hidden="true">▲</i><p><b data-next-name></b><small data-next-dist></small></p></div>
        <div class="g-drive__say"><img src="${faceUrl}" alt="" /><p class="g-bubble g-bubble--static" aria-live="polite" data-say>${esc(say)}</p></div>
        <nav class="g-drive__stops" aria-label="Stops. Pick one and the auto drives there.">
          <h2>${done.size} of ${data.order.length} stops</h2>
          ${data.order
            .map((s, i) => `<button class="g-stop ${done.has(s) ? 'is-done' : ''}" data-stop="${s}" aria-label="${esc(stops[s].title)}: ${esc(projectOf(s).title)}${done.has(s) ? ', done' : ''}"><i>${done.has(s) ? '✓' : i + 1}</i><span>${esc(placeName(s))}</span></button>`)
            .join('')}
          ${done.size >= 3 ? '<button class="btn btn--yellow" data-answer>📞 Answer the call</button>' : ''}
        </nav>
        <canvas class="g-radar" width="320" height="320" aria-hidden="true"></canvas>
        <p class="g-drive__hint" data-hint><b>Arrow keys or WASD</b> to drive. Or pick a stop.</p>
        ${PAD}
      </div>`);

    const sayEl = screen.querySelector<HTMLElement>('[data-say]')!;
    const hint = screen.querySelector<HTMLElement>('[data-hint]')!;
    const arrow = screen.querySelector<HTMLElement>('[data-arrow]')!;
    const nextName = screen.querySelector<HTMLElement>('[data-next-name]')!;
    const nextDist = screen.querySelector<HTMLElement>('[data-next-dist]')!;
    const radar = screen.querySelector<HTMLCanvasElement>('.g-radar')!;
    const g = radar.getContext('2d')!;
    const stopsNav = screen.querySelector<HTMLElement>('.g-drive__stops')!;

    // The bubble clears itself after a while, so it isn't in the way of the road.
    const sayBox = sayEl.parentElement!;
    let quietTimer = 0;
    const speak = (text: string) => {
      sayEl.textContent = text;
      sayBox.classList.remove('is-quiet');
      clearTimeout(quietTimer);
      quietTimer = window.setTimeout(() => sayBox.classList.add('is-quiet'), 8000);
    };
    speak(say);

    if (drive.isOn()) drive.resume(stopStates());
    else drive.start(stopStates(), driveHooks);

    stopsNav.addEventListener('click', (e) => {
      const pick = (e.target as Element).closest<HTMLElement>('[data-stop]');
      if (pick) {
        drive.goTo(pick.dataset.stop!);
        speak(stops[pick.dataset.stop!].say);
      }
    });
    screen.querySelector<HTMLElement>('[data-answer]')?.addEventListener('click', ending);

    const unwire = wheel(drive, hint);

    // The radar and the arrow, at 12 frames a second like everything else that's drawn.
    const paintRadar = () => {
      const car = drive.state();
      drawRadar(g, car, drive.marks.map((m) => ({ ...m, done: done.has(m.slug) })), drive.marks.map((m) => {
        const isDone = done.has(m.slug);
        return { x: m.x, z: m.z, label: isDone ? '✓' : String(data.order.indexOf(m.slug) + 1), color: isDone ? '#14082f' : '#ffc917', fg: isDone ? '#7dff5e' : '#07040e' };
      }));

      const nextSlug = nextStop();
      if (!nextSlug) {
        nextName.textContent = 'Answer the call';
        nextDist.textContent = '';
        arrow.hidden = true;
        return;
      }
      const m = drive.marks.find((x) => x.slug === nextSlug)!;
      pointAt(arrow, car, m.x, m.z);
      nextName.textContent = placeName(nextSlug);
      nextDist.textContent = `${Math.round(Math.hypot(m.x - car.x, m.z - car.z))} m${car.auto ? ' · auto driving' : ''}`;
    };
    paintRadar();
    const radarTimer = window.setInterval(paintRadar, 83);

    cleanup = () => {
      clearInterval(radarTimer);
      clearTimeout(quietTimer);
      unwire();
      root.classList.remove('is-driving');
    };
  };

  // Touch controls. Pointer events, so one thumb can steer while the other holds Go.
  const PAD = `<div class="g-pad" data-pad>
      <div><button data-key="left" aria-label="Steer left">◀</button><button data-key="right" aria-label="Steer right">▶</button></div>
      <div><button data-key="down" aria-label="Brake">Brake</button><button data-key="up" class="g-pad__go" aria-label="Accelerate">Go</button></div>
    </div>`;
  const wheel = (drive: Drive, hint: HTMLElement) => {
    const pad = screen.querySelector<HTMLElement>('[data-pad]')!;
    const hold = (e: PointerEvent, on: boolean) => {
      const key = (e.target as Element).closest<HTMLElement>('[data-key]');
      if (!key) return;
      e.preventDefault();
      if (on) key.setPointerCapture(e.pointerId);
      key.classList.toggle('is-held', on);
      drive.press(key.dataset.key as DriveKey, on);
      hint.hidden = true;
    };
    pad.addEventListener('pointerdown', (e) => hold(e, true));
    pad.addEventListener('pointerup', (e) => hold(e, false));
    pad.addEventListener('pointercancel', (e) => hold(e, false));
    pad.addEventListener('contextmenu', (e) => e.preventDefault());
    const hideHint = (e: KeyboardEvent) => {
      if (/^(Arrow|Key[WASD]$)/.test(e.code)) hint.hidden = true;
    };
    addEventListener('keydown', hideHint);
    return () => removeEventListener('keydown', hideHint);
  };

  const pointAt = (arrow: HTMLElement, car: Car, x: number, z: number) => {
    const turn = car.heading - Math.atan2(car.x - x, car.z - z);
    arrow.style.rotate = `${Math.round((turn * 180) / Math.PI)}deg`;
  };

  // --- A stop's challenge, played at the wheel in the city itself ---
  const challenge = (slug: string, drive: Drive) => {
    const c = (data.challenges as Record<string, { brief: string }>)[slug];
    const p = projectOf(slug);
    let hudEls: { big: HTMLElement; small: HTMLElement; clock: HTMLElement; clockWrap: HTMLElement } | null = null;
    let shown = '';
    let over = false;
    const ui: ChallengeUI = {
      hud: (h: Hud) => {
        if (!hudEls) return;
        const key = `${h.big}|${h.small ?? ''}|${h.clock === undefined ? '' : Math.ceil(h.clock)}`;
        if (h.clock !== undefined) hudEls.clock.style.width = `${(h.clock / (h.of ?? 1)) * 100}%`;
        if (key === shown) return;
        shown = key;
        hudEls.big.textContent = h.big;
        hudEls.small.textContent = h.small ?? '';
        hudEls.clockWrap.hidden = h.clock === undefined;
        hudEls.clockWrap.dataset.left = h.clock === undefined ? '' : `${Math.ceil(h.clock)}s`;
        hudEls.clockWrap.classList.toggle('is-low', h.clock !== undefined && h.clock < 6);
      },
      word: (text: string) => pop(text),
      end: (result) => {
        if (over) return;
        over = true;
        drive.endChallenge();
        screen.querySelector('.g-drive')?.classList.add('is-over');
        later(700, () => stamp(slug, result));
      },
    };
    if (!drive.challenge(slug, ui)) return false;
    root.classList.add('is-driving');
    mount(`
      <div class="g-drive g-drive--task is-briefing">
        <div class="g-drive__next"><i data-arrow aria-hidden="true">▲</i><p><b data-next-name></b><small data-next-dist></small></p></div>
        <div class="g-task" aria-live="polite">
          <p class="g-task__title">${esc(stops[slug].title)}</p>
          <b data-big></b>
          <small data-small></small>
          <i class="g-task__clock" data-clock-wrap hidden><span data-clock></span></i>
          <button class="g-skip" data-skip>Skip this stop →</button>
        </div>
        <canvas class="g-radar" width="320" height="320" aria-hidden="true"></canvas>
        <p class="g-drive__hint" data-hint><b>Arrow keys or WASD</b> to drive.</p>
        ${PAD}
        <section class="g-brief" aria-labelledby="g-brief-title">
          <p class="caption">${esc(stops[slug].title)}</p>
          <h2 id="g-brief-title">${esc(p.title)}</h2>
          <div class="g-brief__say"><img src="${faceUrl}" alt="" /><p class="g-bubble g-bubble--static">${esc(c.brief)}</p></div>
          <p class="g-brief__keys">Drive with the <b>arrow keys</b> or <b>WASD</b>.</p>
          <div class="g-next"><button class="btn btn--yellow" data-start>Start →</button><button class="g-skip" data-skip>Skip this stop</button></div>
        </section>
      </div>`);
    const wrap = screen.querySelector<HTMLElement>('.g-drive')!;
    const $ = (sel: string) => screen.querySelector<HTMLElement>(sel)!;
    hudEls = { big: $('[data-big]'), small: $('[data-small]'), clock: $('[data-clock]'), clockWrap: $('[data-clock-wrap]') };
    const arrow = $('[data-arrow]');
    const nextName = $('[data-next-name]');
    const nextDist = $('[data-next-dist]');
    const nextBox = arrow.parentElement!;
    const radar = screen.querySelector<HTMLCanvasElement>('.g-radar')!;
    const g = radar.getContext('2d')!;
    const unwire = wheel(drive, $('[data-hint]'));

    const go = () => {
      if (!wrap.classList.contains('is-briefing')) return;
      wrap.classList.remove('is-briefing');
      removeEventListener('keydown', keyStart);
      drive.play();
      pop('GO!');
      screen.focus({ preventScroll: true });
    };
    // Any driving key also starts it, so a keyboard player never has to reach for the mouse.
    const keyStart = (e: KeyboardEvent) => {
      if (/^(Arrow|Key[WASD]$)/.test(e.code)) go();
    };
    addEventListener('keydown', keyStart);
    $('[data-start]').onclick = go;
    $('[data-start]').focus();
    screen.querySelectorAll<HTMLElement>('[data-skip]').forEach((btn) => {
      btn.onclick = () => {
        over = true;
        skipped.add(slug);
        drive.endChallenge();
        card(slug, null);
      };
    });

    const paint = () => {
      const car = drive.state();
      drawRadar(g, car, [], drive.challengePins());
      const t = drive.challengeTarget();
      arrow.hidden = !t;
      nextBox.hidden = !t;
      if (t) {
        pointAt(arrow, car, t.x, t.z);
        nextName.textContent = t.label;
        nextDist.textContent = `${Math.round(Math.hypot(t.x - car.x, t.z - car.z))} m`;
      } else {
        nextName.textContent = hudEls!.big.textContent;
        nextDist.textContent = '';
      }
    };
    paint();
    const timer = window.setInterval(paint, 83);
    cleanup = () => {
      clearInterval(timer);
      unwire();
      removeEventListener('keydown', keyStart);
      root.classList.remove('is-driving');
    };
    return true;
  };

  // Comic sound effects, in big ink letters over the action.
  const pop = (text: string) => {
    const el = document.createElement('b');
    el.className = 'g-word';
    el.textContent = text;
    el.setAttribute('aria-hidden', 'true');
    el.style.left = text.length > 8 ? '50%' : `${28 + Math.random() * 44}%`;
    if (text.length > 8) el.classList.add('g-word--long');
    el.style.top = `${26 + Math.random() * 22}%`;
    el.style.rotate = `${-9 + Math.random() * 18}deg`;
    root.append(el);
    later(800, () => el.remove());
  };

  // --- Map ---
  const map = (line?: string) => {
    const drive = cityDrive();
    if (drive) {
      driveScreen(drive, line);
      return;
    }
    const next = data.order.find((s) => !done.has(s));
    const say = line ?? (done.size >= 3 ? story.mapAfterThree : story.mapIdle);
    unread.hidden = done.size < 3;
    mount(`
      <div class="g-map">
        <div class="g-map__board">
          <svg class="g-city" viewBox="0 0 1000 1000" role="group" aria-label="Map of Commit City">
            <defs><pattern id="g-dots" width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="7" cy="7" r="2.4" fill="#2a0f5e"/></pattern></defs>
            <rect width="1000" height="1000" fill="#14082f"/><rect width="1000" height="1000" fill="url(#g-dots)"/>
            <path d="M0 1000 Q300 880 500 980 T1000 860 V1000 Z" fill="#0d8fa0"/>
            <path d="M180 190 C340 420 660 470 810 790 M820 210 C620 400 370 560 190 790" fill="none" stroke="#2a0f5e" stroke-width="30"/>
            ${data.order.map((s) => DISTRICTS[s]).join('')}
            <path d="${RING}" fill="none" stroke="#07040e" stroke-width="58"/>
            <path d="${RING}" fill="none" stroke="#4a2a90" stroke-width="48"/>
            <path class="g-city__ring" data-ring d="${RING}" fill="none" stroke="#ffc917" stroke-width="4" stroke-dasharray="26 22"/>
            ${data.order
              .map((s) => {
                const [x, y, name] = LABELS[s];
                return `<text class="g-city__label" x="${x}" y="${y}" text-anchor="middle">${esc(name)}</text>`;
              })
              .join('')}
            <g data-markers></g>
            <g data-car><g transform="translate(-37 -23)">
              <rect x="0" y="4" width="74" height="38" rx="14" fill="#07040e"/>
              <rect x="4" y="0" width="60" height="46" rx="12" fill="#ffc917" stroke="#07040e" stroke-width="4"/>
              <rect x="14" y="8" width="38" height="30" rx="8" fill="#07040e"/>
              <path d="M74 12 L120 2 V44 L74 34 Z" fill="#ffc917" opacity="0.28"/>
            </g></g>
          </svg>
        </div>
        <aside class="g-map__side">
          <div class="g-map__char">${character('smirk')}</div>
          <p class="g-bubble g-bubble--static" aria-live="polite" data-say>${esc(say)}</p>
          <p class="g-map__progress">${done.size} of ${data.order.length} stops done</p>
          ${done.size >= 3 ? '<button class="btn btn--yellow" data-answer>📞 Answer the call</button>' : ''}
        </aside>
      </div>`);

    const ring = screen.querySelector<SVGPathElement>('[data-ring]')!;
    const len = ring.getTotalLength();
    const car = screen.querySelector<SVGGElement>('[data-car]')!;
    const placeCar = (t: number) => {
      const a = ring.getPointAtLength(((t % 1) + 1) % 1 * len);
      const b = ring.getPointAtLength((((t + 0.002) % 1) + 1) % 1 * len);
      const deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
      car.setAttribute('transform', `translate(${a.x} ${a.y}) rotate(${deg})`);
    };
    placeCar(carAt);

    const group = screen.querySelector<SVGGElement>('[data-markers]')!;
    group.innerHTML = data.order
      .map((s, i) => {
        const pt = ring.getPointAtLength(stops[s].at * len);
        const isDone = done.has(s);
        return `<g class="g-pin ${isDone ? 'is-done' : ''} ${s === next ? 'is-next' : ''}" role="button" tabindex="0" data-stop="${s}"
            aria-label="${esc(stops[s].title)}: ${esc(projectOf(s).title)}${isDone ? ', done' : ''}" transform="translate(${pt.x} ${pt.y})">
          <circle class="g-pin__halo" r="44"/><circle class="g-pin__dot" r="32"/>
          <text class="g-pin__num" y="13" text-anchor="middle">${isDone ? '✓' : i + 1}</text></g>`;
      })
      .join('');

    let rolling = false;
    const roll = (slug: string) => {
      if (rolling) return;
      rolling = true;
      const say = screen.querySelector<HTMLElement>('[data-say]')!;
      say.textContent = stops[slug].say;
      const target = stops[slug].at;
      let delta = target - carAt;
      if (delta > 0.5) delta -= 1;
      if (delta < -0.5) delta += 1;
      const o = { t: carAt };
      const seconds = Math.max(0.5, Math.abs(delta) * 5);
      gsap.to(o, { t: carAt + delta, duration: seconds, ease: 'power1.inOut', onUpdate: () => placeCar(o.t) });
      // The drive is decoration. A timer moves the story on, even if animation frames stall.
      later(seconds * 1000 + 500, () => {
        carAt = target;
        intoMission(slug);
      });
    };
    const pick = (e: Event) => {
      const pin = (e.target as Element).closest<SVGGElement>('[data-stop]');
      if (pin) roll(pin.dataset.stop!);
    };
    group.addEventListener('click', pick);
    group.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        pick(e);
      }
    });
    screen.querySelector<HTMLElement>('[data-answer]')?.addEventListener('click', ending);
  };

  // --- Slanted banner between screens ---
  const showBanner = (title: string, then: () => void) => {
    banner.querySelector('b')!.textContent = title;
    banner.classList.add('is-on');
    // Timers, not animation frames, so a throttled device can't stall the game here.
    later(300, then);
    later(1400, () => banner.classList.remove('is-on'));
    gsap
      .timeline({
        onComplete: () => {
          banner.classList.remove('is-on');
        },
      })
      .fromTo(banner.querySelector('i'), { xPercent: -110 }, { xPercent: 0, duration: 0.24, ease: 'power3.out' })
      .fromTo(banner.querySelector('b'), { xPercent: 90, opacity: 0 }, { xPercent: 0, opacity: 1, duration: 0.22, ease: 'power3.out' }, 0.06)
      .to(banner.querySelector('b'), { xPercent: -90, opacity: 0, duration: 0.2, ease: 'power3.in' }, 0.85)
      .to(banner.querySelector('i'), { xPercent: 110, duration: 0.24, ease: 'power3.in' }, 0.9);
  };

  // --- Mission ---
  const intoMission = (slug: string) => {
    current = slug;
    const drive = cityDrive();
    if (drive) {
      if (!drive.isOn()) drive.start(stopStates(), driveHooks);
      drive.park(slug);
    }
    showBanner(stops[slug].title, () => mission(slug));
  };

  const mission = (slug: string) => {
    const drive = cityDrive();
    if (drive && challenge(slug, drive)) return;
    const p = projectOf(slug);
    mount(`
      <section class="g-mission">
        <header><p class="caption">${esc(stops[slug].title)}</p><h2>${esc(p.title)}</h2>
          <button class="g-skip" data-skip>Skip mission →</button></header>
        <div class="g-mission__stage" data-stage></div>
      </section>`);
    screen.querySelector<HTMLElement>('[data-skip]')!.onclick = () => {
      skipped.add(slug);
      card(slug, null);
    };
    let finished = false;
    cleanup = missions[slug](screen.querySelector<HTMLElement>('[data-stage]')!, (result) => {
      if (finished) return;
      finished = true;
      stamp(slug, result);
    });
  };

  // --- BUILD PASSED / BUILD FAILED stamp ---
  const stamp = (slug: string, result: Result) => {
    const el = document.createElement('div');
    el.className = `g-stamp ${result.passed ? '' : 'g-stamp--fail'}`;
    el.innerHTML = `<b>Build ${result.passed ? 'passed' : 'failed'}</b>${result.headline ? `<p>${esc(result.headline)}</p>` : ''}`;
    root.append(el);
    gsap.fromTo(el.querySelector('b'), { scale: 2.6, rotate: -14 }, { scale: 1, rotate: -5, duration: 0.3, ease: 'steps(6)' });
    if (!done.has(slug)) addFare(stops[slug].fare);
    done.add(slug);
    later(result.headline ? Math.max(3200, result.headline.length * 42) : 1700, () => {
      el.remove();
      card(slug, result);
    });
  };

  // --- Case-study card ---
  const card = (slug: string, result: Result | null) => {
    cityDrive()?.clearChallenge();
    const p = projectOf(slug);
    const allDone = data.order.every((s) => done.has(s));
    mount(`
      <article class="g-card">
        <p class="caption">Case file${result ? ` · Build ${result.passed ? 'passed' : 'failed'}` : ''}</p>
        <h2>${esc(p.title)}</h2>
        <p>${esc(p.oneLiner)}</p>
        <div class="g-card__cols">
          <section><h3>What I built</h3><ul>${p.built.slice(0, 3).map((b) => `<li>${esc(b)}</li>`).join('')}</ul></section>
          ${p.broke.length ? `<section class="g-card__broke"><h3>What broke</h3><ul>${p.broke.map((b) => `<li>${txt(b)}</li>`).join('')}</ul></section>` : ''}
        </div>
        <p class="g-card__learned"><b>What I learned:</b> ${txt(p.learned)}</p>
        <p class="g-card__stack">${p.stack.map(esc).join(' · ')}</p>
        <div class="g-next">
          <button class="btn btn--yellow" data-back>${allDone ? 'The phone is ringing →' : 'Back in the auto →'}</button>
          <a class="btn" href="/projects/${p.slug}/" target="_blank" rel="noopener">Full case file</a>
        </div>
      </article>`);
    screen.querySelector<HTMLElement>('[data-back]')!.onclick = () => (allDone ? ending() : map());
    screen.querySelector<HTMLElement>('[data-back]')!.focus();
  };

  // --- Ending: the caller was the visitor all along ---
  const ending = () => {
    const e = story.ending;
    cityDrive()?.park();
    mount(`
      <article class="g-panel g-end">
        <p class="caption">${esc(e.ring)}</p>
        <div class="g-panel__art">
          <div class="g-call g-call--ring"><b>Unknown caller</b><span aria-hidden="true">📞</span></div>
          <div class="g-panel__char">${character('shocked')}</div>
          <p class="g-bubble">${esc(e.reveal)}</p>
        </div>
        <div class="g-next"><button class="btn btn--yellow" data-reveal>Look at the number →</button></div>
      </article>`);
    screen.querySelector<HTMLElement>('[data-reveal]')!.onclick = () => {
      mount(`
        <article class="g-panel g-end">
          <p class="caption">${esc(e.caption)}</p>
          <div class="g-panel__art">
            <div class="g-call g-call--you"><b>You</b><span aria-hidden="true">🫵</span></div>
            <div class="g-panel__char">${character('proud')}</div>
            <p class="g-bubble">${esc(e.line)}</p>
          </div>
          <p class="g-end__fare">Fare so far: <b>₹${receipt.fare}</b>, ${done.size} of ${data.order.length} stops. That's ₹1 per commit.</p>
          <div class="g-next"><button class="play-accept" data-accept>${esc(e.accept)}</button></div>
        </article>`);
      screen.querySelector<HTMLElement>('[data-accept]')!.onclick = accepted;
      screen.querySelector<HTMLElement>('[data-accept]')!.focus();
    };
    screen.querySelector<HTMLElement>('[data-reveal]')!.focus();
  };

  const accepted = () => {
    const { email, linkedin } = site.contact;
    const todo = [email, linkedin].filter(isTodo).map(txt).join(' ');
    mount(`
      <article class="g-panel g-end g-end--done">
        <p class="caption">Mission accepted</p>
        <h2>${esc(site.name)}</h2>
        <p class="g-bubble g-bubble--static">${esc(story.acceptedLine)}</p>
        <div class="g-end__contacts">${contactHtml()}</div>
        ${todo ? `<p>${todo}</p>` : ''}
        <div class="g-next"><button class="btn" data-replay>Back to the map</button><button class="btn" data-leave>Read the portfolio</button></div>
      </article>`);
    screen.querySelector<HTMLElement>('[data-replay]')!.onclick = () => map();
    screen.querySelector<HTMLElement>('[data-leave]')!.onclick = exit;
  };

  // --- Phone and exit ---
  const phone = createPhone(root, {
    missions: () => data.order.map((slug) => ({ slug, title: `${stops[slug].title}: ${projectOf(slug).title}`, done: done.has(slug) })),
    go: intoMission,
    answer: ending,
  });

  function exit() {
    alive = false;
    cleanup?.();
    cityDrive()?.stop();
    gsap.killTweensOf('*');
    root.remove();
    document.removeEventListener('keydown', onKey);
    document.documentElement.classList.remove('game-open');
    trigger?.focus?.();
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    if (phone.isOpen()) phone.close();
    else exit();
  };
  document.addEventListener('keydown', onKey);
  root.querySelector<HTMLElement>('[data-exit]')!.onclick = exit;
  root.querySelector<HTMLElement>('[data-phone]')!.onclick = () => phone.toggle();

  if (startAt && missions[startAt]) intoMission(startAt);
  else intro();
}
