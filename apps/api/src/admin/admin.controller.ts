import { Body, Controller, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, Roles, type AuthedRequest } from '../auth/auth.guard';
import { AdminService } from './admin.service';
import type {
  AdminComplaintDto,
  ComplaintFilter,
  InspectorOptionDto,
  PlanningRowDto,
  RiskWeightsDto,
} from './admin.dto';
import type { RejectionReason } from '../complaints/complaint.entity';
import type { RiskWeights } from '@aman/shared';

@Controller('api/admin')
@UseGuards(AuthGuard)
@Roles('ADMIN')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('complaints')
  listComplaints(@Query() query: Record<string, string>): Promise<AdminComplaintDto[]> {
    const filter: ComplaintFilter = {};
    if (query['status']) filter.status = query['status'] as ComplaintFilter['status'];
    if (query['category']) filter.category = query['category'] as ComplaintFilter['category'];
    if (query['establishmentId']) filter.establishmentId = query['establishmentId'];
    // Query strings carry 'true'/'false', not booleans.
    if (query['hasEvidence'] !== undefined) filter.hasEvidence = query['hasEvidence'] === 'true';
    return this.admin.listComplaints(filter);
  }

  @Get('inspectors')
  inspectors(): Promise<InspectorOptionDto[]> {
    return this.admin.inspectors();
  }

  @Get('planning')
  planning(): Promise<PlanningRowDto[]> {
    return this.admin.planning();
  }

  @Get('settings/risk-weights')
  getWeights(): Promise<RiskWeightsDto> {
    return this.admin.getRiskWeights();
  }

  @Patch('settings/risk-weights')
  updateWeights(
    @Body() weights: RiskWeights,
    @Req() req: AuthedRequest,
  ): Promise<RiskWeightsDto> {
    return this.admin.updateRiskWeights(weights, req.user!.sub);
  }

  @Patch('complaints/:id')
  async update(
    @Param('id') id: string,
    @Body()
    body: {
      action: 'assign' | 'duplicate' | 'reject' | 'close';
      inspectorId?: string;
      originalId?: string;
      reason?: RejectionReason;
    },
    @Req() req: AuthedRequest,
  ): Promise<{ ok: true }> {
    const actor = req.user!.sub;
    switch (body.action) {
      case 'assign':
        await this.admin.assign(id, body.inspectorId!, actor);
        break;
      case 'duplicate':
        await this.admin.markDuplicate(id, body.originalId!, actor);
        break;
      case 'reject':
        await this.admin.reject(id, body.reason!, actor);
        break;
      case 'close':
        await this.admin.close(id, actor);
        break;
    }
    return { ok: true };
  }
}
