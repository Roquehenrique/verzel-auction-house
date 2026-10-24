import { BadRequestException, Injectable } from '@nestjs/common';
import { CircuitBreaker } from '../external/circuit-breaker.js';
import { CachedResult, ExternalCacheService } from '../external/external-cache.service.js';
import { NhtsaClient } from './nhtsa.client.js';
import {
  maxVehicleYear,
  MIN_VEHICLE_YEAR,
  VehicleImage,
  VehicleMake,
  VehicleModel,
} from './vehicles.types.js';
import { WikipediaClient } from './wikipedia.client.js';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const CATALOG_UNAVAILABLE =
  'O catálogo de veículos está indisponível no momento. Tente novamente em alguns minutos';
const IMAGES_UNAVAILABLE =
  'A busca de imagens está indisponível no momento. Você pode criar o lote sem imagem ou tentar novamente';

@Injectable()
export class VehiclesService {
  // One breaker per external API: Wikipedia failing must not block NHTSA.
  private readonly nhtsaBreaker = new CircuitBreaker('NHTSA');
  private readonly wikipediaBreaker = new CircuitBreaker('Wikipedia');

  constructor(
    private readonly nhtsa: NhtsaClient,
    private readonly wikipedia: WikipediaClient,
    private readonly cache: ExternalCacheService,
  ) {}

  async getMakes(search?: string): Promise<CachedResult<VehicleMake[]>> {
    const result = await this.cache.getOrFetch({
      key: 'nhtsa:makes',
      ttlMs: WEEK_MS,
      fetcher: () => this.nhtsaBreaker.execute(() => this.nhtsa.getMakes()),
      unavailableMessage: CATALOG_UNAVAILABLE,
    });

    // The whole list is cached once; filtering happens locally.
    const term = search?.trim().toLowerCase();
    if (!term) return result;
    return { ...result, data: filterByRelevance(result.data, term) };
  }

  getModels(makeId: number, year: number): Promise<CachedResult<VehicleModel[]>> {
    assertYear(year);
    return this.cache.getOrFetch({
      key: `nhtsa:models:${makeId}:${year}`,
      ttlMs: WEEK_MS,
      fetcher: () => this.nhtsaBreaker.execute(() => this.nhtsa.getModels(makeId, year)),
      unavailableMessage: CATALOG_UNAVAILABLE,
    });
  }

  getImages(make: string, model: string, year: number): Promise<CachedResult<VehicleImage[]>> {
    assertYear(year);
    return this.cache.getOrFetch({
      key: `wikipedia:images:${year}:${make.toLowerCase()}:${model.toLowerCase()}`,
      ttlMs: WEEK_MS,
      fetcher: () =>
        this.wikipediaBreaker.execute(() => this.wikipedia.searchImages(make, model, year)),
      unavailableMessage: IMAGES_UNAVAILABLE,
    });
  }
}

// "to" -> Toyota first (name starts with the term), then makes with a word
// starting with it, then any other match ("Custom", "Motors").
export function filterByRelevance(makes: VehicleMake[], term: string): VehicleMake[] {
  const rank = (name: string) => {
    const lower = name.toLowerCase();
    if (lower.startsWith(term)) return 0;
    if (lower.split(/[\s-]+/).some((word) => word.startsWith(term))) return 1;
    return lower.includes(term) ? 2 : -1;
  };
  return makes
    .map((make) => ({ make, rank: rank(make.name) }))
    .filter(({ rank }) => rank >= 0)
    .sort((a, b) => a.rank - b.rank || a.make.name.localeCompare(b.make.name))
    .map(({ make }) => make);
}

function assertYear(year: number): void {
  const max = maxVehicleYear();
  if (year < MIN_VEHICLE_YEAR || year > max) {
    throw new BadRequestException(`O ano deve estar entre ${MIN_VEHICLE_YEAR} e ${max}`);
  }
}
