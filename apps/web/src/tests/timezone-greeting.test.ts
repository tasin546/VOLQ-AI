import { describe, expect, it } from 'vitest';
import {
  getGreetingForHour,
  getLocalizedGreeting,
  getZonedDateGroup,
  getZonedHour,
  resolveUserTimezone,
} from '../lib/timezone';

describe('Item 3: Timezone Greeting & Zoned Date Boundaries', () => {
  it('enforces exact greeting hour bands', () => {
    // 05:00 - 11:59 -> Good morning
    expect(getGreetingForHour(5)).toBe('Good morning');
    expect(getGreetingForHour(8)).toBe('Good morning');
    expect(getGreetingForHour(11)).toBe('Good morning');

    // 12:00 - 16:59 -> Good afternoon
    expect(getGreetingForHour(12)).toBe('Good afternoon');
    expect(getGreetingForHour(14)).toBe('Good afternoon');
    expect(getGreetingForHour(16)).toBe('Good afternoon');

    // 17:00 - 21:59 -> Good evening
    expect(getGreetingForHour(17)).toBe('Good evening');
    expect(getGreetingForHour(19)).toBe('Good evening');
    expect(getGreetingForHour(21)).toBe('Good evening');

    // 22:00 - 04:59 -> Hello
    expect(getGreetingForHour(22)).toBe('Hello');
    expect(getGreetingForHour(23)).toBe('Hello');
    expect(getGreetingForHour(0)).toBe('Hello');
    expect(getGreetingForHour(2)).toBe('Hello');
    expect(getGreetingForHour(4)).toBe('Hello');
  });

  it('computes localized greeting across global timezones including half-hour offsets and DST', () => {
    // UTC 06:00:00
    const testDate = new Date('2026-11-13T06:00:00Z');

    // Asia/Dhaka (UTC+6) -> 12:00:00 (Good afternoon)
    expect(getZonedHour(testDate, 'Asia/Dhaka')).toBe(12);
    expect(getLocalizedGreeting('Asia/Dhaka', 'Tasin', testDate)).toBe(
      'Good afternoon, Tasin'
    );

    // Asia/Kolkata (UTC+5:30) -> 11:30:00 (Good morning)
    expect(getZonedHour(testDate, 'Asia/Kolkata')).toBe(11);
    expect(getLocalizedGreeting('Asia/Kolkata', 'Rahul', testDate)).toBe(
      'Good morning, Rahul'
    );

    // 31 minutes later -> UTC 06:31:00
    const testDateKolkataAfternoon = new Date('2026-11-13T06:31:00Z');
    // Asia/Kolkata -> 12:01:00 (Good afternoon)
    expect(getZonedHour(testDateKolkataAfternoon, 'Asia/Kolkata')).toBe(12);
    expect(
      getLocalizedGreeting('Asia/Kolkata', 'Rahul', testDateKolkataAfternoon)
    ).toBe('Good afternoon, Rahul');

    // America/Los_Angeles (UTC-8) -> 22:00:00 previous day (Hello)
    expect(getZonedHour(testDate, 'America/Los_Angeles')).toBe(22);
    expect(getLocalizedGreeting('America/Los_Angeles', 'Alex', testDate)).toBe(
      'Hello, Alex'
    );

    // Pacific/Auckland (UTC+13 during NZDT) -> 19:00:00 (Good evening)
    expect(getZonedHour(testDate, 'Pacific/Auckland')).toBe(19);
    expect(getLocalizedGreeting('Pacific/Auckland', 'Sam', testDate)).toBe(
      'Good evening, Sam'
    );
  });

  it('respects manual timezone override over automatic fallback', () => {
    expect(resolveUserTimezone('Asia/Tokyo')).toBe('Asia/Tokyo');
    expect(resolveUserTimezone('America/New_York')).toBe('America/New_York');

    // Invalid or 'auto' resolves to detected system timezone
    const resolvedAuto = resolveUserTimezone('auto');
    expect(typeof resolvedAuto).toBe('string');
    expect(resolvedAuto.length).toBeGreaterThan(0);

    const resolvedInvalid = resolveUserTimezone('Invalid/Zone_Name');
    expect(typeof resolvedInvalid).toBe('string');
    expect(resolvedInvalid.length).toBeGreaterThan(0);
  });

  it('groups chats into Today, Yesterday, Previous 7 days according to user active timezone', () => {
    // Reference moment: Nov 13, 2026 01:00:00 UTC
    const refNow = new Date('2026-11-13T01:00:00Z');

    // Chat created at Nov 12, 2026 23:30:00 UTC
    const chatTime = new Date('2026-11-12T23:30:00Z');

    // In UTC, chatTime is Nov 12 and refNow is Nov 13 -> "yesterday"
    expect(getZonedDateGroup(chatTime, 'UTC', refNow)).toBe('yesterday');

    // In Asia/Dhaka (UTC+6), refNow is Nov 13 07:00 and chatTime is Nov 13 05:30 -> "today"!
    expect(getZonedDateGroup(chatTime, 'Asia/Dhaka', refNow)).toBe('today');

    // Older chat: 5 days ago in UTC
    const fiveDaysAgo = new Date('2026-11-08T01:00:00Z');
    expect(getZonedDateGroup(fiveDaysAgo, 'UTC', refNow)).toBe('previous_7_days');

    // 10 days ago -> older
    const tenDaysAgo = new Date('2026-11-03T01:00:00Z');
    expect(getZonedDateGroup(tenDaysAgo, 'UTC', refNow)).toBe('older');
  });
});
