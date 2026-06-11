export function getBrowserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

const KNOWN_TIMEZONES = [
  { value: 'UTC', label: 'UTC' },
  { value: 'America/New_York', label: 'US Eastern (ET)' },
  { value: 'America/Chicago', label: 'US Central (CT)' },
  { value: 'America/Denver', label: 'US Mountain (MT)' },
  { value: 'America/Los_Angeles', label: 'US Pacific (PT)' },
  { value: 'Europe/London', label: 'UK (GMT/BST)' },
  { value: 'Europe/Berlin', label: 'Central Europe (CET)' },
  { value: 'Europe/Madrid', label: 'Spain (CET)' },
  { value: 'Asia/Kolkata', label: 'India (IST)' },
  { value: 'Asia/Singapore', label: 'Singapore (SGT)' },
  { value: 'Asia/Tokyo', label: 'Japan (JST)' },
  { value: 'Australia/Sydney', label: 'Australia Eastern (AEST)' },
];

export function getCommonTimezones(): { value: string; label: string }[] {
  const browserTz = getBrowserTimezone();
  if (KNOWN_TIMEZONES.some((tz) => tz.value === browserTz)) {
    return KNOWN_TIMEZONES;
  }
  return [{ value: browserTz, label: browserTz.replace(/_/g, ' ') }, ...KNOWN_TIMEZONES];
}

export const COMMON_TIMEZONES = getCommonTimezones();

function getPartsInTimezone(date: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => {
    const val = parseInt(parts.find((p) => p.type === type)?.value || '0', 10);
    if (type === 'hour' && val === 24) return 0;
    return val;
  };
  return {
    year: get('year'),
    month: get('month') - 1,
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
  };
}

export function getDateTimePartsInTimezone(
  date: Date,
  timezone: string,
): { year: number; month: number; day: number; hour: number; minute: number } {
  return getPartsInTimezone(date, timezone === 'local' ? getBrowserTimezone() : timezone);
}

export function dateInTimezone(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timezone: string,
): Date {
  const tz = timezone === 'local' ? getBrowserTimezone() : timezone;

  // Create a UTC guess from the parts
  const guess = new Date(Date.UTC(year, month, day, hour, minute, 0, 0));

  // See what wall-clock time `guess` maps to in the target timezone
  const tzParts = getPartsInTimezone(guess, tz);
  const diffMinutes = hour * 60 + minute - (tzParts.hour * 60 + tzParts.minute);

  let dayDiff = 0;
  if (tzParts.year !== year || tzParts.month !== month || tzParts.day !== day) {
    const guessDay = new Date(Date.UTC(year, month, day));
    const tzDay = new Date(Date.UTC(tzParts.year, tzParts.month, tzParts.day));
    dayDiff = (guessDay.getTime() - tzDay.getTime()) / (24 * 60 * 60 * 1000);
  }

  const totalDiffMs = (dayDiff * 24 * 60 + diffMinutes) * 60 * 1000;
  const adjusted = new Date(guess.getTime() + totalDiffMs);

  const verifyParts = getPartsInTimezone(adjusted, tz);
  if (verifyParts.hour !== hour || verifyParts.minute !== minute) {
    const diff2 = hour * 60 + minute - (verifyParts.hour * 60 + verifyParts.minute);
    let dayDiff2 = 0;
    if (verifyParts.year !== year || verifyParts.month !== month || verifyParts.day !== day) {
      const targetDay = new Date(Date.UTC(year, month, day));
      const vDay = new Date(Date.UTC(verifyParts.year, verifyParts.month, verifyParts.day));
      dayDiff2 = (targetDay.getTime() - vDay.getTime()) / (24 * 60 * 60 * 1000);
    }
    return new Date(adjusted.getTime() + (dayDiff2 * 24 * 60 + diff2) * 60 * 1000);
  }

  return adjusted;
}
