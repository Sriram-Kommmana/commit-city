import { gsap } from 'gsap';

export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export const isTodo = (s: string) => s.startsWith('TODO_USER');
export const txt = (s: string) => (isTodo(s) ? `<span class="todo">${esc(s)}</span>` : esc(s));

export function shake(el: Element) {
  gsap.fromTo(el, { x: -7 }, { x: 0, duration: 0.3, ease: 'elastic.out(2, 0.25)' });
}
