import { gsap } from 'gsap';
import './game.css';
import characterSvg from '../art/character.svg?raw';
import autoSvg from '../art/auto.svg?raw';
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
  solvefx: `<g transform="translate(62 18)"><rect width="120" height="84" fill="#2a241b" stroke="#ffc917" stroke-width="3"/>${[0, 1, 2, 3].map((i) => `<rect x="${12 + i * 26}" y="14" width="16" height="16" fill="#ffc917"/><rect x="${12 + i * 26}" y="46" width="16" height="16" fill="${i === 2 ? '#ffc917' : '#3a3122'}"/>`).join('')}</g>`,
  'ipl-auction': `<g transform="translate(600 245)"><ellipse cx="120" cy="90" rx="124" ry="92" fill="#2f5d3a" stroke="#ffc917" stroke-width="3"/><rect x="104" y="42" width="32" height="96" fill="#d9c58c"/><path d="M104 56 h32 M104 124 h32" stroke="#f6eedb" stroke-width="3"/></g>`,
  'repomind-ai': `<g transform="translate(610 610)" stroke="#ffc917" stroke-width="3">${[0, 1, 2].map((r) => [0, 1, 2].map((c) => `<rect x="${c * 46}" y="${r * 42}" width="38" height="34" fill="${(r + c) % 2 ? '#2a241b' : '#14110d'}"/>`).join('')).join('')}</g>`,
  clipper: `<g transform="translate(250 620)"><rect width="190" height="104" fill="#14110d" stroke="#ffc917" stroke-width="3"/>${[0, 1, 2, 3, 4].map((i) => `<rect x="${10 + i * 36}" y="8" width="24" height="12" fill="#f6eedb"/><rect x="${10 + i * 36}" y="84" width="24" height="12" fill="#f6eedb"/>`).join('')}<rect x="14" y="30" width="162" height="44" fill="#e5322d"/></g>`,
  'mimic-hunt': `<g transform="translate(150 270)"><path d="M0 170 V70 L90 12 L180 70 V170 Z" fill="#2a241b" stroke="#ffc917" stroke-width="3"/><rect x="72" y="104" width="36" height="66" fill="#14110d" stroke="#ffc917" stroke-width="2"/><rect x="24" y="84" width="28" height="28" fill="#ffc917"/><rect x="128" y="84" width="28" height="28" fill="#3a3122"/></g>`,
};
const LABELS: Record<string, [number, number, string]> = {
  solvefx: [122, 138, 'The Hostel'],
  'ipl-auction': [720, 236, 'Cricket Ground'],
  'repomind-ai': [676, 600, 'Tech Street'],
  clipper: [345, 748, 'Film Market'],
  'mimic-hunt': [240, 264, 'The Mansion'],
};

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

  const character = (mood: string) => characterSvg.replace('data-mood="smirk"', `data-mood="${mood}"`);

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

  // --- Map ---
  const map = (line?: string) => {
    const next = data.order.find((s) => !done.has(s));
    const say = line ?? (done.size >= 3 ? story.mapAfterThree : story.mapIdle);
    unread.hidden = done.size < 3;
    mount(`
      <div class="g-map">
        <div class="g-map__board">
          <svg class="g-city" viewBox="0 0 1000 1000" role="group" aria-label="Map of Commit City">
            <defs><pattern id="g-dots" width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="7" cy="7" r="2.4" fill="#2a241b"/></pattern></defs>
            <rect width="1000" height="1000" fill="#1b1712"/><rect width="1000" height="1000" fill="url(#g-dots)"/>
            <path d="M0 1000 Q300 880 500 980 T1000 860 V1000 Z" fill="#163a44"/>
            <path d="M180 190 C340 420 660 470 810 790 M820 210 C620 400 370 560 190 790" fill="none" stroke="#2a241b" stroke-width="30"/>
            ${data.order.map((s) => DISTRICTS[s]).join('')}
            <path d="${RING}" fill="none" stroke="#14110d" stroke-width="58"/>
            <path d="${RING}" fill="none" stroke="#3a3122" stroke-width="48"/>
            <path class="g-city__ring" data-ring d="${RING}" fill="none" stroke="#ffc917" stroke-width="4" stroke-dasharray="26 22"/>
            ${data.order
              .map((s) => {
                const [x, y, name] = LABELS[s];
                return `<text class="g-city__label" x="${x}" y="${y}" text-anchor="middle">${esc(name)}</text>`;
              })
              .join('')}
            <g data-markers></g>
            <g data-car><g transform="translate(-37 -23)">
              <rect x="0" y="4" width="74" height="38" rx="14" fill="#14110d"/>
              <rect x="4" y="0" width="60" height="46" rx="12" fill="#ffc917" stroke="#14110d" stroke-width="4"/>
              <rect x="14" y="8" width="38" height="30" rx="8" fill="#14110d"/>
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

    let driving = false;
    const drive = (slug: string) => {
      if (driving) return;
      driving = true;
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
      if (pin) drive(pin.dataset.stop!);
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
    showBanner(stops[slug].title, () => mission(slug));
  };

  const mission = (slug: string) => {
    const p = projectOf(slug);
    mount(`
      <section class="g-mission">
        <header><p class="caption">${esc(stops[slug].title)}</p><h2>${esc(p.title)}</h2>
          <button class="g-skip" data-skip>Skip mission →</button></header>
        <div class="g-mission__stage" data-stage></div>
      </section>`);
    screen.querySelector<HTMLElement>('[data-skip]')!.onclick = () => card(slug, null);
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
    later(result.headline ? 3200 : 1700, () => {
      el.remove();
      card(slug, result);
    });
  };

  // --- Case-study card ---
  const card = (slug: string, result: Result | null) => {
    const p = projectOf(slug);
    const allDone = data.order.every((s) => done.has(s));
    mount(`
      <article class="g-card">
        <p class="caption">Case file${result ? ` · Build ${result.passed ? 'passed' : 'failed'}` : ''}</p>
        <h2>${esc(p.title)}</h2>
        <p>${esc(p.oneLiner)}</p>
        <div class="g-card__cols">
          <section><h3>What I built</h3><ul>${p.built.slice(0, 3).map((b) => `<li>${esc(b)}</li>`).join('')}</ul></section>
          <section class="g-card__broke"><h3>What broke</h3><ul>${p.broke.map((b) => `<li>${txt(b)}</li>`).join('')}</ul></section>
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
            <div class="g-panel__char">${character('happy')}</div>
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
