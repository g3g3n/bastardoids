import afterburnerLoopUrl from "../assets/sfx/afterburner-loop.mp3";
import bump1Url from "../assets/sfx/bump-1.mp3";
import crash1Url from "../assets/sfx/crash-1.mp3";
import explosion1Url from "../assets/sfx/explosion-1.mp3";
import explosion2Url from "../assets/sfx/explosion-2.mp3";
import laserHitUrl from "../assets/sfx/laser-hit.mp3";
import laserShot1Url from "../assets/sfx/laser-shot-1.mp3";
import plasmaOrbShot1Url from "../assets/sfx/plasmaOrb-shot-1.mp3";
import thrustersLongLoopUrl from "../assets/sfx/thrusters-long-loop.mp3";
import type { SoundEffectName } from "../types";

export interface PlaySfxOptions {
  volume?: number;
  playbackRateMin?: number;
  playbackRateMax?: number;
  offsetSeconds?: number;
  durationSeconds?: number;
}

export interface LoopSfxOptions {
  volume?: number;
  playbackRate?: number;
  offsetSeconds?: number;
}

const SFX_ASSET_URLS: Record<SoundEffectName, string> = {
  afterburnerLoop: afterburnerLoopUrl,
  crash1: crash1Url,
  bump1: bump1Url,
  explosion1: explosion1Url,
  explosion2: explosion2Url,
  laserHit: laserHitUrl,
  laserShot1: laserShot1Url,
  plasmaOrbShot1: plasmaOrbShot1Url,
  thrustersLongLoop: thrustersLongLoopUrl,
};

interface ActiveLoopPlayback {
  name: SoundEffectName;
  source: AudioBufferSourceNode;
  gainNode: GainNode;
}

type BrowserAudioContext = typeof AudioContext;

function getAudioContextConstructor(): BrowserAudioContext | null {
  const browserWindow = window as typeof window & {
    webkitAudioContext?: BrowserAudioContext;
  };

  return globalThis.AudioContext ?? browserWindow.webkitAudioContext ?? null;
}

export class AudioSystem {
  private readonly context: AudioContext | null;
  private readonly masterGain: GainNode | null;
  private readonly sfxGain: GainNode | null;
  private readonly buffers = new Map<SoundEffectName, AudioBuffer>();
  private readonly loading = new Map<SoundEffectName, Promise<AudioBuffer>>();
  private readonly activeLoops = new Map<string, ActiveLoopPlayback>();

  constructor() {
    const AudioContextConstructor = getAudioContextConstructor();
    if (!AudioContextConstructor) {
      this.context = null;
      this.masterGain = null;
      this.sfxGain = null;
      return;
    }

    this.context = new AudioContextConstructor();
    this.masterGain = this.context.createGain();
    this.sfxGain = this.context.createGain();
    this.masterGain.gain.value = 1;
    this.sfxGain.gain.value = 1;
    this.sfxGain.connect(this.masterGain);
    this.masterGain.connect(this.context.destination);

    void this.preloadAll();
  }

  unlock(): void {
    if (this.context?.state === "suspended") {
      void this.context.resume();
    }
  }

  playSfx(name: SoundEffectName | undefined, options: PlaySfxOptions = {}): void {
    if (!name || !this.context || !this.sfxGain) {
      return;
    }

    this.unlock();

    const buffer = this.buffers.get(name);
    if (!buffer) {
      void this.ensureBuffer(name);
      return;
    }

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = this.randomBetween(
      options.playbackRateMin ?? 1,
      options.playbackRateMax ?? 1,
    );

    const gainNode = this.context.createGain();
    gainNode.gain.value = options.volume ?? 1;

    source.connect(gainNode);
    gainNode.connect(this.sfxGain);
    const offsetSeconds = Math.max(0, options.offsetSeconds ?? 0);
    const maxDuration = Math.max(0, buffer.duration - offsetSeconds);
    const durationSeconds =
      options.durationSeconds === undefined
        ? undefined
        : Math.max(0, Math.min(options.durationSeconds, maxDuration));

    if (durationSeconds !== undefined) {
      source.start(0, offsetSeconds, durationSeconds);
    } else {
      source.start(0, offsetSeconds);
    }
    source.onended = () => {
      source.disconnect();
      gainNode.disconnect();
    };
  }

