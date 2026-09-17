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
    const establishmentId = 'test-id-123';
    mockEstablishmentRepo.findOne.mockResolvedValue({
      id: establishmentId,
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
      { category: 'Temperature Control', status: 'CLOSED' },
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

    // Verify inspection query filters by establishment, sorts DESC, and limits to 5
    expect(mockInspectionRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { establishmentId },
        order: { submittedAt: 'DESC' },
        take: 5,
      }),
    );

    // Verify violation query filters by establishment
    expect(mockViolationRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { establishmentId },
      }),
    );
  });

  it('filters out CLOSED and VERIFIED violations from public view, showing only OPEN and OWNER_RESPONDED', async () => {
    const establishmentId = 'test-id-456';
    mockEstablishmentRepo.findOne.mockResolvedValue({
      id: establishmentId,
      slug: 'pizza-palace',
      nameAr: 'قصر البيتزا',
      nameEn: 'Pizza Palace',
      category: 'RESTAURANT',
      currentGrade: 'A',
      currentScore: 95,
      lastInspectionAt: new Date('2026-08-19T00:00:00Z'),
      status: 'ACTIVE',
    });
    mockInspectionRepo.find.mockResolvedValue([
      { submittedAt: new Date('2026-08-19T00:00:00Z'), grade: 'A', violations: [] },
    ]);
    mockViolationRepo.find.mockResolvedValue([
      { category: 'Sanitation', status: 'OPEN' },
      { category: 'HandWashing', status: 'OWNER_RESPONDED' },
      { category: 'Storage', status: 'CLOSED' },
      { category: 'Pest Control', status: 'VERIFIED' },
    ]);

    const result = await service.getPublicBySlug('pizza-palace');

    expect(result).not.toBeNull();
    // Only OPEN and OWNER_RESPONDED should appear
    expect(result!.openViolations).toEqual([
      { category: 'Sanitation', ownerResponded: false },
      { category: 'HandWashing', ownerResponded: true },
    ]);
    // Explicitly verify CLOSED and VERIFIED are NOT in the result
    expect(result!.openViolations).not.toContainEqual(
      expect.objectContaining({ category: 'Storage' }),
    );
    expect(result!.openViolations).not.toContainEqual(
      expect.objectContaining({ category: 'Pest Control' }),
    );
  });
});
