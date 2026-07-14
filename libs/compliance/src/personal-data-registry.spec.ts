import { PersonalDataRegistry } from './personal-data-registry';

describe('PersonalDataRegistry', () => {
  it('registers contributors and lists them; a re-registered key replaces the prior', () => {
    const registry = new PersonalDataRegistry();
    const a = { key: 'profile', collect: jest.fn(), erase: jest.fn() };
    const b = { key: 'tasks', collect: jest.fn(), erase: jest.fn() };
    registry.register(a);
    registry.register(b);
    expect(registry.list()).toEqual([a, b]);

    const a2 = { key: 'profile', collect: jest.fn(), erase: jest.fn() };
    registry.register(a2);
    expect(registry.list()).toHaveLength(2);
    expect(registry.list()).toContain(a2);
    expect(registry.list()).not.toContain(a);
  });
});
