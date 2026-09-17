import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RiskWeightsRow } from './risk-weights.entity';
import { SettingsService } from './settings.service';

@Module({
  imports: [TypeOrmModule.forFeature([RiskWeightsRow])],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
