export function nextScheduleTime(job, now = Date.now()) {
  let next = new Date(job.run_at);
  if (!Number.isFinite(next.getTime())) throw new Error('Invalid schedule time');
  if (job.repeat === 'once') return next;
  if (!['daily','weekly','monthly'].includes(job.repeat)) throw new Error('Invalid recurrence');
  const anchor = Number(job.recurrence_day) || next.getUTCDate();
  do {
    if (job.repeat === 'monthly') {
      const last = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth()+2, 0)).getUTCDate();
      next = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth()+1, Math.min(anchor,last), next.getUTCHours(), next.getUTCMinutes(), next.getUTCSeconds(),next.getUTCMilliseconds()));
    } else next = new Date(next.getTime() + (job.repeat === 'weekly' ? 7 : 1)*86400000);
  } while (next.getTime() <= now);
  return next;
}
