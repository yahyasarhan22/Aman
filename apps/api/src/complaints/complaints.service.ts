import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { Establishment } from '../establishments/establishment.entity';
import { RiskService } from '../risk/risk.service';
import {
  COMPLAINT_CATEGORIES,
  Complaint,
  type ComplaintCategory,
  type ComplaintStatus,
} from './complaint.entity';
import { generateReference, isValidReference, normalizeReference } from './reference';
import { encryptContact, hashIp } from './contact';

const MAX_DESCRIPTION = 300;
const MAX_PER_ESTABLISHMENT_PER_DAY = 3;
const MAX_PER_IP_PER_DAY = 10;
const REFERENCE_ATTEMPTS = 12;

export interface SubmitComplaintDto {
  slug: string;
  category: ComplaintCategory;
  description: string;
  photoIds?: string[];
  contactPhone?: string | null;
  /** Invisible field — a human never fills this in (§5.2, no CAPTCHA). */
  honeypot?: string;
}

export interface ComplaintTimelineStep {
  key: ComplaintStatus;
  reached: boolean;
  at: string | null;
}

export interface ComplaintStatusDto {
  reference: string;
  status: ComplaintStatus;
  establishmentNameAr: string;
  establishmentSlug: string;
  submittedAt: string;
  timeline: ComplaintTimelineStep[];
}

/**
 * The happy path shown as a stepper (§5.3). DUPLICATE and REJECTED are
 * terminal and rendered separately rather than squeezed onto this line.
 */
const TIMELINE_ORDER: ComplaintStatus[] = [
  'SUBMITTED',
  'UNDER_REVIEW',
  'ASSIGNED',
  'INSPECTED',
  'CLOSED',
];

@Injectable()
export class ComplaintsService {
  constructor(
    @InjectRepository(Complaint) private complaints: Repository<Complaint>,
    @InjectRepository(Establishment) private establishments: Repository<Establishment>,
    private risk: RiskService,
  ) {}

  async submit(dto: SubmitComplaintDto, ip: string): Promise<{ reference: string }> {
    // Answer a bot exactly as we answer a human, but write nothing. Telling it
    // that it was caught only teaches it to try again differently.
    if (dto.honeypot && dto.honeypot.trim().length > 0) {
      return { reference: generateReference() };
    }

    const description = (dto.description ?? '').trim();
    if (description.length === 0) {
      throw new BadRequestException('يرجى وصف ما لاحظته.');
    }
    if (description.length > MAX_DESCRIPTION) {
      throw new BadRequestException(`الوصف يجب ألا يتجاوز ${MAX_DESCRIPTION} حرفاً.`);
    }
    if (!COMPLAINT_CATEGORIES.includes(dto.category)) {
      throw new BadRequestException('نوع الشكوى غير معروف.');
    }

    const establishment = await this.establishments.findOne({ where: { slug: dto.slug } });
    if (!establishment) throw new NotFoundException('المنشأة غير مسجّلة.');

    const ipHash = hashIp(ip);
    const since = new Date(Date.now() - 86_400_000);

    const forThisEstablishment = await this.complaints.count({
      where: { ipHash, establishmentId: establishment.id, createdAt: MoreThan(since) },
    });
    if (forThisEstablishment >= MAX_PER_ESTABLISHMENT_PER_DAY) {
      throw new BadRequestException('تم استلام عدة شكاوى عن هذه المنشأة اليوم. حاول غداً.');
    }

    const overall = await this.complaints.count({ where: { ipHash, createdAt: MoreThan(since) } });
    if (overall >= MAX_PER_IP_PER_DAY) {
      throw new BadRequestException('تجاوزت الحد اليومي للشكاوى. حاول غداً.');
    }

    const photoIds = dto.photoIds ?? [];
    const now = new Date();

    const saved = await this.saveWithUniqueReference({
      establishmentId: establishment.id,
      category: dto.category,
      description,
      hasEvidence: photoIds.length > 0,
      photoIds: photoIds.length ? photoIds.join(',') : null,
      contactPhoneEncrypted: dto.contactPhone?.trim()
        ? encryptContact(dto.contactPhone.trim())
        : null,
      ipHash,
      status: 'SUBMITTED',
      duplicateOfId: null,
      rejectionReason: null,
      assignedInspectorId: null,
      inspectionId: null,
      createdAt: now,
      updatedAt: now,
    });

    // The whole point of the product: this moves the queue, not the grade.
    await this.risk.recalculate(establishment.id, 'COMPLAINT');

    return { reference: saved.reference };
  }

  /** Four digits is a small space, so collide-and-retry rather than pretending
   *  the generator is unique. The unique index is the real guarantee. */
  private async saveWithUniqueReference(
    row: Omit<Complaint, 'id' | 'reference'>,
  ): Promise<Complaint> {
    for (let attempt = 0; attempt < REFERENCE_ATTEMPTS; attempt++) {
      try {
        return await this.complaints.save({
          ...row,
          reference: generateReference(),
        } as Complaint);
      } catch (error) {
        const message = String((error as { message?: string })?.message ?? '');
        if (!/duplicate|unique/i.test(message)) throw error;
      }
    }
    throw new BadRequestException('تعذّر إنشاء رقم مرجعي. حاول مرة أخرى.');
  }

  async trackByReference(input: string): Promise<ComplaintStatusDto> {
    // Validate the shape before touching the database — a malformed reference
    // is a typo or a probe, and neither deserves a query.
    if (!isValidReference(input)) throw new NotFoundException('الرقم المرجعي غير صحيح.');

    const complaint = await this.complaints.findOne({
      where: { reference: normalizeReference(input) },
    });
    if (!complaint) throw new NotFoundException('لا توجد شكوى بهذا الرقم المرجعي.');

    const establishment = await this.establishments.findOne({
      where: { id: complaint.establishmentId },
    });

    const reachedIndex = TIMELINE_ORDER.indexOf(complaint.status);

    return {
      reference: complaint.reference,
      status: complaint.status,
      establishmentNameAr: establishment?.nameAr ?? '',
      establishmentSlug: establishment?.slug ?? '',
      submittedAt: complaint.createdAt.toISOString(),
      // Spec §5.3: status and dates only. No inspector name, no internal notes,
      // no rejection reason — those are admin-side.
      timeline: TIMELINE_ORDER.map((key, index) => ({
        key,
        reached: reachedIndex >= 0 && index <= reachedIndex,
        at:
          index === 0
            ? complaint.createdAt.toISOString()
            : reachedIndex >= 0 && index <= reachedIndex
              ? complaint.updatedAt.toISOString()
              : null,
      })),
    };
  }
}
