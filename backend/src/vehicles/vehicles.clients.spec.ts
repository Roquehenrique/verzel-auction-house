import { ConfigService } from '@nestjs/config';
import { formatMakeName, NhtsaClient } from './nhtsa.client.js';
import { filterByRelevance } from './vehicles.service.js';
import { WikipediaClient } from './wikipedia.client.js';

const config = new ConfigService({});
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe('vehicle clients', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  describe('formatMakeName', () => {
    it.each([
      ['TOYOTA', 'Toyota'],
      ['ASTON MARTIN', 'Aston Martin'],
      ['MERCEDES-BENZ', 'Mercedes-Benz'],
      ['BMW', 'BMW'],
      ['  KIA ', 'KIA'],
    ])('%j -> %j', (input, expected) => {
      expect(formatMakeName(input)).toBe(expected);
    });
  });

  describe('NhtsaClient', () => {
    const client = new NhtsaClient(config);

    it('queries models by make id and removes duplicated names', async () => {
      fetchMock.mockResolvedValue(
        json({
          Count: 3,
          Results: [
            { Model_ID: 2, Model_Name: 'Supra' },
            { Model_ID: 1, Model_Name: 'Corolla' },
            { Model_ID: 3, Model_Name: 'supra ' },
          ],
        }),
      );

      const models = await client.getModels(448, 2020);

      expect(models).toEqual([
        { id: 1, name: 'Corolla' },
        { id: 2, name: 'Supra' },
      ]);
      expect(fetchMock.mock.calls[0][0] as string).toContain(
        '/GetModelsForMakeIdYear/makeId/448/modelyear/2020/',
      );
    });

    it('rejects an unexpected response shape', async () => {
      fetchMock.mockResolvedValue(json({ error: 'something' }));
      await expect(client.getMakes()).rejects.toThrow('unexpected response');
    });
  });

  describe('WikipediaClient', () => {
    const client = new WikipediaClient(config);
    const page = (index: number, title: string, file?: string) => ({
      index,
      title,
      pageimage: file,
      thumbnail: file ? { source: `https://thumb.example/${file}?utm_source=api` } : undefined,
    });

    it('keeps relevant photos, without logos, duplicates or tracking params', async () => {
      fetchMock.mockResolvedValue(
        json({
          query: {
            pages: [
              page(3, 'Toyota Supra in motorsport', 'race.jpg'),
              page(1, 'Toyota GR Supra', 'supra.png'),
              page(2, 'Toyota Supra', 'supra.png'), // same image as index 1
              page(4, 'Toyota Celica', 'celica.jpg'), // not the searched model
              page(5, 'Supra logo', 'logo.svg'),
              page(6, 'Toyota Supra (A80)'), // no image
            ],
          },
        }),
      );

      const images = await client.searchImages('Toyota', 'Supra', 2020);

      expect(images.map((image) => image.url)).toEqual([
        'https://thumb.example/supra.png',
        'https://thumb.example/race.jpg',
      ]);
      expect(images[0]).toMatchObject({
        title: 'Toyota GR Supra',
        pageUrl: 'https://en.wikipedia.org/wiki/Toyota_GR_Supra',
      });
    });

    it('falls back to any result when no title mentions the model', async () => {
      fetchMock.mockResolvedValue(json({ query: { pages: [page(1, 'Toyota', 'toyota.jpg')] } }));
      const images = await client.searchImages('Toyota', 'Mirai', 2020);
      expect(images).toHaveLength(1);
    });

    it('returns an empty list when the search finds nothing', async () => {
      fetchMock.mockResolvedValue(json({ batchcomplete: true }));
      await expect(client.searchImages('X', 'Y', 2020)).resolves.toEqual([]);
    });
  });

  describe('filterByRelevance', () => {
    const makes = ['Custom Motors', 'Toyota', 'Aston Martin', 'Tom Cars'].map((name, id) => ({
      id,
      name,
    }));

    it('ranks prefix matches first, then substrings (alphabetical within a rank)', () => {
      expect(filterByRelevance(makes, 'to').map((make) => make.name)).toEqual([
        'Tom Cars',
        'Toyota',
        'Aston Martin',
        'Custom Motors',
      ]);
    });

    it('ranks a word starting with the term above a plain substring', () => {
      const withLemon = [...makes, { id: 9, name: 'Alemo' }];
      expect(filterByRelevance(withLemon, 'mo').map((make) => make.name)).toEqual([
        'Custom Motors', // word "Motors" starts with "mo"
        'Alemo', // "mo" only in the middle, despite coming first alphabetically
      ]);
    });
  });
});
