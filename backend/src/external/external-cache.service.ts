import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface CachedResult<T> {
  data: T;
  // true when the external API failed and an expired cache entry was served
  stale: boolean;
  fetchedAt: Date;
}

export interface GetOrFetchOptions<T> {
  key: string;
  ttlMs: number;
  fetcher: () => Promise<T>;
  // shown to the user when the API fails and there is nothing cached
  unavailableMessage: string;
}

// Cache-aside with "stale-if-error":
//   fresh entry           -> served without calling the API
//   expired / no entry    -> calls the API and stores the response
//   API fails + any entry -> serves the expired entry (stale: true)
//   API fails + no entry  -> 503 with a friendly message
@Injectable()
export class ExternalCacheService {
  private readonly logger = new Logger(ExternalCacheService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getOrFetch<T>({
    key,
    ttlMs,
    fetcher,
    unavailableMessage,
  }: GetOrFetchOptions<T>): Promise<CachedResult<T>> {
    const cached = await this.prisma.externalApiCache.findUnique({
      where: { key },
    });
    if (cached && cached.expiresAt > new Date()) {
      return {
        data: cached.payload as T,
        stale: false,
        fetchedAt: cached.fetchedAt,
      };
    }

    let data: T;
    try {
      data = await fetcher();
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (cached) {
        this.logger.warn(`Serving stale cache for "${key}": ${reason}`);
        return {
          data: cached.payload as T,
          stale: true,
          fetchedAt: cached.fetchedAt,
        };
      }
      this.logger.error(`No cache available for "${key}": ${reason}`);
      throw new ServiceUnavailableException(unavailableMessage);
    }

    const fetchedAt = new Date();
    const entry = {
      payload: data as Prisma.InputJsonValue,
      fetchedAt,
      expiresAt: new Date(fetchedAt.getTime() + ttlMs),
    };
    await this.prisma.externalApiCache.upsert({
      where: { key },
      create: { key, ...entry },
      update: entry,
    });
    return { data, stale: false, fetchedAt };
  }
}
