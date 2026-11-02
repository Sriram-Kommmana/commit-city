import { gsap } from 'gsap';
import data from '../../content/missions.json';
import { esc, shake } from './util';

export interface Result {
  passed: boolean;
  headline?: string;
}
type Finish = (result: Result) => void;
type Cleanup = () => void;
type Mission = (stage: HTMLElement, finish: Finish) => Cleanup | void;

// SolveFX: pick a solution, submit it, and get a verdict.
const verdict: Mission = (stage, finish) => {
  const m = data.verdict;
  stage.innerHTML = `
    <p class="m-brief">${esc(m.brief)}</p>
    <div class="m-editor">
      <div class="m-tabs" role="tablist">
        ${m.solutions.map((s, i) => `<button class="m-tab" role="tab" data-i="${i}" aria-selected="${i === 0}">${esc(s.label)}</button>`).join('')}
      </div>
      <pre class="m-code"><code></code></pre>
    </div>
    <button class="btn btn--yellow m-go" data-submit>Submit</button>
    <div class="m-verdict" aria-live="polite"></div>`;
  const code = stage.querySelector('code')!;
  const out = stage.querySelector<HTMLElement>('.m-verdict')!;
  let pick = 0;
  const show = () => {
    code.textContent = m.solutions[pick].code;
    stage.querySelectorAll('.m-tab').forEach((t, i) => t.setAttribute('aria-selected', String(i === pick)));
  };
  show();
  stage.addEventListener('click', (e) => {
    const el = e.target as HTMLElement;
    const tab = el.closest<HTMLElement>('.m-tab');
    if (tab) {
      pick = Number(tab.dataset.i);
      show();
      return;
    }
    if (!el.closest('[data-submit]')) return;
    const key = m.solutions[pick].verdict as keyof typeof m.results;
    const r = m.results[key];
    out.className = `m-verdict m-verdict--${key}`;
    out.innerHTML = `<b>${esc(r.title)}</b><span>${esc(r.body)}</span>`;
    gsap.fromTo(out, { scale: 1.2 }, { scale: 1, duration: 0.25, ease: 'steps(4)' });
    if (key === 'accepted') {
      setTimeout(() => finish({ passed: true }), 1700);
    } else {
      shake(stage);
    }
  });
};

// IPL auction: one lot, three scripted rivals, and a countdown.
const auction: Mission = (stage, finish) => {
  const m = data.auction;
  stage.innerHTML = `
    <p class="m-brief">${esc(m.brief)}</p>
    <div class="m-lot">
      <div class="m-lot__card">
        <p class="m-lot__role">${esc(m.lot.role)}</p>
        <h3>${esc(m.lot.name)}</h3>
        <dl>${m.lot.stats.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
      </div>
      <div class="m-lot__board">
        <p class="m-lot__label">Current bid</p>
        <p class="m-lot__bid" data-bid></p>
        <p class="m-lot__who" data-who aria-live="polite"></p>
        <div class="m-lot__row"><span>Your purse <b data-purse></b></span><span>Clock <b data-clock></b></span></div>
        <div class="m-lot__bar"><i data-bar></i></div>
      </div>
    </div>
    <button class="btn btn--yellow m-go m-go--big" data-bid-btn>Raise the bid</button>`;
  const $ = (s: string) => stage.querySelector<HTMLElement>(s)!;
  let bid = m.start;
  let leader = m.rivals[0];
  let left = m.seconds;
  let nextRival = 2.6;
  let over = false;

  const paint = () => {
    $('[data-bid]').textContent = `₹${bid} Cr`;
    $('[data-who]').textContent = leader === 'you' ? 'You lead' : `${leader} lead`;
    $('[data-purse]').textContent = `₹${m.purse} Cr`;
    $('[data-clock]').textContent = `${Math.ceil(left)}s`;
    $('[data-bar]').style.width = `${(left / m.seconds) * 100}%`;
    const btn = $('[data-bid-btn]') as HTMLButtonElement;
    btn.textContent = `Raise to ₹${bid + m.step} Cr`;
    btn.disabled = bid + m.step > m.purse || leader === 'you';
  };
  const hammer = () => {
    over = true;
    clearInterval(timer);
    const won = leader === 'you';
    $('[data-who]').textContent = won ? 'Sold to you!' : `Sold to ${leader}!`;
    ($('[data-bid-btn]') as HTMLButtonElement).disabled = true;
    shake(stage);
    finish({ passed: true, headline: won ? m.won : m.lost });
  };
  const timer = window.setInterval(() => {
    if (over) return;
    left -= 0.1;
    nextRival -= 0.1;
    // Rivals stop at their limit, so a visitor who keeps bidding always wins.
    if (nextRival <= 0 && leader === 'you' && bid < m.rivalLimit) {
      bid += m.step;
      leader = m.rivals[bid % m.rivals.length];
      nextRival = 1.6 + (bid % 3) * 0.5;
      gsap.fromTo($('[data-bid]'), { scale: 1.3 }, { scale: 1, duration: 0.2, ease: 'steps(3)' });
    }
    if (left <= 0) hammer();
    else paint();
  }, 100);
  $('[data-bid-btn]').addEventListener('click', () => {
    if (over || leader === 'you') return;
    bid += m.step;
    leader = 'you';
    nextRival = 1.2;
    gsap.fromTo($('[data-bid]'), { scale: 1.3 }, { scale: 1, duration: 0.2, ease: 'steps(3)' });
    paint();
  });
  paint();
  return () => clearInterval(timer);
};

