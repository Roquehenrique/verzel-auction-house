export class ExternalApiError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'ExternalApiError';
  }
}

export interface FetchJsonOptions {
  timeoutMs?: number;
  retries?: number; // extra attempts after the first one
  retryDelayMs?: number; // doubled on each retry
  headers?: Record<string, string>;
}

// Wikipedia/Wikimedia ask API clients to identify themselves.
export const USER_AGENT = 'LeilaoCarros/1.0 (Verzel Elite Dev technical test)';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// GET a JSON resource with a timeout and retries for transient failures
// (network errors, timeouts, HTTP 5xx and 429).
export async function fetchJson<T>(
  url: string,
  {
    timeoutMs = 5_000,
    retries = 1,
    retryDelayMs = 300,
    headers,
  }: FetchJsonOptions = {},
): Promise<T> {
  const host = new URL(url).host;

  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/json',
          ...headers,
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        throw new ExternalApiError(
          `${host} responded with HTTP ${response.status}`,
          response.status >= 500 || response.status === 429,
        );
      }
      try {
        return (await response.json()) as T;
      } catch {
        throw new ExternalApiError(
          `${host} returned an invalid JSON body`,
          false,
        );
      }
    } catch (error) {
      const failure = toExternalApiError(error, host, timeoutMs);
      if (!failure.retryable || attempt >= retries) throw failure;
      await sleep(retryDelayMs * 2 ** attempt);
    }
  }
}

function toExternalApiError(
  error: unknown,
  host: string,
  timeoutMs: number,
): ExternalApiError {
  if (error instanceof ExternalApiError) return error;
  if (error instanceof Error && error.name === 'TimeoutError') {
    return new ExternalApiError(
      `${host} did not respond within ${timeoutMs}ms`,
      true,
    );
  }
  // fetch throws TypeError for network failures (DNS, connection refused...).
  const reason = error instanceof Error ? error.message : String(error);
  return new ExternalApiError(`could not reach ${host}: ${reason}`, true);
}
