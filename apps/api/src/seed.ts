import 'reflect-metadata';
import 'dotenv/config';
import { DataSource } from 'typeorm';
import { calculateRisk, deadlineFor, scoreToGrade } from '@aman/shared';
import { Establishment } from './establishments/establishment.entity';
import { Inspection } from './establishments/inspection.entity';
import { InspectionItem } from './establishments/inspection-item.entity';
import { Violation } from './establishments/violation.entity';
import { ChecklistVersion } from './checklist/checklist-version.entity';
import { ChecklistItem } from './checklist/checklist-item.entity';
import { CHECKLIST_V1 } from './checklist/checklist.seed';
import { RiskSnapshot } from './risk/risk-snapshot.entity';
import { Complaint } from './complaints/complaint.entity';
import { User } from './auth/user.entity';
import { hashPassword } from './auth/password';

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

async function seed() {
  const dataSource = new DataSource({
    type: 'mysql',
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '3306', 10),
    username: process.env.DB_USER ?? 'root',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME ?? 'aman',
    entities: [
      Establishment,
      Inspection,
      InspectionItem,
      Violation,
      ChecklistVersion,
      ChecklistItem,
      User,
      RiskSnapshot,
      Complaint,
    ],
    synchronize: true,
  });
  await dataSource.initialize();

  const establishmentRepo = dataSource.getRepository(Establishment);
  const inspectionRepo = dataSource.getRepository(Inspection);
  const inspectionItemRepo = dataSource.getRepository(InspectionItem);
  const violationRepo = dataSource.getRepository(Violation);
  const versionRepo = dataSource.getRepository(ChecklistVersion);
  const checklistItemRepo = dataSource.getRepository(ChecklistItem);
  const userRepo = dataSource.getRepository(User);
  const snapshotRepo = dataSource.getRepository(RiskSnapshot);
  const complaintRepo = dataSource.getRepository(Complaint);

  // Child rows first — foreign keys point upward.
  for (const repo of [
    snapshotRepo,
    complaintRepo,
    inspectionItemRepo,
    violationRepo,
    inspectionRepo,
    checklistItemRepo,
    versionRepo,
    establishmentRepo,
    userRepo,
  ]) {
    await repo.createQueryBuilder().delete().execute();
  }

  // --- checklist v1 -------------------------------------------------------
  const version = await versionRepo.save({ version: 1, isActive: true, createdAt: new Date() });
  const items = await checklistItemRepo.save(
    CHECKLIST_V1.map((item, index) => ({
      checklistVersionId: version.id,
      section: item.section,
      sectionNameAr: item.sectionNameAr,
      code: item.code,
      labelAr: item.labelAr,
      severity: item.severity,
      requiresMeasurement: item.requiresMeasurement ?? false,
      unit: item.unit ?? null,
      threshold: item.threshold ?? null,
      recommendationTemplate: item.recommendationTemplate,
      sortOrder: index,
    })),
  );
  const itemByCode = new Map(items.map((i) => [i.code, i]));

  // --- users --------------------------------------------------------------
  await userRepo.save([
    {
      email: 'inspector@nablus.ps',
      passwordHash: await hashPassword('aman1234'),
      role: 'INSPECTOR',
      displayNameAr: 'سامي عبد الله',
      establishmentId: null,
    },
    {
      email: 'admin@nablus.ps',
      passwordHash: await hashPassword('aman1234'),
      role: 'ADMIN',
      displayNameAr: 'إدارة بلدية نابلس',
      establishmentId: null,
    },
  ]);

  // --- establishments -----------------------------------------------------
  const goldenOven = await establishmentRepo.save({
    slug: 'golden-oven-nablus',
    nameAr: 'الفرن الذهبي',
    nameEn: 'Golden Oven',
    category: 'BAKERY',
    address: 'البلدة القديمة، نابلس',
    currentGrade: scoreToGrade(82),
    currentScore: 82,
    lastInspectionAt: daysAgo(12),
    status: 'ACTIVE',
  });

  const inspection1 = await inspectionRepo.save({
    establishmentId: goldenOven.id,
    checklistVersionId: version.id,
    type: 'ROUTINE',
    score: 82,
    grade: scoreToGrade(82),
    previousGrade: scoreToGrade(96),
    startedAt: daysAgo(12),
    submittedAt: daysAgo(12),
  });
  await inspectionRepo.save({
    establishmentId: goldenOven.id,
    checklistVersionId: version.id,
    type: 'ROUTINE',
    score: 96,
    grade: scoreToGrade(96),
    previousGrade: null,
    startedAt: daysAgo(97),
    submittedAt: daysAgo(97),
  });

  const coldStorage = itemByCode.get('2.1')!;
  await violationRepo.save({
    inspectionId: inspection1.id,
    establishmentId: goldenOven.id,
    checklistItemId: coldStorage.id,
    category: 'التخزين البارد عند 4° مئوية أو أقل',
    severity: 'CRITICAL',
    measuredValue: '8',
    recommendation:
      'اضبط التبريد إلى أقل من 4° مئوية. القراءة المسجلة: 8°. إذا تعذّر على الوحدة الثبات على الحرارة فاستبدلها خلال 2 يوماً.',
    occurredAt: daysAgo(12),
    deadlineAt: deadlineFor('CRITICAL', daysAgo(12)),
    status: 'OWNER_RESPONDED',
    respondedAt: daysAgo(9),
  });

  await establishmentRepo.save({
    slug: 'al-salam-restaurant',
    nameAr: 'مطعم السلام',
    nameEn: null,
    category: 'RESTAURANT',
    address: 'رفيديا، نابلس',
    currentGrade: scoreToGrade(68),
    currentScore: 68,
    lastInspectionAt: daysAgo(94),
    status: 'ACTIVE',
  });

  await establishmentRepo.save({
    slug: 'nour-bakery',
    nameAr: 'مخبز النور',
    nameEn: null,
    category: 'BAKERY',
    address: 'وسط البلد، نابلس',
    currentGrade: null,
    currentScore: null,
    lastInspectionAt: null,
    status: 'ACTIVE',
  });

  await establishmentRepo.save({
    slug: 'jabal-butcher',
    nameAr: 'ملحمة الجبل',
    nameEn: null,
    category: 'BUTCHER',
    address: 'جبل النار، نابلس',
    currentGrade: scoreToGrade(91),
    currentScore: 91,
    lastInspectionAt: daysAgo(38),
    status: 'ACTIVE',
  });

  // Compute a real snapshot for every establishment so a fresh database has a
  // meaningful queue instead of every row sitting at zero.
  for (const establishment of await establishmentRepo.find()) {
    const establishmentViolations = await violationRepo.find({
      where: { establishmentId: establishment.id },
    });
    const establishmentComplaints = await complaintRepo.find({
      where: { establishmentId: establishment.id },
    });

    const breakdown = calculateRisk({
      category: establishment.category,
      lastInspectionAt: establishment.lastInspectionAt,
      violations: establishmentViolations.map((v) => ({
        severity: v.severity,
        occurredAt: v.occurredAt ?? v.deadlineAt ?? new Date(),
      })),
      complaints: establishmentComplaints.map((c) => ({
        category: c.category,
        documented: c.hasEvidence,
        submittedAt: c.createdAt,
      })),
    });

    await snapshotRepo.save({
      establishmentId: establishment.id,
      total: breakdown.total,
      factorsJson: JSON.stringify(breakdown.factors),
      trigger: 'MANUAL',
      calculatedAt: new Date(),
    });
    await establishmentRepo.update(establishment.id, { currentRiskScore: breakdown.total });
  }

  console.log(`Seeded 4 establishments, ${items.length} checklist items, 2 users.`);
  console.log('Inspector login: inspector@nablus.ps / aman1234');
  await dataSource.destroy();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
