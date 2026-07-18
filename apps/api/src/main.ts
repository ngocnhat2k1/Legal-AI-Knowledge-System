import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  // Required so DatabaseModule.onModuleDestroy runs and the connection closes cleanly.
  app.enableShutdownHooks();
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
}

void bootstrap();
