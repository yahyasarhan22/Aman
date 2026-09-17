import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Complaint } from '../complaints/complaint.entity';
import { Establishment } from '../establishments/establishment.entity';
import { Violation } from '../establishments/violation.entity';
import { User } from '../auth/user.entity';
import { RiskModule } from '../risk/risk.module';
import { SettingsModule } from '../settings/settings.module';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { QrService } from './qr.service';

@Module({
  imports: [
    RiskModule,
    SettingsModule,
    TypeOrmModule.forFeature([Complaint, Establishment, Violation, User]),
  ],
  providers: [AdminService, QrService],
  controllers: [AdminController],
})
export class AdminModule {}
