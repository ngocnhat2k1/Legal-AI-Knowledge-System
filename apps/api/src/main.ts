import { join } from 'node:path';

import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from './app.module';
import { QuietExceptionFilter } from './exceptions.filter';

async function bootstrap(): Promise<void> {
  // Local dev reads .env; in Docker the environment comes from compose and there is no file.
  try {
    process.loadEnvFile();
  } catch {
    /* no .env */
  }
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // R14: an unexpected error is logged by class and code, never its message (a failed query carries the user's words).
  app.useGlobalFilters(new QuietExceptionFilter(app.getHttpAdapter()));
  // The web UI. express.static only answers for files that exist, so API routes fall through untouched.
  app.useStaticAssets(join(process.cwd(), 'public'));
  // Required so DatabaseModule.onModuleDestroy runs and the connection closes cleanly.
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
