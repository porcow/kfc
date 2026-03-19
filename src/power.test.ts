import assert from 'node:assert/strict';

import { test } from './test-compat.ts';
import {
  createMacOsPowerEventObserver,
  parsePowerManagementLogLine,
} from './power.ts';

test('power management log parser recognizes sleep and wake lines', () => {
  const sleep = parsePowerManagementLogLine(
    "2026-03-12 19:19:36 +0800 Sleep               \tEntering Sleep state due to 'Clamshell Sleep':TCPKeepAlive=active Using Batt (Charge:100%) 138 secs  ",
  );
  assert.deepEqual(sleep, {
    type: 'sleep',
    observedAt: '2026-03-12T11:19:36.000Z',
    rawLine:
      "2026-03-12 19:19:36 +0800 Sleep               \tEntering Sleep state due to 'Clamshell Sleep':TCPKeepAlive=active Using Batt (Charge:100%) 138 secs  ",
  });

  const wake = parsePowerManagementLogLine(
    '2026-03-12 19:21:55 +0800 Wake                \tDarkWake to FullWake from Deep Idle [CDNVAP] : due to Notification Using BATT (Charge:100%) 5 secs    ',
  );
  assert.deepEqual(wake, {
    type: 'wake',
    observedAt: '2026-03-12T11:21:55.000Z',
    rawLine:
      '2026-03-12 19:21:55 +0800 Wake                \tDarkWake to FullWake from Deep Idle [CDNVAP] : due to Notification Using BATT (Charge:100%) 5 secs    ',
  });
});

test('power event observer is a no-op off darwin', async () => {
  let spawned = false;
  const observer = createMacOsPowerEventObserver(
    {
      onSleep() {},
      onWake() {},
    },
    {
      platform: 'linux',
      spawnImpl() {
        spawned = true;
        throw new Error('should not spawn on non-darwin');
      },
    },
  );

  observer.start();
  await observer.close();
  assert.equal(spawned, false);
});
