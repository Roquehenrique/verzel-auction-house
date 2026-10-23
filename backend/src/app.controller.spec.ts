import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { PrismaService } from './prisma/prisma.service.js';

describe('AppController', () => {
  let appController: AppController;
  const prisma = { $queryRaw: vi.fn() };

  beforeEach(async () => {
    prisma.$queryRaw.mockReset();
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [{ provide: PrismaService, useValue: prisma }],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  it('health returns ok when the database answers', async () => {
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    await expect(appController.health()).resolves.toMatchObject({
      status: 'ok',
      database: 'up',
    });
  });

  it('health returns 503 when the database is down', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('connection refused'));
    await expect(appController.health()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
