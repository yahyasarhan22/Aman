import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Establishment } from './establishment.entity';
import { Inspection } from './inspection.entity';
import { Violation } from './violation.entity';
import { EstablishmentPublicDto } from './dto/establishment-public.dto';

@Injectable()
export class EstablishmentsService {
  constructor(
    @InjectRepository(Establishment) private establishmentRepo: Repository<Establishment>,
    @InjectRepository(Inspection) private inspectionRepo: Repository<Inspection>,
    @InjectRepository(Violation) private violationRepo: Repository<Violation>,
  ) {}

  async getPublicBySlug(slug: string): Promise<EstablishmentPublicDto | null> {
    const establishment = await this.establishmentRepo.findOne({ where: { slug } });
    if (!establishment) return null;
    return this.buildDto(establishment);
  }

  private async buildDto(establishment: Establishment): Promise<EstablishmentPublicDto> {
    const inspections = await this.inspectionRepo.find({
      where: { establishmentId: (establishment as any).id },
      relations: ['violations'],
      order: { submittedAt: 'DESC' },
      take: 5,
    });

    const openViolations = await this.violationRepo.find({
      where: { establishmentId: (establishment as any).id },
    });

    return {
      slug: establishment.slug,
      nameAr: establishment.nameAr,
      nameEn: establishment.nameEn ?? null,
      category: establishment.category,
      grade: establishment.currentGrade,
      score: establishment.currentScore,
      lastInspectionAt: establishment.lastInspectionAt
        ? establishment.lastInspectionAt.toISOString()
        : null,
      openViolations: openViolations
        .filter((v) => v.status === 'OPEN' || v.status === 'OWNER_RESPONDED')
        .map((v) => ({ category: v.category, ownerResponded: v.status === 'OWNER_RESPONDED' })),
      history: inspections.map((i) => ({
        date: i.submittedAt.toISOString(),
        grade: i.grade,
        violationCount: i.violations?.length ?? 0,
      })),
      status: establishment.status,
    };
  }
}
