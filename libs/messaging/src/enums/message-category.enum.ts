/**
 * Message category. TRANSACTIONAL always sends (verification, receipts, security);
 * MARKETING is subject to user consent/opt-out (checked once the preferences
 * table is wired — stubbed as always-allow for now).
 */
export enum MessageCategory {
  TRANSACTIONAL = 'TRANSACTIONAL',
  MARKETING = 'MARKETING',
}
