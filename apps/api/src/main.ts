import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { UPLOAD_DIR } from './uploads/uploads.controller';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableCors();
  // Rate limiting keys off req.ip. Trusting X-Forwarded-For is correct ONLY
  // behind a proxy that overwrites it; with the API exposed directly, trusting
  // it lets any client forge an address and defeat every limit in §11. Off
  // unless deployment explicitly opts in.
  if (process.env.TRUST_PROXY === 'true') app.set('trust proxy', 1);
  // Spec §11: uploads are served from their own path with no execution rights.
  app.useStaticAssets(UPLOAD_DIR, { prefix: '/uploads/', index: false, dotfiles: 'deny' });
  // Signatures are base64 canvas images; the default 100kb body limit is not enough.
  app.useBodyParser('json', { limit: '10mb' });
  await app.listen(3000);
}
bootstrap();
