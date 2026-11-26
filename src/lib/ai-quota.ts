/** Calendar boundaries follow the account's Fortaleza billing month, not UTC. */
export const MONTHLY_AI_LIMIT = 4;
export function aiMonth(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Fortaleza",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  return `${parts.find((p) => p.type === "year")?.value}-${parts.find((p) => p.type === "month")?.value}-01`;
}
export function quotaDecision(
  enabled: boolean,
  used: number,
  admin = false,
  configuredLimit: unknown = MONTHLY_AI_LIMIT,
) {
  const numericLimit = Number(configuredLimit);
  const limit =
    Number.isInteger(numericLimit) && numericLimit >= 0 && numericLimit <= 10000 ? numericLimit : MONTHLY_AI_LIMIT;
  return { allowed: enabled && (admin || used < limit), limit: admin ? null : limit, used };
}
