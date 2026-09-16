export function isReminderDue(
  lastReminderAt: string | null,
  intervalDays: number,
  now = Date.now(),
) {
  if (!lastReminderAt) return true;
  const last = new Date(lastReminderAt).getTime();
  if (!Number.isFinite(last)) return true;
  return now - last >= intervalDays * 24 * 60 * 60 * 1000;
}
