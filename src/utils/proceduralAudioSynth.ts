import {
  computeFocServoAcousticParams,
  computeTurbofanAcousticParams
} from './sciTechEngine';

/**
 * Module 5: Zero-External-File Procedural Physical WebAudio DSP Synthesizer.
 * Synthesizes in pure native WebAudio code (zero .mp3/.wav network loads):
 * 1. FOC Brushless Servo & Harmonic Drive variable-frequency whine (180Hz ~ 1,400Hz) driven by Σ|Δq/Δt|
 * 2. CFM56 N1/N2 Dual-Spool Turbofan Blade Passing Frequency (BPF) scream + pink-noise jet roar
 * 3. Ping360 2.4kHz Abyssal Sonar Ping with bounded underwater delay/feedback reverb + Sub-Bass impacts
 * 4. Master Brickwall Limiter / DynamicsCompressor, strict mute gate, 18-voice polyphony guard,
 *    shared pre-allocated Pink/White noise buffers, cyclic DelayNode teardown, and 3D Stereo Panning.
 */
class ProceduralPhysicalAudioEngine {
  private static readonly MAX_ACTIVE_TRANSIENTS = 18;

  private ctx: AudioContext | null = null;
  private enabled = false;

  // Master bus + brickwall limiter
  private masterGain: GainNode | null = null;
  private masterLimiter: DynamicsCompressorNode | null = null;

  // Shared pre-allocated noise buffers (allocated strictly once per AudioContext)
  private whiteNoiseBuf: AudioBuffer | null = null;
  private pinkNoiseBuf: AudioBuffer | null = null;

  // Persistent continuous FOC Servo + Turbofan synth nodes
  private servoOscA: OscillatorNode | null = null;
  private servoOscB: OscillatorNode | null = null;
  private servoFilter: BiquadFilterNode | null = null;
  private servoGain: GainNode | null = null;

  private fanN1Osc: OscillatorNode | null = null;
  private fanN2Osc: OscillatorNode | null = null;
  private jetNoiseSrc: AudioBufferSourceNode | null = null;
  private jetFilter: BiquadFilterNode | null = null;
  private aeroGain: GainNode | null = null;

  private activeTransients = 0;
  private lastSonarPingAt = 0;
  private masterVolume = 0.85;
  private lastHoverTickAt = 0;
  private lastSliderHissAt = 0;
  private gestureUnlockInstalled = false;

  constructor() {
    this.installAutoGestureUnlock();
  }

