/** Calendar boundaries follow the account's Fortaleza billing month, not UTC. */
export const MONTHLY_AI_LIMIT = 4;
export function aiMonth(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Fortaleza', year: 'numeric', month: '2-digit' }).formatToParts(now);
  return `${parts.find(p => p.type === 'year')?.value}-${parts.find(p => p.type === 'month')?.value}-01`;
}
export function quotaDecision(enabled: boolean, used: number, admin = false) {
  return { allowed: enabled && (admin || used < MONTHLY_AI_LIMIT), limit: admin ? null : MONTHLY_AI_LIMIT, used };
}