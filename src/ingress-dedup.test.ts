import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';

import { RunRepository } from './persistence/run-repository.ts';

test('repository claims an ingress event key only once within the dedup window', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kids-alfred-ingress-dedup-'));
  const repository = new RunRepository(join(directory, 'dedup.sqlite'));

  try {
    assert.equal(
      repository.claimIngressEvent('im.message.receive_v1:msg-1', 'im.message.receive_v1'),
      true,
    );
    assert.equal(
      repository.claimIngressEvent('im.message.receive_v1:msg-1', 'im.message.receive_v1'),
      false,
    );
  } finally {
    repository.close();
  }
});

