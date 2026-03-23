import assert from 'node:assert/strict';

import { test } from './test-compat.ts';
import {
  getHostTimeZoneLabel,
  isQuietHoursActiveAt,
  isQuietHoursMutedEventType,
  isQuietHoursWindowActiveAtTime,
  validateQuietHoursRange,
  validateQuietHoursTime,
} from './quiet-hours.ts';

test('validateQuietHoursTime accepts exact HH:mm:ss format and rejects invalid values', () => {
  assert.equal(validateQuietHoursTime('00:00:00'), '00:00:00');
  assert.equal(validateQuietHoursTime('23:59:59'), '23:59:59');
  assert.throws(() => validateQuietHoursTime('24:00:00'), /HH:mm:ss/u);
  assert.throws(() => validateQuietHoursTime('7:00:00'), /HH:mm:ss/u);
});

test('validateQuietHoursRange rejects equal start and end times', () => {
  assert.deepEqual(validateQuietHoursRange('23:00:00', '07:00:00'), {
    fromTime: '23:00:00',
    toTime: '07:00:00',
  });
  assert.throws(() => validateQuietHoursRange('22:00:00', '22:00:00'), /must differ/u);
});

test('isQuietHoursWindowActiveAtTime handles same-day windows', () => {
  assert.equal(isQuietHoursWindowActiveAtTime('09:00:00', '18:00:00', '08:59:59'), false);
  assert.equal(isQuietHoursWindowActiveAtTime('09:00:00', '18:00:00', '09:00:00'), true);
  assert.equal(isQuietHoursWindowActiveAtTime('09:00:00', '18:00:00', '17:59:59'), true);
  assert.equal(isQuietHoursWindowActiveAtTime('09:00:00', '18:00:00', '18:00:00'), false);
});

test('isQuietHoursWindowActiveAtTime handles cross-midnight windows', () => {
  assert.equal(isQuietHoursWindowActiveAtTime('23:00:00', '07:00:00', '22:59:59'), false);
  assert.equal(isQuietHoursWindowActiveAtTime('23:00:00', '07:00:00', '23:00:00'), true);
  assert.equal(isQuietHoursWindowActiveAtTime('23:00:00', '07:00:00', '02:00:00'), true);
  assert.equal(isQuietHoursWindowActiveAtTime('23:00:00', '07:00:00', '06:59:59'), true);
  assert.equal(isQuietHoursWindowActiveAtTime('23:00:00', '07:00:00', '07:00:00'), false);
});

test('isQuietHoursActiveAt uses event-local clock time and enabled flag', () => {
  const quietHours = {
    enabled: true,
    fromTime: '23:00:00',
    toTime: '07:00:00',
  };
  assert.equal(isQuietHoursActiveAt(quietHours, '2026-03-23T23:30:00.000Z'), true);
  assert.equal(isQuietHoursActiveAt(quietHours, '2026-03-23T12:00:00.000Z'), false);
  assert.equal(
    isQuietHoursActiveAt(
      {
        ...quietHours,
        enabled: false,
      },
      '2026-03-23T23:30:00.000Z',
    ),
    false,
  );
});

test('isQuietHoursMutedEventType matches the supported service-event set', () => {
  assert.equal(isQuietHoursMutedEventType('system_sleeping'), true);
  assert.equal(isQuietHoursMutedEventType('system_woke'), true);
  assert.equal(isQuietHoursMutedEventType('service_online'), true);
  assert.equal(isQuietHoursMutedEventType('service_reconnected'), true);
});

test('getHostTimeZoneLabel includes a UTC offset', () => {
  assert.match(getHostTimeZoneLabel(), /UTC[+-]\d{2}:\d{2}/u);
});
