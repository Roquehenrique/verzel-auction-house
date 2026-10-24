export class CircuitOpenError extends Error {
  constructor(name: string) {
    super(`${name} is temporarily disabled after repeated failures`);
    this.name = 'CircuitOpenError';
  }
}

// Stops calling an external API for a while after consecutive failures, so
// users get the cached data immediately instead of waiting for timeouts and we
// don't hammer an API that is already struggling.
//
//   closed    -> calls go through; `threshold` consecutive failures open it
//   open      -> calls fail fast with CircuitOpenError for `cooldownMs`
//   half-open -> after the cooldown, the next call is a trial: success closes
//                the circuit, failure opens it again
export class CircuitBreaker {
  private consecutiveFailures = 0;
  private openedAt: number | null = null;

  constructor(
    readonly name: string,
    private readonly threshold = 3,
    private readonly cooldownMs = 30_000,
    private readonly now: () => number = Date.now,
  ) {}

  get state(): 'closed' | 'open' | 'half-open' {
    if (this.openedAt === null) return 'closed';
    return this.now() - this.openedAt < this.cooldownMs ? 'open' : 'half-open';
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'open') throw new CircuitOpenError(this.name);

    try {
      const result = await operation();
      this.consecutiveFailures = 0;
      this.openedAt = null;
      return result;
    } catch (error) {
      this.consecutiveFailures++;
      if (this.consecutiveFailures >= this.threshold) this.openedAt = this.now();
      throw error;
    }
  }
}
