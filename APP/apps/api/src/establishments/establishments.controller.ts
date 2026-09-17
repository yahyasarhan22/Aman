import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { EstablishmentsService } from './establishments.service';
import { EstablishmentPublicDto } from './dto/establishment-public.dto';

@Controller('api/public/establishments')
export class EstablishmentsController {
  constructor(private readonly establishmentsService: EstablishmentsService) {}

  @Get(':slug')
  async getBySlug(@Param('slug') slug: string): Promise<EstablishmentPublicDto> {
    const dto = await this.establishmentsService.getPublicBySlug(slug);
    if (!dto) throw new NotFoundException(`No establishment registered for slug "${slug}"`);
    return dto;
  }
}
