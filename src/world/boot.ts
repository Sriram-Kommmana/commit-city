// Starts the 3D city behind the page. If anything here fails, or the device asks for less
// motion or data, the page keeps its painted CSS background and works exactly the same.
const canvas = document.querySelector<HTMLCanvasElement>('[data-world]');

function supported() {
  const probe = document.createElement('canvas');
  return !!probe.getContext('webgl2');
}

async function run() {
  if (!canvas || !supported()) return;
  const save = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
  if (save) return;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const { startWorld } = await import('./world');
  const world = await startWorld(canvas, { still });

  // Each section pins a point on the camera's journey, so the two line up on any screen size.
  let stops: [number, number][] = [];
  const measure = () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    stops = [...document.querySelectorAll<HTMLElement>('[data-p]')].map((el) => {
      const mid = el.offsetTop + el.offsetHeight / 2 - innerHeight / 2;
      return [Math.min(Math.max(mid, 0), max), Number(el.dataset.p)];
    });
    stops[0] = [0, 0];
    stops[stops.length - 1] = [max, 1];
  };
  const progress = () => {
    const y = scrollY;
    for (let i = 0; i < stops.length - 1; i++) {
      const [ya, pa] = stops[i];
      const [yb, pb] = stops[i + 1];
      if (y <= yb) return pa + (pb - pa) * Math.max((y - ya) / (yb - ya || 1), 0);
    }
    return 1;
  };
  measure();
  addEventListener('resize', measure, { passive: true });
  addEventListener('load', measure);
  document.fonts.ready.then(measure);
  const update = () => {
    if (document.documentElement.classList.contains('game-open')) return;
    const p = progress();
    world.setProgress(p);
    document.documentElement.style.setProperty('--p', p.toFixed(4));
    window.dispatchEvent(new CustomEvent('world:progress', { detail: p }));
  };
  addEventListener('scroll', update, { passive: true });
  addEventListener('resize', update, { passive: true });
  update();
  canvas.classList.add('is-on');

  // Story mode plays over the living city, which cruises down the avenue behind it.
  new MutationObserver(() => {
    const open = document.documentElement.classList.contains('game-open');
    world.setCruise(open);
    if (!open) update();
  }).observe(
    document.documentElement,
    { attributes: true, attributeFilter: ['class'] },
  );

  // Debug only: ?p=0.3 jumps straight to a point on the journey.
  const q = new URLSearchParams(location.search).get('p');
  if (q) world.renderAt(Number(q));
  (window as unknown as { __world: typeof world }).__world = world;
}

// Let the page paint first: the painted poster shows instantly, and the city takes over from it.
const begin = () => run().catch((error) => console.error('The 3D city could not start', error));
if ('requestIdleCallback' in window) requestIdleCallback(begin, { timeout: 500 });
else setTimeout(begin, 200);
