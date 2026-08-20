import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Complaint } from '../complaints/complaint.entity';
import { Establishment } from '../establishments/establishment.entity';
import { User } from '../auth/user.entity';
import { RiskModule } from '../risk/risk.module';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';

@Module({
  imports: [RiskModule, TypeOrmModule.forFeature([Complaint, Establishment, User])],
  providers: [AdminService],
  controllers: [AdminController],
})
export class AdminModule {}
