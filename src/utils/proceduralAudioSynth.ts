import {
  computeFocServoAcousticParams,
  computeTurbofanAcousticParams
} from './sciTechEngine';

/**
 * Module 5: Zero-External-File Procedural Physical WebAudio Synthesizer.
 * Synthesizes in pure native WebAudio code (zero .mp3/.wav network loads):
 * 1. FOC Brushless Servo & Harmonic Drive variable-frequency whine (180Hz ~ 1,400Hz) driven by Σ|Δq/Δt|
 * 2. CFM56 N1/N2 Dual-Spool Turbofan Blade Passing Frequency (BPF) scream + pink-noise jet roar
 * 3. Ping360 2.4kHz Abyssal Sonar Ping with underwater delay/feedback reverb + Sub-Bass weapon/Bullet-Time drop
 */
class ProceduralPhysicalAudioEngine {
  private ctx: AudioContext | null = null;
  private enabled = false;

  // Persistent continuous FOC Servo + Turbofan synth nodes
  private masterGain: GainNode | null = null;
  private servoOscA: OscillatorNode | null = null;
  private servoOscB: OscillatorNode | null = null;
  private servoFilter: BiquadFilterNode | null = null;
  private servoGain: GainNode | null = null;

  private fanN1Osc: OscillatorNode | null = null;
  private fanN2Osc: OscillatorNode | null = null;
  private jetNoiseSrc: AudioBufferSourceNode | null = null;
  private jetFilter: BiquadFilterNode | null = null;
  private aeroGain: GainNode | null = null;

