export class RateLimiter {
  private lastCall = 0

  constructor(private minIntervalMs: number) {}

  async wait(): Promise<void> {
    const now = Date.now()
    const elapsed = now - this.lastCall
    if (elapsed < this.minIntervalMs) {
      await sleep(this.minIntervalMs - elapsed)
    }
    this.lastCall = Date.now()
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export const xhsLimiter = new RateLimiter(2000)  // 2 秒间隔
export const claudeLimiter = new RateLimiter(1000) // 1 秒间隔
