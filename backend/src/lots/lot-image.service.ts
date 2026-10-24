import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { USER_AGENT } from '../external/http-client.js';

// Only pictures returned by the catalog (Wikimedia Commons) are accepted, so a
// lot cannot point to an arbitrary URL.
const ALLOWED_IMAGE_HOSTS = ['upload.wikimedia.org', 'thumb.wikimedia.org'];
const ALLOWED_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 8_000;

export interface DownloadedImage {
  contentType: string;
  data: Uint8Array<ArrayBuffer>;
}

@Injectable()
export class LotImageService {
  private readonly logger = new Logger(LotImageService.name);

  assertAllowedUrl(url: string): void {
    const parsed = new URL(url);
    if (
      parsed.protocol !== 'https:' ||
      !ALLOWED_IMAGE_HOSTS.includes(parsed.hostname)
    ) {
      throw new BadRequestException(
        'A imagem deve ser uma das sugeridas pelo catálogo (Wikimedia)',
      );
    }
  }

  // Best effort: if the download fails the lot is still created and the
  // original URL is used (the image endpoint redirects to it).
  async download(url: string): Promise<DownloadedImage | null> {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const contentType =
        response.headers.get('content-type')?.split(';')[0].trim() ?? '';
      if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
        throw new Error(`unsupported content type "${contentType}"`);
      }
      if (
        Number(response.headers.get('content-length') ?? 0) > MAX_IMAGE_BYTES
      ) {
        throw new Error('image too large');
      }

      const data = new Uint8Array(await response.arrayBuffer());
      if (data.byteLength > MAX_IMAGE_BYTES) throw new Error('image too large');
      return { contentType, data };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Could not store a copy of ${url}: ${reason}`);
      return null;
    }
  }
}