  public installAutoGestureUnlock(): void {
    if (this.gestureUnlockInstalled || typeof window === 'undefined') return;
    this.gestureUnlockInstalled = true;
    const unlock = () => {
      if (this.enabled && this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
    };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public getVolume(): number {
    return this.masterVolume;
  }

  public setVolume(vol01: number): void {
    this.masterVolume = Math.max(0, Math.min(1, Number.isFinite(vol01) ? vol01 : 0.85));
    if (this.enabled && this.ctx && this.masterGain) {
      this.masterGain.gain.setTargetAtTime(this.masterVolume, this.ctx.currentTime, 0.03);
    }
  }

  public setEnabled(next: boolean): void {
    this.enabled = next;
    if (next) {
      const ctx = this.ensureGraph();
      if (ctx && this.masterGain) {
        this.masterGain.gain.cancelScheduledValues(ctx.currentTime);
        this.masterGain.gain.setTargetAtTime(this.masterVolume, ctx.currentTime, 0.03);
      }
      this.playMechanicalLatchClick(680);
    } else if (this.ctx && this.masterGain) {
      const t = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(t);
      this.masterGain.gain.setTargetAtTime(0.0, t, 0.025);
      this.silenceContinuousLoops();
    }
  }

  /**
   * Ensures the WebAudio DSP graph is initialized.
   * Strict mute invariant: NEVER creates/resumes AudioContext or raises masterGain when `!this.enabled`,
   * even if legacy callers pass `forceAllow = true`.
   */
  private ensureGraph(_forceAllow: boolean = false): AudioContext | null {
    if (!this.enabled || typeof window === 'undefined') return null;

    if (!this.ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      const ctx = new AC();
      this.ctx = ctx;

      // Master DynamicsCompressor / Limiter between masterGain and destination to prevent digital clipping
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -6;
      limiter.knee.value = 12;
      limiter.ratio.value = 10;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.14;
      limiter.connect(ctx.destination);
      this.masterLimiter = limiter;

      const master = ctx.createGain();
      master.gain.value = this.masterVolume;
      master.connect(limiter);
      this.masterGain = master;

      // Pre-allocate shared White Noise (2.2s) & Pink Noise (2.0s Paul Kellet 1/f) buffers once
      const whiteLen = Math.floor(ctx.sampleRate * 2.2);
      const whiteBuf = ctx.createBuffer(1, whiteLen, ctx.sampleRate);
      const whiteData = whiteBuf.getChannelData(0);
      for (let i = 0; i < whiteLen; i++) {
        whiteData[i] = Math.random() * 2 - 1;
      }
      this.whiteNoiseBuf = whiteBuf;

      const pinkLen = Math.floor(ctx.sampleRate * 2.0);
      const pinkBuf = ctx.createBuffer(1, pinkLen, ctx.sampleRate);
      const pinkOut = pinkBuf.getChannelData(0);
      let b0 = 0,
        b1 = 0,
        b2 = 0,
        b3 = 0,
        b4 = 0,
        b5 = 0,
        b6 = 0;
      for (let i = 0; i < pinkLen; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.969 * b2 + white * 0.153852;
        b3 = 0.8665 * b3 + white * 0.3104856;
        b4 = 0.55 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.016898;
        pinkOut[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
      }
      this.pinkNoiseBuf = pinkBuf;

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
    return this.ctx;
  }

  private canSpawnTransient(): boolean {
    return this.activeTransients < ProceduralPhysicalAudioEngine.MAX_ACTIVE_TRANSIENTS;
  }

  /**
   * Creates an optional 3D StereoPannerNode (`pan` in [-1, 1]) connected to masterGain,
   * or connects directly to masterGain when centered to save DSP nodes.
   */
  private createOutputDestination(
    ctx: AudioContext,
    pan?: number
  ): { dest: AudioNode; panner: StereoPannerNode | null } {
    if (
      pan !== undefined &&
      Number.isFinite(pan) &&
      Math.abs(pan) > 0.001 &&
      typeof ctx.createStereoPanner === 'function'
    ) {
      const panner = ctx.createStereoPanner();
      panner.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), ctx.currentTime);
      panner.connect(this.masterGain!);
      return { dest: panner, panner };
    }
    return { dest: this.masterGain!, panner: null };
  }

  /**
   * Attaches `onended` lifecycle cleanup to a transient OscillatorNode / AudioBufferSourceNode,
   * disconnecting all downstream filter/gain/panner nodes and maintaining the polyphony counter.
   */
  private registerTransientCleanup(
    source: AudioScheduledSourceNode,
    nodesToDisconnect: (AudioNode | null | undefined)[],
    countPolyphonySlot: boolean = true
  ): void {
    if (countPolyphonySlot) {
      this.activeTransients++;
    }
    let cleaned = false;
    source.onended = () => {
      if (cleaned) return;
      cleaned = true;
      if (countPolyphonySlot) {
        this.activeTransients = Math.max(0, this.activeTransients - 1);
      }
      try {
        source.disconnect();
      } catch {}
      for (const node of nodesToDisconnect) {
        if (!node) continue;
        try {
          node.disconnect();
        } catch {}
      }
    };
  }

  /**
   * Updates continuous FOC Brushless Servo & Harmonic Drive whine every frame from Σ|Δq/Δt| and peak |τ|.
   */
  public updateFocServoTelemetry(
    sumJointSpeedRadS: number,
    isSubseaRov: boolean = false,
    simTime: number = 0,
    peakTorqueRatio01: number = 0
  ): void {
    const ctx = this.ensureGraph();
    if (!ctx || !this.servoOscA || !this.servoOscB || !this.servoFilter || !this.servoGain) return;

    // Silence aero engine while in Hangar / Mars / ROV view
    if (this.aeroGain) {
      this.aeroGain.gain.setTargetAtTime(0.0, ctx.currentTime, 0.08);
    }

    const params = computeFocServoAcousticParams(sumJointSpeedRadS);
    const torqueBoost = Math.max(0, Math.min(1, peakTorqueRatio01));
    const t = ctx.currentTime;
    this.servoOscA.frequency.setTargetAtTime(
      params.primaryCarrierHz * (1 + torqueBoost * 0.18),
      t,
      0.035
    );
    this.servoOscB.frequency.setTargetAtTime(
      params.harmonicSidebandHz * (1 + torqueBoost * 0.24),
      t,
      0.035
    );
    this.servoFilter.frequency.setTargetAtTime(
      params.primaryCarrierHz * (1.25 + torqueBoost * 0.35),
      t,
      0.04
    );
    this.servoGain.gain.setTargetAtTime(
      Math.min(0.14, params.gain * (1 + torqueBoost * 0.45)),
      t,
      0.045
    );

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
  public playMechanicalLatchClick(
    pitchHz: number = 760,
    forceAllow: boolean = false,
    pan?: number
  ): void {
    const ctx = this.ensureGraph(forceAllow);
    if (!ctx || !this.masterGain || !this.canSpawnTransient()) return;
    const t = ctx.currentTime;
    const { dest, panner } = this.createOutputDestination(ctx, pan);

    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(pitchHz, t);
    osc.frequency.exponentialRampToValueAtTime(190, t + 0.065);

    g.gain.setValueAtTime(0.09, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);

    osc.connect(g);
    g.connect(dest);
    this.registerTransientCleanup(osc, [g, panner], true);
    osc.start(t);
    osc.stop(t + 0.075);
  }

  /**
   * Ethereal 2.4kHz Ping360 subsea acoustic sonar pulse with multi-tap underwater delay echo.
   * Explicitly breaks and disconnects the cyclic `delay -> lp -> feedback -> delay` network after decay.
   */
  public playSonarPing2400Hz(pan?: number): void {
    const ctx = this.ensureGraph();
    if (!ctx || !this.masterGain || !this.canSpawnTransient()) return;
    const t = ctx.currentTime;
    const { dest, panner } = this.createOutputDestination(ctx, pan);

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
    pingGain.connect(dest);
    pingGain.connect(delay);
    delay.connect(lp);
    lp.connect(feedback);
    feedback.connect(delay);
    lp.connect(dest);

    this.registerTransientCleanup(pingOsc, [], true);
    pingOsc.start(t);
    pingOsc.stop(t + 0.26);

    if (typeof window !== 'undefined') {
      window.setTimeout(() => {
        try {
          feedback.gain.value = 0;
          pingGain.disconnect();
          delay.disconnect();
          lp.disconnect();
          feedback.disconnect();
          panner?.disconnect();
        } catch {}
      }, 2200);
    }
  }

  /**
   * Deep Sub-Bass Drop + High-Energy Transient for Laser Fire, EMP, SLS Laser Ignition, and Bullet-Time Freeze!
   */
  public playSubBassImpact(
    mode: 'laser' | 'emp_bullettime' | 'sls_print',
    pan?: number
  ): void {
    const ctx = this.ensureGraph();
    if (!ctx || !this.masterGain || !this.canSpawnTransient()) return;
    const t = ctx.currentTime;
    const { dest, panner } = this.createOutputDestination(ctx, pan);

    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = 'sine';

    if (mode === 'emp_bullettime') {
      sub.frequency.setValueAtTime(135, t);
      sub.frequency.exponentialRampToValueAtTime(26, t + 0.65);
      subGain.gain.setValueAtTime(0.18, t);
      subGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.68);
      sub.connect(subGain);
      subGain.connect(dest);
      this.registerTransientCleanup(sub, [subGain, panner], true);
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
      subGain.connect(dest);
      this.registerTransientCleanup(sub, [subGain, panner], true);
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
    subGain.connect(dest);
    zing.connect(zingGain);
    zingGain.connect(dest);

    this.registerTransientCleanup(sub, [subGain, panner], true);
    this.registerTransientCleanup(zing, [zingGain], false);
    sub.start(t);
    sub.stop(t + 0.38);
    zing.start(t);
    zing.stop(t + 0.25);
  }

  /**
   * Sandbox Domain Fire Cue (replaces legacy rogue TacticalSynthAudio context).
   */
  public playSandboxFireCue(domain: 'land' | 'sea' | 'air', pan?: number): void {
    const ctx = this.ensureGraph();
    if (!ctx || !this.masterGain || !this.canSpawnTransient()) return;
    const t = ctx.currentTime;
    const { dest, panner } = this.createOutputDestination(ctx, pan);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(dest);

    if (domain === 'air') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(145, t);
      osc.frequency.exponentialRampToValueAtTime(32, t + 0.48);
      gain.gain.setValueAtTime(0.18, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      this.registerTransientCleanup(osc, [gain, panner], true);
      osc.start(t);
      osc.stop(t + 0.52);

      if (this.pinkNoiseBuf) {
        const nSrc = ctx.createBufferSource();
        nSrc.buffer = this.pinkNoiseBuf;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(640, t);
        bp.Q.value = 1.2;
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.11, t);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.36);
        nSrc.connect(bp);
        bp.connect(ng);
        ng.connect(dest);
        this.registerTransientCleanup(nSrc, [bp, ng], false);
        nSrc.start(t, Math.random() * 0.8, 0.38);
      }
    } else if (domain === 'sea') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(620, t);
      osc.frequency.exponentialRampToValueAtTime(190, t + 0.36);
      gain.gain.setValueAtTime(0.15, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
      this.registerTransientCleanup(osc, [gain, panner], true);
      osc.start(t);
      osc.stop(t + 0.4);
    } else {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(980, t);
      osc.frequency.exponentialRampToValueAtTime(160, t + 0.28);
      gain.gain.setValueAtTime(0.15, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      this.registerTransientCleanup(osc, [gain, panner], true);
      osc.start(t);
      osc.stop(t + 0.32);

      if (this.whiteNoiseBuf) {
        const nSrc = ctx.createBufferSource();
        nSrc.buffer = this.whiteNoiseBuf;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(2200, t);
        bp.Q.value = 2.4;
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.09, t);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.055);
        nSrc.connect(bp);
        bp.connect(ng);
        ng.connect(dest);
        this.registerTransientCleanup(nSrc, [bp, ng], false);
        nSrc.start(t, Math.random() * 1.2, 0.06);
      }
    }
  }

