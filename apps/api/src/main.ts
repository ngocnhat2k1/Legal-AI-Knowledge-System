import { join } from 'node:path';

import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  // Local dev reads .env; in Docker the environment comes from compose and there is no file.
  try {
    process.loadEnvFile();
  } catch {
    /* no .env */
  }
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // The web UI. express.static only answers for files that exist, so API routes fall through untouched.
  app.useStaticAssets(join(process.cwd(), 'public'));
  // Required so DatabaseModule.onModuleDestroy runs and the connection closes cleanly.
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
