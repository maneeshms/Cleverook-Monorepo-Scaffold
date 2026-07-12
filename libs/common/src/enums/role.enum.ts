/**
 * Coarse account roles. Fine-grained admin sub-roles (SUPPORT, FINANCE, etc.)
 * and agency member permissions are modelled separately as permission scopes;
 * this enum is the primary gate used by RolesGuard.
 */
export enum Role {
  USER = 'USER',
  AGENT = 'AGENT',
  ADMIN = 'ADMIN',
  SUPER_ADMIN = 'SUPER_ADMIN',
}

export enum SubscriptionTier {
  FREE = 'FREE',
  PREMIUM = 'PREMIUM',
  AGENT_SOLO = 'AGENT_SOLO',
  AGENCY = 'AGENCY',
  ENTERPRISE = 'ENTERPRISE',
}
