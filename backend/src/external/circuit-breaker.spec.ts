import { CircuitBreaker, CircuitOpenError } from './circuit-breaker.js';

describe('CircuitBreaker', () => {
  let now: number;
  let breaker: CircuitBreaker;
  const fail = () => Promise.reject(new Error('API down'));
  const succeed = () => Promise.resolve('ok');

  beforeEach(() => {
    now = 0;
    breaker = new CircuitBreaker('API', 3, 30_000, () => now);
  });

  async function failTimes(times: number) {
    for (let i = 0; i < times; i++)
      await expect(breaker.execute(fail)).rejects.toThrow('API down');
  }

  it('stays closed below the failure threshold', async () => {
    await failTimes(2);
    expect(breaker.state).toBe('closed');
    await expect(breaker.execute(succeed)).resolves.toBe('ok');
  });

  it('opens after consecutive failures and fails fast without calling the API', async () => {
    await failTimes(3);
    expect(breaker.state).toBe('open');

    const operation = vi.fn(succeed);
    await expect(breaker.execute(operation)).rejects.toBeInstanceOf(
      CircuitOpenError,
    );
    expect(operation).not.toHaveBeenCalled();
  });

  it('a success resets the failure count', async () => {
    await failTimes(2);
    await breaker.execute(succeed);
    await failTimes(2);
    expect(breaker.state).toBe('closed');
  });

  it('after the cooldown, a successful trial closes the circuit', async () => {
    await failTimes(3);
    now = 30_000;
    expect(breaker.state).toBe('half-open');
    await expect(breaker.execute(succeed)).resolves.toBe('ok');
    expect(breaker.state).toBe('closed');
  });

  it('after the cooldown, a failed trial opens the circuit again', async () => {
    await failTimes(3);
    now = 30_000;
    await failTimes(1);
    expect(breaker.state).toBe('open');
  });
});
