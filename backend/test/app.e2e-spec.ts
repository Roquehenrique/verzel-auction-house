import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { createTestApp } from './utils.js';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/api/health is public and reports the database', () => {
    return request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect((res) =>
        expect(res.body).toMatchObject({ status: 'ok', database: 'up' }),
      );
  });
});
