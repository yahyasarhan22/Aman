import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { Establishment } from './establishments/establishment.entity';
import { Inspection } from './establishments/inspection.entity';
import { Violation } from './establishments/violation.entity';

async function seed() {
  const dataSource = new DataSource({
    type: 'mysql',
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '3306', 10),
    username: process.env.DB_USER ?? 'root',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME ?? 'aman',
    entities: [Establishment, Inspection, Violation],
    synchronize: true,
  });
  await dataSource.initialize();

  const establishmentRepo = dataSource.getRepository(Establishment);
  const inspectionRepo = dataSource.getRepository(Inspection);
  const violationRepo = dataSource.getRepository(Violation);

  await violationRepo.delete({});
  await inspectionRepo.delete({});
  await establishmentRepo.delete({});

  const goldenOven = await establishmentRepo.save({
    slug: 'golden-oven-nablus',
    nameAr: 'الفرن الذهبي',
    nameEn: 'Golden Oven',
    category: 'BAKERY',
    address: 'Old City, Nablus',
    currentGrade: 'B',
    currentScore: 82,
    lastInspectionAt: new Date('2026-08-05'),
    status: 'ACTIVE',
  });

  const inspection1 = await inspectionRepo.save({
    establishmentId: goldenOven.id,
    score: 82,
    grade: 'B',
    previousGrade: 'A',
    submittedAt: new Date('2026-08-05'),
  });
  const inspection2 = await inspectionRepo.save({
    establishmentId: goldenOven.id,
    score: 96,
    grade: 'A',
    previousGrade: 'B',
    submittedAt: new Date('2026-05-14'),
  });

  await violationRepo.save({
    inspectionId: inspection1.id,
    establishmentId: goldenOven.id,
    category: 'Refrigeration temperature above limit',
    severity: 'CRITICAL',
    status: 'OWNER_RESPONDED',
    respondedAt: new Date('2026-08-08'),
  });

  await establishmentRepo.save({
    slug: 'al-salam-restaurant',
    nameAr: 'مطعم السلام',
    nameEn: null,
    category: 'RESTAURANT',
    address: 'Rafidia, Nablus',
    currentGrade: 'C',
    currentScore: 68,
    lastInspectionAt: new Date('2026-05-06'),
    status: 'ACTIVE',
  });

  await establishmentRepo.save({
    slug: 'nour-bakery',
    nameAr: 'مخبز النور',
    nameEn: null,
    category: 'BAKERY',
    address: 'Downtown, Nablus',
    currentGrade: null,
    currentScore: null,
    lastInspectionAt: null,
    status: 'ACTIVE',
  });

  console.log('Seeded 3 establishments.');
  await dataSource.destroy();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
