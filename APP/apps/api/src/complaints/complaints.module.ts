import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Establishment } from '../establishments/establishment.entity';
import { RiskModule } from '../risk/risk.module';
import { Complaint } from './complaint.entity';
import { ComplaintsService } from './complaints.service';
import { ComplaintsController } from './complaints.controller';

@Module({
  imports: [RiskModule, TypeOrmModule.forFeature([Complaint, Establishment])],
  providers: [ComplaintsService],
  controllers: [ComplaintsController],
  exports: [ComplaintsService],
})
export class ComplaintsModule {}
