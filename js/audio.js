// Звуки синтезируются через WebAudio — никаких файлов.
(function () {
  const A = {};
  HW.Audio = A;
  let ctx = null;

  // AudioContext можно запустить только после жеста пользователя (iOS/Android WebView)
  A.unlock = function () {
    if (!ctx) {
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    }
    if (ctx.state === 'suspended') ctx.resume();
  };

  function tone(freq, dur, type, vol, when, slideTo) {
    const t = ctx.currentTime + (when || 0);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.15, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(ctx.destination);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(dur, freq, vol, when) {
    const t = ctx.currentTime + (when || 0);
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = buf;
    f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 1.5;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(ctx.destination);
    src.start(t);
  }

  A.play = function (name) {
    if (!ctx || !HW.settings || !HW.settings.sound) return;
    try {
      switch (name) {
        case 'click': tone(700, 0.05, 'triangle', 0.06); break;
        case 'done': tone(880, 0.12, 'sine', 0.09); tone(1175, 0.18, 'sine', 0.09, 0.09); break;
        case 'beep': [0, 0.25, 0.5].forEach(w => tone(1500, 0.14, 'square', 0.04, w)); break;
        case 'bark': [0, 0.2].forEach(w => { tone(480, 0.11, 'sawtooth', 0.09, w, 200); noise(0.09, 900, 0.12, w); }); break;
        case 'night': [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.6, 'sine', 0.09, i * 0.16)); break;
        case 'chime': tone(880, 0.35, 'sine', 0.1); tone(1320, 0.45, 'sine', 0.07, 0.12); break;
        case 'ach': [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.25, 'triangle', 0.08, i * 0.09)); break;
        case 'bad': tone(240, 0.25, 'sawtooth', 0.04, 0, 150); break;
        case 'alarm': [0, 0.18, 0.36].forEach(w => tone(980, 0.12, 'square', 0.06, w, 760)); break;
        case 'cry': [0, 0.45].forEach(w => tone(620, 0.4, 'triangle', 0.07, w, 380)); tone(700, 0.6, 'triangle', 0.05, 0.9, 420); break;
        case 'tick': tone(1900, 0.025, 'square', 0.025); break;
        case 'coin': tone(1320, 0.08, 'square', 0.04); tone(1760, 0.2, 'square', 0.04, 0.07); break;
      }
    } catch (e) { /* звук — не критично */ }
  };
})();
