import { INestApplication, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';

// Shared by main.ts and the e2e tests so both run with the same configuration.
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api');

  // Behind the deploy platform's proxy: use X-Forwarded-For as the client IP
  // (needed by the login rate limit).
  (app as NestExpressApplication).set('trust proxy', 1);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strips properties without validation decorators
      forbidNonWhitelisted: true,
      transform: true,
      stopAtFirstError: true, // one message per field instead of repeated ones
    }),
  );

  const origins = (process.env.FRONTEND_URL ?? 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim());
  app.enableCors({ origin: origins, credentials: true });
}
