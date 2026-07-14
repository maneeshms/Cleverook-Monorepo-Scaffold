import { ComplianceModule } from './compliance.module';
import { COMPLIANCE_OPTIONS } from './compliance.options';
import { ComplianceController } from './compliance.controller';

describe('ComplianceModule.forRootAsync', () => {
  const dynamicModule = ComplianceModule.forRootAsync({
    inject: ['SOME_CONFIG'],
    useFactory: () => ({ auditHmacSecret: 's' }),
  });

  it('registers globally with the options provider wired to the host factory', () => {
    expect(dynamicModule.global).toBe(true);
    const optionsProvider = (dynamicModule.providers as any[]).find(
      (p) => p.provide === COMPLIANCE_OPTIONS,
    );
    expect(optionsProvider.inject).toEqual(['SOME_CONFIG']);
    expect(optionsProvider.useFactory()).toEqual({ auditHmacSecret: 's' });
  });

  it('defaults imports/inject and registers the controller', () => {
    const bare = ComplianceModule.forRootAsync({ useFactory: () => ({ auditHmacSecret: 's' }) });
    const optionsProvider = (bare.providers as any[]).find((p) => p.provide === COMPLIANCE_OPTIONS);
    expect(optionsProvider.inject).toEqual([]);
    expect(bare.imports?.length).toBeGreaterThan(0); // TypeOrmModule.forFeature([...])
    expect(bare.controllers).toContain(ComplianceController);
  });

  it('omits the controller when controller:false', () => {
    const headless = ComplianceModule.forRootAsync({
      controller: false,
      useFactory: () => ({ auditHmacSecret: 's' }),
    });
    expect(headless.controllers).toEqual([]);
  });

  it('exports the service + registry surface', () => {
    expect(dynamicModule.exports?.length).toBeGreaterThan(0);
  });
});
