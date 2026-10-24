import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExternalApiError, fetchJson } from '../external/http-client.js';
import type { VehicleImage } from './vehicles.types.js';

// NHTSA has no pictures, so images come from the Wikipedia search API
// (lead image of each matching article). No API key required.
interface WikipediaSearchResponse {
  query?: {
    pages: Array<{
      index: number;
      title: string;
      pageimage?: string;
      thumbnail?: { source: string };
    }>;
  };
}

const MAX_IMAGES = 4;

@Injectable()
export class WikipediaClient {
  private readonly apiUrl: string;

  constructor(config: ConfigService) {
    this.apiUrl = config.get('WIKIPEDIA_API_URL') ?? 'https://en.wikipedia.org/w/api.php';
  }

  async searchImages(make: string, model: string, year: number): Promise<VehicleImage[]> {
    const params = new URLSearchParams({
      action: 'query',
      generator: 'search',
      gsrsearch: `${year} ${make} ${model} car`,
      gsrlimit: '8',
      prop: 'pageimages',
      piprop: 'thumbnail|name',
      pithumbsize: '960',
      format: 'json',
      formatversion: '2',
    });
    const response = await fetchJson<WikipediaSearchResponse>(`${this.apiUrl}?${params}`);
    if (!response || typeof response !== 'object') {
      throw new ExternalApiError('Wikipedia returned an unexpected response', false);
    }

    const pages = (response.query?.pages ?? [])
      .filter((page) => page.thumbnail && page.pageimage && !/\.svg$/i.test(page.pageimage)) // skip logos
      .sort((a, b) => a.index - b.index);

    // Search results also bring related cars (e.g. "Celica" for "Supra"): prefer
    // articles whose title mentions the model, falling back to all results.
    const modelToken = model.split(/\s+/)[0].toLowerCase();
    const relevant = pages.filter((page) => page.title.toLowerCase().includes(modelToken));
    const candidates = relevant.length > 0 ? relevant : pages;

    // Different articles often share the same lead image.
    const seenFiles = new Set<string>();
    const images: VehicleImage[] = [];
    for (const page of candidates) {
      if (seenFiles.has(page.pageimage!)) continue;
      seenFiles.add(page.pageimage!);
      images.push({
        url: stripQuery(page.thumbnail!.source),
        title: page.title,
        pageUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`,
      });
      if (images.length === MAX_IMAGES) break;
    }
    return images;
  }
}

// Removes tracking parameters (utm_*) added by the API.
function stripQuery(url: string): string {
  const parsed = new URL(url);
  parsed.search = '';
  return parsed.toString();
}
