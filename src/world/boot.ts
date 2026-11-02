// Starts the 3D city behind the page. If anything here fails, or the device asks for less
// motion or data, the page keeps its painted CSS background and works exactly the same.
const canvas = document.querySelector<HTMLCanvasElement>('[data-world]');
const root = document.documentElement;

function supported() {
  const probe = document.createElement('canvas');
  return !!probe.getContext('webgl2');
}

// The inline script in the page holds the title back for the opening. This always lets it go.
const showHero = () => root.classList.remove('holding');

async function run() {
  if (!canvas || !supported()) return showHero();
  const save = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
  if (save) return showHero();
  const params = new URLSearchParams(location.search);
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const { startWorld } = await import('./world');
  const world = await startWorld(canvas, { still, fixedQuality: params.has('fixed') });

  // Each section pins a point on the camera's journey, so the two line up on any screen size.
  let stops: [number, number][] = [];
  const measure = () => {
    const max = root.scrollHeight - innerHeight;
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
    if (root.classList.contains('game-open')) return;
    const p = progress();
    world.setProgress(p);
    root.style.setProperty('--p', p.toFixed(4));
    window.dispatchEvent(new CustomEvent('world:progress', { detail: p }));
  };
  addEventListener('scroll', update, { passive: true });
  addEventListener('resize', update, { passive: true });
  update();
  canvas.classList.add('is-on');

  // Panels lean into the scroll: the faster you fall, the harder the page skews.
  if (!still) {
    let shown = 0;
    let lastY = scrollY;
    window.setInterval(() => {
      // Stepped at 12 frames a second, like everything else that's hand-drawn here.
      const dy = scrollY - lastY;
      lastY = scrollY;
      const v = Math.max(Math.min(dy / 180, 1), -1);
      shown += (v - shown) * 0.5;
      root.style.setProperty('--v', (Math.abs(shown) < 0.01 ? 0 : shown).toFixed(3));
    }, 83);
  }

  // Panels slam in as they arrive.
  root.classList.add('anim');
  const seen = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) e.target.classList.add('in');
      }
    },
    { threshold: 0.12 },
  );
  document.querySelectorAll('.panel, .card, .street__head').forEach((el) => seen.observe(el));

  // Story mode plays over the living city, which cruises down the avenue behind it.
  new MutationObserver(() => {
    const open = root.classList.contains('game-open');
    world.setCruise(open);
    if (!open) update();
  }).observe(root, { attributes: true, attributeFilter: ['class'] });

  // The opening plays once, on load, from the top of the page. Any input skips it.
  const canOpen = !still && scrollY < 40 && !params.has('nointro') && !params.has('p');
  if (canOpen) {
    const skip = () => world.skipOpening();
    const stopListening = () => {
      for (const ev of ['wheel', 'touchmove', 'keydown', 'pointerdown']) removeEventListener(ev, skip);
    };
    for (const ev of ['wheel', 'touchmove', 'keydown', 'pointerdown']) addEventListener(ev, skip, { passive: true });
    root.classList.add('in-opening');
    world.playOpening(
      () => {
        showHero();
        root.classList.add('title-in');
      },
      () => {
        stopListening();
        root.classList.remove('in-opening');
      },
    );
  } else {
    showHero();
  }

  // Debug only: ?p=0.3 jumps straight to a point on the journey.
  const q = params.get('p');
  if (q) world.renderAt(Number(q));
  (window as unknown as { __world: typeof world }).__world = world;
  window.dispatchEvent(new CustomEvent('world:ready', { detail: world }));
}

// Let the page paint first: the painted poster shows instantly, and the city takes over from it.
const begin = () =>
  run().catch((error) => {
    console.error('The 3D city could not start', error);
    showHero();
  });
if ('requestIdleCallback' in window) requestIdleCallback(begin, { timeout: 400 });
else setTimeout(begin, 200);
window.setTimeout(showHero, 3500); // Never leave the title hidden, whatever happens above.
