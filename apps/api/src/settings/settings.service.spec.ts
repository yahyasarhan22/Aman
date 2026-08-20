import { BadRequestException } from '@nestjs/common';
import { RISK_WEIGHTS } from '@aman/shared';
import { SettingsService } from './settings.service';

function build(row: any = null) {
  const saved: any[] = [];
  const audit = { record: jest.fn(async () => undefined) };
  const repo = {
    findOne: jest.fn(async () => row),
    save: jest.fn(async (r: any) => {
      saved.push(r);
      return r;
    }),
  };
  return { service: new SettingsService(repo as any, audit as any), saved, audit, repo };
}

describe('SettingsService.getWeights', () => {
  it('falls back to the spec §6.2 defaults when nothing has ever been saved', async () => {
    const { service } = build(null);
    const weights = await service.getWeights();
    expect(weights).toEqual(RISK_WEIGHTS);
  });

  it('returns the saved row once one exists', async () => {
    const { service } = build({
      priorViolations: 50,
      complaintPressure: 20,
      timeSinceInspection: 20,
      category: 10,
    });
    const weights = await service.getWeights();
    expect(weights.PRIOR_VIOLATIONS).toBe(50);
    expect(weights.COMPLAINT_PRESSURE).toBe(20);
  });
});

describe('SettingsService.updateWeights', () => {
  const valid = {
    PRIOR_VIOLATIONS: 50,
    COMPLAINT_PRESSURE: 20,
    TIME_SINCE_INSPECTION: 20,
    CATEGORY: 10,
  };

  it('rejects weights that do not sum to 100', async () => {
    const { service } = build();
    await expect(
      service.updateWeights({ ...valid, CATEGORY: 5 }, 'admin-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('persists a valid set and records who changed it', async () => {
    const { service, saved } = build();
    await service.updateWeights(valid, 'admin-1');
    expect(saved[0]).toMatchObject({
      id: 'current',
      priorViolations: 50,
      complaintPressure: 20,
      timeSinceInspection: 20,
      category: 10,
      updatedBy: 'admin-1',
    });
  });

  it('writes the change to the audit log — no silent tuning of the formula (§5.10)', async () => {
    const { service, audit } = build();
    await service.updateWeights(valid, 'admin-1');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'RISK_WEIGHTS_CHANGED',
        actorId: 'admin-1',
        after: valid,
      }),
    );
  });
});
