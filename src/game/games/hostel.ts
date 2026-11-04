import data from '../../../content/missions.json';
import { clamp, dist, DISPLAY, GREEN, inked, INK, LABEL, PAPER, PINK, RED, YELLOW, type Game } from '../arcade';

// SolveFX: 2 AM in the hostel, the lights go out, and every verdict comes for you.
// Each hit shows SolveFX's real overlay for that verdict. Five ACCEPTED tokens bring out the boss.

const T = data.arcade.solvefx;

type Kind = 'wa' | 'tle' | 'rte' | 'mle';
interface Foe {
  kind: Kind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hop: number; // seconds to the next teleport
  warnX: number;
  warnY: number;
  gone: number; // seconds until it comes back after being debugged
  size: number;
}

// The real SolveFX screens, one per verdict.
const SCREENS: Record<Kind | 'accepted', [string, string]> = {
  wa: ['<div class="sfx-title"><b>Wrong answer</b><small>So close. Probably.</small></div>', 'sfx-failed'],
  tle: ['<div class="sfx-shutdown">Time\'s up. Shutting down...</div>', 'sfx-black'],
  rte: [
    '<pre class="sfx-crash">A critical error has occurred.\n\nSolveFX has stopped your program\nto prevent further embarrassment.\n\nRUNTIME ERROR\n\nCollecting crash information...\n████████████████████ 100%</pre>',
    'sfx-blue',
  ],
  mle: ['<div class="sfx-dialog"><b>Out of memory</b><p>Your solution asked for more memory than this problem allows.</p><span>OK</span></div>', 'sfx-dim'],
  accepted: ['<div class="sfx-title"><b>Accepted</b><small>All test cases passed</small></div>', 'sfx-passed'],
};

