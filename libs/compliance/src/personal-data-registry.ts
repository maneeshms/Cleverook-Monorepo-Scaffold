import { Injectable } from '@nestjs/common';

/**
 * A module's contribution to data-subject rights for the personal data IT owns.
 * Modules register one of these at startup so the compliance library can service
 * GDPR export (Art. 15/20) and erasure (Art. 17) WITHOUT the library importing
 * every feature module — inversion of control keeps `libs/compliance` decoupled.
 */
export interface PersonalDataContributor {
  /** Stable key naming the data set, e.g. 'profile', 'tasks', 'notifications'. */
  key: string;
  /** Return everything held about the subject, as a JSON-serialisable value. */
  collect(userId: string): Promise<unknown>;
  /**
   * Erase or anonymise the subject's data (Art. 17). Prefer anonymisation over
   * hard delete where referential integrity or lawful retention requires the row
   * to survive (crypto-shred / tombstone the PII, keep the skeleton). Return the
   * number of records affected for the erasure audit record.
   */
  erase(userId: string): Promise<number>;
}

/**
 * Central registry of {@link PersonalDataContributor}s. Feature modules call
 * `register(...)` in their `onModuleInit`; the compliance services iterate the
 * registry to build a complete export or run a full erasure. New modules become
 * export/erasure-complete just by registering — no change to the library.
 */
@Injectable()
export class PersonalDataRegistry {
  private readonly contributors = new Map<string, PersonalDataContributor>();

  register(contributor: PersonalDataContributor): void {
    this.contributors.set(contributor.key, contributor);
  }

  list(): PersonalDataContributor[] {
    return [...this.contributors.values()];
  }
}