  playLoop(
    loopId: string,
    name: SoundEffectName | undefined,
    options: LoopSfxOptions = {},
  ): void {
    if (!loopId || !name || !this.context || !this.sfxGain) {
      return;
    }

    this.unlock();

    const buffer = this.buffers.get(name);
    if (!buffer) {
      void this.ensureBuffer(name);
      return;
    }

    const existingLoop = this.activeLoops.get(loopId);
    if (existingLoop) {
      if (existingLoop.name === name) {
        existingLoop.source.playbackRate.value = options.playbackRate ?? 1;
        existingLoop.gainNode.gain.cancelScheduledValues(this.context.currentTime);
        existingLoop.gainNode.gain.setValueAtTime(
          existingLoop.gainNode.gain.value,
          this.context.currentTime,
        );
        existingLoop.gainNode.gain.linearRampToValueAtTime(
          options.volume ?? 1,
          this.context.currentTime + 0.04,
        );
        return;
      }

      this.stopLoop(loopId);
    }

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.playbackRate.value = options.playbackRate ?? 1;

    const gainNode = this.context.createGain();
    gainNode.gain.value = 0;

    source.connect(gainNode);
    gainNode.connect(this.sfxGain);

    const offsetSeconds = Math.max(0, options.offsetSeconds ?? 0);
    source.start(0, offsetSeconds);

    const playback: ActiveLoopPlayback = {
      name,
      source,
      gainNode,
    };
    this.activeLoops.set(loopId, playback);
    gainNode.gain.linearRampToValueAtTime(options.volume ?? 1, this.context.currentTime + 0.04);
    source.onended = () => {
      const activeLoop = this.activeLoops.get(loopId);
      if (activeLoop?.source === source) {
        this.activeLoops.delete(loopId);
      }
      source.disconnect();
      gainNode.disconnect();
    };
  }

  stopLoop(loopId: string, fadeOutSeconds = 0.04): void {
    if (!this.context) {
      return;
    }

    const activeLoop = this.activeLoops.get(loopId);
    if (!activeLoop) {
      return;
    }
    this.activeLoops.delete(loopId);

    const stopAt = this.context.currentTime + Math.max(0.01, fadeOutSeconds);
    activeLoop.gainNode.gain.cancelScheduledValues(this.context.currentTime);
    activeLoop.gainNode.gain.setValueAtTime(
      activeLoop.gainNode.gain.value,
      this.context.currentTime,
    );
    activeLoop.gainNode.gain.linearRampToValueAtTime(0, stopAt);
    activeLoop.source.stop(stopAt + 0.01);
  }

  stopAllLoops(): void {
    for (const loopId of this.activeLoops.keys()) {
      this.stopLoop(loopId);
    }
  }

  private async preloadAll(): Promise<void> {
    await Promise.all(
      (Object.keys(SFX_ASSET_URLS) as SoundEffectName[]).map((name) => this.ensureBuffer(name)),
    );
  }

  private async ensureBuffer(name: SoundEffectName): Promise<AudioBuffer> {
    const existingBuffer = this.buffers.get(name);
    if (existingBuffer) {
      return existingBuffer;
    }

    const existingLoad = this.loading.get(name);
    if (existingLoad) {
      return existingLoad;
    }

    const loadPromise = this.loadBuffer(name);
    this.loading.set(name, loadPromise);

    try {
      const buffer = await loadPromise;
      this.buffers.set(name, buffer);
      return buffer;
    } finally {
      this.loading.delete(name);
    }
  }

  private async loadBuffer(name: SoundEffectName): Promise<AudioBuffer> {
    if (!this.context) {
      throw new Error("Cannot load audio buffer without an audio context.");
    }

    const response = await fetch(SFX_ASSET_URLS[name]);
    const arrayBuffer = await response.arrayBuffer();
    return await this.context.decodeAudioData(arrayBuffer.slice(0));
  }

  private randomBetween(min: number, max: number): number {
    if (max <= min) {
      return min;
    }

    return min + Math.random() * (max - min);
  }
}
