export interface PerformanceSnapshot {
  fps: number;
  frameMs: number;
  workMs: number;
}

export class PerformanceMonitor {
  private readonly sampleSize: number;
  private frameSamples: number[] = [];
  private workSamples: number[] = [];
  private lastFrameAt = performance.now();
  private workStartedAt = 0;

  constructor(sampleSize = 60) {
    this.sampleSize = sampleSize;
  }

  beginFrame(): void {
    const now = performance.now();
    this.pushSample(this.frameSamples, now - this.lastFrameAt);
    this.lastFrameAt = now;
    this.workStartedAt = now;
  }

  endFrame(): void {
    if (this.workStartedAt <= 0) {
      return;
    }

    this.pushSample(this.workSamples, performance.now() - this.workStartedAt);
  }

  getSnapshot(): PerformanceSnapshot {
    const frameMs = this.average(this.frameSamples);
    const workMs = this.average(this.workSamples);
    return {
      fps: frameMs > 0 ? 1000 / frameMs : 0,
      frameMs,
      workMs,
    };
  }

  private pushSample(samples: number[], value: number): void {
    samples.push(value);
    if (samples.length > this.sampleSize) {
      samples.shift();
    }
  }

  private average(samples: number[]): number {
    if (samples.length === 0) {
      return 0;
    }

    let total = 0;
    for (const sample of samples) {
      total += sample;
    }
    return total / samples.length;
  }
}
