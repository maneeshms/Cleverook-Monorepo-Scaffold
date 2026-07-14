import { DataSubjectService } from './data-subject.service';
import { PersonalDataRegistry } from './personal-data-registry';

describe('DataSubjectService', () => {
  let registry: PersonalDataRegistry;
  let consent: { history: jest.Mock };
  let audit: { record: jest.Mock };
  let service: DataSubjectService;

  beforeEach(() => {
    registry = new PersonalDataRegistry();
    consent = { history: jest.fn().mockResolvedValue([{ purpose: 'x', granted: true }]) };
    audit = { record: jest.fn() };
    service = new DataSubjectService(registry, consent as never, audit as never);
  });

  it('export aggregates every contributor plus consent history and audits it', async () => {
    registry.register({
      key: 'profile',
      collect: async () => ({ email: 'a@b.co' }),
      erase: jest.fn(),
    });
    registry.register({
      key: 'tasks',
      collect: async () => [{ id: 't1' }],
      erase: jest.fn(),
    });

    const out = await service.exportData('u1');
    expect(out.subjectId).toBe('u1');
    expect(out.data).toEqual({
      profile: { email: 'a@b.co' },
      tasks: [{ id: 't1' }],
      consent: [{ purpose: 'x', granted: true }],
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'data.export', actorId: 'u1' }),
    );
  });

  it('erase runs every contributor eraser, totals the counts, and audits it', async () => {
    registry.register({ key: 'profile', collect: jest.fn(), erase: async () => 1 });
    registry.register({ key: 'tasks', collect: jest.fn(), erase: async () => 3 });

    const result = await service.erase('u1');
    expect(result.affected).toEqual({ profile: 1, tasks: 3 });
    expect(result.total).toBe(4);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'data.erase',
        metadata: { affected: { profile: 1, tasks: 3 }, total: 4 },
      }),
    );
  });
});
