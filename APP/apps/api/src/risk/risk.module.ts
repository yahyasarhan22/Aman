import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Establishment } from '../establishments/establishment.entity';
import { Violation } from '../establishments/violation.entity';
import { Complaint } from '../complaints/complaint.entity';
import { RiskSnapshot } from './risk-snapshot.entity';
import { SettingsModule } from '../settings/settings.module';
import { RiskService } from './risk.service';

@Module({
  imports: [SettingsModule, TypeOrmModule.forFeature([Establishment, Violation, Complaint, RiskSnapshot])],
  providers: [RiskService],
  exports: [RiskService],
})
export class RiskModule {}
