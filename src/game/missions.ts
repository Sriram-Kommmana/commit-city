import data from '../../content/missions.json';
import { esc, shake } from './util';

export interface Result {
  passed: boolean;
  headline?: string;
}
type Finish = (result: Result) => void;
type Cleanup = () => void;
type Mission = (stage: HTMLElement, finish: Finish) => Cleanup | void;

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

// The other four stops are arcade games (src/game/games), which need no WebGL.
export const missions: Record<string, Mission> = {
  'mimic-hunt': mimic,
};
