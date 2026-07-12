import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '@clevscaffold/database';

/**
 * A feature flag backing the OpenFeature `database` provider.
 *
 * `enabled` drives boolean evaluations; `value` (jsonb) carries the variant for
 * string/number/object evaluations. The flag `key` is the natural identifier used
 * by OpenFeature call sites (e.g. `new-checkout`).
 */
@Entity('feature_flags')
export class FeatureFlag extends BaseEntity {
  @Index('UQ_feature_flags_key', { unique: true })
  @Column({ type: 'varchar', length: 120 })
  key: string;

  @Column({ type: 'boolean', default: false })
  enabled: boolean;

  // Variant payload for non-boolean flags (string/number/object). Null = boolean-only.
  @Column({ type: 'jsonb', nullable: true })
  value: unknown | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description: string | null;
}
