import data from '../../../content/missions.json';
import { clamp, CYAN, DISPLAY, GREEN, HAND, inked, INK, LABEL, panel, PAPER, PINK, RED, YELLOW, type Game } from '../arcade';

// IPL Auction: you hold the hammer, and nine AI franchises have lost their minds.
// Tap any bid flashing red (a franchise bidding money it doesn't have). Bring the hammer down on "going twice".

const T = data.arcade['ipl-auction'];

interface Team {
  name: string;
  persona: string;
  purse: number;
  up: number; // paddle raised, seconds
  bad: number; // seconds left to reject an illegal bid
  badBid: number;
}

type Phase = 'open' | 'once' | 'twice' | 'sold' | 'break' | 'riot';

export const auction: Game = {
  brief: T.brief,
  how: T.how,
  howTouch: T.howTouch,
  start: (k) => {
    const { g } = k;
    const teams: Team[] = T.teams.map(([name, persona]) => ({ name, persona, purse: 20, up: 0, bad: 0, badBid: 0 }));
    let lot = 0;
    let bid = T.lots[0].base;
    let leader = -1;
    let phase: Phase = 'break';
    let clock = 1.2; // time left in the current phase
    let nextBid = 0.8;
    let chaos = 0;
    let quiet = 0; // seconds since the last bid
    let freeze = 0;
    let hammer = 0; // the gavel swing, 0..1
    let visitor = 0; // the last lot's surprise paddle
    const fired = new Set<string>();
    const sales: { name: string; team: string; price: number }[] = [];
    let confetti: { x: number; y: number; vx: number; vy: number; c: string }[] = [];

    const shout = (text: string, color = YELLOW) => {
      k.word(text, k.W / 2, k.H * (0.36 + Math.random() * 0.14), color, 54);
      k.shake(0.5);
    };
    const L = () => T.lots[lot];
    const raise = (i: number, amount: number) => {
      const t = teams[i];
      const next = Math.round((bid + amount) * 2) / 2;
      t.up = 0.9;
      if (next > t.purse) {
        // Bidding money it doesn't have. It never becomes the price: the auctioneer has to catch it.
        t.bad = 1.7;
        t.badBid = next;
        const b = teamBox(i);
        k.word(T.overflow, b.x + b.w / 2, b.y - 6, RED, 34);
        return;
      } else {
        bid = next;
        leader = i;
      }
      quiet = 0;
      if (phase === 'once' || phase === 'twice') phase = 'open';
    };
    const randomTeam = (except = -1) => {
      let i = Math.floor(Math.random() * teams.length);
      if (i === except) i = (i + 1) % teams.length;
      return i;
    };
    const startLot = () => {
      bid = L().base;
      leader = -1;
      phase = 'open';
      quiet = 0;
      nextBid = 0.5;
      fired.clear();
      k.say(L().say);
    };
    const sell = () => {
      phase = 'sold';
      hammer = 1;
      k.shake(1.2);
      k.boom();
      const toVisitor = visitor > 0;
      const team = toVisitor ? T.you : leader >= 0 ? teams[leader].name : T.nobody;
      if (!toVisitor && leader >= 0) teams[leader].purse = Math.max(teams[leader].purse - bid, 0);
      sales.push({ name: L().name, team, price: bid });
      k.word('SOLD!', k.W / 2, k.H * 0.36, YELLOW, 96);
      for (let i = 0; i < 60; i++) confetti.push({ x: k.W / 2, y: k.H * 0.3, vx: (Math.random() - 0.5) * 900, vy: -Math.random() * 700, c: [YELLOW, PINK, CYAN, GREEN][i % 4] });
      clock = 2.4;
    };

    // Scripted chaos, per lot, at seconds into the bidding.
    const events = (t: number) => {
      const at = (key: string, when: number, fn: () => void) => {
        if (t >= when && !fired.has(key)) {
          fired.add(key);
          fn();
        }
      };
      if (lot === 0) {
        at('overflow', 3.5, () => raise(7, 30));
      } else if (lot === 1) {
        at('mind', 2, () => {
          // The funniest moment: an AI franchise throws almost its whole purse at one player.
          shout(T.lostMind);
          teams[1].up = 1.5;
          bid = Math.round(teams[1].purse * 0.95 * 2) / 2;
          leader = 1;
          quiet = 0;
          k.say(T.lines.mind);
        });
        at('rtm', 3.2, () => {
          shout(T.rtm, CYAN);
          raise(4, 0.5);
        });
        at('lag', 4.4, () => {
          shout(T.lag, PINK);
          freeze = 1.1;
        });
      } else {
        at('war', 1.2, () => {
          shout(T.war, RED);
          for (const i of [2, 5, 8]) raise(i, 25 + i);
          k.say(T.lines.war);
        });
        at('visitor', 7, () => {
          // A tenth paddle, from outside the room.
          visitor = 1;
          shout(T.visitor, GREEN);
          bid = 999;
          leader = -1;
          quiet = 0;
          k.say(T.lines.visitor);
        });
      }
    };

    // --- Drawing ---
    const layout = () => {
      const wide = k.W > k.H;
      const top = 54;
      const lotH = wide ? 150 : 170;
      const gridY = top + lotH + 18;
      const gavelH = wide ? 96 : 120;
      const gridH = k.H - gridY - gavelH - 26;
      return { wide, top, lotH, gridY, gridH, gavelY: k.H - gavelH - 8, gavelH };
    };
    const teamBox = (i: number) => {
      const { gridY, gridH } = layout();
      const cols = 3;
      const gap = 12;
      const w = (k.W - 28 - gap * (cols - 1)) / cols;
      const h = (gridH - gap * 2) / 3;
      return { x: 14 + (i % cols) * (w + gap), y: gridY + Math.floor(i / cols) * (h + gap), w, h };
    };
    const draw = () => {
      const lay = layout();
      // The hall.
      g.fillStyle = '#14082f';
      g.fillRect(0, 0, k.W, k.H);
      g.fillStyle = '#1f9d57';
      g.fillRect(0, lay.gridY - 10, k.W, k.H);
      for (let y = lay.gridY; y < k.H; y += 26) {
        g.fillStyle = (y / 26) % 2 < 1 ? '#178a49' : '#1f9d57';
        g.fillRect(0, y, k.W, 13);
      }
      // HUD: lot number and the chaos meter.
      g.fillStyle = 'rgba(7,4,14,0.9)';
      g.fillRect(0, 0, k.W, 44);
      g.textBaseline = 'middle';
      g.textAlign = 'left';
      g.font = `26px ${DISPLAY}`;
      g.fillStyle = YELLOW;
      g.fillText(`LOT ${lot + 1} / ${T.lots.length}`, 14, 23);
      const mw = Math.min(300, k.W * 0.4);
      g.fillStyle = PAPER;
      g.font = `22px ${LABEL}`;
      g.textAlign = 'right';
      g.fillText('CHAOS', k.W - mw - 24, 23);
      g.fillStyle = '#2a0f5e';
      g.fillRect(k.W - mw - 14, 12, mw, 22);
      g.fillStyle = chaos > 70 ? RED : PINK;
      g.fillRect(k.W - mw - 14, 12, (mw * chaos) / 100, 22);
      g.strokeStyle = PAPER;
      g.lineWidth = 2;
      g.strokeRect(k.W - mw - 14, 12, mw, 22);

      // The lot on the block.
      const L0 = T.lots[Math.min(lot, T.lots.length - 1)];
      const lw = Math.min(k.W - 28, 760);
      const lx = (k.W - lw) / 2;
      panel(g, lx, lay.top, lw, lay.lotH, PAPER, PINK);
      g.textAlign = 'left';
      g.fillStyle = INK;
      g.font = `20px ${LABEL}`;
      g.fillText(`${L0.role} · rating ${L0.rating} · base ₹${L0.base} Cr`, lx + 16, lay.top + 22);
      g.font = `${lay.wide ? 46 : 38}px ${DISPLAY}`;
      g.fillText(L0.name.toUpperCase(), lx + 16, lay.top + 64);
      const big = visitor ? 'PRICELESS' : `₹${bid} CR`;
      g.font = `${lay.wide ? 54 : 44}px ${DISPLAY}`;
      g.textAlign = 'right';
      g.fillStyle = visitor ? GREEN : phase === 'twice' ? RED : INK;
      g.fillText(big, lx + lw - 16, lay.top + (lay.wide ? 70 : 112));
      g.textAlign = 'left';
      g.font = `24px ${HAND}`;
      g.fillStyle = INK;
      const who = visitor ? T.you : leader >= 0 ? teams[leader].name : T.noBids;
      const state = phase === 'once' ? T.once : phase === 'twice' ? T.twice : phase === 'sold' ? 'SOLD!' : '';
      g.fillText(`${who}${state ? ` · ${state}` : ''}`, lx + 16, lay.top + lay.lotH - 22);

      // The franchises.
      teams.forEach((t, i) => {
        const b = teamBox(i);
        const lift = t.up > 0 ? -8 : 0;
        const flash = t.bad > 0 && Math.floor(k.t * 8) % 2 === 0;
        panel(g, b.x, b.y + lift, b.w, b.h, t.bad > 0 ? (flash ? RED : '#ffb0b0') : i === leader ? YELLOW : PAPER);
        g.textAlign = 'left';
        g.fillStyle = INK;
        g.font = `${Math.min(24, b.h * 0.3)}px ${DISPLAY}`;
        g.fillText(`${i + 1}. ${t.name}`, b.x + 10, b.y + lift + b.h * 0.3, b.w - 20);
        g.font = `${Math.min(18, b.h * 0.22)}px ${LABEL}`;
        g.fillText(t.bad > 0 ? `BIDS ₹${t.badBid} · HAS ₹${t.purse}!` : `${t.persona} · ₹${t.purse} Cr left`, b.x + 10, b.y + lift + b.h * 0.62, b.w - 20);
        // The purse bar.
        g.fillStyle = '#2a0f5e';
        g.fillRect(b.x + 10, b.y + lift + b.h - 14, b.w - 20, 6);
        g.fillStyle = GREEN;
        g.fillRect(b.x + 10, b.y + lift + b.h - 14, ((b.w - 20) * t.purse) / 20, 6);
        if (t.up > 0) inked(g, t.bad > 0 ? 'TAP TO REJECT' : `₹${bid}`, b.x + b.w - 50, b.y + lift - 4, 22, t.bad > 0 ? RED : YELLOW);
      });

      // The gavel.
      const gy = lay.gavelY;
      const gw = Math.min(k.W - 28, 520);
      const gx = (k.W - gw) / 2;
      const ready = phase === 'twice';
      panel(g, gx, gy, gw, lay.gavelH - 10, ready ? (Math.floor(k.t * 6) % 2 ? YELLOW : PINK) : '#3a2a5e');
      g.save();
      g.translate(gx + 70, gy + lay.gavelH / 2 - 4);
      g.rotate(-0.6 + hammer * 0.9);
      g.fillStyle = '#8a4b2a';
      g.fillRect(-6, -10, 12, 60);
      g.fillStyle = '#5a2f17';
      g.fillRect(-28, -34, 56, 26);
      g.strokeStyle = INK;
      g.lineWidth = 3;
      g.strokeRect(-28, -34, 56, 26);
      g.restore();
      inked(g, ready ? T.hit : phase === 'once' ? T.once : T.hammer, gx + gw / 2 + 30, gy + lay.gavelH / 2 - 4, lay.wide ? 40 : 34, ready ? PAPER : '#b9a9e0');

      // Confetti.
      for (const c of confetti) {
        g.fillStyle = c.c;
        g.fillRect(c.x, c.y, 9, 14);
      }
      if (freeze > 0) {
        g.fillStyle = 'rgba(7,4,14,0.55)';
        g.fillRect(0, 0, k.W, k.H);
        inked(g, T.reconnecting, k.W / 2, k.H / 2, 40, PAPER);
      }
    };

    const tapTeam = (x: number, y: number) => {
      for (let i = 0; i < teams.length; i++) {
        const b = teamBox(i);
        if (x >= b.x && x <= b.x + b.w && y >= b.y - 10 && y <= b.y + b.h) return i;
      }
      return -1;
    };
    const reject = (i: number) => {
      const t = teams[i];
      if (t.bad <= 0) {
        // Rejecting an honest bid is its own kind of chaos.
        chaos = clamp(chaos + 6, 0, 100);
        k.word(T.honest, k.W / 2, k.H * 0.5, PINK, 36);
        return;
      }
      t.bad = 0;
      t.up = 0;
      k.word('REJECTED!', k.W / 2, k.H * 0.5, GREEN, 56);
      k.boom();
    };
    const gavel = () => {
      if (phase === 'twice') {
        sell();
      } else if (phase === 'open' || phase === 'once') {
        // Too early: the room erupts.
        hammer = 0.6;
        chaos = clamp(chaos + 12, 0, 100);
        shout(T.early, RED);
        for (let n = 0; n < 3; n++) raise(randomTeam(), 1 + n * 0.5);
      }
    };

    let t0 = 0;
    k.expose({ teams, phase: () => phase, chaos: () => chaos });
    startLot();
    return (dt) => {
      hammer = Math.max(hammer - dt * 2.5, 0);
      confetti = confetti.filter((c) => c.y < k.H + 40);
      for (const c of confetti) {
        c.x += c.vx * dt;
        c.y += c.vy * dt;
        c.vy += 1400 * dt;
      }
      for (const t of teams) t.up = Math.max(t.up - dt, 0);

      if (phase === 'riot') {
        draw();
        return;
      }
      if (freeze > 0) {
        freeze -= dt;
        if (freeze <= 0) {
          // The lag ends and every bid arrives at once.
          for (let n = 0; n < 4; n++) raise(randomTeam(), 0.5);
          k.word(T.burst, k.W / 2, k.H * 0.4, PINK, 50);
        }
        draw();
        return;
      }

      // Input: number keys or taps reject, Space or the gavel sells.
      for (const tap of k.taps) {
        const i = tapTeam(tap.x, tap.y);
        if (i >= 0) reject(i);
        else if (tap.y > layout().gavelY - 10) gavel();
      }
      for (let i = 0; i < 9; i++) if (k.pressed(`Digit${i + 1}`, `Numpad${i + 1}`)) reject(i);
      if (k.pressed('Space', 'Enter')) gavel();

      // Illegal bids that slip past fill the chaos meter.
      for (const t of teams) {
        if (t.bad <= 0) continue;
        t.bad -= dt;
        if (t.bad <= 0) {
          chaos = clamp(chaos + 22, 0, 100);
          t.purse = 0;
          k.word(T.bankrupt, k.W / 2, k.H * 0.55, RED, 44);
          k.shake(0.8);
        }
      }
      if (chaos >= 100) {
        phase = 'riot';
        k.say(T.lines.riot);
        k.shake(1.5);
        k.interrupt(`<div class="sfx-paper"><small>${T.paper}</small><b>${T.riotHead}</b><p>${T.riotSub}</p></div>`, 'sfx-dim', 3200, () =>
          k.end({ passed: false, headline: T.lost }),
        );
        draw();
        return;
      }

      if (phase === 'sold' || phase === 'break') {
        clock -= dt;
        if (clock <= 0) {
          if (phase === 'sold' && lot === T.lots.length - 1) {
            phase = 'riot'; // stops the loop; the ending card takes over
            const rows = sales.map((s) => `<li><b>${s.name}</b> → ${s.team} <i>${s.price >= 999 ? 'Priceless' : `₹${s.price} Cr`}</i></li>`).join('');
            k.interrupt(`<div class="sfx-paper"><small>${T.paper}</small><b>${T.wonHead}</b><ul>${rows}</ul></div>`, 'sfx-dim', 3600, () =>
              k.end({ passed: true, headline: T.won }),
            );
          } else {
            if (phase === 'sold') lot += 1;
            startLot();
            t0 = k.t;
          }
        }
        draw();
        return;
      }

      const since = k.t - t0;
      events(since);
      // Ordinary bidding, until the lot reaches what the room thinks it's worth.
      nextBid -= dt;
      if (!visitor && nextBid <= 0 && bid < L().cap) {
        nextBid = 0.5 + Math.random() * 0.7;
        const i = randomTeam(leader);
        if (teams[i].purse >= bid + 0.5 && teams[i].bad <= 0) raise(i, Math.random() < 0.3 ? 1 : 0.5);
      }
      quiet += dt;
      const badOpen = teams.some((t) => t.bad > 0);
      if (phase === 'open' && quiet > 1.5 && !badOpen && (bid >= L().cap || visitor)) {
        phase = 'once';
        clock = 1;
      } else if (phase === 'once') {
        clock -= dt;
        if (clock <= 0) {
          phase = 'twice';
          clock = 1.4;
        }
      } else if (phase === 'twice') {
        clock -= dt;
        if (clock <= 0) {
          // Too slow: someone snipes it at the last second.
          if (visitor) {
            phase = 'twice';
            clock = 1.4;
          } else {
            chaos = clamp(chaos + 8, 0, 100);
            shout(T.sniped, PINK);
            raise(randomTeam(leader), 0.5);
            phase = 'open';
            quiet = 0.6;
          }
        }
      }
      draw();
    };
  },
};
