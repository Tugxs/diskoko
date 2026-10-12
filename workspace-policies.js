// Retention is separate from the reporting window allowed by a subscription.
export const ANALYTICS_RETENTION_DAYS = 365;
export function analyticsPeriods(limit = 30) {
  return [7,14,30,90,365].filter(days => days <= Math.min(ANALYTICS_RETENTION_DAYS,Number(limit) || 30));
}
