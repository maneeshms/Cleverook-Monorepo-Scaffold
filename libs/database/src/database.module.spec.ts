import { ConfigService } from '@nestjs/config';
import { typeOrmOptionsFactory } from './database.module';
import { BaseEntity } from './entities/base.entity';

const configService = (values: Record<string, unknown>) =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService;

describe('typeOrmOptionsFactory', () => {
  it('builds hardened defaults from the database namespace', () => {
    const options = typeOrmOptionsFactory(
      configService({
        'database.url': 'postgresql://u:p@h:5432/db',
        'database.ssl': false,
        'database.logging': true,
        'database.poolMax': 10,
      }),
    ) as Record<string, unknown>;

    expect(options.type).toBe('postgres');
    expect(options.url).toBe('postgresql://u:p@h:5432/db');
    expect(options.synchronize).toBe(false);
    expect(options.migrationsRun).toBe(false);
    expect(options.autoLoadEntities).toBe(true);
    expect(options.logging).toBe(true);
    expect(options.extra).toEqual({ max: 10 });
  });

  it('passes managed-host SSL objects through and defaults the pool', () => {
    const options = typeOrmOptionsFactory(
      configService({
        'database.url': 'postgresql://supabase',
        'database.ssl': { rejectUnauthorized: false },
      }),
    ) as Record<string, unknown>;
    expect(options.ssl).toEqual({ rejectUnauthorized: false });
    expect(options.extra).toEqual({ max: 20 });
  });
});

describe('BaseEntity', () => {
  it('declares uuid pk + timestamps + soft delete on subclasses', () => {
    class Sample extends BaseEntity {}
    const sample = new Sample();
    sample.id = '00000000-0000-0000-0000-000000000000';
    sample.createdAt = new Date();
    sample.updatedAt = new Date();
    sample.deletedAt = null;
    expect(sample).toBeInstanceOf(BaseEntity);
    expect(sample.deletedAt).toBeNull();
  });
});
