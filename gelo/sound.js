// Som sintetizado na hora com Web Audio (nenhum arquivo de áudio): vento de fundo, sopro nas transições,
// estalo de neve quando o cursor solta um bloco e um sino curto ao trocar a forma das partículas.
// Só liga depois de um clique (regra dos navegadores) e pode ser desligado no HUD.
export function createSound() {
  let ctx = null, master = null, noise = null, windGain = null, droneGain = null;
  let on = false, lastPop = 0;

  function init() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    // vento: ruído em loop num passa-baixa que oscila devagar
    const src = ctx.createBufferSource(); src.buffer = noise; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = .8;
    const lfo = ctx.createOscillator(); lfo.frequency.value = .07;
    const lfoG = ctx.createGain(); lfoG.gain.value = 260;
    lfo.connect(lfoG); lfoG.connect(lp.frequency); lfo.start();
    windGain = ctx.createGain(); windGain.gain.value = .22;
    src.connect(lp); lp.connect(windGain); windGain.connect(master); src.start();

    // zumbido grave e frio, bem baixo
    droneGain = ctx.createGain(); droneGain.gain.value = .0; droneGain.connect(master);
    [55, 82.4, 110.3].forEach((f, i) => {
      const o = ctx.createOscillator(); o.type = i ? 'sine' : 'triangle'; o.frequency.value = f; o.detune.value = (i - 1) * 6;
      const g = ctx.createGain(); g.gain.value = i ? .25 : .4; o.connect(g); g.connect(droneGain); o.start();
    });
    return true;
  }

  const envGain = (t0, a, peak, rel) => {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + a);
    g.gain.exponentialRampToValueAtTime(.0001, t0 + a + rel);
    g.connect(master);
    return g;
  };
  const noiseShot = (t0, dur) => { const s = ctx.createBufferSource(); s.buffer = noise; s.start(t0, Math.random() * 1.5); s.stop(t0 + dur); return s; };

  const api = {
    get on() { return on; },
    enable() {
      if (!ctx && !init()) return;
      ctx.resume();
      on = true;
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(.9, ctx.currentTime, .6);
    },
    disable() {
      if (!ctx) return;
      on = false;
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(0, ctx.currentTime, .2);
    },
    toggle() { on ? api.disable() : api.enable(); return on; },
    // cena atual muda o fundo: vento no iglu, zumbido nos anéis e no palco
    setScene(w) {
      if (!ctx) return;
      const t = ctx.currentTime;
      windGain.gain.setTargetAtTime(w === 'iglu' ? .22 : .07, t, .8);
      droneGain.gain.setTargetAtTime(w === 'iglu' ? .0 : .05, t, 1.2);
    },
    whoosh(strong = false) {
      if (!on) return;
      const t = ctx.currentTime, dur = strong ? 1.6 : 1;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2;
      bp.frequency.setValueAtTime(250, t); bp.frequency.exponentialRampToValueAtTime(strong ? 3200 : 2000, t + dur * .55); bp.frequency.exponentialRampToValueAtTime(400, t + dur);
      noiseShot(t, dur).connect(bp); bp.connect(envGain(t, dur * .45, strong ? .5 : .3, dur * .55));
    },
    pop() {
      if (!on) return;
      const now = performance.now(); if (now - lastPop < 110) return; lastPop = now;
      const t = ctx.currentTime;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400 + Math.random() * 1200; bp.Q.value = 2.5;
      noiseShot(t, .12).connect(bp); bp.connect(envGain(t, .004, .35, .1));
    },
    chime(k = 0) {
      if (!on) return;
      const t = ctx.currentTime, base = [659.3, 784, 987.8, 1174.7][k % 4];
      [1, 2.01, 3.02].forEach((m, i) => {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = base * m;
        o.connect(envGain(t, .005, [.12, .05, .025][i], 1.4 - i * .3)); o.start(t); o.stop(t + 1.6);
      });
    },
  };
  return api;
}
