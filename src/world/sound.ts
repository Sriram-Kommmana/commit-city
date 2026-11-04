// Sound effects, synthesised live with no audio files. Off until the visitor asks for it.
// There is no background music: wind, a siren, the commit line's zip and hits react to the journey.

export function createSound() {
  let ctx: AudioContext | null = null;
  let master: GainNode;
  let wind: GainNode;
  let windFilter: BiquadFilterNode;
  let sirenGain: GainNode;
  let sirenOsc: OscillatorNode;
  let noise: AudioBuffer;
  let on = false;

  const kick = (t: number) => {
    const o = ctx!.createOscillator();
    const g = ctx!.createGain();
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.3);
  };

  const burst = (t: number, length: number, level: number, type: BiquadFilterType, cutoff: number) => {
    const s = ctx!.createBufferSource();
    s.buffer = noise;
    const f = ctx!.createBiquadFilter();
    f.type = type;
    f.frequency.value = cutoff;
    const g = ctx!.createGain();
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + length);
    s.connect(f).connect(g).connect(master);
    s.start(t);
    s.stop(t + length + 0.02);
  };

  const start = () => {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.5;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);

    const size = ctx.sampleRate * 2;
    noise = ctx.createBuffer(1, size, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < size; i++) data[i] = Math.random() * 2 - 1;

    // Wind for the fall, as filtered noise that opens up with speed.
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 500;
    windFilter.Q.value = 0.7;
    wind = ctx.createGain();
    wind.gain.value = 0;
    src.connect(windFilter).connect(wind).connect(master);
    src.start();

    // A two-tone siren for the chase, quiet and off-key enough to stay out of the way.
    sirenOsc = ctx.createOscillator();
    sirenOsc.type = 'square';
    sirenOsc.frequency.value = 660;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1400;
    sirenGain = ctx.createGain();
    sirenGain.gain.value = 0;
    sirenOsc.connect(lp).connect(sirenGain).connect(master);
    sirenOsc.start();

  };

  return {
    toggle() {
      on = !on;
      if (on) {
        if (!ctx) start();
        else ctx.resume();
      } else {
        ctx?.suspend();
      }
      return on;
    },
    /** Called as the journey moves, with its position and speed. */
    update(p: number, speed: number) {
      if (!ctx || !on) return;
      const t = ctx.currentTime;
      const falling = p > 0.08 && p < 0.5 ? 1 : 0.25;
      wind.gain.setTargetAtTime(Math.min(speed * 0.9 * falling, 0.5), t, 0.08);
      windFilter.frequency.setTargetAtTime(400 + speed * 2200, t, 0.1);
      const chase = p > 0.57 && p < 0.77;
      sirenGain.gain.setTargetAtTime(chase ? 0.035 : 0, t, 0.2);
      if (chase) sirenOsc.frequency.setValueAtTime(Math.floor(t * 2.4) % 2 ? 660 : 880, t);
    },
    /** The commit line firing: a quick rising zip. */
    zip() {
      if (!ctx || !on) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(320, t);
      o.frequency.exponentialRampToValueAtTime(1800, t + 0.12);
      g.gain.setValueAtTime(0.16, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      o.connect(g).connect(master);
      o.start(t);
      o.stop(t + 0.2);
      burst(t, 0.12, 0.25, 'highpass', 3000);
    },
    /** A hit for cuts and impacts. */
    hit() {
      if (!ctx || !on) return;
      const t = ctx.currentTime;
      burst(t, 0.3, 0.6, 'lowpass', 900);
      kick(t);
    },
    stop() {
      ctx?.close();
    },
  };
}
