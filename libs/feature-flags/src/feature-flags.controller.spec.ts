import { FeatureFlagsController } from './feature-flags.controller';

describe('FeatureFlagsController', () => {
  const flags = {
    isEnabled: jest.fn(),
    listFlags: jest.fn(),
    upsertFlag: jest.fn(),
    deleteFlag: jest.fn(),
  };
  const controller = new FeatureFlagsController(flags as never);
  const user = { sub: 'u1', role: 'USER' } as never;

  beforeEach(() => jest.clearAllMocks());

  it('evaluates a flag with the caller as the targeting key', async () => {
    flags.isEnabled.mockResolvedValue(true);
    await expect(controller.evaluate({ key: 'x' }, user)).resolves.toEqual({
      key: 'x',
      enabled: true,
    });
    expect(flags.isEnabled).toHaveBeenCalledWith('x', false, { targetingKey: 'u1', role: 'USER' });
  });

  it('lists flags', async () => {
    flags.listFlags.mockResolvedValue([]);
    await controller.list();
    expect(flags.listFlags).toHaveBeenCalled();
  });

  it('upserts a flag', async () => {
    await controller.upsert({ key: 'k' }, { enabled: true });
    expect(flags.upsertFlag).toHaveBeenCalledWith({ key: 'k', enabled: true });
  });

  it('deletes a flag', async () => {
    await controller.remove({ key: 'k' });
    expect(flags.deleteFlag).toHaveBeenCalledWith('k');
  });
});