export const hostel: Game = {
  brief: T.brief,
  how: T.how,
  howTouch: T.howTouch,
  start: (k) => {
    const { g } = k;
    const me = { x: k.W / 2, y: k.H / 2 + 60, vx: 0, face: 1, shield: 0, safe: 0 };
    let lives = 3;
    let got = 0;
    let lights = 1;
    let boss: { x: number; y: number; hp: number; dash: number; vx: number; vy: number; hurt: number } | null = null;
    let done = false;
    const foes: Foe[] = [];
    const said = new Set<string>();
    const once = (key: keyof typeof T.lines) => {
      if (said.has(key)) return;
      said.add(key);
      k.say(T.lines[key]);
    };
    const token = { x: 0, y: 0, spin: 0 };
    const placeToken = () => {
      for (let i = 0; i < 30; i++) {
        token.x = 70 + Math.random() * (k.W - 140);
        token.y = 130 + Math.random() * (k.H - 190);
        if (dist(token.x, token.y, me.x, me.y) > 220) break;
      }
    };
    placeToken();
    k.expose({ me, foes, token, boss: () => boss });
    const edge = () => {
      const side = Math.floor(Math.random() * 4);
      return side === 0 ? { x: -60, y: Math.random() * k.H } : side === 1 ? { x: k.W + 60, y: Math.random() * k.H } : side === 2 ? { x: Math.random() * k.W, y: -60 } : { x: Math.random() * k.W, y: k.H + 60 };
    };
    const spawn = (kind: Kind) => {
      const at = edge();
      foes.push({ kind, ...at, vx: 0, vy: 0, hop: 2.4, warnX: 0, warnY: 0, gone: 0, size: kind === 'mle' ? 0.6 : 1 });
      once(kind);
    };
    const schedule: [number, Kind][] = [
      [2.6, 'wa'],
      [6, 'tle'],
      [10, 'rte'],
      [15, 'mle'],
      [21, 'wa'],
    ];

    const hurt = (kind: Kind, fromX: number, fromY: number) => {
      lives -= 1;
      me.safe = 2.2;
      k.shake(1);
      k.boom();
      const away = Math.atan2(me.y - fromY, me.x - fromX);
      me.x = clamp(me.x + Math.cos(away) * 90, 40, k.W - 40);
      me.y = clamp(me.y + Math.sin(away) * 90, 110, k.H - 30);
      if (lives <= 0) {
        done = true;
        k.say(T.lines.dead);
        k.interrupt(SCREENS.tle[0], SCREENS.tle[1], 2200, () => k.end({ passed: false, headline: T.lost }));
        return;
      }
      k.say(T.hits[(3 - lives - 1) % T.hits.length]);
      k.interrupt(SCREENS[kind][0], SCREENS[kind][1], 1100);
    };

    // --- Drawing ---
    const floor = () => {
      g.fillStyle = '#1b1230';
      g.fillRect(0, 0, k.W, k.H);
      g.strokeStyle = '#261a42';
      g.lineWidth = 2;
      for (let x = 0; x < k.W; x += 60) {
        g.beginPath();
        g.moveTo(x, 100);
        g.lineTo(x, k.H);
        g.stroke();
      }
      for (let y = 100; y < k.H; y += 60) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(k.W, y);
        g.stroke();
      }
      // The corridor wall, with numbered rooms.
      g.fillStyle = '#128a99';
      g.fillRect(0, 0, k.W, 100);
      g.fillStyle = INK;
      g.fillRect(0, 96, k.W, 6);
      for (let x = 40, n = 201; x < k.W - 60; x += 150, n++) {
        g.fillStyle = '#0a3f52';
        g.fillRect(x, 22, 64, 76);
        g.strokeStyle = INK;
        g.lineWidth = 4;
        g.strokeRect(x, 22, 64, 76);
        g.fillStyle = n === 204 ? YELLOW : '#0f5a6d';
        g.fillRect(x + 12, 36, 40, 10);
        g.font = `20px ${LABEL}`;
        g.fillStyle = PAPER;
        g.textAlign = 'center';
        g.fillText(String(n), x + 32, 70);
      }
    };
    const eyes = (x: number, y: number, s: number, angry = true) => {
      for (const side of [-1, 1]) {
        g.fillStyle = PAPER;
        g.beginPath();
        g.ellipse(x + side * 12 * s, y, 8 * s, 10 * s, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = INK;
        g.beginPath();
        g.arc(x + side * 12 * s + (me.x > x ? 2 : -2) * s, y + 2 * s, 4 * s, 0, Math.PI * 2);
        g.fill();
        if (angry) {
          g.lineWidth = 4 * s;
          g.strokeStyle = INK;
          g.beginPath();
          g.moveTo(x + side * 4 * s, y - 8 * s);
          g.lineTo(x + side * 20 * s, y - 14 * s);
          g.stroke();
        }
      }
    };
    const drawFoe = (f: Foe, glow: boolean) => {
      const bob = Math.sin(k.t * 6 + f.x) * 4;
      const x = f.x;
      const y = f.y + bob;
      if (f.kind === 'wa') {
        if (!glow) {
          g.fillStyle = RED;
          g.strokeStyle = INK;
          g.lineWidth = 5;
          g.beginPath();
          g.roundRect(x - 92, y - 34, 184, 68, 14);
          g.fill();
          g.stroke();
          // Little teeth along the bottom.
          g.fillStyle = PAPER;
          for (let i = -3; i <= 3; i++) {
            g.beginPath();
            g.moveTo(x + i * 22 - 8, y + 34);
            g.lineTo(x + i * 22 + 8, y + 34);
            g.lineTo(x + i * 22, y + 46);
            g.fill();
          }
        }
        inked(g, 'WRONG ANSWER', x, y + 12, 26, glow ? RED : PAPER);
        eyes(x, y - 14, 0.9);
      } else if (f.kind === 'tle') {
        if (!glow) {
          g.fillStyle = YELLOW;
          g.strokeStyle = INK;
          g.lineWidth = 5;
          g.beginPath();
          g.arc(x, y, 40, 0, Math.PI * 2);
          g.fill();
          g.stroke();
          g.lineWidth = 4;
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x + Math.cos(k.t * 9) * 26, y + Math.sin(k.t * 9) * 26);
          g.stroke();
        }
        inked(g, 'TLE', x, y + 56, 24, glow ? YELLOW : PAPER);
        eyes(x, y - 6, 0.7);
      } else if (f.kind === 'rte') {
        if (f.hop < 0.7) {
          inked(g, '✕', f.warnX, f.warnY, 46, PINK);
        }
        if (!glow) {
          for (let i = 0; i < 3; i++) {
            g.fillStyle = ['#7a2cff', PINK, '#17e4ff'][i];
            g.fillRect(x - 70 + (Math.random() - 0.5) * 10, y - 26 + i * 16, 140, 16);
          }
          g.lineWidth = 4;
          g.strokeStyle = INK;
          g.strokeRect(x - 70, y - 26, 140, 48);
        }
        inked(g, 'RUNTIME ERROR', x, y + 40, 22, glow ? '#b88cff' : PAPER);
        eyes(x, y - 4, 0.75);
      } else {
        const w = 150 * f.size;
        const h = 96 * f.size;
        if (!glow) {
          g.fillStyle = '#d8d2c4';
          g.fillRect(x - w / 2, y - h / 2, w, h);
          g.fillStyle = '#1f3fa0';
          g.fillRect(x - w / 2, y - h / 2, w, 22 * f.size);
          g.lineWidth = 4;
          g.strokeStyle = INK;
          g.strokeRect(x - w / 2, y - h / 2, w, h);
          g.font = `${16 * f.size}px ${LABEL}`;
          g.fillStyle = PAPER;
          g.textAlign = 'left';
          g.fillText('Out of memory', x - w / 2 + 8, y - h / 2 + 15 * f.size);
        }
        eyes(x, y + 8 * f.size, 0.8 * f.size, false);
      }
    };
    const drawMe = () => {
      const img = k.figure(me.shield > 0 ? 'happy' : lives === 1 ? 'shocked' : 'worried');
      const h = 140;
      const w = (img.width / img.height) * h;
      if (me.safe > 0 && Math.floor(k.t * 12) % 2) return;
      g.save();
      g.translate(me.x, me.y);
      if (me.face < 0) g.scale(-1, 1);
      g.rotate(clamp(me.vx / 2000, -0.15, 0.15));
      g.drawImage(img, -w / 2, -h + 20 + Math.abs(Math.sin(k.t * 14)) * (Math.abs(me.vx) > 20 ? -6 : 0), w, h);
      g.restore();
      if (me.shield > 0) {
        g.strokeStyle = GREEN;
        g.lineWidth = 6;
        g.setLineDash([14, 8]);
        g.beginPath();
        g.arc(me.x, me.y - 40, 70, k.t * 3, k.t * 3 + Math.PI * 2);
        g.stroke();
        g.setLineDash([]);
      }
    };
    const drawToken = () => {
      token.spin += 0.1;
      const s = Math.abs(Math.cos(token.spin));
      g.save();
      g.translate(token.x, token.y + Math.sin(k.t * 4) * 5);
      g.scale(0.3 + s * 0.7, 1);
      g.fillStyle = GREEN;
      g.strokeStyle = INK;
      g.lineWidth = 5;
      g.beginPath();
      g.arc(0, 0, 26, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      inked(g, '✓', 0, 2, 30, PAPER);
      g.restore();
      inked(g, 'ACCEPTED', token.x, token.y + 42, 18, GREEN);
    };
    const drawBoss = () => {
      if (!boss) return;
      const r = 70 + boss.hp * 14;
      const x = boss.x;
      const y = boss.y + Math.sin(k.t * 3) * 6;
      g.fillStyle = boss.hurt > 0 && Math.floor(k.t * 20) % 2 ? PAPER : YELLOW;
      g.strokeStyle = INK;
      g.lineWidth = 8;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        g.lineWidth = 5;
        g.beginPath();
        g.moveTo(x + Math.cos(a) * r * 0.82, y + Math.sin(a) * r * 0.82);
        g.lineTo(x + Math.cos(a) * r * 0.95, y + Math.sin(a) * r * 0.95);
        g.stroke();
      }
      g.lineWidth = 7;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(k.t * 14) * r * 0.75, y + Math.sin(k.t * 14) * r * 0.75);
      g.stroke();
      eyes(x, y - r * 0.3, r / 60);
      // A mouth full of teeth.
      g.fillStyle = INK;
      g.beginPath();
      g.ellipse(x, y + r * 0.35, r * 0.45, r * 0.18, 0, 0, Math.PI * 2);
      g.fill();
      inked(g, 'TIME LIMIT EXCEEDED', x, y - r - 22, 30, RED);
    };
    const hud = () => {
      g.fillStyle = 'rgba(7,4,14,0.85)';
      g.fillRect(0, 0, k.W, 44);
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.font = `30px ${DISPLAY}`;
      g.fillStyle = PINK;
      g.fillText('♥'.repeat(Math.max(lives, 0)) + '♡'.repeat(3 - Math.max(lives, 0)), 14, 24);
      g.fillStyle = GREEN;
      g.textAlign = 'right';
      g.fillText(boss ? `BOSS ${'■'.repeat(boss.hp)}` : `✓ ${got} / 5`, k.W - 14, 24);
      g.textAlign = 'center';
      g.font = `24px ${LABEL}`;
      g.fillStyle = PAPER;
      if (k.W > 640) g.fillText(boss ? T.hudBoss : T.hud, k.W / 2, 24);
    };

    return (dt) => {
      // Lights out, two seconds in.
      if (k.t > 1.6 && k.t < 2.3) lights = Math.floor(k.t * 14) % 2 ? 1 : 0.2;
      else if (k.t >= 2.3) {
        if (lights > 0.05) {
          k.word('CLICK.', k.W / 2, k.H / 2 - 40, PAPER, 60);
          once('dark');
        }
        lights = 0;
      }
      for (const [at, kind] of schedule) if (!boss && k.t >= at && k.t - dt < at) spawn(kind);

      // --- You ---
      if (!done) {
        let { x: sx, y: sy } = k.stick();
        if (k.pointer.down) {
          const d = dist(k.pointer.x, k.pointer.y, me.x, me.y - 40);
          if (d > 14) {
            sx = (k.pointer.x - me.x) / d;
            sy = (k.pointer.y - (me.y - 40)) / d;
          }
        }
        const len = Math.hypot(sx, sy) || 1;
        const speed = 320;
        me.vx = (sx / len) * speed * (sx || sy ? 1 : 0);
        const vy = (sy / len) * speed * (sx || sy ? 1 : 0);
        me.x = clamp(me.x + me.vx * dt, 40, k.W - 40);
        me.y = clamp(me.y + vy * dt, 150, k.H - 20);
        if (Math.abs(me.vx) > 5) me.face = Math.sign(me.vx);
        me.shield = Math.max(me.shield - dt, 0);
        me.safe = Math.max(me.safe - dt, 0);

        if (dist(me.x, me.y - 40, token.x, token.y) < 56) {
          got += boss ? 0 : 1;
          me.shield = 3.5;
          k.word(boss ? 'SHIELD!' : 'ACCEPTED!', token.x, token.y - 30, GREEN, 48);
          once('shield');
          placeToken();
          if (got >= 5 && !boss) {
            // The boss arrives and chases everyone else off.
            boss = { x: k.W / 2, y: -140, hp: 3, dash: 3, vx: 0, vy: 0, hurt: 0 };
            foes.length = 0;
            k.shake(1.2);
            k.boom();
            k.word('BOSS FIGHT!', k.W / 2, k.H / 2, RED, 80);
            k.say(T.lines.boss);
          }
        }

        // --- The verdicts ---
        for (const f of foes) {
          if (f.gone > 0) {
            f.gone -= dt;
            if (f.gone <= 0) Object.assign(f, edge());
            continue;
          }
          const dx = me.x - f.x;
          const dy = me.y - 40 - f.y;
          const d = Math.hypot(dx, dy) || 1;
          if (f.kind === 'wa') {
            const v = Math.min(105 + k.t * 2.5, 190);
            f.x += (dx / d) * v * dt;
            f.y += (dy / d) * v * dt;
          } else if (f.kind === 'tle') {
            const v = Math.min(60 + k.t * 7, 300);
            f.vx += ((dx / d) * v - f.vx) * dt * 2;
            f.vy += ((dy / d) * v - f.vy) * dt * 2;
            f.x += f.vx * dt;
            f.y += f.vy * dt;
          } else if (f.kind === 'rte') {
            f.hop -= dt;
            if (f.hop < 0.7 && !f.warnX) {
              f.warnX = clamp(me.x + (Math.random() - 0.5) * 260, 60, k.W - 60);
              f.warnY = clamp(me.y - 40 + (Math.random() - 0.5) * 200, 150, k.H - 40);
            }
            if (f.hop <= 0) {
              f.x = f.warnX;
              f.y = f.warnY;
              f.warnX = 0;
              f.hop = 2.2 + Math.random();
              k.word('ZAP!', f.x, f.y - 50, '#b88cff', 40);
            }
            f.x += (dx / d) * 40 * dt;
            f.y += (dy / d) * 40 * dt;
          } else {
            f.size = Math.min(f.size + dt * 0.05, 1.9);
            f.x += (dx / d) * 55 * dt;
            f.y += (dy / d) * 55 * dt;
          }
          const reach = f.kind === 'mle' ? 60 * f.size : f.kind === 'wa' ? 70 : 46;
          if (d < reach) {
            if (me.shield > 0) {
              f.gone = 3;
              f.x = -999;
              k.word('DEBUGGED!', me.x, me.y - 120, GREEN, 50);
              k.shake(0.5);
              k.boom();
            } else if (me.safe <= 0) hurt(f.kind, f.x, f.y);
          }
        }

        // --- The boss ---
        if (boss) {
          boss.hurt = Math.max(boss.hurt - dt, 0);
          if (boss.y < 120) boss.y += 160 * dt;
          const dx = me.x - boss.x;
          const dy = me.y - 40 - boss.y;
          const d = Math.hypot(dx, dy) || 1;
          boss.dash -= dt;
          if (boss.dash <= 0) {
            boss.dash = 3.2;
            boss.vx = (dx / d) * 620;
            boss.vy = (dy / d) * 620;
            k.word('TICK TOCK!', boss.x, boss.y - 140, YELLOW, 44);
          }
          boss.vx *= 1 - dt * 2.2;
          boss.vy *= 1 - dt * 2.2;
          boss.x = clamp(boss.x + ((dx / d) * 80 + boss.vx) * dt, 80, k.W - 80);
          boss.y = clamp(boss.y + ((dy / d) * 80 + boss.vy) * dt, 60, k.H - 60);
          const r = 70 + boss.hp * 14;
          if (d < r + 30) {
            if (me.shield > 0 && boss.hurt <= 0) {
              boss.hp -= 1;
              boss.hurt = 1;
              me.shield = 0;
              k.shake(1.3);
              k.boom();
              k.word(T.bossHits[2 - boss.hp] ?? 'BONK!', boss.x, boss.y, PAPER, 56);
              boss.vx = (-dx / d) * 500;
              boss.vy = (-dy / d) * 500;
              if (boss.hp <= 0) {
                done = true;
                k.say(T.lines.won);
                k.interrupt(SCREENS.accepted[0], SCREENS.accepted[1], 2400, () => k.end({ passed: true, headline: T.won }));
              }
            } else if (me.safe <= 0 && boss.hurt <= 0) hurt('tle', boss.x, boss.y);
          }
        }
      }

      // --- Draw ---
      floor();
      drawToken();
      for (const f of foes) if (f.gone <= 0) drawFoe(f, false);
      drawMe();
      // The dark, with a pool of light round the player. Monsters' eyes and words still glow through.
      const dark = 1 - lights;
      if (dark > 0) {
        const r = g.createRadialGradient(me.x, me.y - 40, 70, me.x, me.y - 40, 250);
        r.addColorStop(0, 'rgba(7,4,14,0)');
        r.addColorStop(1, `rgba(7,4,14,${0.93 * dark})`);
        g.fillStyle = r;
        g.fillRect(0, 0, k.W, k.H);
        for (const f of foes) if (f.gone <= 0) drawFoe(f, true);
        drawToken();
      }
      drawBoss();
      hud();
    };
  },
};
