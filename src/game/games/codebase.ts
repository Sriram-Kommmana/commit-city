import data from '../../../content/missions.json';
import { clamp, CYAN, DISPLAY, GREEN, inked, INK, LABEL, PAPER, PINK, RED, YELLOW, type Game } from '../arcade';

// RepoMind: the codebase is a building with one floor per layer. Bad commits drop bugs on the roof,
// and the bugs drill shortcuts that skip a layer, which is exactly what RepoMind calls drift.
// Squash bugs, repair shortcuts, and keep the building standing until the clock runs out.

const T = data.arcade['repomind-ai'];
const FLOORS = ['ROUTERS', 'SERVICES', 'REPOSITORIES'];
const COLS = ['sales', 'products', 'users'];
const LENGTH = 36;

interface Bug {
  floor: number;
  x: number;
  vx: number;
  col: number;
  drill: number; // seconds spent drilling a shortcut
  fall: number; // y offset while falling onto the roof
}
interface Meteor {
  x: number;
  y: number;
  text: string;
  big: boolean;
}

export const codebase: Game = {
  brief: T.brief,
  how: T.how,
  howTouch: T.howTouch,
  start: (k) => {
    const { g } = k;
    let health = 100;
    let floor = 0;
    let x = k.W / 2;
    let face = 1;
    let jump = 0;
    let goal: { x: number; floor: number } | null = null;
    const bugs: Bug[] = [];
    const meteors: Meteor[] = [];
    const links = [0, 0, 0]; // repair progress needed per column; >0 means a shortcut exists
    const fixing = [0, 0, 0];
    const debris: { x: number; y: number; vx: number; vy: number; c: string }[] = [];
    let nextCommit = 2;
    let commit = 0;
    let twist = false;
    let over = false;
    let squashed = 0;
    let burning = false;

    k.expose({ bugs, links, me: () => ({ x, floor, health }), geo: () => geo() });
    const geo = () => {
      const bw = Math.min(k.W - 40, 860);
      const bx = (k.W - bw) / 2;
      const fh = Math.min((k.H - 160) / 3, 190);
      const top = Math.max(120, (k.H - fh * 3) / 2 + 10);
      return { bx, bw, top, fh, colX: (c: number) => bx + (bw * (c + 0.5)) / 3, floorY: (f: number) => top + fh * (f + 1) - 8 };
    };
    const drop = (text: string, big = false) => {
      const { bx, bw } = geo();
      meteors.push({ x: bx + 60 + Math.random() * (bw - 120), y: -60, text, big });
    };

    const tilt = () => ((100 - health) / 100) * 0.07 * Math.sin(k.t * 1.7);

    const drawBuilding = () => {
      const { bx, bw, top, fh, colX, floorY } = geo();
      g.save();
      g.translate(k.W / 2, k.H);
      g.rotate(tilt());
      g.translate(-k.W / 2, -k.H);
      // Roof.
      g.fillStyle = INK;
      g.fillRect(bx - 10, top - 14, bw + 20, 14);
      inked(g, 'SHOPWISE / main', bx + 120, top - 30, 24, CYAN);
      for (let f = 0; f < 3; f++) {
        const y = top + fh * f;
        g.fillStyle = ['#2a0f5e', '#14326b', '#0d3b33'][f];
        g.fillRect(bx, y, bw, fh);
        g.strokeStyle = INK;
        g.lineWidth = 5;
        g.strokeRect(bx, y, bw, fh);
        g.font = `22px ${LABEL}`;
        g.fillStyle = PAPER;
        g.textAlign = 'left';
        g.textBaseline = 'middle';
        g.fillText(FLOORS[f], bx + 12, y + 18);
        // One room per module.
        for (let c = 0; c < 3; c++) {
          const cx = colX(c);
          g.fillStyle = f === 0 ? YELLOW : f === 1 ? PAPER : '#1f6e4a';
          g.fillRect(cx - 56, y + fh * 0.32, 112, fh * 0.3);
          g.lineWidth = 3;
          g.strokeStyle = INK;
          g.strokeRect(cx - 56, y + fh * 0.32, 112, fh * 0.3);
          g.font = `18px ${LABEL}`;
          g.fillStyle = f === 2 ? PAPER : INK;
          g.textAlign = 'center';
          g.fillText(f === 1 ? `${COLS[c]}Service` : f === 2 ? `${COLS[c]}Repo` : `/${COLS[c]}`, cx, y + fh * 0.47);
        }
        // The floor slab.
        g.fillStyle = INK;
        g.fillRect(bx, floorY(f), bw, 8);
      }
      // Healthy connections, one layer to the next.
      for (let c = 0; c < 3; c++) {
        const cx = colX(c);
        g.strokeStyle = GREEN;
        g.lineWidth = 5;
        for (let f = 0; f < 2; f++) {
          g.beginPath();
          g.moveTo(cx + 10, top + fh * f + fh * 0.62);
          g.lineTo(cx + 10, top + fh * (f + 1) + fh * 0.32);
          g.stroke();
        }
        // A drilled shortcut: the router reaching straight into the repository.
        if (links[c] > 0) {
          g.strokeStyle = Math.floor(k.t * 8) % 2 ? RED : '#ff7b6b';
          g.lineWidth = 8;
          g.setLineDash([12, 8]);
          g.beginPath();
          g.moveTo(cx - 30, top + fh * 0.62);
          g.bezierCurveTo(cx - 110, top + fh * 1.2, cx - 110, top + fh * 1.9, cx - 30, top + fh * 2.32);
          g.stroke();
          g.setLineDash([]);
          if (fixing[c] > 0) {
            g.strokeStyle = GREEN;
            g.lineWidth = 6;
            g.beginPath();
            g.arc(cx - 84, top + fh * 1.5, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * fixing[c]);
            g.stroke();
          }
        }
      }
      // Fire, once the health is low.
      if (health < 55) {
        for (let i = 0; i < 8; i++) {
          const fx = bx + ((i * 137) % bw);
          const fy = top + fh * ((i % 3) + 0.95);
          const hgt = 18 + Math.abs(Math.sin(k.t * 9 + i)) * 22;
          g.fillStyle = i % 2 ? '#ff5a2e' : YELLOW;
          g.beginPath();
          g.moveTo(fx - 12, fy);
          g.lineTo(fx, fy - hgt);
          g.lineTo(fx + 12, fy);
          g.fill();
        }
      }
      // Bugs.
      for (const b of bugs) {
        const y = floorY(b.floor) - 16 - b.fall;
        const legs = Math.floor(k.t * 12) % 2;
        g.fillStyle = RED;
        g.strokeStyle = INK;
        g.lineWidth = 3;
        g.beginPath();
        g.ellipse(b.x, y, 27, 18, 0, 0, Math.PI * 2);
        g.fill();
        g.stroke();
        for (let l = -1; l <= 1; l++) {
          g.beginPath();
          g.moveTo(b.x + l * 12, y + 10);
          g.lineTo(b.x + l * 12 + (legs ? 8 : -8), y + 22);
          g.stroke();
        }
        g.fillStyle = PAPER;
        g.beginPath();
        g.arc(b.x + 7 * Math.sign(b.vx || 1), y - 4, 5, 0, Math.PI * 2);
        g.fill();
        if (b.drill > 0) inked(g, 'BZZZT', b.x, y - 30, 18, YELLOW);
      }
      // You.
      const img = k.figure(health < 40 ? 'shocked' : 'worried');
      const h = Math.min(geo().fh * 0.95, 132);
      const w = (img.width / img.height) * h;
      const py = floorY(floor) - Math.sin(Math.min(jump, 1) * Math.PI) * 40;
      g.save();
      g.translate(x, py);
      if (face < 0) g.scale(-1, 1);
      g.drawImage(img, -w / 2, -h + 4, w, h);
      g.restore();
      g.restore();
    };

    const drawHud = () => {
      g.fillStyle = 'rgba(7,4,14,0.9)';
      g.fillRect(0, 0, k.W, 44);
      g.textBaseline = 'middle';
      g.textAlign = 'left';
      g.font = `26px ${DISPLAY}`;
      g.fillStyle = health > 70 ? GREEN : health > 40 ? YELLOW : RED;
      g.fillText(`HEALTH ${health.toFixed(1)}`, 14, 23);
      g.textAlign = 'right';
      g.fillStyle = PAPER;
      g.fillText(`${Math.max(0, Math.ceil(LENGTH - k.t))}s`, k.W - 14, 23);
      g.textAlign = 'center';
      g.font = `22px ${LABEL}`;
      if (k.W > 640) g.fillText(T.hud, k.W / 2, 23);
      // The commit feed: real commit messages from the demo repo.
      for (const m of meteors) {
        g.fillStyle = m.big ? RED : PINK;
        g.strokeStyle = INK;
        g.lineWidth = 4;
        g.beginPath();
        g.arc(m.x, m.y, m.big ? 34 : 20, 0, Math.PI * 2);
        g.fill();
        g.stroke();
        g.fillStyle = 'rgba(255,90,46,0.6)';
        g.beginPath();
        g.moveTo(m.x - 14, m.y - 18);
        g.lineTo(m.x, m.y - (m.big ? 120 : 70));
        g.lineTo(m.x + 14, m.y - 18);
        g.fill();
        inked(g, m.text, clamp(m.x, 160, k.W - 160), m.y - (m.big ? 52 : 34), m.big ? 26 : 18, m.big ? RED : PAPER);
      }
      for (const d of debris) {
        g.fillStyle = d.c;
        g.fillRect(d.x, d.y, 10, 10);
      }
    };

    return (dt) => {
      const { bx, bw, colX, floorY } = geo();
      if (!over) {
        // --- Moving: left and right on a floor, up and down the stairs ---
        const s = k.stick();
        for (const tap of k.taps) {
          const f = clamp(Math.floor((tap.y - geo().top) / geo().fh), 0, 2);
          goal = { x: clamp(tap.x, bx + 30, bx + bw - 30), floor: f };
        }
        if (s.x || s.y) goal = null;
        let vx = s.x * 340;
        if (jump <= 0) {
          if (k.pressed('ArrowUp', 'KeyW') && floor > 0) {
            floor -= 1;
            jump = 1;
          } else if (k.pressed('ArrowDown', 'KeyS') && floor < 2) {
            floor += 1;
            jump = 1;
          } else if (goal) {
            if (goal.floor !== floor) {
              floor += Math.sign(goal.floor - floor);
              jump = 1;
            } else if (Math.abs(goal.x - x) > 8) vx = Math.sign(goal.x - x) * 360;
            else goal = null;
          }
        }
        jump = Math.max(jump - dt * 4, 0);
        x = clamp(x + vx * dt, bx + 30, bx + bw - 30);
        if (Math.abs(vx) > 1) face = Math.sign(vx);

        // --- Commits fall from the sky ---
        nextCommit -= dt;
        if (nextCommit <= 0) {
          nextCommit = Math.max(3 - k.t * 0.07, 1.25);
          drop(T.commits[commit++ % T.commits.length]);
        }
        if (!twist && k.t > 15) {
          // The plot twist.
          twist = true;
          drop(T.force, true);
          k.say(T.lines.force);
        }
        for (let i = meteors.length - 1; i >= 0; i--) {
          const m = meteors[i];
          m.y += (m.big ? 260 : 330) * dt;
          if (m.y >= geo().top - 10) {
            meteors.splice(i, 1);
            k.shake(m.big ? 1.4 : 0.4);
            k.boom();
            const n = m.big ? 5 : k.t > 12 ? 2 : 1;
            for (let b = 0; b < n; b++) bugs.push({ floor: 0, x: m.x + (b - n / 2) * 40, vx: (Math.random() < 0.5 ? -1 : 1) * 70, col: Math.floor(Math.random() * 3), drill: 0, fall: 40 });
            if (m.big) {
              links[Math.floor(Math.random() * 3)] = 1;
              health -= 7.4;
              k.word('PUSH --FORCE!', m.x, geo().top + 40, RED, 52);
            }
          }
        }

        // --- Bugs walk to a module and drill a shortcut down through the services floor ---
        for (let i = bugs.length - 1; i >= 0; i--) {
          const b = bugs[i];
          b.fall = Math.max(b.fall - dt * 160, 0);
          const tx = colX(b.col) - 30;
          if (b.drill > 0 || Math.abs(tx - b.x) < 6) {
            b.drill += dt;
            if (b.drill > 2.2) {
              // Through: a router now calls a repository directly.
              if (links[b.col] <= 0) {
                k.word(T.violation, colX(b.col), geo().top + 60, RED, 40);
                k.say(T.lines.violation);
              }
              links[b.col] = 1;
              health -= 7.4;
              bugs.splice(i, 1);
              k.shake(0.6);
              continue;
            }
          } else b.x += Math.sign(tx - b.x) * Math.abs(b.vx) * dt;
          // Squashed if you reach it on its floor.
          if (b.floor === floor && Math.abs(b.x - x) < 34 && jump < 0.5) {
            bugs.splice(i, 1);
            squashed++;
            k.word(squashed === 1 ? 'SQUASH!' : ['SPLAT!', 'GOTCHA!', 'SQUISH!'][squashed % 3], x, floorY(floor) - 90, GREEN, 46);
            k.boom();
            for (let d = 0; d < 8; d++) debris.push({ x, y: floorY(floor) - 20, vx: (Math.random() - 0.5) * 400, vy: -Math.random() * 400, c: RED });
          }
        }

        // --- Shortcuts leak health until someone repairs them on the services floor ---
        for (let c = 0; c < 3; c++) {
          if (links[c] <= 0) continue;
          health -= dt * 1.6;
          const near = floor === 1 && Math.abs(x - (colX(c) - 70)) < 60;
          fixing[c] = near ? fixing[c] + dt / 0.8 : Math.max(fixing[c] - dt, 0);
          if (fixing[c] >= 1) {
            links[c] = 0;
            fixing[c] = 0;
            health = Math.min(health + 7.4, 100);
            k.word(T.refactor, colX(c), floorY(1) - 100, CYAN, 46);
          }
        }
        health = clamp(health, 0, 100);
        if (health < 50) {
          k.shake(0.15);
          if (Math.random() < dt * 3) debris.push({ x: bx + Math.random() * bw, y: geo().top, vx: (Math.random() - 0.5) * 80, vy: 0, c: '#4a2a90' });
        }
        if (health < 60 && !burning) {
          burning = true;
          k.say(T.lines.burning);
        }

        if (health <= 0) {
          over = true;
          k.say(T.lines.collapse);
          k.shake(2);
          k.boom();
          k.interrupt(`<div class="sfx-paper sfx-paper--rm"><small>RepoMind</small><b>${T.collapseHead}</b><p>${T.collapseSub}</p></div>`, 'sfx-dim', 3200, () =>
            k.end({ passed: false, headline: T.lost }),
          );
        } else if (k.t >= LENGTH) {
          over = true;
          k.say(T.lines.won);
          const open = links.filter((l) => l > 0).length;
          k.interrupt(
            `<div class="sfx-paper sfx-paper--rm"><small>RepoMind · architecture report</small><b>${T.wonHead}</b><ul><li>Health <i>${health.toFixed(1)}</i></li><li>Bugs squashed <i>${squashed}</i></li><li>Shortcuts left open <i>${open}</i></li></ul><p>${T.wonSub}</p></div>`,
            'sfx-dim',
            3800,
            () => k.end({ passed: true, headline: T.won }),
          );
        }
      }
      for (let i = debris.length - 1; i >= 0; i--) {
        const d = debris[i];
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.vy += 900 * dt;
        if (d.y > k.H + 20) debris.splice(i, 1);
      }

      // --- Draw ---
      g.fillStyle = '#14082f';
      g.fillRect(0, 0, k.W, k.H);
      g.fillStyle = '#1b1230';
      for (let i = 0; i < 12; i++) g.fillRect(((i * 97) % k.W) - 20, 70 + (i % 4) * 40, 60, k.H);
      drawBuilding();
      drawHud();
    };
  },
};
