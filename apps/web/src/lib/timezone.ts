/**
 * Timezone utilities supporting automatic detection and user manual IANA override.
 * Handles daylight saving time, 30/45-minute offset zones, and zoned day boundaries.
 */

export const GREETING_BANDS = {
  morning: 'Good morning',
  afternoon: 'Good afternoon',
  evening: 'Good evening',
  night: 'Hello',
} as const;

export function getSystemTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function isValidIanaTimezone(tz: string): boolean {
  if (!tz || typeof tz !== 'string') return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function resolveUserTimezone(preference?: string | null): string {
  if (preference && preference !== 'auto' && isValidIanaTimezone(preference)) {
    return preference;
  }
  return getSystemTimezone();
}

/**
 * Returns the greeting for a specific hour (0-23):
 * - 05:00 - 11:59: "Good morning"
 * - 12:00 - 16:59: "Good afternoon"
 * - 17:00 - 21:59: "Good evening"
 * - 22:00 - 04:59: "Hello"
 */
export function getGreetingForHour(hour: number): string {
  if (hour >= 5 && hour < 12) return GREETING_BANDS.morning;
  if (hour >= 12 && hour < 17) return GREETING_BANDS.afternoon;
  if (hour >= 17 && hour < 22) return GREETING_BANDS.evening;
  return GREETING_BANDS.night;
}

export function getZonedHour(date: Date, timeZone: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: 'numeric',
      hourCycle: 'h23',
    }).formatToParts(date);
    const hourPart = parts.find((p) => p.type === 'hour');
    return hourPart ? parseInt(hourPart.value, 10) : date.getHours();
  } catch {
    return date.getHours();
  }
}

export function getLocalizedGreeting(
  timeZone: string,
  displayName?: string,
  date: Date = new Date()
): string {
  const hour = getZonedHour(date, timeZone);
  const greeting = getGreetingForHour(hour);
  const name = displayName?.trim() || 'there';
  return `${greeting}, ${name}`;
}

export type ZonedDateGroup = 'today' | 'yesterday' | 'previous_7_days' | 'older';

export function getZonedDateGroup(
  date: Date,
  timeZone: string,
  now: Date = new Date()
): ZonedDateGroup {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const dateStr = formatter.format(date);
    const nowStr = formatter.format(now);

    if (dateStr === nowStr) return 'today';

    const d1 = new Date(`${dateStr}T00:00:00Z`).getTime();
    const d2 = new Date(`${nowStr}T00:00:00Z`).getTime();
    const diffDays = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));

    if (diffDays === 1) return 'yesterday';
    if (diffDays > 1 && diffDays <= 7) return 'previous_7_days';
    return 'older';
  } catch {
    // Fallback if Intl fails
    const diff = Math.floor((now.getTime() - date.getTime()) / 86_400_000);
    if (diff <= 0) return 'today';
    if (diff === 1) return 'yesterday';
    if (diff <= 7) return 'previous_7_days';
    return 'older';
  }
}

export function formatZonedTime(date: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone,
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  } catch {
    return date.toLocaleTimeString();
  }
}

let cachedIanaList: string[] | null = null;

export function getAllIanaTimezones(): string[] {
  if (cachedIanaList) return cachedIanaList;
  try {
    if (typeof Intl.supportedValuesOf === 'function') {
      cachedIanaList = Intl.supportedValuesOf('timeZone');
      return cachedIanaList;
    }
  } catch {
    // fallback
  }

  cachedIanaList = [
    'UTC',
    'Africa/Cairo',
    'Africa/Johannesburg',
    'America/Anchorage',
    'America/Argentina/Buenos_Aires',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'America/New_York',
    'America/Sao_Paulo',
    'America/Toronto',
    'America/Vancouver',
    'Asia/Bangkok',
    'Asia/Dhaka',
    'Asia/Dubai',
    'Asia/Hong_Kong',
    'Asia/Jakarta',
    'Asia/Kolkata',
    'Asia/Seoul',
    'Asia/Shanghai',
    'Asia/Singapore',
    'Asia/Tokyo',
    'Australia/Melbourne',
    'Australia/Sydney',
    'Europe/Amsterdam',
    'Europe/Berlin',
    'Europe/London',
    'Europe/Madrid',
    'Europe/Paris',
    'Europe/Rome',
    'Pacific/Auckland',
    'Pacific/Honolulu',
  ];
  return cachedIanaList;
}
