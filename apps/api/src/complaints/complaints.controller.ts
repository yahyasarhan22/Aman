import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import {
  ComplaintsService,
  type ComplaintStatusDto,
  type SubmitComplaintDto,
} from './complaints.service';

@Controller('api/public/complaints')
export class ComplaintsController {
  constructor(private readonly complaints: ComplaintsService) {}

  @Post()
  submit(@Body() dto: SubmitComplaintDto, @Req() req: Request): Promise<{ reference: string }> {
    const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    return this.complaints.submit(dto, ip);
  }

  @Get(':reference')
  track(@Param('reference') reference: string): Promise<ComplaintStatusDto> {
    return this.complaints.trackByReference(reference);
  }
}
