/** Downshift within a short window, without treating a 30 Hz screen as a slow GPU. */
export class RenderBudget {
  level = 0;
  private elapsed = 0;
  private samples = 0;
  private slow = 0;

  observe(frameSeconds: number, gpuMilliseconds?: number): boolean {
    this.elapsed += Math.min(frameSeconds, .1);
    this.samples++;
    if (gpuMilliseconds === undefined ? frameSeconds > 1 / 28 : gpuMilliseconds > 13) this.slow++;
    if (this.elapsed < .35 || this.samples < 4) return false;
    const reduce = this.level < 2 && this.slow / this.samples >= .6;
    if (reduce) this.level++;
    this.elapsed = this.samples = this.slow = 0;
    return reduce;
  }
}