  private lastSonarPingAt = 0;

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setEnabled(next: boolean): void {
    this.enabled = next;
    if (next) {
      const ctx = this.ensureGraph();
      if (ctx && this.masterGain) {
        this.masterGain.gain.setTargetAtTime(0.85, ctx.currentTime, 0.04);
      }
      this.playMechanicalLatchClick(680);
    } else if (this.ctx && this.masterGain) {
      this.masterGain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.04);
    }
  }

  private ensureGraph(forceAllow: boolean = false): AudioContext | null {
    if ((!this.enabled && !forceAllow) || typeof window === 'undefined') return null;

    if (!this.ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      const ctx = new AC();
      this.ctx = ctx;

      const master = ctx.createGain();
      master.gain.value = 0.85;
      master.connect(ctx.destination);
      this.masterGain = master;

      // 1. Dual-Carrier FOC Brushless Servo & Harmonic Reducer Synth (Sine + Triangle -> Bandpass)
      const sFilter = ctx.createBiquadFilter();
      sFilter.type = 'bandpass';
      sFilter.frequency.value = 520;
      sFilter.Q.value = 3.2;

      const sGain = ctx.createGain();
      sGain.gain.value = 0.0;

      const oscA = ctx.createOscillator();
      oscA.type = 'sine';
      oscA.frequency.value = 220;

      const oscB = ctx.createOscillator();
      oscB.type = 'triangle';
      oscB.frequency.value = 330;

      oscA.connect(sFilter);
      oscB.connect(sFilter);
      sFilter.connect(sGain);
      sGain.connect(master);

      oscA.start();
      oscB.start();

      this.servoOscA = oscA;
      this.servoOscB = oscB;
      this.servoFilter = sFilter;
      this.servoGain = sGain;

      // 2. Aerospace N1/N2 Dual-Spool BPF + Pink-Noise Jet Plume Synth
      const aGain = ctx.createGain();
      aGain.gain.value = 0.0;

      // Procedural Pink Noise Buffer (2.0s seamless loop, Paul Kellet 1/f filter)
      const bufLen = ctx.sampleRate * 2;
      const pinkBuf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
      const out = pinkBuf.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < bufLen; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
      }

      const noiseSrc = ctx.createBufferSource();
      noiseSrc.buffer = pinkBuf;
      noiseSrc.loop = true;

      const jFilter = ctx.createBiquadFilter();
      jFilter.type = 'bandpass';
      jFilter.frequency.value = 320;
      jFilter.Q.value = 1.1;

      const n1Osc = ctx.createOscillator();
      n1Osc.type = 'sawtooth';
      n1Osc.frequency.value = 380;
      const n1SubGain = ctx.createGain();
      n1SubGain.gain.value = 0.22;

      const n2Osc = ctx.createOscillator();
      n2Osc.type = 'sine';
      n2Osc.frequency.value = 920;
      const n2SubGain = ctx.createGain();
      n2SubGain.gain.value = 0.28;

      noiseSrc.connect(jFilter);
      jFilter.connect(aGain);
      n1Osc.connect(n1SubGain);
      n1SubGain.connect(aGain);
      n2Osc.connect(n2SubGain);
      n2SubGain.connect(aGain);
      aGain.connect(master);

      noiseSrc.start();
      n1Osc.start();
      n2Osc.start();

      this.jetNoiseSrc = noiseSrc;
      this.jetFilter = jFilter;
      this.fanN1Osc = n1Osc;
      this.fanN2Osc = n2Osc;
      this.aeroGain = aGain;
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    if (forceAllow && this.masterGain) {
      this.masterGain.gain.setTargetAtTime(0.85, this.ctx.currentTime, 0.02);
    }
    return this.ctx;
  }

  /**
   * Updates continuous FOC Brushless Servo & Harmonic Drive whine every frame from Σ|Δq/Δt|.
   */
  public updateFocServoTelemetry(sumJointSpeedRadS: number, isSubseaRov: boolean = false, simTime: number = 0): void {
    const ctx = this.ensureGraph();
    if (!ctx || !this.servoOscA || !this.servoOscB || !this.servoFilter || !this.servoGain) return;

    // Silence aero engine while in Hangar / Mars / ROV view
    if (this.aeroGain) {
      this.aeroGain.gain.setTargetAtTime(0.0, ctx.currentTime, 0.08);
    }

    const params = computeFocServoAcousticParams(sumJointSpeedRadS);
    const t = ctx.currentTime;
    this.servoOscA.frequency.setTargetAtTime(params.primaryCarrierHz, t, 0.035);
    this.servoOscB.frequency.setTargetAtTime(params.harmonicSidebandHz, t, 0.035);
    this.servoFilter.frequency.setTargetAtTime(params.primaryCarrierHz * 1.25, t, 0.04);
    this.servoGain.gain.setTargetAtTime(params.gain, t, 0.045);

    // Periodic 2.4kHz Ping360 Sonar Pulse with underwater reverb when viewing BlueROV2 / RexROV2!
    if (isSubseaRov && simTime - this.lastSonarPingAt > 3.2) {
      this.lastSonarPingAt = simTime;
      this.playSonarPing2400Hz();
    }
  }

  /**
   * Updates continuous CFM56 N1/N2 Dual-Spool Turbofan roar & Blade Passing Frequency scream.
   */
  public updateAeroTurbofanTelemetry(n1Rpm: number, n2Rpm: number, isReverse: boolean): void {
    const ctx = this.ensureGraph();
    if (!ctx || !this.fanN1Osc || !this.fanN2Osc || !this.jetFilter || !this.aeroGain) return;

    if (this.servoGain) {
      this.servoGain.gain.setTargetAtTime(0.0, ctx.currentTime, 0.08);
    }

    const p = computeTurbofanAcousticParams(n1Rpm, n2Rpm, isReverse);
    const t = ctx.currentTime;
    this.fanN1Osc.frequency.setTargetAtTime(p.n1BpfHz, t, 0.05);
    this.fanN2Osc.frequency.setTargetAtTime(p.n2BpfHz, t, 0.05);
    this.jetFilter.frequency.setTargetAtTime(p.jetBandpassHz, t, 0.06);
    this.aeroGain.gain.setTargetAtTime(p.gain, t, 0.06);
  }

  public silenceContinuousLoops(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.servoGain?.gain.setTargetAtTime(0.0, t, 0.05);
    this.aeroGain?.gain.setTargetAtTime(0.0, t, 0.05);
  }

  /**
   * Crisp mechanical latch / CAD snap-fit click sound when peeling, isolating, or locking armor.
   */
  public playMechanicalLatchClick(pitchHz: number = 760, forceAllow: boolean = false): void {
    const ctx = this.ensureGraph(forceAllow);
    if (!ctx || !this.masterGain) return;
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(pitchHz, t);
    osc.frequency.exponentialRampToValueAtTime(190, t + 0.065);

    g.gain.setValueAtTime(0.09, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);

    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.075);
  }

  /**
   * Ethereal 2.4kHz Ping360 subsea acoustic sonar pulse with multi-tap underwater delay echo.
   */
  public playSonarPing2400Hz(): void {
    const ctx = this.ensureGraph();
    if (!ctx || !this.masterGain) return;
    const t = ctx.currentTime;

    const pingOsc = ctx.createOscillator();
    const pingGain = ctx.createGain();
    const delay = ctx.createDelay(0.6);
    const feedback = ctx.createGain();
    const lp = ctx.createBiquadFilter();

    pingOsc.type = 'sine';
    pingOsc.frequency.setValueAtTime(2400, t);
    pingOsc.frequency.exponentialRampToValueAtTime(2340, t + 0.18);

    pingGain.gain.setValueAtTime(0.001, t);
    pingGain.gain.linearRampToValueAtTime(0.075, t + 0.012);
    pingGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);

    delay.delayTime.value = 0.21;
    feedback.gain.value = 0.42;
    lp.type = 'lowpass';
    lp.frequency.value = 2800;

    pingOsc.connect(pingGain);
    pingGain.connect(this.masterGain);
    pingGain.connect(delay);
    delay.connect(lp);
    lp.connect(feedback);
    feedback.connect(delay);
    lp.connect(this.masterGain);

    pingOsc.start(t);
    pingOsc.stop(t + 0.26);
  }

  /**
   * Deep Sub-Bass Drop + High-Energy Transient for Laser Fire, EMP, SLS Laser Ignition, and Bullet-Time Freeze!
   */
  public playSubBassImpact(mode: 'laser' | 'emp_bullettime' | 'sls_print'): void {
    const ctx = this.ensureGraph();
    if (!ctx || !this.masterGain) return;
    const t = ctx.currentTime;

    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = 'sine';

    if (mode === 'emp_bullettime') {
      sub.frequency.setValueAtTime(135, t);
      sub.frequency.exponentialRampToValueAtTime(26, t + 0.65);
      subGain.gain.setValueAtTime(0.18, t);
      subGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.68);
      sub.connect(subGain);
      subGain.connect(this.masterGain);
      sub.start(t);
      sub.stop(t + 0.7);
      return;
    }

    if (mode === 'sls_print') {
      sub.frequency.setValueAtTime(110, t);
      sub.frequency.linearRampToValueAtTime(420, t + 0.45);
      subGain.gain.setValueAtTime(0.08, t);
      subGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.48);
      sub.connect(subGain);
      subGain.connect(this.masterGain);
      sub.start(t);
      sub.stop(t + 0.5);
      return;
    }

    // High-energy Laser + Sub-Bass punch
    sub.frequency.setValueAtTime(160, t);
    sub.frequency.exponentialRampToValueAtTime(34, t + 0.34);
    subGain.gain.setValueAtTime(0.15, t);
    subGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.36);

    const zing = ctx.createOscillator();
    const zingGain = ctx.createGain();
    zing.type = 'sawtooth';
    zing.frequency.setValueAtTime(1480, t);
    zing.frequency.exponentialRampToValueAtTime(220, t + 0.22);
    zingGain.gain.setValueAtTime(0.06, t);
    zingGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);

    sub.connect(subGain);
    subGain.connect(this.masterGain);
    zing.connect(zingGain);
    zingGain.connect(this.masterGain);

    sub.start(t);
    sub.stop(t + 0.38);
    zing.start(t);
    zing.stop(t + 0.25);
  }

  /**
   * Death Stranding Odradek 3-Layer Signature Sound (100% Zero-File WebAudio Synthesis):
   * 1) 0 ~ 0.12s: Crisp metallic vane Click-Clack bandpass noise burst + metallic ring;
   * 2) 0.10 ~ 0.80s: Spatial low-frequency sonar sweep dive (160Hz -> 38Hz sine resonance);
   * 3) 0.15 ~ 2.80s: Ethereal Kojima-style FM fifth-interval overtone chord (440Hz / 659.25Hz / 987.77Hz)
   *                  routed through a stereo Ping-Pong Delay tail!
   */
  public playOdradekScanSignature(forceAllow: boolean = false): void {
    const ctx = this.ensureGraph(forceAllow);
    if (!ctx || !this.masterGain) return;
    const t = ctx.currentTime;

    // Layer 1 (0 ~ 0.12s): Crisp Metallic Click-Clack Double Vane Snap (Bandpass Noise + High-Q Chime)
    const snapLen = Math.floor(ctx.sampleRate * 0.13);
    const snapBuf = ctx.createBuffer(1, snapLen, ctx.sampleRate);
    const snapData = snapBuf.getChannelData(0);
    for (let i = 0; i < snapLen; i++) {
      const sec = i / ctx.sampleRate;
      const env1 = sec < 0.04 ? Math.exp(-sec * 95) : 0;
      const env2 = sec >= 0.055 ? Math.exp(-(sec - 0.055) * 85) : 0;
      snapData[i] = (Math.random() * 2 - 1) * (env1 + env2 * 1.15);
    }
    const snapSrc = ctx.createBufferSource();
    snapSrc.buffer = snapBuf;
    const snapBp = ctx.createBiquadFilter();
    snapBp.type = 'bandpass';
    snapBp.frequency.setValueAtTime(2650, t);
    snapBp.Q.value = 4.2;
    const snapGain = ctx.createGain();
    snapGain.gain.setValueAtTime(0.24, t);
    snapSrc.connect(snapBp);
    snapBp.connect(snapGain);
    snapGain.connect(this.masterGain);
    snapSrc.start(t);

    // Layer 2 (0.10 ~ 0.80s): Spatial Low-Frequency Sonar Dive (160Hz -> 38Hz)
    const subDive = ctx.createOscillator();
    const subDiveGain = ctx.createGain();
    subDive.type = 'sine';
    subDive.frequency.setValueAtTime(160, t + 0.1);
    subDive.frequency.exponentialRampToValueAtTime(38, t + 0.8);
    subDiveGain.gain.setValueAtTime(0.0001, t);
    subDiveGain.gain.linearRampToValueAtTime(0.22, t + 0.13);
    subDiveGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.84);
    subDive.connect(subDiveGain);
    subDiveGain.connect(this.masterGain);
    subDive.start(t + 0.09);
    subDive.stop(t + 0.86);

    // Layer 3 (0.15 ~ 2.80s): Ethereal FM Fifth-Interval Chord (440 / 659.25 / 987.77 Hz) + Stereo Ping-Pong Delay
    const chordBus = ctx.createGain();
    chordBus.gain.setValueAtTime(0.0001, t);
    chordBus.gain.linearRampToValueAtTime(0.11, t + 0.24);
    chordBus.gain.exponentialRampToValueAtTime(0.0001, t + 2.75);
    chordBus.connect(this.masterGain);

    // Stereo Ping-Pong Delay Network
    const delayL = ctx.createDelay(0.6);
    const delayR = ctx.createDelay(0.6);
    delayL.delayTime.value = 0.22;
    delayR.delayTime.value = 0.33;
    const fbL = ctx.createGain();
    const fbR = ctx.createGain();
    fbL.gain.value = 0.38;
    fbR.gain.value = 0.36;
    const merger = ctx.createChannelMerger(2);
    const wetGain = ctx.createGain();
    wetGain.gain.setValueAtTime(0.09, t);
    wetGain.gain.exponentialRampToValueAtTime(0.0001, t + 2.85);

    chordBus.connect(delayL);
    delayL.connect(fbL);
    fbL.connect(delayR);
    delayR.connect(fbR);
    fbR.connect(delayL);
    delayL.connect(merger, 0, 0);
    delayR.connect(merger, 0, 1);
    merger.connect(wetGain);
    wetGain.connect(this.masterGain);

    const chordFreqs = [440.0, 659.25, 987.77];
    chordFreqs.forEach((f0, idx) => {
      const carrier = ctx.createOscillator();
      const mod = ctx.createOscillator();
      const modGain = ctx.createGain();
      const voiceGain = ctx.createGain();

      carrier.type = 'sine';
      carrier.frequency.setValueAtTime(f0, t + 0.15 + idx * 0.035);

      mod.type = 'sine';
      mod.frequency.setValueAtTime(f0 * 1.5, t + 0.15);
      modGain.gain.setValueAtTime(f0 * 0.45, t + 0.15);
      modGain.gain.exponentialRampToValueAtTime(1.5, t + 1.6);

      voiceGain.gain.setValueAtTime(0.36 / (idx + 1), t + 0.15);

      mod.connect(modGain);
      modGain.connect(carrier.frequency);
      carrier.connect(voiceGain);
      voiceGain.connect(chordBus);

      mod.start(t + 0.15 + idx * 0.035);
      carrier.start(t + 0.15 + idx * 0.035);
      mod.stop(t + 2.8);
      carrier.stop(t + 2.8);
    });
  }

  /**
   * Titanfall 2 Orbital Dropfall Deployment Audio:
   * - 'launch_fall': Supersonic atmospheric reentry shriek + retro-thruster burn
   * - 'touchdown_rise': Heavy seismic ground slam + rising URDF hydraulic servo stand-up whine!
   */
  public playOrbitalDropfallAudio(
    phase: 'launch_fall' | 'touchdown_rise',
    forceAllow: boolean = false
  ): void {
    const ctx = this.ensureGraph(forceAllow);
    if (!ctx || !this.masterGain) return;
    const t = ctx.currentTime;

    if (phase === 'launch_fall') {
      const shriek = ctx.createOscillator();
      const shriekGain = ctx.createGain();
      shriek.type = 'sawtooth';
      shriek.frequency.setValueAtTime(1320, t);
      shriek.frequency.exponentialRampToValueAtTime(210, t + 0.88);
      shriekGain.gain.setValueAtTime(0.065, t);
      shriekGain.gain.linearRampToValueAtTime(0.14, t + 0.65);
      shriekGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.92);
      shriek.connect(shriekGain);
      shriekGain.connect(this.masterGain);
      shriek.start(t);
      shriek.stop(t + 0.94);
      return;
    }

    // Touchdown seismic slam + 0.35s delayed rising hydraulic servo whine!
    const slam = ctx.createOscillator();
    const slamGain = ctx.createGain();
    slam.type = 'sine';
    slam.frequency.setValueAtTime(155, t);
    slam.frequency.exponentialRampToValueAtTime(24, t + 0.58);
    slamGain.gain.setValueAtTime(0.28, t);
    slamGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.62);
    slam.connect(slamGain);
    slamGain.connect(this.masterGain);
    slam.start(t);
    slam.stop(t + 0.64);

    const servoRise = ctx.createOscillator();
    const servoGain = ctx.createGain();
    servoRise.type = 'triangle';
    servoRise.frequency.setValueAtTime(195, t + 0.32);
    servoRise.frequency.exponentialRampToValueAtTime(860, t + 0.88);
    servoGain.gain.setValueAtTime(0.0001, t + 0.30);
    servoGain.gain.linearRampToValueAtTime(0.095, t + 0.42);
    servoGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.92);
    servoRise.connect(servoGain);
    servoGain.connect(this.masterGain);
    servoRise.start(t + 0.31);
    servoRise.stop(t + 0.94);
  }

  /**
   * Armored Core 6 Overheat Armor-Pop Steam Venting & Mechanical Lock-Shut Audio.
   */
  public playOverheatVentAudio(
    phase: 'open_steam' | 'lock_shut',
    forceAllow: boolean = false
  ): void {
    const ctx = this.ensureGraph(forceAllow);
    if (!ctx || !this.masterGain) return;
    const t = ctx.currentTime;

    if (phase === 'lock_shut') {
      this.playMechanicalLatchClick(880, forceAllow);
      window.setTimeout(() => this.playMechanicalLatchClick(540, forceAllow), 55);
      return;
    }

    this.playMechanicalLatchClick(940, forceAllow);
    const len = Math.floor(ctx.sampleRate * 2.1);
    const steamBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = steamBuf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      ch[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = steamBuf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1850, t);
    bp.frequency.exponentialRampToValueAtTime(780, t + 2.05);
    bp.Q.value = 1.6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(0.16, t + 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.08);

    src.connect(bp);
    bp.connect(g);
    g.connect(this.masterGain);
    src.start(t);
  }

  /**
   * Call of Duty style crisp tactical hitmarker audio tick ("thwack-tick" + metallic kill chime).
   */
  public playCodHitmarkerTick(
    isCritOrStagger: boolean = false,
    isKill: boolean = false,
    forceAllow: boolean = false
  ): void {
    const ctx = this.ensureGraph(forceAllow);
    if (!ctx || !this.masterGain) return;
    const t = ctx.currentTime;

    // Short high-Q percussive transient tick
    const snapLen = Math.floor(ctx.sampleRate * 0.045);
    const snapBuf = ctx.createBuffer(1, snapLen, ctx.sampleRate);
    const data = snapBuf.getChannelData(0);
    for (let i = 0; i < snapLen; i++) {
      const env = Math.exp(-(i / ctx.sampleRate) * 145);
      data[i] = (Math.random() * 2 - 1) * env;
    }
    const src = ctx.createBufferSource();
    src.buffer = snapBuf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(isCritOrStagger ? 3100 : 2350, t);
    bp.Q.value = 3.6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(isCritOrStagger ? 0.24 : 0.16, t);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.masterGain);
    src.start(t);

    if (isCritOrStagger || isKill) {
      const ping = ctx.createOscillator();
      const pg = ctx.createGain();
      ping.type = 'triangle';
      ping.frequency.setValueAtTime(isKill ? 1320 : 980, t);
      ping.frequency.exponentialRampToValueAtTime(isKill ? 1980 : 620, t + 0.09);
      pg.gain.setValueAtTime(0.11, t);
      pg.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
      ping.connect(pg);
      pg.connect(this.masterGain);
      ping.start(t);
      ping.stop(t + 0.12);
    }
  }

  /**
   * Sci-Fi Weapon Fire Audio (Pulse Rifle / Railgun Crack / Homing Missile Pod).
   */
  public playCombatWeaponFire(
    weapon: 'pulse_rifle' | 'railgun' | 'missile_pod' | 'orbital_ion',
    forceAllow: boolean = false
  ): void {
    const ctx = this.ensureGraph(forceAllow);
    if (!ctx || !this.masterGain) return;
    const t = ctx.currentTime;
    const jitter = 0.94 + Math.random() * 0.12;

    if (weapon === 'pulse_rifle') {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(780 * jitter, t);
      osc.frequency.exponentialRampToValueAtTime(145, t + 0.085);
      g.gain.setValueAtTime(0.085, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      osc.connect(g);
      g.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.095);
      return;
    }

    if (weapon === 'railgun') {
      const sub = ctx.createOscillator();
      const sg = ctx.createGain();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(210, t);
      sub.frequency.exponentialRampToValueAtTime(32, t + 0.32);
      sg.gain.setValueAtTime(0.22, t);
      sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
      sub.connect(sg);
      sg.connect(this.masterGain);
      sub.start(t);
      sub.stop(t + 0.35);

      const whip = ctx.createOscillator();
      const wg = ctx.createGain();
      whip.type = 'sawtooth';
      whip.frequency.setValueAtTime(2200 * jitter, t);
      whip.frequency.exponentialRampToValueAtTime(180, t + 0.18);
      wg.gain.setValueAtTime(0.11, t);
      wg.gain.exponentialRampToValueAtTime(0.0001, t + 0.19);
      whip.connect(wg);
      wg.connect(this.masterGain);
      whip.start(t);
      whip.stop(t + 0.2);
      return;
    }

    if (weapon === 'missile_pod') {
      const hiss = ctx.createOscillator();
      const hg = ctx.createGain();
      hiss.type = 'triangle';
      hiss.frequency.setValueAtTime(520 * jitter, t);
      hiss.frequency.exponentialRampToValueAtTime(1480, t + 0.16);
      hg.gain.setValueAtTime(0.09, t);
      hg.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      hiss.connect(hg);
      hg.connect(this.masterGain);
      hiss.start(t);
      hiss.stop(t + 0.19);
      return;
    }

    // Orbital Ion Cannon Ultimate Strike
    const drop = ctx.createOscillator();
    const dg = ctx.createGain();
    drop.type = 'sawtooth';
    drop.frequency.setValueAtTime(920, t);
    drop.frequency.exponentialRampToValueAtTime(36, t + 0.85);
    dg.gain.setValueAtTime(0.24, t);
    dg.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    drop.connect(dg);
    dg.connect(this.masterGain);
    drop.start(t);
    drop.stop(t + 0.92);
  }

  /**
   * Armored Core 6 Boss Arrival Horn, ACS Stagger Break, and Coral Laser Telegraph Cues.
   */
  public playBossEventCue(
    event: 'boss_warning' | 'acs_stagger_break' | 'laser_charge' | 'emp_nova',
    forceAllow: boolean = false
  ): void {
    const ctx = this.ensureGraph(forceAllow);
    if (!ctx || !this.masterGain) return;
    const t = ctx.currentTime;

    if (event === 'boss_warning') {
      const hornA = ctx.createOscillator();
      const hornB = ctx.createOscillator();
      const hg = ctx.createGain();
      hornA.type = 'sawtooth';
      hornB.type = 'sawtooth';
      hornA.frequency.setValueAtTime(110, t);
      hornB.frequency.setValueAtTime(114.5, t);
      hornA.frequency.exponentialRampToValueAtTime(72, t + 0.9);
      hornB.frequency.exponentialRampToValueAtTime(75, t + 0.9);
      hg.gain.setValueAtTime(0.001, t);
      hg.gain.linearRampToValueAtTime(0.18, t + 0.08);
      hg.gain.exponentialRampToValueAtTime(0.0001, t + 0.95);
      hornA.connect(hg);
      hornB.connect(hg);
      hg.connect(this.masterGain);
      hornA.start(t);
      hornB.start(t);
      hornA.stop(t + 0.98);
      hornB.stop(t + 0.98);
      return;
    }

    if (event === 'acs_stagger_break') {
      const sub = ctx.createOscillator();
      const sg = ctx.createGain();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(190, t);
      sub.frequency.exponentialRampToValueAtTime(28, t + 0.62);
      sg.gain.setValueAtTime(0.28, t);
      sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.66);
      sub.connect(sg);
      sg.connect(this.masterGain);
      sub.start(t);
      sub.stop(t + 0.68);

      const alarm = ctx.createOscillator();
      const ag = ctx.createGain();
      alarm.type = 'square';
      alarm.frequency.setValueAtTime(1480, t);
      alarm.frequency.setValueAtTime(1860, t + 0.09);
      ag.gain.setValueAtTime(0.09, t);
      ag.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
      alarm.connect(ag);
      ag.connect(this.masterGain);
      alarm.start(t);
      alarm.stop(t + 0.25);
      return;
    }

    if (event === 'laser_charge') {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(240, t);
      osc.frequency.exponentialRampToValueAtTime(1680, t + 0.65);
      g.gain.setValueAtTime(0.02, t);
      g.gain.linearRampToValueAtTime(0.13, t + 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
      osc.connect(g);
      g.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.72);
      return;
    }

    // EMP Nova pulse
    const emp = ctx.createOscillator();
    const eg = ctx.createGain();
    emp.type = 'triangle';
    emp.frequency.setValueAtTime(640, t);
    emp.frequency.exponentialRampToValueAtTime(48, t + 0.38);
    eg.gain.setValueAtTime(0.18, t);
    eg.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    emp.connect(eg);
    eg.connect(this.masterGain);
    emp.start(t);
    emp.stop(t + 0.44);
  }

  /**
   * Hangar Unitree Push-Recovery Heavy Kinetic Impact Thud + Servo Brace Whir.
   */
  public playPushImpactThud(forceNewtons: number = 225, forceAllow: boolean = false): void {
    const ctx = this.ensureGraph(forceAllow);
    if (!ctx || !this.masterGain) return;
    const t = ctx.currentTime;
    const scale = Math.max(0.6, Math.min(1.5, forceNewtons / 220));

    // Low-end kinetic chassis thud
    const sub = ctx.createOscillator();
    const sg = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(135 * scale, t);
    sub.frequency.exponentialRampToValueAtTime(34, t + 0.21);
    sg.gain.setValueAtTime(0.24 * scale, t);
    sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
    sub.connect(sg);
    sg.connect(this.masterGain);
    sub.start(t);
    sub.stop(t + 0.25);

    // High-torque harmonic drive reflex chirp
    const servo = ctx.createOscillator();
    const vg = ctx.createGain();
    servo.type = 'triangle';
    servo.frequency.setValueAtTime(310, t + 0.03);
    servo.frequency.exponentialRampToValueAtTime(760, t + 0.16);
    servo.frequency.exponentialRampToValueAtTime(420, t + 0.34);
    vg.gain.setValueAtTime(0.0001, t);
    vg.gain.linearRampToValueAtTime(0.075 * scale, t + 0.06);
    vg.gain.exponentialRampToValueAtTime(0.0001, t + 0.36);
    servo.connect(vg);
    vg.connect(this.masterGain);
    servo.start(t);
    servo.stop(t + 0.38);
  }

  /**
   * Crystalline Plasma Shield Shatter Burst when enemy energy shield drops to 0.
   */
  public playShieldShatterBurst(forceAllow: boolean = false): void {
    const ctx = this.ensureGraph(forceAllow);
    if (!ctx || !this.masterGain) return;
    const t = ctx.currentTime;
    const freqs = [1640, 2180, 2890];
    freqs.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, t + idx * 0.018);
      osc.frequency.exponentialRampToValueAtTime(f * 0.42, t + 0.24 + idx * 0.02);
      g.gain.setValueAtTime(0.09, t + idx * 0.018);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26 + idx * 0.02);
      osc.connect(g);
      g.connect(this.masterGain!);
      osc.start(t + idx * 0.018);
      osc.stop(t + 0.28 + idx * 0.02);
    });
  }

  /**
   * Tactical Two-Tone Data-Link Ping when commanding Allied Wingman Go2 [Q].
   */
  public playWingmanCommandPing(forceAllow: boolean = false): void {
    const ctx = this.ensureGraph(forceAllow);
    if (!ctx || !this.masterGain) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(980, t);
    osc.frequency.setValueAtTime(1480, t + 0.055);
    g.gain.setValueAtTime(0.095, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.17);
  }
}

export const proceduralAudioSynth = new ProceduralPhysicalAudioEngine();