  /**
   * Bullet-Time Time-Dilation Enter / Exit Sweep Cue.
   */
  public playBulletTimeSnap(entering: boolean, pan?: number): void {
    const ctx = this.ensureGraph();
    if (!ctx || !this.masterGain || !this.canSpawnTransient()) return;
    const t = ctx.currentTime;
    const { dest, panner } = this.createOutputDestination(ctx, pan);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(entering ? 520 : 120, t);
    osc.frequency.exponentialRampToValueAtTime(entering ? 54 : 680, t + 0.28);
    gain.gain.setValueAtTime(0.13, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    osc.connect(gain);
    gain.connect(dest);
    this.registerTransientCleanup(osc, [gain, panner], true);
    osc.start(t);
    osc.stop(t + 0.32);
  }

  /**
   * Death Stranding Odradek 3-Layer Signature Sound (Zero Per-Hit Buffer Allocations):
   * 1) 0 ~ 0.12s: Crisp metallic vane Click-Clack bandpass noise burst using shared whiteNoiseBuf;
   * 2) 0.10 ~ 0.80s: Spatial low-frequency sonar sweep dive (160Hz -> 38Hz sine resonance);
   * 3) 0.15 ~ 2.05s: Ethereal Kojima-style FM fifth-interval overtone chord (440Hz / 659.25Hz / 987.77Hz)
   *                  routed through a stereo Ping-Pong Delay tail that cleanly disconnects at 2200ms!
   */
  public playOdradekScanSignature(forceAllow: boolean = false): void {
    const ctx = this.ensureGraph(forceAllow);
    if (!ctx || !this.masterGain || !this.canSpawnTransient()) return;
    const t = ctx.currentTime;

    // Layer 1 (0 ~ 0.12s): Crisp Metallic Click-Clack Double Vane Snap via shared whiteNoiseBuf
    if (this.whiteNoiseBuf) {
      const snapSrc = ctx.createBufferSource();
      snapSrc.buffer = this.whiteNoiseBuf;
      const snapBp = ctx.createBiquadFilter();
      snapBp.type = 'bandpass';
      snapBp.frequency.setValueAtTime(2650, t);
      snapBp.Q.value = 4.2;
      const snapGain = ctx.createGain();
      snapGain.gain.setValueAtTime(0.24, t);
      snapGain.gain.exponentialRampToValueAtTime(0.002, t + 0.038);
      snapGain.gain.setValueAtTime(0.27, t + 0.055);
      snapGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      snapSrc.connect(snapBp);
      snapBp.connect(snapGain);
      snapGain.connect(this.masterGain);
      this.registerTransientCleanup(snapSrc, [snapBp, snapGain], false);
      snapSrc.start(t, Math.random() * 1.2, 0.13);
    }

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
    this.registerTransientCleanup(subDive, [subDiveGain], true);
    subDive.start(t + 0.09);
    subDive.stop(t + 0.86);

    // Layer 3 (0.15 ~ 2.05s): Ethereal FM Fifth-Interval Chord + Bounded Stereo Ping-Pong Delay
    const chordBus = ctx.createGain();
    chordBus.gain.setValueAtTime(0.0001, t);
    chordBus.gain.linearRampToValueAtTime(0.11, t + 0.24);
    chordBus.gain.exponentialRampToValueAtTime(0.0001, t + 2.02);
    chordBus.connect(this.masterGain);

    const delayL = ctx.createDelay(0.6);
    const delayR = ctx.createDelay(0.6);
    delayL.delayTime.value = 0.22;
    delayR.delayTime.value = 0.33;
    const fbL = ctx.createGain();
    const fbR = ctx.createGain();
    fbL.gain.value = 0.36;
    fbR.gain.value = 0.34;
    const lpEcho = ctx.createBiquadFilter();
    lpEcho.type = 'lowpass';
    lpEcho.frequency.value = 3200;
    const merger = ctx.createChannelMerger(2);
    const wetGain = ctx.createGain();
    wetGain.gain.setValueAtTime(0.09, t);
    wetGain.gain.exponentialRampToValueAtTime(0.0001, t + 2.12);

    chordBus.connect(delayL);
    delayL.connect(lpEcho);
    lpEcho.connect(fbL);
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
      modGain.gain.exponentialRampToValueAtTime(1.5, t + 1.5);

      voiceGain.gain.setValueAtTime(0.36 / (idx + 1), t + 0.15);

      mod.connect(modGain);
      modGain.connect(carrier.frequency);
      carrier.connect(voiceGain);
      voiceGain.connect(chordBus);

      this.registerTransientCleanup(mod, [modGain], false);
      this.registerTransientCleanup(carrier, [voiceGain], false);

      mod.start(t + 0.15 + idx * 0.035);
      carrier.start(t + 0.15 + idx * 0.035);
      mod.stop(t + 2.05);
      carrier.stop(t + 2.05);
    });

