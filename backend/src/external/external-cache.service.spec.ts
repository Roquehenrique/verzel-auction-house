import { ServiceUnavailableException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service.js';
import { ExternalCacheService } from './external-cache.service.js';

describe('ExternalCacheService', () => {
  const prisma = {
    externalApiCache: { findUnique: vi.fn(), upsert: vi.fn() },
  };
  const service = new ExternalCacheService(prisma as unknown as PrismaService);
  vi.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);
  vi.spyOn(service['logger'], 'error').mockImplementation(() => undefined);

  const HOUR = 60 * 60 * 1000;
  const entry = (expiresInMs: number) => ({
    key: 'k',
    payload: ['cached'],
    fetchedAt: new Date(Date.now() - HOUR),
    expiresAt: new Date(Date.now() + expiresInMs),
  });
  const options = (fetcher: () => Promise<unknown>) => ({
    key: 'k',
    ttlMs: HOUR,
    fetcher,
    unavailableMessage: 'Indisponível',
  });

  beforeEach(() => {
    prisma.externalApiCache.findUnique.mockReset();
    prisma.externalApiCache.upsert.mockReset();
  });

  it('serves a fresh entry without calling the API', async () => {
    prisma.externalApiCache.findUnique.mockResolvedValue(entry(HOUR));
    const fetcher = vi.fn();

    const result = await service.getOrFetch(options(fetcher));

    expect(result).toMatchObject({ data: ['cached'], stale: false });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('calls the API when the entry expired and stores the response', async () => {
    prisma.externalApiCache.findUnique.mockResolvedValue(entry(-1));

    const result = await service.getOrFetch(options(() => Promise.resolve(['fresh'])));

    expect(result).toMatchObject({ data: ['fresh'], stale: false });
    expect(prisma.externalApiCache.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: 'k' } }),
    );
  });

  it('serves the expired entry (stale) when the API fails', async () => {
    prisma.externalApiCache.findUnique.mockResolvedValue(entry(-1));

    const result = await service.getOrFetch(options(() => Promise.reject(new Error('down'))));

    expect(result).toMatchObject({ data: ['cached'], stale: true });
    expect(prisma.externalApiCache.upsert).not.toHaveBeenCalled();
  });

  it('returns 503 with the friendly message when the API fails and nothing is cached', async () => {
    prisma.externalApiCache.findUnique.mockResolvedValue(null);

    const promise = service.getOrFetch(options(() => Promise.reject(new Error('down'))));

    await expect(promise).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(promise).rejects.toThrow('Indisponível');
  });
});
