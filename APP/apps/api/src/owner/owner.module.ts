import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Establishment } from '../establishments/establishment.entity';
import { Violation } from '../establishments/violation.entity';
import { OwnerService } from './owner.service';
import { OwnerController } from './owner.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Establishment, Violation])],
  providers: [OwnerService],
  controllers: [OwnerController],
})
export class OwnerModule {}
