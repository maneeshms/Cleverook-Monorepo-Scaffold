import { FeatureFlagsModule } from './feature-flags.module';
import { FEATURE_FLAGS_OPTIONS } from './feature-flags.options';
import { FeatureFlagsController } from './feature-flags.controller';

describe('FeatureFlagsModule.forRootAsync', () => {
  const dynamicModule = FeatureFlagsModule.forRootAsync({
    inject: ['SOME_CONFIG'],
    useFactory: () => ({ provider: 'env' }),
  });

  it('registers globally with the options provider wired to the host factory', () => {
    expect(dynamicModule.global).toBe(true);
    const optionsProvider = (dynamicModule.providers as any[]).find(
      (p) => p.provide === FEATURE_FLAGS_OPTIONS,
    );
    expect(optionsProvider.inject).toEqual(['SOME_CONFIG']);
    expect(optionsProvider.useFactory()).toEqual({ provider: 'env' });
  });

  it('defaults imports/inject when omitted and registers the admin controller', () => {
    const bare = FeatureFlagsModule.forRootAsync({ useFactory: () => ({}) });
    const optionsProvider = (bare.providers as any[]).find(
      (p) => p.provide === FEATURE_FLAGS_OPTIONS,
    );
    expect(optionsProvider.inject).toEqual([]);
    expect(bare.imports?.length).toBeGreaterThan(0); // TypeOrmModule.forFeature([FeatureFlag])
    expect(bare.controllers).toContain(FeatureFlagsController);
  });

  it('omits the controller when controller:false', () => {
    const headless = FeatureFlagsModule.forRootAsync({
      controller: false,
      useFactory: () => ({}),
    });
    expect(headless.controllers).toEqual([]);
  });

  it('exports the public service surface', () => {
    expect(dynamicModule.exports?.length).toBeGreaterThan(0);
  });
});
