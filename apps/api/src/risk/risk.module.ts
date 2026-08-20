import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Establishment } from '../establishments/establishment.entity';
import { Violation } from '../establishments/violation.entity';
import { Complaint } from '../complaints/complaint.entity';
import { RiskSnapshot } from './risk-snapshot.entity';
import { RiskService } from './risk.service';

@Module({
  imports: [TypeOrmModule.forFeature([Establishment, Violation, Complaint, RiskSnapshot])],
  providers: [RiskService],
  exports: [RiskService],
})
export class RiskModule {}
