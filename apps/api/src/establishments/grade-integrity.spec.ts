import { EstablishmentsService } from './establishments.service';
import { UploadsController } from '../uploads/uploads.controller';
import { AuthService } from '../auth/auth.service';

/**
 * Spec §3.1, §6.3, §11: only a submitted inspection may change a grade. The
 * enforcement is structural — no service other than InspectorService exposes a
 * way to write one. If a later week adds an admin override or lets a complaint
 * touch the grade, this fails loudly and on purpose.
 */
describe('grade integrity', () => {
  const gradeWriting = /grade/i;

  const methodsOf = (klass: Function) =>
    Object.getOwnPropertyNames(klass.prototype).filter((name) => name !== 'constructor');

  it.each([
    ['EstablishmentsService', EstablishmentsService],
    ['UploadsController', UploadsController],
    ['AuthService', AuthService],
  ])('%s exposes no grade-writing method', (_name, klass) => {
    const suspicious = methodsOf(klass).filter(
      (m) => gradeWriting.test(m) && /^(set|update|write|change|override)/i.test(m),
    );
    expect(suspicious).toEqual([]);
  });

  it('the public establishments service is read-only', () => {
    const mutating = methodsOf(EstablishmentsService).filter((m) =>
      /^(set|update|create|delete|save|write)/i.test(m),
    );
    expect(mutating).toEqual([]);
  });
});
