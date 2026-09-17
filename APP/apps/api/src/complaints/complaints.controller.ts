import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import {
  ComplaintsService,
  type ComplaintStatusDto,
  type SubmitComplaintDto,
} from './complaints.service';

function clientIp(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

@Controller('api/public/complaints')
export class ComplaintsController {
  constructor(private readonly complaints: ComplaintsService) {}

  @Post()
  submit(@Body() dto: SubmitComplaintDto, @Req() req: Request): Promise<{ reference: string }> {
    return this.complaints.submit(dto, clientIp(req));
  }

  @Get(':reference')
  track(
    @Param('reference') reference: string,
    @Req() req: Request,
  ): Promise<ComplaintStatusDto> {
    return this.complaints.trackByReference(reference, clientIp(req));
  }
}
