import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Establishment } from './establishment.entity';
import { Inspection } from './inspection.entity';
import { Violation } from './violation.entity';
import { EstablishmentsService } from './establishments.service';
import { EstablishmentsController } from './establishments.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Establishment, Inspection, Violation])],
  providers: [EstablishmentsService],
  controllers: [EstablishmentsController],
  exports: [EstablishmentsService],
})
export class EstablishmentsModule {}
