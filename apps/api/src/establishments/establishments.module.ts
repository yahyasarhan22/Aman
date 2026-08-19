import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Establishment } from './establishment.entity';
import { Inspection } from './inspection.entity';
import { Violation } from './violation.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Establishment, Inspection, Violation])],
})
export class EstablishmentsModule {}
