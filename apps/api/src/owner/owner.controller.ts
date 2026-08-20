import { Body, Controller, ForbiddenException, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, Roles, type AuthedRequest } from '../auth/auth.guard';
import { OwnerService } from './owner.service';
import type { OwnerOverviewDto, RespondDto } from './owner.dto';

@Controller('api/owner')
@UseGuards(AuthGuard)
@Roles('OWNER')
export class OwnerController {
  constructor(private readonly owner: OwnerService) {}

  /** Spec §8.3: scoped to the token's establishment. There is deliberately no
   *  id parameter to reject — the route simply has no way to name another. */
  private scope(req: AuthedRequest): string {
    const establishmentId = req.user?.establishmentId;
    if (!establishmentId) throw new ForbiddenException('لا توجد منشأة مرتبطة بهذا الحساب.');
    return establishmentId;
  }

  @Get('establishment')
  overview(@Req() req: AuthedRequest): Promise<OwnerOverviewDto> {
    return this.owner.overview(this.scope(req));
  }

  @Post('violations/:id/respond')
  async respond(
    @Param('id') id: string,
    @Body() dto: RespondDto,
    @Req() req: AuthedRequest,
  ): Promise<{ ok: true }> {
    await this.owner.respond(id, dto, this.scope(req));
    return { ok: true };
  }
}