// RepoMind: scrub real history, and find the first commit that broke the architecture.
const drift: Mission = (stage, finish) => {
  const m = data.drift;
  const routers = ['sales', 'products', 'users'];
  stage.innerHTML = `
    <p class="m-brief">${esc(m.brief)}</p>
    <div class="m-drift">
      <svg class="m-graph" viewBox="0 0 420 240" role="img" aria-label="Routers, services and repositories, with any layer violations in red">
        <g class="m-graph__ok" stroke="#f6eedb" stroke-width="3">
          <path d="M70 62 V112 M210 62 V112 M350 62 V112 M70 146 V190 M210 146 V190 M350 146 V190"></path>
        </g>
        ${routers.map((r, i) => `<path class="m-graph__bad" data-bad="${r}" d="M${50 + i * 140} 62 Q${16 + i * 140} 126 ${50 + i * 140} 190" fill="none" stroke="#e5322d" stroke-width="5" stroke-dasharray="9 6"></path>`).join('')}
        ${routers.map((r, i) => `<g><rect x="${14 + i * 140}" y="28" width="112" height="34" fill="#ffc917" stroke="#14110d" stroke-width="3"></rect><text x="${70 + i * 140}" y="53" text-anchor="middle">${r}</text></g>`).join('')}
        ${[0, 1, 2].map((i) => `<g><rect x="${14 + i * 140}" y="112" width="112" height="34" fill="#f6eedb" stroke="#14110d" stroke-width="3"></rect><text x="${70 + i * 140}" y="137" text-anchor="middle">service</text></g>`).join('')}
        ${[0, 1, 2].map((i) => `<g><rect x="${14 + i * 140}" y="190" width="112" height="34" fill="#2a241b" stroke="#ffc917" stroke-width="3"></rect><text x="${70 + i * 140}" y="215" text-anchor="middle" style="fill:#f6eedb">repository</text></g>`).join('')}
      </svg>
      <div class="m-gauge"><b data-health></b><span>health</span></div>
    </div>
    <div class="m-commit"><b data-date></b> <span data-commit></span><em data-note></em></div>
    <label class="visually-hidden" for="m-range">Point in the repository's history</label>
    <input id="m-range" class="m-range" type="range" min="0" max="${m.points.length - 1}" value="0" step="1" />
    <button class="btn btn--yellow m-go" data-pick>It broke here</button>
    <p class="m-feedback" data-fb aria-live="polite"></p>`;
  const $ = (s: string) => stage.querySelector<HTMLElement>(s)!;
  const range = $('#m-range') as HTMLInputElement;
  const paint = () => {
    const p = m.points[Number(range.value)];
    $('[data-health]').textContent = String(p.health);
    $('[data-health]').classList.toggle('is-bad', p.health < 100);
    $('[data-date]').textContent = p.date;
    $('[data-commit]').textContent = p.commit;
    $('[data-note]').textContent = p.note ?? '';
    stage.querySelectorAll<SVGElement>('[data-bad]').forEach((el) => {
      el.style.display = p.bad.includes(el.dataset.bad!) ? 'inline' : 'none';
    });
  };
  range.addEventListener('input', paint);
  paint();
  $('[data-pick]').addEventListener('click', () => {
    if (Number(range.value) === m.answer) {
      $('[data-fb]').textContent = m.right;
      setTimeout(() => finish({ passed: true }), 1800);
    } else {
      $('[data-fb]').textContent = m.wrong;
      shake(stage);
    }
  });
};

