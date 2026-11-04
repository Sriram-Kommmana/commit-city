import data from '../../../content/missions.json';
import { CYAN, DISPLAY, GREEN, HAND, inked, INK, LABEL, panel, PAPER, PINK, RED, YELLOW, type Game } from '../arcade';

// Clipper: you're the director, the clips are the real moments Clipper scored, and the editing
// software falls apart while you cut the trailer: the audio dies, the captions go nonsense, the GPU
// overheats and the render freezes at 99%.

const T = data.arcade.clipper;
const M = data.clipper.moments;
const LENGTH = 26;
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

interface Clip {
  i: number; // index into the moments
  x: number;
  taken: boolean;
}
interface Flying {
  i: number;
  x: number;
  y: number;
  tx: number;
  ty: number;
  t: number;
}

export const director: Game = {
  brief: T.brief,
  how: T.how,
  howTouch: T.howTouch,
  start: (k) => {
    const { g } = k;
    const CW = 176;
    const clips: Clip[] = M.map((_, i) => ({ i, x: k.W * 0.45 + i * (CW + 26), taken: false }));
    const picks: number[] = [];
    const flying: Flying[] = [];
    let fan = 0; // taps on the fan while the GPU is overheating
    let hot = false;
    let audio = true;
    let garbled = false;
    let audioBack = 0;
    let garbleEnd = 0;
    let render = -1; // -1 not started, then 0..1
    let mash = 0;
    let over = false;
    const fired = new Set<string>();
    const once = (key: string, fn: () => void) => {
      if (!fired.has(key)) {
        fired.add(key);
        fn();
      }
    };

    k.expose({ clips, picks, hot: () => hot, render: () => render, cw: CW, W: () => k.W, scores: M.map((m) => m.score) });
    const lay = () => {
      const wide = k.W > k.H;
      const slotY = 58;
      const slotH = wide ? 104 : 120;
      const lineH = 150;
      const lineY = k.H - lineH - 14;
      const monY = slotY + slotH + 16;
      return { wide, slotY, slotH, lineY, lineH, monY, monH: lineY - monY - 16 };
    };
    const slot = (n: number) => {
      const { slotY, slotH } = lay();
      const w = Math.min((k.W - 60) / 3, 260);
      const x0 = (k.W - (w * 3 + 24)) / 2;
      return { x: x0 + n * (w + 12), y: slotY, w, h: slotH };
    };
    const fanBox = () => {
      const { monY, monH } = lay();
      return { x: k.W / 2 - 70, y: monY + monH - 92, w: 140, h: 80 };
    };

    const take = (c: Clip) => {
      if (c.taken || picks.length + flying.length >= 3) return;
      c.taken = true;
      const s = slot(picks.length + flying.length);
      flying.push({ i: c.i, x: c.x + CW / 2, y: lay().lineY + 60, tx: s.x + s.w / 2, ty: s.y + s.h / 2, t: 0 });
      k.word(['CUT!', 'KEEP!', 'THAT ONE!'][picks.length + flying.length - 1] ?? 'CUT!', c.x + CW / 2, lay().lineY - 10, YELLOW, 44);
      k.boom();
    };

    const face = (x: number, y: number, score: number, r: number) => {
      g.fillStyle = score > 45 ? YELLOW : score > 36 ? PAPER : '#b9a9e0';
      g.strokeStyle = INK;
      g.lineWidth = 3;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.fillStyle = INK;
      g.beginPath();
      g.arc(x - r * 0.35, y - r * 0.2, r * 0.12, 0, Math.PI * 2);
      g.arc(x + r * 0.35, y - r * 0.2, r * 0.12, 0, Math.PI * 2);
      g.fill();
      g.lineWidth = 3;
      g.beginPath();
      if (score > 45) g.arc(x, y + r * 0.1, r * 0.45, 0.1 * Math.PI, 0.9 * Math.PI);
      else if (score > 36) {
        g.moveTo(x - r * 0.35, y + r * 0.35);
        g.lineTo(x + r * 0.35, y + r * 0.35);
      } else g.arc(x, y + r * 0.6, r * 0.35, 1.15 * Math.PI, 1.85 * Math.PI);
      g.stroke();
    };

    const card = (i: number, x: number, y: number, w: number, h: number, dim = false) => {
      const m = M[i];
      panel(g, x, y, w, h, dim ? '#3a2a5e' : '#14082f', PINK);
      // Film holes.
      g.fillStyle = PAPER;
      for (let hx = x + 8; hx < x + w - 8; hx += 18) {
        g.fillRect(hx, y + 5, 9, 6);
        g.fillRect(hx, y + h - 11, 9, 6);
      }
      face(x + 30, y + 40, m.score, 17);
      // The waveform, unless the audio has died.
      g.fillStyle = audio ? CYAN : '#4a2a90';
      for (let b = 0; b < 12; b++) {
        const amp = audio ? (0.3 + (m.score / 60) * (0.5 + 0.5 * Math.abs(Math.sin(b * 1.7 + i * 3 + k.t * 6)))) * 30 : 2;
        g.fillRect(x + 56 + b * 9, y + 42 - amp / 2, 6, amp);
      }
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.font = `${Math.min(20, w / 8.5)}px ${DISPLAY}`;
      g.fillStyle = PAPER;
      const title = garbled ? T.garbled[i % T.garbled.length] : m.title;
      g.fillText(title.toUpperCase(), x + 10, y + h - 44, w - 20);
      g.font = `18px ${LABEL}`;
      g.fillStyle = '#b9a9e0';
      g.fillText(`${mmss(m.start)} · ${m.end - m.start}s`, x + 10, y + h - 24);
    };

    const pipeline = () => {
      const { monY, monH } = lay();
      const mw = Math.min(k.W - 28, 820);
      const mx = (k.W - mw) / 2;
      panel(g, mx, monY, mw, monH, hot ? '#3a0a16' : '#0f0820');
      // Clipper's real pipeline, one lamp per step.
      const steps = T.steps;
      const sw = (mw - 20) / steps.length;
      steps.forEach((s, i) => {
        const lit = render >= 0 ? i < Math.round(render * steps.length) : i < 5;
        const broken = (i === 0 && garbled) || (i === 1 && !audio) || (i === 4 && hot);
        g.fillStyle = broken ? (Math.floor(k.t * 6) % 2 ? RED : '#5a0a0a') : lit ? GREEN : '#2a0f5e';
        g.fillRect(mx + 10 + i * sw + 3, monY + 12, sw - 6, 26);
        g.font = `${Math.min(17, sw / 5)}px ${LABEL}`;
        g.fillStyle = INK;
        g.textAlign = 'center';
        g.fillText(s, mx + 10 + i * sw + sw / 2, monY + 26);
      });
      // What's going wrong right now.
      const msg = render >= 0 ? (render >= 0.99 && mash < T.mash ? T.frozen : T.rendering) : hot ? T.hot : garbled ? T.captions : !audio ? T.noAudio : T.ok;
      inked(g, msg, k.W / 2, monY + monH * 0.45, lay().wide ? 36 : 28, hot || !audio || garbled ? RED : PAPER);
      if (garbled) {
        g.font = `22px ${HAND}`;
        g.fillStyle = YELLOW;
        g.textAlign = 'center';
        g.fillText(T.subtitle, k.W / 2, monY + monH * 0.45 + 40, mw - 30);
      }
      if (render >= 0) {
        const bw = mw - 80;
        g.fillStyle = '#2a0f5e';
        g.fillRect(mx + 40, monY + monH - 46, bw, 24);
        g.fillStyle = YELLOW;
        g.fillRect(mx + 40, monY + monH - 46, bw * Math.min(render, 1), 24);
        g.strokeStyle = PAPER;
        g.lineWidth = 2;
        g.strokeRect(mx + 40, monY + monH - 46, bw, 24);
        inked(g, `${Math.floor(Math.min(render, 1) * 100)}%`, k.W / 2, monY + monH - 34, 22, PAPER);
      }
      if (hot) {
        const f = fanBox();
        panel(g, f.x, f.y, f.w, f.h, CYAN);
        g.save();
        g.translate(f.x + 40, f.y + f.h / 2);
        g.rotate(k.t * (4 + fan * 6));
        g.fillStyle = INK;
        for (let b = 0; b < 3; b++) {
          g.rotate((Math.PI * 2) / 3);
          g.beginPath();
          g.ellipse(14, 0, 14, 6, 0, 0, Math.PI * 2);
          g.fill();
        }
        g.restore();
        inked(g, `FAN ${fan}/5`, f.x + 98, f.y + f.h / 2, 22, PAPER);
      }
    };

    const startRender = () => {
      if (render >= 0) return;
      render = 0;
      hot = false;
      garbled = false;
      audio = true;
      k.say(T.lines.render);
    };

    return (dt) => {
      const L = lay();
      const playhead = k.W / 2;
      if (!over) {
        // --- The malfunctions ---
        if (render < 0) {
          // Each cut sets off the next breakdown, and the clock does too, so everyone gets all of them.
          const picked = picks.length + flying.length;
          if (k.t > 3.5 || picked >= 1) once('audio', () => {
            audio = false;
            audioBack = k.t + 4;
            k.word('SILENCE!', k.W / 2, L.monY + 60, PAPER, 56);
            k.say(T.lines.audio);
          });
          if (!audio && k.t >= audioBack) audio = true;
          if ((k.t > 9 || picks.length >= 1) && fired.has('audio')) once('captions', () => {
            garbled = true;
            garbleEnd = k.t + 5;
            k.say(T.lines.captions);
          });
          if (garbled && k.t >= garbleEnd) garbled = false;
          if ((k.t > 15 || picks.length >= 2) && fired.has('captions')) once('hot', () => {
            hot = true;
            fan = 0;
            k.word(T.hotWord, k.W / 2, L.monY + 60, RED, 56);
            k.say(T.lines.hot);
          });
        }

        // --- The timeline moves, much faster while the GPU is overheating ---
        const speed = hot ? 260 : 110;
        const loop = M.length * (CW + 26);
        for (const c of clips) {
          c.x -= speed * dt;
          if (c.x < -CW - 20) c.x += loop;
        }
        if (hot) k.shake(0.12);

        // --- Input ---
        for (const tap of k.taps) {
          const f = fanBox();
          if (hot && tap.x >= f.x && tap.x <= f.x + f.w && tap.y >= f.y && tap.y <= f.y + f.h) {
            fan++;
            continue;
          }
          if (render >= 0.99) {
            mash++;
            continue;
          }
          if (tap.y >= L.lineY) {
            const c = clips.find((cl) => !cl.taken && tap.x >= cl.x && tap.x <= cl.x + CW);
            if (c) take(c);
          }
        }
        if (k.pressed('KeyF') && hot) fan++;
        if (k.pressed('Space', 'Enter')) {
          if (render >= 0.99) mash++;
          else if (render < 0) {
            const c = clips.find((cl) => !cl.taken && playhead >= cl.x && playhead <= cl.x + CW);
            if (c) take(c);
          }
        }
        if (hot && fan >= 5) {
          hot = false;
          k.word('COOLED!', k.W / 2, L.monY + 60, CYAN, 56);
          k.say(T.lines.cooled);
        }

        // Clips land in the trailer.
        for (let n = flying.length - 1; n >= 0; n--) {
          const f = flying[n];
          f.t += dt * 2.6;
          if (f.t >= 1) {
            picks.push(f.i);
            flying.splice(n, 1);
          }
        }
        if (picks.length === 3 && render < 0) startRender();
        if (k.t >= LENGTH && render < 0 && !flying.length) {
          // Out of time: the intern fills the rest.
          k.say(T.lines.intern);
          for (const c of clips) if (picks.length < 3 && !c.taken) {
            c.taken = true;
            picks.push(c.i);
          }
          startRender();
        }

        // --- The render, which freezes at 99% until you mash ---
        if (render >= 0) {
          if (render < 0.99) render = Math.min(render + dt * 0.7, 0.99);
          else if (mash >= T.mash) render = Math.min(render + dt * 2, 1.0001);
          if (render > 1) {
            over = true;
            const scores = picks.map((i) => M[i].score);
            const avg = scores.reduce((a, b) => a + b, 0) / 3;
            const verdict = avg >= 42 ? T.reviews[0] : avg >= 37 ? T.reviews[1] : T.reviews[2];
            const panels = picks
              .map((i, n) => `<li><span>${n + 1}</span><b>${M[i].title}</b><i>Clipper score ${M[i].score}</i></li>`)
              .join('');
            k.say(avg >= 37 ? T.lines.good : T.lines.bad);
            k.interrupt(
              `<div class="sfx-trailer"><small>${T.premiere}</small><ol>${panels}</ol><b>${verdict[0]}</b><p>“${verdict[1]}” <em>${T.critic}</em></p></div>`,
              'sfx-dim',
              4200,
              () => k.end({ passed: avg >= 37, headline: `${avg >= 37 ? T.won : T.lost} ${T.twist}` }),
            );
          }
        }
      }

      // --- Draw ---
      g.fillStyle = '#14082f';
      g.fillRect(0, 0, k.W, k.H);
      // HUD.
      g.fillStyle = 'rgba(7,4,14,0.9)';
      g.fillRect(0, 0, k.W, 44);
      g.textBaseline = 'middle';
      g.textAlign = 'left';
      g.font = `26px ${DISPLAY}`;
      g.fillStyle = YELLOW;
      g.fillText(`TRAILER ${picks.length} / 3`, 14, 23);
      g.textAlign = 'right';
      g.fillStyle = PAPER;
      g.fillText(render >= 0 ? 'RENDER' : `${Math.max(0, Math.ceil(LENGTH - k.t))}s`, k.W - 14, 23);
      // The trailer's three slots.
      for (let n = 0; n < 3; n++) {
        const s = slot(n);
        if (picks[n] !== undefined) card(picks[n], s.x, s.y, s.w, s.h);
        else {
          g.setLineDash([10, 8]);
          g.strokeStyle = '#b9a9e0';
          g.lineWidth = 3;
          g.strokeRect(s.x, s.y, s.w, s.h);
          g.setLineDash([]);
          inked(g, `SHOT ${n + 1}`, s.x + s.w / 2, s.y + s.h / 2, 26, '#4a2a90');
        }
      }
      pipeline();
      // The timeline.
      g.fillStyle = '#07040e';
      g.fillRect(0, L.lineY - 8, k.W, L.lineH + 16);
      for (const c of clips) if (c.x < k.W && c.x > -CW) card(c.i, c.x, L.lineY, CW, L.lineH - 4, c.taken);
      g.fillStyle = YELLOW;
      g.fillRect(playhead - 2, L.lineY - 18, 4, L.lineH + 26);
      g.beginPath();
      g.moveTo(playhead - 12, L.lineY - 22);
      g.lineTo(playhead + 12, L.lineY - 22);
      g.lineTo(playhead, L.lineY - 8);
      g.fill();
      for (const f of flying) {
        const e = 1 - (1 - f.t) ** 2;
        const x = f.x + (f.tx - f.x) * e;
        const y = f.y + (f.ty - f.y) * e - Math.sin(f.t * Math.PI) * 120;
        g.save();
        g.translate(x, y);
        g.rotate(f.t * Math.PI * 2);
        card(f.i, -CW / 2, -50, CW, 100);
        g.restore();
      }
      if (hot) {
        g.fillStyle = `rgba(229,50,45,${0.12 + 0.08 * Math.sin(k.t * 10)})`;
        g.fillRect(0, 0, k.W, k.H);
      }

    };
  },
};
