import { ExternalApiError, fetchJson } from './http-client.js';

const URL = 'https://api.example.com/data';
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('fetchJson', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  const options = { retries: 1, retryDelayMs: 1 };

  it('returns the parsed body and identifies the client', async () => {
    fetchMock.mockResolvedValue(json({ ok: true }));
    await expect(fetchJson(URL, options)).resolves.toEqual({ ok: true });
    const headers = fetchMock.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers['User-Agent']).toMatch(/LeilaoCarros/);
  });

  it('retries a 5xx and succeeds on the second attempt', async () => {
    fetchMock.mockResolvedValueOnce(json({}, 503)).mockResolvedValueOnce(json({ ok: true }));
    await expect(fetchJson(URL, options)).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries a 429 (rate limited)', async () => {
    fetchMock.mockResolvedValueOnce(json({}, 429)).mockResolvedValueOnce(json([]));
    await expect(fetchJson(URL, options)).resolves.toEqual([]);
  });

  it('does not retry a 4xx client error', async () => {
    fetchMock.mockResolvedValue(json({}, 404));
    await expect(fetchJson(URL, options)).rejects.toThrow('HTTP 404');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries network errors and gives up after the configured retries', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    await expect(fetchJson(URL, options)).rejects.toBeInstanceOf(ExternalApiError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('turns a timeout into a retryable ExternalApiError', async () => {
    fetchMock.mockRejectedValue(new DOMException('timed out', 'TimeoutError'));
    await expect(fetchJson(URL, { ...options, timeoutMs: 50 })).rejects.toThrow(
      'did not respond within 50ms',
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry an invalid JSON body', async () => {
    fetchMock.mockResolvedValue(new Response('<html>maintenance</html>', { status: 200 }));
    await expect(fetchJson(URL, options)).rejects.toThrow('invalid JSON');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
