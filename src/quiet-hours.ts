import type { ServiceEventQuietHoursRecord, ServiceEventType } from './domain.ts';

const QUIET_HOURS_TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/u;

export const QUIET_HOURS_MUTED_EVENT_TYPES: readonly ServiceEventType[] = [
  'system_sleeping',
  'system_woke',
  'service_online',
  'service_reconnected',
];

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function offsetLabel(offsetMinutes: number): string {
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absoluteMinutes = Math.abs(offsetMinutes);
  const hours = Math.floor(absoluteMinutes / 60);
  const minutes = absoluteMinutes % 60;
  return `UTC${sign}${pad(hours)}:${pad(minutes)}`;
}

function secondsSinceMidnight(value: string): number {
  const [hours, minutes, seconds] = value.split(':').map((part) => Number(part));
  return (hours * 60 * 60) + (minutes * 60) + seconds;
}

export function validateQuietHoursTime(value: string): string {
  if (!QUIET_HOURS_TIME_PATTERN.test(value)) {
    throw new Error('Quiet hours time must use HH:mm:ss format');
  }
  return value;
}

export function validateQuietHoursRange(fromTime: string, toTime: string): {
  fromTime: string;
  toTime: string;
} {
  const validatedFrom = validateQuietHoursTime(fromTime);
  const validatedTo = validateQuietHoursTime(toTime);
  if (validatedFrom === validatedTo) {
    throw new Error('Quiet hours start and end times must differ');
  }
  return {
    fromTime: validatedFrom,
    toTime: validatedTo,
  };
}

export function isoToLocalClockTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return value;
  }
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function isQuietHoursWindowActiveAtTime(
  fromTime: string,
  toTime: string,
  clockTime: string,
): boolean {
  const from = secondsSinceMidnight(fromTime);
  const to = secondsSinceMidnight(toTime);
  const now = secondsSinceMidnight(clockTime);

  if (from < to) {
    return now >= from && now < to;
  }
  return now >= from || now < to;
}

export function isQuietHoursActiveAt(
  quietHours: Pick<ServiceEventQuietHoursRecord, 'enabled' | 'fromTime' | 'toTime'>,
  eventAt: string,
): boolean {
  if (!quietHours.enabled) {
    return false;
  }
  return isQuietHoursWindowActiveAtTime(
    quietHours.fromTime,
    quietHours.toTime,
    isoToLocalClockTime(eventAt),
  );
}

export function isQuietHoursMutedEventType(eventType: ServiceEventType): boolean {
  return QUIET_HOURS_MUTED_EVENT_TYPES.includes(eventType);
}

export function getHostTimeZoneLabel(now: Date = new Date()): string {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const offset = offsetLabel(-now.getTimezoneOffset());
  return timeZone ? `${timeZone} (${offset})` : offset;
}
