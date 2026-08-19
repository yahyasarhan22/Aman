import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, Roles, type AuthedRequest } from '../auth/auth.guard';
import { InspectorService } from './inspector.service';
import type {
  EstablishmentBundleDto,
  QueueEntryDto,
  SubmitInspectionDto,
  SubmitInspectionResultDto,
} from './inspector.dto';

@Controller('api/inspector')
@UseGuards(AuthGuard)
@Roles('INSPECTOR', 'ADMIN')
export class InspectorController {
  constructor(private readonly inspector: InspectorService) {}

  @Get('queue')
  getQueue(): Promise<QueueEntryDto[]> {
    return this.inspector.getQueue();
  }

  /** Called on "Start" — everything the offline app needs in one round trip. */
  @Get('establishments/:id/bundle')
  getBundle(@Param('id') id: string): Promise<EstablishmentBundleDto> {
    return this.inspector.getBundle(id);
  }

  @Post('inspections')
  submit(
    @Body() dto: SubmitInspectionDto,
    @Req() req: AuthedRequest,
  ): Promise<SubmitInspectionResultDto> {
    return this.inspector.submitInspection(dto, req.user!.sub);
  }
}
