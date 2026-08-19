import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { UPLOAD_DIR } from './uploads/uploads.controller';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableCors();
  // Spec §11: uploads are served from their own path with no execution rights.
  app.useStaticAssets(UPLOAD_DIR, { prefix: '/uploads/', index: false, dotfiles: 'deny' });
  // Signatures are base64 canvas images; the default 100kb body limit is not enough.
  app.useBodyParser('json', { limit: '10mb' });
  await app.listen(3000);
}
bootstrap();