// Clipper: guess the top moment from the real scores, then see why the run failed.
const clipper: Mission = (stage, finish) => {
  const m = data.clipper;
  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const best = Math.max(...m.moments.map((x) => x.score));
  stage.innerHTML = `
    <p class="m-brief">${esc(m.brief)}</p>
    <div class="m-strip">
      ${m.moments
        .map(
          (x, i) => `<button class="m-frame" data-i="${i}">
            <i class="m-frame__bar" style="--h:${x.score}%"></i>
            <b class="m-frame__score">${x.score}</b>
            <span class="m-frame__time">${mmss(x.start)}</span>
            <span class="m-frame__title">${esc(x.title)}</span>
          </button>`,
        )
        .join('')}
    </div>
    <div class="m-reveal" data-reveal aria-live="polite"></div>`;
  let done = false;
  stage.querySelector('.m-strip')!.addEventListener('click', (e) => {
    const frame = (e.target as HTMLElement).closest<HTMLElement>('.m-frame');
    if (!frame || done) return;
    done = true;
    const picked = m.moments[Number(frame.dataset.i)];
    stage.querySelector('.m-strip')!.classList.add('is-open');
    frame.classList.add('is-picked');
    stage.querySelectorAll<HTMLElement>('.m-frame').forEach((f, i) => {
      if (m.moments[i].score === best) f.classList.add('is-best');
    });
    const score = picked.score === best ? 'You matched the model.' : `You picked ${picked.score}. The model's top score was ${best}.`;
    const reveal = stage.querySelector<HTMLElement>('[data-reveal]')!;
    reveal.innerHTML = `<p><b>${esc(score)}</b> ${esc(m.reveal)}</p><button class="btn btn--yellow" data-next>See what I fixed</button>`;
    reveal.querySelector('[data-next]')!.addEventListener('click', () => finish({ passed: false }));
  });
};

// Mimic Hunt: one prop in the room is really me.
const PROPS = [
  ['chair', 'M12 8 h20 v34 h26 v42 h-8 v-30 h-30 v30 h-8 z'],
  ['plant', 'M40 44 Q14 34 18 6 Q36 14 40 34 Q44 14 62 6 Q66 34 40 44 M26 50 h28 l-5 36 h-18 z'],
  ['crate', 'M8 22 h64 v62 h-64 z M8 22 l64 62 M72 22 l-64 62'],
  ['lamp', 'M24 12 h32 l12 34 h-56 z M36 46 h8 v30 h-8 z M22 76 h36 v9 h-36 z'],
  ['stool', 'M14 26 h52 v12 h-52 z M22 38 l-6 48 h8 l6 -48 z M58 38 l6 48 h-8 l-6 -48 z'],
  ['barrel', 'M18 12 Q40 4 62 12 Q70 48 62 84 Q40 92 18 84 Q10 48 18 12 z M12 34 H68 M12 62 H68'],
  ['clock', 'M40 8 a34 34 0 1 0 .1 0 z M40 18 V42 L56 52'],
  ['gnome', 'M40 4 L60 44 H20 z M24 44 h32 v14 h-32 z M28 58 h24 l6 28 h-36 z'],
] as const;

const mimic: Mission = (stage, finish) => {
  const m = data.mimic;
  const layout = [3, 0, 5, 1, 7, 2, 6, 4];
  stage.innerHTML = `
    <p class="m-brief">${esc(m.brief)}</p>
    <p class="m-shots">Shots left: <b data-shots>${m.shots}</b></p>
    <div class="m-room">
      ${layout
        .map(
          (p, i) => `<button class="m-prop m-prop--${i}" data-prop="${PROPS[p][0]}" aria-label="Shoot the ${PROPS[p][0]}">
            <svg viewBox="0 0 80 92" aria-hidden="true">
              <path d="${PROPS[p][1]}" fill="#14110d" stroke="#ffc917" stroke-width="3" stroke-linejoin="round"></path>
              ${PROPS[p][0] === 'lamp' ? '<g class="m-prop__eyes"><ellipse cx="33" cy="30" rx="5" ry="6.5" fill="#f6eedb"/><ellipse cx="47" cy="30" rx="5" ry="6.5" fill="#f6eedb"/></g>' : ''}
            </svg>
          </button>`,
        )
        .join('')}
    </div>
    <p class="m-feedback" data-fb aria-live="polite"></p>`;
  const fb = stage.querySelector<HTMLElement>('[data-fb]')!;
  const shotsEl = stage.querySelector<HTMLElement>('[data-shots]')!;
  let shots = m.shots;
  let misses = 0;
  let over = false;
  stage.querySelector('.m-room')!.addEventListener('click', (e) => {
    const prop = (e.target as HTMLElement).closest<HTMLButtonElement>('.m-prop');
    if (!prop || over || prop.disabled) return;
    shots -= 1;
    shotsEl.textContent = String(shots);
    if (prop.dataset.prop === 'lamp') {
      over = true;
      prop.classList.add('is-found');
      fb.textContent = m.found;
      setTimeout(() => finish({ passed: true }), 2000);
      return;
    }
    prop.disabled = true;
    prop.classList.add('is-hit');
    fb.textContent = m.misses[misses++ % m.misses.length];
    shake(stage);
    if (shots === 0) {
      over = true;
      stage.querySelector('[data-prop="lamp"]')!.classList.add('is-found');
      fb.textContent = m.lost;
      setTimeout(() => finish({ passed: false }), 2200);
    }
  });
};

export const missions: Record<string, Mission> = {
  solvefx: verdict,
  'ipl-auction': auction,
  'repomind-ai': drift,
  clipper,
  'mimic-hunt': mimic,
};
