import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EstablishmentsService } from './establishments.service';
import { Establishment } from './establishment.entity';
import { Inspection } from './inspection.entity';
import { Violation } from './violation.entity';

describe('EstablishmentsService', () => {
  let service: EstablishmentsService;
  const mockEstablishmentRepo = { findOne: jest.fn() };
  const mockInspectionRepo = { find: jest.fn() };
  const mockViolationRepo = { find: jest.fn() };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        EstablishmentsService,
        { provide: getRepositoryToken(Establishment), useValue: mockEstablishmentRepo },
        { provide: getRepositoryToken(Inspection), useValue: mockInspectionRepo },
        { provide: getRepositoryToken(Violation), useValue: mockViolationRepo },
      ],
    }).compile();

    service = module.get(EstablishmentsService);
  });

  it('returns null when the slug does not exist', async () => {
    mockEstablishmentRepo.findOne.mockResolvedValue(null);
    const result = await service.getPublicBySlug('nonexistent');
    expect(result).toBeNull();
  });

  it('maps an establishment to the public DTO, hiding no inspector identity fields', async () => {
    mockEstablishmentRepo.findOne.mockResolvedValue({
      slug: 'golden-oven-nablus',
      nameAr: 'الفرن الذهبي',
      nameEn: null,
      category: 'BAKERY',
      currentGrade: 'B',
      currentScore: 82,
      lastInspectionAt: new Date('2026-08-05T00:00:00Z'),
      status: 'ACTIVE',
    });
    mockInspectionRepo.find.mockResolvedValue([
      { submittedAt: new Date('2026-08-05T00:00:00Z'), grade: 'B', violations: [{}, {}] },
      { submittedAt: new Date('2026-05-14T00:00:00Z'), grade: 'A', violations: [] },
    ]);
    mockViolationRepo.find.mockResolvedValue([
      { category: 'Refrigeration', status: 'OWNER_RESPONDED' },
    ]);

    const result = await service.getPublicBySlug('golden-oven-nablus');

    expect(result).toEqual({
      slug: 'golden-oven-nablus',
      nameAr: 'الفرن الذهبي',
      nameEn: null,
      category: 'BAKERY',
      grade: 'B',
      score: 82,
      lastInspectionAt: '2026-08-05T00:00:00.000Z',
      openViolations: [{ category: 'Refrigeration', ownerResponded: true }],
      history: [
        { date: '2026-08-05T00:00:00.000Z', grade: 'B', violationCount: 2 },
        { date: '2026-05-14T00:00:00.000Z', grade: 'A', violationCount: 0 },
      ],
      status: 'ACTIVE',
    });
  });
});