    if (typeof window !== 'undefined') {
      window.setTimeout(() => {
        try {
          fbL.gain.value = 0;
          fbR.gain.value = 0;
          chordBus.disconnect();
          delayL.disconnect();
          delayR.disconnect();
          lpEcho.disconnect();
          fbL.disconnect();
          fbR.disconnect();
          merger.disconnect();
          wetGain.disconnect();
        } catch {}
      }, 2200);
    }
  }

  /**
   * Titanfall 2 Orbital Dropfall Deployment Audio:
   * - 'launch_fall': Supersonic atmospheric reentry shriek + retro-thruster burn
   * - 'touchdown_rise': Heavy seismic ground slam + rising URDF hydraulic servo stand-up whine!
   */
  public playOrbitalDropfallAudio(
    phase: 'launch_fall' | 'touchdown_rise',
    forceAllow: boolean = false,
    pan?: number
  ): void {
    const ctx = this.ensureGraph(forceAllow);
    if (!ctx || !this.masterGain || !this.canSpawnTransient()) return;
    const t = ctx.currentTime;
    const { dest, panner } = this.createOutputDestination(ctx, pan);

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
      shriekGain.connect(dest);
      this.registerTransientCleanup(shriek, [shriekGain, panner], true);
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
    slamGain.connect(dest);
    this.registerTransientCleanup(slam, [slamGain], false);
    slam.start(t);
    slam.stop(t + 0.64);

    const servoRise = ctx.createOscillator();
    const servoGain = ctx.createGain();
    servoRise.type = 'triangle';
    servoRise.frequency.setValueAtTime(195, t + 0.32);
    servoRise.frequency.exponentialRampToValueAtTime(860, t + 0.88);
    servoGain.gain.setValueAtTime(0.0001, t + 0.3);
    servoGain.gain.linearRampToValueAtTime(0.095, t + 0.42);
    servoGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.92);
    servoRise.connect(servoGain);
    servoGain.connect(dest);
    this.registerTransientCleanup(servoRise, [servoGain, panner], true);
    servoRise.start(t + 0.31);
    servoRise.stop(t + 0.94);
  }

  /**
   * Armored Core 6 Overheat Armor-Pop Steam Venting & Mechanical Lock-Shut Audio (Zero Buffer Allocation).
   */
  public playOverheatVentAudio(
    phase: 'open_steam' | 'lock_shut',
    forceAllow: boolean = false,
    pan?: number
  ): void {
    const ctx = this.ensureGraph(forceAllow);
    if (!ctx || !this.masterGain) return;
    const t = ctx.currentTime;

    if (phase === 'lock_shut') {
      this.playMechanicalLatchClick(880, forceAllow, pan);
      if (typeof window !== 'undefined') {
        window.setTimeout(() => this.playMechanicalLatchClick(540, forceAllow, pan), 55);
      }
      return;
    }

    this.playMechanicalLatchClick(940, forceAllow, pan);
    if (!this.whiteNoiseBuf || !this.canSpawnTransient()) return;
    const { dest, panner } = this.createOutputDestination(ctx, pan);

    const src = ctx.createBufferSource();
    src.buffer = this.whiteNoiseBuf;
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
    g.connect(dest);
    this.registerTransientCleanup(src, [bp, g, panner], true);
    src.start(t, 0, 2.1);
  }

  /**
   * Call of Duty style crisp tactical hitmarker audio tick ("thwack-tick" + metallic kill chime).
   * Reuses pre-allocated whiteNoiseBuf so 30 rapid hits trigger zero synchronous buffer allocations.
   */
  public playCodHitmarkerTick(
    isCritOrStagger: boolean = false,
    isKill: boolean = false,
    forceAllow: boolean = false,
    pan?: number
  ): void {
    const ctx = this.ensureGraph(forceAllow);
    if (!ctx || !this.masterGain || !this.whiteNoiseBuf || !this.canSpawnTransient()) return;
    const t = ctx.currentTime;
    const { dest, panner } = this.createOutputDestination(ctx, pan);

    const src = ctx.createBufferSource();
    src.buffer = this.whiteNoiseBuf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(isCritOrStagger ? 3100 : 2350, t);
    bp.Q.value = 3.6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(isCritOrStagger ? 0.24 : 0.16, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.042);

    src.connect(bp);
    bp.connect(g);
    g.connect(dest);

    const hasChime = isCritOrStagger || isKill;
    this.registerTransientCleanup(src, hasChime ? [bp, g] : [bp, g, panner], !hasChime);
    src.start(t, Math.random() * 1.5, 0.045);

    if (hasChime) {
      const ping = ctx.createOscillator();
      const pg = ctx.createGain();
      ping.type = 'triangle';
      ping.frequency.setValueAtTime(isKill ? 1320 : 980, t);
      ping.frequency.exponentialRampToValueAtTime(isKill ? 1980 : 620, t + 0.09);
      pg.gain.setValueAtTime(0.11, t);
      pg.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
      ping.connect(pg);
      pg.connect(dest);
      this.registerTransientCleanup(ping, [pg, panner], true);
      ping.start(t);
      ping.stop(t + 0.12);
    }
  }

  /**
   * Sci-Fi Weapon Fire Audio (Pulse Rifle / Railgun Crack / Homing Missile Pod / Orbital Ion)
   * Enriched with layered transient noise punch + sub-bass body.
   */
  public playCombatWeaponFire(
    weapon: 'pulse_rifle' | 'railgun' | 'missile_pod' | 'orbital_ion',
    forceAllow: boolean = false,
    pan?: number
  ): void {
    const ctx = this.ensureGraph(forceAllow);
    if (!ctx || !this.masterGain || !this.canSpawnTransient()) return;
    const t = ctx.currentTime;
    const jitter = 0.94 + Math.random() * 0.12;
    const { dest, panner } = this.createOutputDestination(ctx, pan);

    if (weapon === 'pulse_rifle') {
      // Layer 1: Plasma carrier bolt
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(780 * jitter, t);
      osc.frequency.exponentialRampToValueAtTime(145, t + 0.085);
      g.gain.setValueAtTime(0.085, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      osc.connect(g);
      g.connect(dest);
      this.registerTransientCleanup(osc, [g, panner], true);
      osc.start(t);
      osc.stop(t + 0.095);

      // Layer 2: Tight sub-bass chest thump
      const sub = ctx.createOscillator();
      const sg = ctx.createGain();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(148 * jitter, t);
      sub.frequency.exponentialRampToValueAtTime(48, t + 0.072);
      sg.gain.setValueAtTime(0.11, t);
      sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.078);
      sub.connect(sg);
      sg.connect(dest);
      this.registerTransientCleanup(sub, [sg], false);
      sub.start(t);
      sub.stop(t + 0.082);

      // Layer 3: Crisp transient white-noise muzzle snap
      if (this.whiteNoiseBuf) {
        const nSrc = ctx.createBufferSource();
        nSrc.buffer = this.whiteNoiseBuf;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(2550 * jitter, t);
        bp.Q.value = 2.4;
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.095, t);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
        nSrc.connect(bp);
        bp.connect(ng);
        ng.connect(dest);
        this.registerTransientCleanup(nSrc, [bp, ng], false);
        nSrc.start(t, Math.random() * 1.4, 0.034);
      }
      return;
    }

    if (weapon === 'railgun') {
      // Layer 1: Deep electromagnetic capacitor sub-bass discharge
      const sub = ctx.createOscillator();
      const sg = ctx.createGain();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(220, t);
      sub.frequency.exponentialRampToValueAtTime(30, t + 0.32);
      sg.gain.setValueAtTime(0.24, t);
      sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
      sub.connect(sg);
      sg.connect(dest);
      this.registerTransientCleanup(sub, [sg, panner], true);
      sub.start(t);
      sub.stop(t + 0.35);

      // Layer 2: Hypersonic Lorentz rail whip
      const whip = ctx.createOscillator();
      const wg = ctx.createGain();
      whip.type = 'sawtooth';
      whip.frequency.setValueAtTime(2200 * jitter, t);
      whip.frequency.exponentialRampToValueAtTime(180, t + 0.18);
      wg.gain.setValueAtTime(0.11, t);
      wg.gain.exponentialRampToValueAtTime(0.0001, t + 0.19);
      whip.connect(wg);
      wg.connect(dest);
      this.registerTransientCleanup(whip, [wg], false);
      whip.start(t);
      whip.stop(t + 0.2);

      // Layer 3: High-voltage arc crack transient noise punch
      if (this.whiteNoiseBuf) {
        const arcSrc = ctx.createBufferSource();
        arcSrc.buffer = this.whiteNoiseBuf;
        const hp = ctx.createBiquadFilter();
        hp.type = 'bandpass';
        hp.frequency.setValueAtTime(3200, t);
        hp.Q.value = 1.9;
        const ag = ctx.createGain();
        ag.gain.setValueAtTime(0.18, t);
        ag.gain.exponentialRampToValueAtTime(0.0001, t + 0.068);
        arcSrc.connect(hp);
        hp.connect(ag);
        ag.connect(dest);
        this.registerTransientCleanup(arcSrc, [hp, ag], false);
        arcSrc.start(t, Math.random() * 1.4, 0.075);
      }
      return;
    }

    if (weapon === 'missile_pod') {
      // Layer 1: Launch tube whistle transient
      const hiss = ctx.createOscillator();
      const hg = ctx.createGain();
      hiss.type = 'triangle';
      hiss.frequency.setValueAtTime(520 * jitter, t);
      hiss.frequency.exponentialRampToValueAtTime(1480, t + 0.16);
      hg.gain.setValueAtTime(0.085, t);
      hg.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      hiss.connect(hg);
      hg.connect(dest);
      this.registerTransientCleanup(hiss, [hg], false);
      hiss.start(t);
      hiss.stop(t + 0.19);

      // Layer 2: Breech ejection sub-bass body
      const thump = ctx.createOscillator();
      const tg = ctx.createGain();
      thump.type = 'sine';
      thump.frequency.setValueAtTime(132 * jitter, t);
      thump.frequency.exponentialRampToValueAtTime(42, t + 0.14);
      tg.gain.setValueAtTime(0.14, t);
      tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
      thump.connect(tg);
      tg.connect(dest);
      this.registerTransientCleanup(thump, [tg], false);
      thump.start(t);
      thump.stop(t + 0.16);

      // Layer 3: Solid-propellant pink-noise rocket whoosh
      if (this.pinkNoiseBuf) {
        const pSrc = ctx.createBufferSource();
        pSrc.buffer = this.pinkNoiseBuf;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(980 * jitter, t);
        bp.frequency.exponentialRampToValueAtTime(2400, t + 0.21);
        bp.Q.value = 1.4;
        const pg = ctx.createGain();
        pg.gain.setValueAtTime(0.01, t);
        pg.gain.linearRampToValueAtTime(0.16, t + 0.025);
        pg.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
        pSrc.connect(bp);
        bp.connect(pg);
        pg.connect(dest);
        this.registerTransientCleanup(pSrc, [bp, pg, panner], true);
        pSrc.start(t, Math.random() * 1.2, 0.23);
      } else {
        this.registerTransientCleanup(hiss, [hg, panner], true);
      }
      return;
    }

    // Orbital Ion Cannon Ultimate Strike (Sawtooth drop + Sub-Bass + Noise burst)
    const drop = ctx.createOscillator();
    const dg = ctx.createGain();
    drop.type = 'sawtooth';
    drop.frequency.setValueAtTime(920, t);
    drop.frequency.exponentialRampToValueAtTime(36, t + 0.85);
    dg.gain.setValueAtTime(0.22, t);
    dg.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    drop.connect(dg);
    dg.connect(dest);
    this.registerTransientCleanup(drop, [dg, panner], true);
    drop.start(t);
    drop.stop(t + 0.92);

    const ionSub = ctx.createOscillator();
    const isg = ctx.createGain();
    ionSub.type = 'sine';
    ionSub.frequency.setValueAtTime(115, t);
    ionSub.frequency.exponentialRampToValueAtTime(26, t + 0.82);
    isg.gain.setValueAtTime(0.22, t);
    isg.gain.exponentialRampToValueAtTime(0.0001, t + 0.86);
    ionSub.connect(isg);
    isg.connect(dest);
    this.registerTransientCleanup(ionSub, [isg], false);
    ionSub.start(t);
    ionSub.stop(t + 0.88);
  }

  /**
   * Armored Core 6 Boss Arrival Horn, ACS Stagger Break, and Coral Laser Telegraph Cues.
   */
  public playBossEventCue(
    event: 'boss_warning' | 'acs_stagger_break' | 'laser_charge' | 'emp_nova',
    forceAllow: boolean = false,
    pan?: number
  ): void {
    const ctx = this.ensureGraph(forceAllow);
    if (!ctx || !this.masterGain || !this.canSpawnTransient()) return;
    const t = ctx.currentTime;
    const { dest, panner } = this.createOutputDestination(ctx, pan);

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
      hg.connect(dest);
      this.registerTransientCleanup(hornA, [], false);
      this.registerTransientCleanup(hornB, [hg, panner], true);
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
      sg.connect(dest);
      this.registerTransientCleanup(sub, [sg, panner], true);
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
      ag.connect(dest);
      this.registerTransientCleanup(alarm, [ag], false);
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
      g.connect(dest);
      this.registerTransientCleanup(osc, [g, panner], true);
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
    eg.connect(dest);
    this.registerTransientCleanup(emp, [eg, panner], true);
    emp.start(t);
    emp.stop(t + 0.44);
  }

  /**
   * Hangar Unitree Push-Recovery Heavy Kinetic Impact Thud + Servo Brace Whir.
   */
  public playPushImpactThud(
    forceNewtons: number = 225,
    forceAllow: boolean = false,
    pan?: number
  ): void {
    const ctx = this.ensureGraph(forceAllow);
    if (!ctx || !this.masterGain || !this.canSpawnTransient()) return;
    const t = ctx.currentTime;
    const scale = Math.max(0.6, Math.min(1.5, forceNewtons / 220));
    const { dest, panner } = this.createOutputDestination(ctx, pan);

    const sub = ctx.createOscillator();
    const sg = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(135 * scale, t);
    sub.frequency.exponentialRampToValueAtTime(34, t + 0.21);
    sg.gain.setValueAtTime(0.24 * scale, t);
    sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
    sub.connect(sg);
    sg.connect(dest);
    this.registerTransientCleanup(sub, [sg], false);
    sub.start(t);
    sub.stop(t + 0.25);

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
    vg.connect(dest);
    this.registerTransientCleanup(servo, [vg, panner], true);
    servo.start(t);
    servo.stop(t + 0.38);
  }

  /**
   * Crystalline Plasma Shield Shatter Burst when enemy energy shield drops to 0.
   */
  public playShieldShatterBurst(forceAllow: boolean = false, pan?: number): void {
    const ctx = this.ensureGraph(forceAllow);
    if (!ctx || !this.masterGain || !this.canSpawnTransient()) return;
    const t = ctx.currentTime;
    const { dest, panner } = this.createOutputDestination(ctx, pan);

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
      g.connect(dest);
      const isLast = idx === freqs.length - 1;
      this.registerTransientCleanup(osc, isLast ? [g, panner] : [g], isLast);
      osc.start(t + idx * 0.018);
      osc.stop(t + 0.28 + idx * 0.02);
    });
  }

  /**
   * Tactical Two-Tone Data-Link Ping when commanding Allied Wingman Go2 [Q].
   */
  public playWingmanCommandPing(forceAllow: boolean = false, pan?: number): void {
    const ctx = this.ensureGraph(forceAllow);
    if (!ctx || !this.masterGain || !this.canSpawnTransient()) return;
    const t = ctx.currentTime;
    const { dest, panner } = this.createOutputDestination(ctx, pan);

    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(980, t);
    osc.frequency.setValueAtTime(1480, t + 0.055);
    g.gain.setValueAtTime(0.095, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    osc.connect(g);
    g.connect(dest);
    this.registerTransientCleanup(osc, [g, panner], true);
    osc.start(t);
    osc.stop(t + 0.17);
  }

  /**
   * Subtle high-precision optical micro-tick on CAD part hover (rate-limited to avoid chatter).
   */
  public playPartHoverTick(pan?: number): void {
    const ctx = this.ensureGraph();
    if (!ctx || !this.masterGain || !this.canSpawnTransient()) return;
    const now = performance.now();
    if (now - this.lastHoverTickAt < 55) return;
    this.lastHoverTickAt = now;

    const t = ctx.currentTime;
    const { dest, panner } = this.createOutputDestination(ctx, pan);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1820, t);
    osc.frequency.exponentialRampToValueAtTime(920, t + 0.022);
    g.gain.setValueAtTime(0.032, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.025);
    osc.connect(g);
    g.connect(dest);
    this.registerTransientCleanup(osc, [g, panner], true);
    osc.start(t);
    osc.stop(t + 0.028);
  }

  /**
   * Speed-modulated bandpass pink-noise pneumatic hiss + subtle precision ratchet micro-tick
   * while scrubbing exploded/section sliders.
   */
  public playExplosionSliderHiss(deltaAmount: number, pan?: number): void {
    const ctx = this.ensureGraph();
    if (!ctx || !this.masterGain || !this.canSpawnTransient()) return;
    const now = performance.now();
    if (now - this.lastSliderHissAt < 48) return;
    this.lastSliderHissAt = now;

    const speed = Math.min(1, Math.abs(deltaAmount) * 18);
    const t = ctx.currentTime;
    const { dest, panner } = this.createOutputDestination(ctx, pan);

    // 1. Genuine bandpass-filtered pink-noise pneumatic fixture hiss
    if (this.pinkNoiseBuf) {
      const hissSrc = ctx.createBufferSource();
      hissSrc.buffer = this.pinkNoiseBuf;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(950 + speed * 1150, t);
      bp.Q.value = 1.85;
      const hg = ctx.createGain();
      hg.gain.setValueAtTime(0.004, t);
      hg.gain.linearRampToValueAtTime(0.055 + speed * 0.075, t + 0.012);
      hg.gain.exponentialRampToValueAtTime(0.0001, t + 0.068);
      hissSrc.connect(bp);
      bp.connect(hg);
      hg.connect(dest);
      this.registerTransientCleanup(hissSrc, [bp, hg, panner], true);
      hissSrc.start(t, Math.random() * 1.3, 0.075);
    }

    // 2. Subtle CNC detent ratchet micro-tick
    const tick = ctx.createOscillator();
    const tg = ctx.createGain();
    tick.type = 'sine';
    tick.frequency.setValueAtTime(1480 + speed * 420, t);
    tick.frequency.exponentialRampToValueAtTime(440, t + 0.016);
    tg.gain.setValueAtTime(0.016 + speed * 0.02, t);
    tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.019);
    tick.connect(tg);
    tg.connect(dest);
    this.registerTransientCleanup(tick, this.pinkNoiseBuf ? [tg] : [tg, panner], !this.pinkNoiseBuf);
    tick.start(t);
    tick.stop(t + 0.022);
  }

  /**
   * Heavy damped magnetic latch thud when exploded CAD sub-assemblies snap back to 0% home.
   */
  public playMagneticSnapBackThud(forceAllow: boolean = false, pan?: number): void {
    const ctx = this.ensureGraph(forceAllow);
    if (!ctx || !this.masterGain || !this.canSpawnTransient()) return;
    const t = ctx.currentTime;
    const { dest, panner } = this.createOutputDestination(ctx, pan);

    const sub = ctx.createOscillator();
    const sg = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(148, t);
    sub.frequency.exponentialRampToValueAtTime(38, t + 0.16);
    sg.gain.setValueAtTime(0.18, t);
    sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    sub.connect(sg);
    sg.connect(dest);
    this.registerTransientCleanup(sub, [sg, panner], true);
    sub.start(t);
    sub.stop(t + 0.19);

    this.playMechanicalLatchClick(860, forceAllow, pan);
  }

  /**
   * Crystalline harmonic resonance when clicking the 3D Hexagonal Energy Shield.
   */
  public playHexShieldRippleResonance(forceAllow: boolean = false, pan?: number): void {
    const ctx = this.ensureGraph(forceAllow);
    if (!ctx || !this.masterGain || !this.canSpawnTransient()) return;
    const t = ctx.currentTime;
    const { dest, panner } = this.createOutputDestination(ctx, pan);

    const freqs = [660, 990, 1485];
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, t);
      osc.frequency.exponentialRampToValueAtTime(f * 1.12, t + 0.28 + i * 0.05);
      g.gain.setValueAtTime(0.065 / (i + 1), t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34 + i * 0.05);
      osc.connect(g);
      g.connect(dest);
      const isLast = i === freqs.length - 1;
      this.registerTransientCleanup(osc, isLast ? [g, panner] : [g], isLast);
      osc.start(t);
      osc.stop(t + 0.36 + i * 0.05);
    });
  }

  /**
   * Deep-to-bright sonar radar sweep for Tactical Topographic Pulse Wave [T].
   */
  public playTacticalPulseRadarSweep(forceAllow: boolean = false, pan?: number): void {
    const ctx = this.ensureGraph(forceAllow);
    if (!ctx || !this.masterGain || !this.canSpawnTransient()) return;
    const t = ctx.currentTime;
    const { dest, panner } = this.createOutputDestination(ctx, pan);

    const sub = ctx.createOscillator();
    const sg = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(95, t);
    sub.frequency.exponentialRampToValueAtTime(32, t + 0.45);
    sg.gain.setValueAtTime(0.16, t);
    sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.48);
    sub.connect(sg);
    sg.connect(dest);
    this.registerTransientCleanup(sub, [sg], false);
    sub.start(t);
    sub.stop(t + 0.5);

    const sweep = ctx.createOscillator();
    const wg = ctx.createGain();
    sweep.type = 'sine';
    sweep.frequency.setValueAtTime(360, t + 0.04);
    sweep.frequency.exponentialRampToValueAtTime(1640, t + 0.55);
    wg.gain.setValueAtTime(0.001, t);
    wg.gain.linearRampToValueAtTime(0.075, t + 0.1);
    wg.gain.exponentialRampToValueAtTime(0.0001, t + 0.62);
    sweep.connect(wg);
    wg.connect(dest);
    this.registerTransientCleanup(sweep, [wg, panner], true);
    sweep.start(t + 0.04);
    sweep.stop(t + 0.65);
  }
}

export const proceduralAudioSynth = new ProceduralPhysicalAudioEngine();
