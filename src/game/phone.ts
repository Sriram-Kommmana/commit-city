import site from '../../content/site.json';
import projects from '../../content/projects.json';
import { esc, isTodo } from './util';

interface PhoneHooks {
  missions: () => { slug: string; title: string; done: boolean }[];
  go: (slug: string) => void;
  answer: () => void;
}

const contactLinks = () => {
  const { github, email, linkedin } = site.contact;
  return [
    ['GitHub', github],
    ['Email', isTodo(email) ? '' : `mailto:${email}`],
    ['LinkedIn', isTodo(linkedin) ? '' : linkedin],
  ].filter(([, href]) => href) as [string, string][];
};

export const contactHtml = () =>
  contactLinks()
    .map(([label, href]) => `<a class="btn btn--yellow" href="${esc(href)}" target="_blank" rel="noopener">${label}</a>`)
    .join('');

// Hardcoded commands, with no backend.
function run(line: string): string {
  const [cmd, ...args] = line.trim().split(/\s+/);
  const rest = args.join(' ');
  switch (cmd?.toLowerCase()) {
    case '':
    case undefined:
      return '';
    case 'help':
      return 'help, about, skills, projects, open <project>, contact, redis-cli PING, sudo hire <name>';
    case 'about':
      return site.about.lead;
    case 'skills':
      return site.skills.map((g) => `${g.group}: ${g.items.map((i) => i.name).join(', ')}`).join('\n');
    case 'projects':
      return projects.map((p) => p.slug).join('\n');
    case 'open': {
      const p = projects.find((x) => x.slug === rest.toLowerCase());
      if (!p) return `No project called "${rest}". Try: projects`;
      window.open(`/projects/${p.slug}/`, '_blank', 'noopener');
      return `Opening ${p.title}...`;
    }
    case 'contact':
      return contactLinks().map(([label, href]) => `${label}: ${href.replace('mailto:', '')}`).join('\n');
    case 'redis-cli':
      return /^ping$/i.test(rest) ? 'PONG\n(My own Redis in C++ is still at the starter stage.)' : 'Only PING works here.';
    case 'sudo':
      return /^hire\b/i.test(rest)
        ? `Permission denied: hiring needs a conversation first.\nI'm happy to have one:\n${contactLinks().map(([l, h]) => `${l}: ${h.replace('mailto:', '')}`).join('\n')}`
        : 'sudo: nice try.';
    default:
      return `${cmd}: command not found. Try: help`;
  }
}

export function createPhone(root: HTMLElement, hooks: PhoneHooks) {
  const el = document.createElement('aside');
  el.className = 'g-phone';
  el.setAttribute('aria-label', 'In-game phone');
  el.hidden = true;
  root.append(el);

  let tab: 'missions' | 'contacts' | 'terminal' = 'missions';
  const log: string[] = ['Type help to start.'];

  const render = () => {
    const body =
      tab === 'missions'
        ? `<ul class="g-phone__list">
            ${hooks
              .missions()
              .map((m) => `<li><button data-go="${m.slug}"><i>${m.done ? '✓' : '›'}</i>${esc(m.title)}</button></li>`)
              .join('')}
          </ul>
          <button class="btn btn--yellow g-phone__answer" data-answer>📞 Answer the call</button>`
        : tab === 'contacts'
          ? `<div class="g-phone__contacts">${contactHtml()}</div>`
          : `<pre class="g-term" aria-live="polite">${esc(log.join('\n'))}</pre>
             <form class="g-term__form"><span aria-hidden="true">$</span>
               <label class="visually-hidden" for="g-term-in">Terminal command</label>
               <input id="g-term-in" autocomplete="off" autocapitalize="off" spellcheck="false" />
             </form>`;
    el.innerHTML = `
      <div class="g-phone__top"><b>${tab}</b><button class="g-phone__close" data-close aria-label="Close phone">✕</button></div>
      <div class="g-phone__body">${body}</div>
      <nav class="g-phone__tabs">
        ${(['missions', 'contacts', 'terminal'] as const).map((t) => `<button data-tab="${t}" aria-current="${t === tab}">${t}</button>`).join('')}
      </nav>`;
    if (tab === 'terminal') {
      const pre = el.querySelector('.g-term')!;
      pre.scrollTop = pre.scrollHeight;
      el.querySelector<HTMLInputElement>('#g-term-in')!.focus();
    }
  };

  el.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const tabBtn = t.closest<HTMLElement>('[data-tab]');
    if (tabBtn) {
      tab = tabBtn.dataset.tab as typeof tab;
      render();
    } else if (t.closest('[data-close]')) close();
    else if (t.closest('[data-answer]')) {
      close();
      hooks.answer();
    } else {
      const go = t.closest<HTMLElement>('[data-go]');
      if (go) {
        close();
        hooks.go(go.dataset.go!);
      }
    }
  });

  el.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = el.querySelector<HTMLInputElement>('#g-term-in')!;
    log.push(`$ ${input.value}`, run(input.value));
    render();
  });

  const open = () => {
    el.hidden = false;
    render();
  };
  const close = () => {
    el.hidden = true;
  };
  return { open, close, toggle: () => (el.hidden ? open() : close()), isOpen: () => !el.hidden };
}
