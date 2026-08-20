import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Establishment } from '../establishments/establishment.entity';
import { Inspection } from '../establishments/inspection.entity';
import { InspectionItem } from '../establishments/inspection-item.entity';
import { Violation } from '../establishments/violation.entity';
import { ChecklistVersion } from '../checklist/checklist-version.entity';
import { ChecklistItem } from '../checklist/checklist-item.entity';
import { RiskModule } from '../risk/risk.module';
import { InspectorService } from './inspector.service';
import { InspectorController } from './inspector.controller';

@Module({
  imports: [
    RiskModule,
    TypeOrmModule.forFeature([
      Establishment,
      Inspection,
      InspectionItem,
      Violation,
      ChecklistVersion,
      ChecklistItem,
    ]),
  ],
  providers: [InspectorService],
  controllers: [InspectorController],
})
export class InspectorModule {}
