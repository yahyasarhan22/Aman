import { Module } from '@nestjs/common';
import { PublicUploadsController, UploadsController } from './uploads.controller';

@Module({ controllers: [UploadsController, PublicUploadsController] })
export class UploadsModule {}
