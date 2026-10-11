(() => {
const DEFAULT_CONFIG = Object.freeze({
  minFrequency: 120,
  maxFrequency: 2200,
  rmsThreshold: 0.015,
  clarityThreshold: 0.78,
  stabilityWindowMs: 220,
  stabilityCents: 35,
  tuningToleranceCents: 20
});

const PITCH_NAMES = Object.freeze(["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]);

function frequencyToPitch(frequency) {
  if (!Number.isFinite(frequency) || frequency <= 0) return null;
  const exactMidi = 69 + 12 * Math.log2(frequency / 440);
  const midi = Math.round(exactMidi);
  const noteName = PITCH_NAMES[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return { frequency, exactMidi, midi, noteName, octave, pitchId: `${noteName}${octave}`, cents: (exactMidi - midi) * 100 };
}

function calculateCentsDeviation(frequency, referenceFrequency) {
  if (!(frequency > 0) || !(referenceFrequency > 0)) return NaN;
  return 1200 * Math.log2(frequency / referenceFrequency);
}

function comparePitch(targetPitchId, detected, tolerance = DEFAULT_CONFIG.tuningToleranceCents) {
  if (!detected) return { outcome: "waiting", tuning: null };
  if (detected.pitchId !== targetPitchId) return { outcome: "different", tuning: null };
  const tuning = detected.cents < -tolerance ? "low" : detected.cents > tolerance ? "high" : "tune";
  return { outcome: "correct", tuning };
}

function detectFundamentalFrequency(samples, sampleRate, options = {}) {
  const config = { ...DEFAULT_CONFIG, ...options };
  if (!samples?.length || !(sampleRate > 0)) return null;
  let mean = 0;
  for (let i = 0; i < samples.length; i += 1) mean += samples[i];
  mean /= samples.length;
  let energy = 0;
  const centered = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) { centered[i] = samples[i] - mean; energy += centered[i] * centered[i]; }
  const rms = Math.sqrt(energy / samples.length);
  if (rms < config.rmsThreshold) return null;

  const minLag = Math.max(2, Math.floor(sampleRate / config.maxFrequency));
  const maxLag = Math.min(Math.floor(sampleRate / config.minFrequency), samples.length - 2);
  const correlations = new Float64Array(maxLag + 1);
  let globalLag = -1; let globalClarity = 0;
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let sum = 0; let energyA = 0; let energyB = 0;
    const limit = centered.length - lag;
    for (let i = 0; i < limit; i += 1) {
      const a = centered[i]; const b = centered[i + lag];
      sum += a * b; energyA += a * a; energyB += b * b;
    }
    const clarity = energyA && energyB ? sum / Math.sqrt(energyA * energyB) : 0;
    correlations[lag] = clarity;
    if (clarity > globalClarity) { globalClarity = clarity; globalLag = lag; }
  }
  if (globalLag < 0 || globalClarity < config.clarityThreshold) return null;
  let bestLag = globalLag;
  const acceptablePeak = Math.max(config.clarityThreshold, globalClarity * 0.92);
  for (let lag = minLag + 1; lag < maxLag; lag += 1) {
    if (correlations[lag] >= acceptablePeak && correlations[lag] >= correlations[lag - 1] && correlations[lag] > correlations[lag + 1]) {
      bestLag = lag; break;
    }
  }
  const bestClarity = correlations[bestLag];
  const left = correlations[bestLag - 1] || bestClarity;
  const right = correlations[bestLag + 1] || bestClarity;
  const denominator = left - 2 * bestClarity + right;
  const adjustment = denominator ? 0.5 * (left - right) / denominator : 0;
  const lag = bestLag + Math.max(-0.5, Math.min(0.5, adjustment));
  return { frequency: sampleRate / lag, rms, clarity: bestClarity };
}

class PitchStabilizer {
  constructor(options = {}) { this.config = { ...DEFAULT_CONFIG, ...options }; this.readings = []; }
  reset() { this.readings = []; }
  add(reading, timestamp = Date.now()) {
    if (!reading) { this.readings = []; return null; }
    const pitch = reading.pitchId ? reading : frequencyToPitch(reading.frequency || reading);
    if (!pitch) { this.readings = []; return null; }
    this.readings.push({ ...pitch, timestamp });
    const cutoff = timestamp - this.config.stabilityWindowMs;
    this.readings = this.readings.filter((item) => item.timestamp >= cutoff && item.midi === pitch.midi);
    if (this.readings.length < 3) return null;
    const span = this.readings[this.readings.length - 1].timestamp - this.readings[0].timestamp;
    const cents = this.readings.map((item) => item.exactMidi * 100);
    if (span < this.config.stabilityWindowMs * 0.75 || Math.max(...cents) - Math.min(...cents) > this.config.stabilityCents) return null;
    const frequency = this.readings.reduce((sum, item) => sum + item.frequency, 0) / this.readings.length;
    return { ...frequencyToPitch(frequency), stable: true };
  }
}

class BrowserPitchDetector {
  constructor(callbacks = {}, options = {}) {
    this.callbacks = callbacks; this.config = { ...DEFAULT_CONFIG, ...options };
    this.stream = null; this.context = null; this.source = null; this.analyser = null; this.frame = null;
    this.stabilizer = new PitchStabilizer(this.config); this.running = false; this.starting = false;
  }
  async start() {
    if (this.running || this.starting) return;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("unsupported");
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) throw new Error("unsupported");
    this.starting = true;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false });
      this.context = new AudioContextClass(); await this.context.resume();
      this.source = this.context.createMediaStreamSource(this.stream); this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 4096; this.analyser.smoothingTimeConstant = 0; this.source.connect(this.analyser);
      this.stream.getAudioTracks().forEach((track) => track.addEventListener("ended", () => { if (this.running) this.fail(new Error("disconnected")); }, { once: true }));
      this.running = true; this.stabilizer.reset(); this.callbacks.onState?.("listening"); this.process();
    } catch (error) { await this.stop(); throw error; }
    finally { this.starting = false; }
  }
  process() {
    if (!this.running) return;
    const samples = new Float32Array(this.analyser.fftSize); this.analyser.getFloatTimeDomainData(samples);
    const estimate = detectFundamentalFrequency(samples, this.context.sampleRate, this.config);
    const stable = estimate ? this.stabilizer.add(frequencyToPitch(estimate.frequency), performance.now()) : this.stabilizer.add(null);
    stable ? this.callbacks.onPitch?.({ ...stable, rms: estimate.rms, clarity: estimate.clarity }) : this.callbacks.onWaiting?.();
    this.frame = requestAnimationFrame(() => this.process());
  }
  async fail(error) { await this.stop(); this.callbacks.onError?.(error); }
  async stop() {
    this.running = false; this.starting = false;
    if (this.frame !== null) cancelAnimationFrame(this.frame); this.frame = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    try { this.source?.disconnect(); } catch { /* Already disconnected. */ }
    if (this.context && this.context.state !== "closed") { try { await this.context.close(); } catch { /* Ignore shutdown errors. */ } }
    this.stream = null; this.context = null; this.source = null; this.analyser = null; this.stabilizer.reset();
    this.callbacks.onState?.("idle");
  }
}

globalThis.AirRecorderPitch = Object.freeze({
  DEFAULT_CONFIG, BrowserPitchDetector, PitchStabilizer, calculateCentsDeviation, comparePitch, detectFundamentalFrequency, frequencyToPitch
});
})();
