// Server-only helper that syncs the official South African public-holiday
// calendar into the system so the scheduling engine can block those dates.
import type { Repositories } from "./db/repositories.server";
import { writeAudit, type Actor } from "./scheduling/scheduling.service.server";

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Anonymous Gregorian computus — returns Easter Sunday for the given year. */
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function shift(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

/** South African public holidays, including the "Sunday falls to Monday" rule. */
export function southAfricanHolidays(year: number): { name: string; holiday_date: string }[] {
  const easter = easterSunday(year);
  const fixed: { name: string; month: number; day: number }[] = [
    { name: "New Year's Day", month: 1, day: 1 },
    { name: "Human Rights Day", month: 3, day: 21 },
    { name: "Freedom Day", month: 4, day: 27 },
    { name: "Workers' Day", month: 5, day: 1 },
    { name: "Youth Day", month: 6, day: 16 },
    { name: "National Women's Day", month: 8, day: 9 },
    { name: "Heritage Day", month: 9, day: 24 },
    { name: "Day of Reconciliation", month: 12, day: 16 },
    { name: "Christmas Day", month: 12, day: 25 },
    { name: "Day of Goodwill", month: 12, day: 26 },
  ];

  const list: { name: string; holiday_date: string }[] = [];
  for (const item of fixed) {
    const date = new Date(Date.UTC(year, item.month - 1, item.day));
    list.push({ name: item.name, holiday_date: iso(date) });
    if (date.getUTCDay() === 0) {
      list.push({ name: `${item.name} (observed)`, holiday_date: iso(shift(date, 1)) });
    }
  }
  list.push({ name: "Good Friday", holiday_date: iso(shift(easter, -2)) });
  list.push({ name: "Family Day", holiday_date: iso(shift(easter, 1)) });

  return list.sort((a, b) => a.holiday_date.localeCompare(b.holiday_date));
}

export async function syncHolidayCalendar(
  repos: Repositories,
  actor: Actor,
  year: number,
): Promise<{ added: number; skipped: number; year: number }> {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new Error("Provide a valid calendar year.");

  const existing = (await repos.publicHolidays.list({})) as unknown as { holiday_date: string }[];
  const known = new Set(existing.map((row) => String(row.holiday_date).slice(0, 10)));

  let added = 0;
  let skipped = 0;
  for (const holiday of southAfricanHolidays(year)) {
    if (known.has(holiday.holiday_date)) {
      skipped += 1;
      continue;
    }
    await repos.publicHolidays.create(holiday);
    known.add(holiday.holiday_date);
    added += 1;
  }

  await writeAudit(repos, actor, {
    action: "public_holidays.sync",
    entity: "public_holidays",
    entityId: String(year),
    details: { year, added, skipped },
  });
  return { added, skipped, year };
}
