import { randomInt } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import type {
  CronChatSubscriptionRecord,
  CronDesiredState,
  CronJobRecord,
  CronObservedState,
  PDWin11MonitorState,
  PairingRecord,
  RunRecord,
  RunState,
  ServiceEventQuietHoursRecord,
  ServiceEventStateRecord,
  ServiceEventSubscriptionRecord,
  ServiceEventType,
} from '../domain.ts';
import { openSqliteDatabase, type SQLiteDatabase } from './sqlite.ts';

export class RunRepository {
  readonly database: SQLiteDatabase;
  private readonly sqlitePath: string;

  constructor(sqlitePath: string) {
    this.sqlitePath = sqlitePath;
    mkdirSync(dirname(sqlitePath), { recursive: true });
    this.database = openSqliteDatabase(sqlitePath);
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS runs (
        run_id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        task_type TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        confirmation_id TEXT NOT NULL,
        state TEXT NOT NULL,
        parameters_json TEXT NOT NULL,
        parameter_summary TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        started_at TEXT,
        finished_at TEXT,
        status_summary TEXT,
        result_json TEXT,
        origin_chat_id TEXT,
        cancellable INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS confirmations (
        confirmation_id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES runs(run_id)
      );
      CREATE TABLE IF NOT EXISTS run_events (
        event_id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL REFERENCES runs(run_id),
        state TEXT NOT NULL,
        summary TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS pairings (
        pair_code TEXT PRIMARY KEY,
        actor_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        used_at TEXT
      );
      CREATE TABLE IF NOT EXISTS cron_jobs (
        task_id TEXT PRIMARY KEY,
        launchd_label TEXT NOT NULL,
        schedule TEXT NOT NULL,
        auto_start INTEGER NOT NULL,
        desired_state TEXT NOT NULL,
        observed_state TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_started_at TEXT,
        last_stopped_at TEXT,
        last_error TEXT
      );
      CREATE TABLE IF NOT EXISTS cron_chat_subscriptions (
        task_id TEXT NOT NULL,
        chat_id TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (task_id, chat_id)
      );
      CREATE TABLE IF NOT EXISTS service_event_subscriptions (
        actor_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        enabled INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (actor_id, event_type)
      );
      CREATE TABLE IF NOT EXISTS service_event_quiet_hours (
        actor_id TEXT PRIMARY KEY,
        enabled INTEGER NOT NULL,
        from_time TEXT NOT NULL,
        to_time TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS service_event_state (
        singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
        last_connected_at TEXT,
        last_heartbeat_succeeded_at TEXT,
        last_reconnected_notified_at TEXT,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS pd_win11_states (
        task_id TEXT PRIMARY KEY,
        state TEXT NOT NULL,
        detected_start_at TEXT,
        last_transition_at TEXT NOT NULL,
        last_notification_at TEXT,
        last_runtime_reminder_at TEXT
      );
      CREATE TABLE IF NOT EXISTS ingress_dedup_events (
        event_key TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_runs_actor_created ON runs(actor_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_pairings_actor_created ON pairings(actor_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_ingress_dedup_expires ON ingress_dedup_events(expires_at);
    `);
    this.ensureRunColumn('origin_chat_id', 'TEXT');
    this.ensureTableColumn('pd_win11_states', 'last_runtime_reminder_at', 'TEXT');
  }

  close(): void {
    this.database.close();
  }

  createRunWithConfirmation(run: RunRecord): { created: boolean; runId: string } {
    const existing = this.getRunIdForConfirmation(run.confirmationId);
    if (existing) {
      return { created: false, runId: existing };
    }

    this.database.exec('BEGIN IMMEDIATE');
    try {
      const existingAgain = this.getRunIdForConfirmation(run.confirmationId);
      if (existingAgain) {
        this.database.exec('COMMIT');
        return { created: false, runId: existingAgain };
      }

      this.database
        .prepare(`
          INSERT INTO runs (
            run_id, task_id, task_type, actor_id, confirmation_id, state,
            parameters_json, parameter_summary, created_at, updated_at,
            started_at, finished_at, status_summary, result_json, origin_chat_id, cancellable
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          run.runId,
          run.taskId,
          run.taskType,
          run.actorId,
          run.confirmationId,
          run.state,
          JSON.stringify(run.parameters),
          run.parameterSummary,
          run.createdAt,
          run.updatedAt,
          run.startedAt ?? null,
          run.finishedAt ?? null,
          run.statusSummary ?? null,
          run.resultJson ?? null,
          run.originChatId ?? null,
          run.cancellable ? 1 : 0,
        );

      this.database
        .prepare('INSERT INTO confirmations (confirmation_id, run_id) VALUES (?, ?)')
        .run(run.confirmationId, run.runId);

      this.appendRunEvent(run.runId, run.state, run.statusSummary ?? 'Run created');
      this.database.exec('COMMIT');
      return { created: true, runId: run.runId };
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  getRunIdForConfirmation(confirmationId: string): string | undefined {
    const row = this.database
      .prepare('SELECT run_id FROM confirmations WHERE confirmation_id = ?')
      .get(confirmationId) as { run_id?: string } | undefined;
    return row?.run_id;
  }

  getRun(runId: string): RunRecord | undefined {
    const row = this.database
      .prepare('SELECT * FROM runs WHERE run_id = ?')
      .get(runId) as Record<string, unknown> | undefined;

    if (!row) {
      return undefined;
    }

    return {
      runId: String(row.run_id),
      taskId: String(row.task_id),
      taskType: row.task_type as RunRecord['taskType'],
      actorId: String(row.actor_id),
      confirmationId: String(row.confirmation_id),
      state: row.state as RunState,
      parameters: JSON.parse(String(row.parameters_json)) as RunRecord['parameters'],
      parameterSummary: String(row.parameter_summary),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      startedAt: row.started_at ? String(row.started_at) : undefined,
      finishedAt: row.finished_at ? String(row.finished_at) : undefined,
      statusSummary: row.status_summary ? String(row.status_summary) : undefined,
      resultJson: row.result_json ? String(row.result_json) : undefined,
      originChatId: row.origin_chat_id ? String(row.origin_chat_id) : undefined,
      cancellable: Number(row.cancellable) === 1,
    };
  }

  listRecentRuns(actorId?: string, limit = 10): RunRecord[] {
    const rows = actorId
      ? (this.database
          .prepare('SELECT * FROM runs WHERE actor_id = ? ORDER BY created_at DESC LIMIT ?')
          .all(actorId, limit) as Record<string, unknown>[])
      : (this.database
          .prepare('SELECT * FROM runs ORDER BY created_at DESC LIMIT ?')
          .all(limit) as Record<string, unknown>[]);

    return rows
      .map((row) => this.getRun(String(row.run_id)))
      .filter((row): row is RunRecord => Boolean(row));
  }

  updateRun(
    runId: string,
    updates: Partial<
      Pick<
        RunRecord,
        'state' | 'updatedAt' | 'startedAt' | 'finishedAt' | 'statusSummary' | 'resultJson'
      >
    >,
  ): RunRecord {
    const current = this.getRun(runId);
    if (!current) {
      throw new Error(`Run not found: ${runId}`);
    }

    const next: RunRecord = {
      ...current,
      ...updates,
      updatedAt: updates.updatedAt ?? new Date().toISOString(),
    };

    this.database
      .prepare(`
        UPDATE runs
        SET state = ?, updated_at = ?, started_at = ?, finished_at = ?, status_summary = ?, result_json = ?
        WHERE run_id = ?
      `)
      .run(
        next.state,
        next.updatedAt,
        next.startedAt ?? null,
        next.finishedAt ?? null,
        next.statusSummary ?? null,
        next.resultJson ?? null,
        runId,
      );
    this.appendRunEvent(runId, next.state, next.statusSummary);
    return next;
  }

  appendRunEvent(runId: string, state: RunState, summary?: string): void {
    this.database
      .prepare(
        'INSERT INTO run_events (run_id, state, summary, created_at) VALUES (?, ?, ?, ?)',
      )
      .run(runId, state, summary ?? null, new Date().toISOString());
  }

  reconcileInterruptedRuns(): number {
    const stuckStates = ['queued', 'running'];
    const rows = this.database
      .prepare(
        `SELECT run_id FROM runs WHERE state IN (${stuckStates.map(() => '?').join(', ')})`,
      )
      .all(...stuckStates) as { run_id: string }[];

    for (const row of rows) {
      this.updateRun(row.run_id, {
        state: 'failed',
        finishedAt: new Date().toISOString(),
        statusSummary: 'Run interrupted by service restart',
        resultJson: JSON.stringify({ error: 'interrupted' }),
      });
    }

    return rows.length;
  }

  createPairing(
    actorId: string,
    options: { pairCode: string; createdAt?: string; expiresAt: string },
  ): PairingRecord {
    const createdAt = options.createdAt ?? new Date().toISOString();
    this.database
      .prepare(
        'INSERT INTO pairings (pair_code, actor_id, created_at, expires_at, used_at) VALUES (?, ?, ?, ?, NULL)',
      )
      .run(options.pairCode, actorId, createdAt, options.expiresAt);
    return {
      actorId,
      pairCode: options.pairCode,
      createdAt,
      expiresAt: options.expiresAt,
    };
  }

  issuePairing(botId: string, actorId: string, options: { ttlMs?: number } = {}): PairingRecord {
    const existing = this.getActivePairingForActor(actorId);
    if (existing && existing.pairCode.startsWith(`${botId}-`)) {
      return existing;
    }

    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + (options.ttlMs ?? 10 * 60_000)).toISOString();
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const pairCode = `${botId}-${this.randomSuffix(6)}`;
      try {
        return this.createPairing(actorId, {
          pairCode,
          createdAt,
          expiresAt,
        });
      } catch (error) {
        if (!(error instanceof Error) || !error.message.includes('UNIQUE')) {
          throw error;
        }
      }
    }

    throw new Error('Failed to generate a unique pairing code');
  }

  getPairing(pairCode: string): PairingRecord | undefined {
    const row = this.database
      .prepare('SELECT * FROM pairings WHERE pair_code = ?')
      .get(pairCode) as Record<string, unknown> | undefined;
    return row ? this.toPairingRecord(row) : undefined;
  }

  getActivePairingForActor(actorId: string): PairingRecord | undefined {
    const now = new Date().toISOString();
    const row = this.database
      .prepare(
        `
          SELECT * FROM pairings
          WHERE actor_id = ? AND used_at IS NULL AND expires_at > ?
          ORDER BY created_at DESC
          LIMIT 1
        `,
      )
      .get(actorId, now) as Record<string, unknown> | undefined;
    return row ? this.toPairingRecord(row) : undefined;
  }

  markPairingUsed(pairCode: string, usedAt = new Date().toISOString()): PairingRecord {
    const pairing = this.getPairing(pairCode);
    if (!pairing) {
      throw new Error(`Pairing not found: ${pairCode}`);
    }

    this.database
      .prepare('UPDATE pairings SET used_at = ? WHERE pair_code = ?')
      .run(usedAt, pairCode);
    return {
      ...pairing,
      usedAt,
    };
  }

  private toPairingRecord(row: Record<string, unknown>): PairingRecord {
    return {
      botId: String(row.pair_code).split('-')[0],
      actorId: String(row.actor_id),
      pairCode: String(row.pair_code),
      createdAt: String(row.created_at),
      expiresAt: String(row.expires_at),
      usedAt: row.used_at ? String(row.used_at) : undefined,
    };
  }

  upsertCronJob(
    record: Omit<CronJobRecord, 'createdAt' | 'updatedAt'> & {
      createdAt?: string;
      updatedAt?: string;
    },
  ): CronJobRecord {
    const current = this.getCronJob(record.taskId);
    const createdAt = current?.createdAt ?? record.createdAt ?? new Date().toISOString();
    const updatedAt = record.updatedAt ?? new Date().toISOString();
    this.database
      .prepare(`
        INSERT INTO cron_jobs (
          task_id, launchd_label, schedule, auto_start, desired_state, observed_state,
          created_at, updated_at, last_started_at, last_stopped_at, last_error
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(task_id) DO UPDATE SET
          launchd_label = excluded.launchd_label,
          schedule = excluded.schedule,
          auto_start = excluded.auto_start,
          desired_state = excluded.desired_state,
          observed_state = excluded.observed_state,
          updated_at = excluded.updated_at,
          last_started_at = excluded.last_started_at,
          last_stopped_at = excluded.last_stopped_at,
          last_error = excluded.last_error
      `)
      .run(
        record.taskId,
        record.launchdLabel,
        record.schedule,
        record.autoStart ? 1 : 0,
        record.desiredState,
        record.observedState,
        createdAt,
        updatedAt,
        record.lastStartedAt ?? null,
        record.lastStoppedAt ?? null,
        record.lastError ?? null,
      );
    return this.getCronJob(record.taskId)!;
  }

  getCronJob(taskId: string): CronJobRecord | undefined {
    const row = this.database
      .prepare('SELECT * FROM cron_jobs WHERE task_id = ?')
      .get(taskId) as Record<string, unknown> | undefined;
    if (!row) {
      return undefined;
    }
    return {
      taskId: String(row.task_id),
      launchdLabel: String(row.launchd_label),
      schedule: String(row.schedule),
      autoStart: Number(row.auto_start) === 1,
      desiredState: String(row.desired_state) as CronDesiredState,
      observedState: String(row.observed_state) as CronObservedState,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      lastStartedAt: row.last_started_at ? String(row.last_started_at) : undefined,
      lastStoppedAt: row.last_stopped_at ? String(row.last_stopped_at) : undefined,
      lastError: row.last_error ? String(row.last_error) : undefined,
    };
  }

  listCronJobs(): CronJobRecord[] {
    const rows = this.database
      .prepare('SELECT * FROM cron_jobs ORDER BY task_id ASC')
      .all() as Record<string, unknown>[];
    return rows
      .map((row) => this.getCronJob(String(row.task_id)))
      .filter((row): row is CronJobRecord => Boolean(row));
  }

  upsertCronSubscription(
    taskId: string,
    chatId: string,
    actorId: string,
  ): CronChatSubscriptionRecord {
    const current = this.getCronSubscription(taskId, chatId);
    const createdAt = current?.createdAt ?? new Date().toISOString();
    const updatedAt = new Date().toISOString();
    this.database
      .prepare(`
        INSERT INTO cron_chat_subscriptions (
          task_id, chat_id, actor_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(task_id, chat_id) DO UPDATE SET
          actor_id = excluded.actor_id,
          updated_at = excluded.updated_at
      `)
      .run(taskId, chatId, actorId, createdAt, updatedAt);
    return this.getCronSubscription(taskId, chatId)!;
  }

  getCronSubscription(taskId: string, chatId: string): CronChatSubscriptionRecord | undefined {
    const row = this.database
      .prepare('SELECT * FROM cron_chat_subscriptions WHERE task_id = ? AND chat_id = ?')
      .get(taskId, chatId) as Record<string, unknown> | undefined;
    return row ? this.toCronSubscriptionRecord(row) : undefined;
  }

  listCronSubscriptions(taskId: string): CronChatSubscriptionRecord[] {
    const rows = this.database
      .prepare('SELECT * FROM cron_chat_subscriptions WHERE task_id = ? ORDER BY chat_id ASC')
      .all(taskId) as Record<string, unknown>[];
    return rows.map((row) => this.toCronSubscriptionRecord(row));
  }

  isCronChatSubscribed(taskId: string, chatId: string): boolean {
    return Boolean(this.getCronSubscription(taskId, chatId));
  }

  clearCronSubscriptions(taskId: string): number {
    const result = this.database
      .prepare('DELETE FROM cron_chat_subscriptions WHERE task_id = ?')
      .run(taskId);
    return Number(result.changes ?? 0);
  }

  upsertServiceEventSubscription(
    actorId: string,
    eventType: ServiceEventType,
    enabled = true,
    updatedAt = new Date().toISOString(),
  ): ServiceEventSubscriptionRecord {
    const current = this.getServiceEventSubscription(actorId, eventType);
    const createdAt = current?.createdAt ?? updatedAt;
    this.database
      .prepare(`
        INSERT INTO service_event_subscriptions (
          actor_id, event_type, enabled, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(actor_id, event_type) DO UPDATE SET
          enabled = excluded.enabled,
          updated_at = excluded.updated_at
      `)
      .run(actorId, eventType, enabled ? 1 : 0, createdAt, updatedAt);
    return this.getServiceEventSubscription(actorId, eventType)!;
  }

  getServiceEventSubscription(
    actorId: string,
    eventType: ServiceEventType,
  ): ServiceEventSubscriptionRecord | undefined {
    const row = this.database
      .prepare(
        `
          SELECT * FROM service_event_subscriptions
          WHERE actor_id = ? AND event_type = ?
        `,
      )
      .get(actorId, eventType) as Record<string, unknown> | undefined;
    return row ? this.toServiceEventSubscriptionRecord(row) : undefined;
  }

  listServiceEventSubscriptions(
    eventType?: ServiceEventType,
    options: { enabledOnly?: boolean } = {},
  ): ServiceEventSubscriptionRecord[] {
    const clauses: string[] = [];
    const args: unknown[] = [];
    if (eventType) {
      clauses.push('event_type = ?');
      args.push(eventType);
    }
    if (options.enabledOnly) {
      clauses.push('enabled = 1');
    }
    const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = this.database
      .prepare(
        `
          SELECT * FROM service_event_subscriptions
          ${whereClause}
          ORDER BY actor_id ASC, event_type ASC
        `,
      )
      .all(...args) as Record<string, unknown>[];
    return rows.map((row) => this.toServiceEventSubscriptionRecord(row));
  }

  deleteServiceEventSubscriptionsForActor(actorId: string): number {
    const result = this.database
      .prepare('DELETE FROM service_event_subscriptions WHERE actor_id = ?')
      .run(actorId);
    return Number(result.changes ?? 0);
  }

  upsertServiceEventQuietHours(
    actorId: string,
    fromTime: string,
    toTime: string,
    enabled = true,
    updatedAt = new Date().toISOString(),
  ): ServiceEventQuietHoursRecord {
    const current = this.getServiceEventQuietHours(actorId);
    const createdAt = current?.createdAt ?? updatedAt;
    this.database
      .prepare(`
        INSERT INTO service_event_quiet_hours (
          actor_id, enabled, from_time, to_time, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(actor_id) DO UPDATE SET
          enabled = excluded.enabled,
          from_time = excluded.from_time,
          to_time = excluded.to_time,
          updated_at = excluded.updated_at
      `)
      .run(actorId, enabled ? 1 : 0, fromTime, toTime, createdAt, updatedAt);
    return this.getServiceEventQuietHours(actorId)!;
  }

  getServiceEventQuietHours(actorId: string): ServiceEventQuietHoursRecord | undefined {
    const row = this.database
      .prepare(
        `
          SELECT * FROM service_event_quiet_hours
          WHERE actor_id = ?
        `,
      )
      .get(actorId) as Record<string, unknown> | undefined;
    return row ? this.toServiceEventQuietHoursRecord(row) : undefined;
  }

  setServiceEventQuietHoursEnabled(
    actorId: string,
    enabled: boolean,
    updatedAt = new Date().toISOString(),
  ): ServiceEventQuietHoursRecord | undefined {
    const current = this.getServiceEventQuietHours(actorId);
    if (!current) {
      return undefined;
    }
    this.database
      .prepare(
        `
          UPDATE service_event_quiet_hours
          SET enabled = ?, updated_at = ?
          WHERE actor_id = ?
        `,
      )
      .run(enabled ? 1 : 0, updatedAt, actorId);
    return this.getServiceEventQuietHours(actorId);
  }

  getServiceEventState(): ServiceEventStateRecord | undefined {
    const row = this.database
      .prepare('SELECT * FROM service_event_state WHERE singleton_id = 1')
      .get() as Record<string, unknown> | undefined;
    return row ? this.toServiceEventStateRecord(row) : undefined;
  }

  saveServiceEventState(
    state: Partial<{
      lastConnectedAt: string | null;
      lastHeartbeatSucceededAt: string | null;
      lastReconnectedNotifiedAt: string | null;
    }>,
    updatedAt = new Date().toISOString(),
  ): ServiceEventStateRecord {
    const current = this.getServiceEventState();
    const next: ServiceEventStateRecord = {
      lastConnectedAt:
        state.lastConnectedAt !== undefined ? state.lastConnectedAt ?? undefined : current?.lastConnectedAt,
      lastHeartbeatSucceededAt:
        state.lastHeartbeatSucceededAt !== undefined
          ? state.lastHeartbeatSucceededAt ?? undefined
          : current?.lastHeartbeatSucceededAt,
      lastReconnectedNotifiedAt:
        state.lastReconnectedNotifiedAt !== undefined
          ? state.lastReconnectedNotifiedAt ?? undefined
          : current?.lastReconnectedNotifiedAt,
      updatedAt,
    };
    this.database
      .prepare(`
        INSERT INTO service_event_state (
          singleton_id, last_connected_at, last_heartbeat_succeeded_at, last_reconnected_notified_at, updated_at
        ) VALUES (1, ?, ?, ?, ?)
        ON CONFLICT(singleton_id) DO UPDATE SET
          last_connected_at = excluded.last_connected_at,
          last_heartbeat_succeeded_at = excluded.last_heartbeat_succeeded_at,
          last_reconnected_notified_at = excluded.last_reconnected_notified_at,
          updated_at = excluded.updated_at
      `)
      .run(
        next.lastConnectedAt ?? null,
        next.lastHeartbeatSucceededAt ?? null,
        next.lastReconnectedNotifiedAt ?? null,
        next.updatedAt,
      );
    return this.getServiceEventState()!;
  }

  getPDWin11State(taskId: string): PDWin11MonitorState | undefined {
    const row = this.database
      .prepare('SELECT * FROM pd_win11_states WHERE task_id = ?')
      .get(taskId) as Record<string, unknown> | undefined;
    if (!row) {
      return undefined;
    }
    return {
      state: String(row.state) as PDWin11MonitorState['state'],
      detectedStartAt: row.detected_start_at ? String(row.detected_start_at) : undefined,
      lastTransitionAt: String(row.last_transition_at),
      lastNotificationAt: row.last_notification_at ? String(row.last_notification_at) : undefined,
      lastRuntimeReminderAt: row.last_runtime_reminder_at
        ? String(row.last_runtime_reminder_at)
        : undefined,
    };
  }

  savePDWin11State(taskId: string, state: PDWin11MonitorState): PDWin11MonitorState {
    this.database
      .prepare(`
        INSERT INTO pd_win11_states (
          task_id, state, detected_start_at, last_transition_at, last_notification_at, last_runtime_reminder_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(task_id) DO UPDATE SET
          state = excluded.state,
          detected_start_at = excluded.detected_start_at,
          last_transition_at = excluded.last_transition_at,
          last_notification_at = excluded.last_notification_at,
          last_runtime_reminder_at = excluded.last_runtime_reminder_at
      `)
      .run(
        taskId,
        state.state,
        state.detectedStartAt ?? null,
        state.lastTransitionAt,
        state.lastNotificationAt ?? null,
        state.lastRuntimeReminderAt ?? null,
      );
    return this.getPDWin11State(taskId)!;
  }

  claimIngressEvent(
    eventKey: string,
    eventType: string,
    options: { ttlMs?: number; now?: string } = {},
  ): boolean {
    const now = options.now ?? new Date().toISOString();
    const expiresAt = new Date(Date.now() + (options.ttlMs ?? 15 * 60_000)).toISOString();
    this.database
      .prepare('DELETE FROM ingress_dedup_events WHERE expires_at <= ?')
      .run(now);
    try {
      this.database
        .prepare(
          'INSERT INTO ingress_dedup_events (event_key, event_type, created_at, expires_at) VALUES (?, ?, ?, ?)',
        )
        .run(eventKey, eventType, now, expiresAt);
      return true;
    } catch (error) {
      if (error instanceof Error && error.message.includes('UNIQUE')) {
        return false;
      }
      throw error;
    }
  }

  private ensureRunColumn(columnName: string, definition: string): void {
    this.ensureTableColumn('runs', columnName, definition);
  }

  private ensureTableColumn(tableName: string, columnName: string, definition: string): void {
    const columns = this.database
      .prepare(`PRAGMA table_info(${tableName})`)
      .all() as Array<{ name?: string }>;
    if (columns.some((column) => column.name === columnName)) {
      return;
    }
    this.database.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }

  private randomSuffix(length: number): string {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let index = 0; index < length; index += 1) {
      result += alphabet[randomInt(0, alphabet.length)];
    }
    return result;
  }

  private toCronSubscriptionRecord(row: Record<string, unknown>): CronChatSubscriptionRecord {
    return {
      taskId: String(row.task_id),
      chatId: String(row.chat_id),
      actorId: String(row.actor_id),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private toServiceEventSubscriptionRecord(
    row: Record<string, unknown>,
  ): ServiceEventSubscriptionRecord {
    return {
      actorId: String(row.actor_id),
      eventType: row.event_type as ServiceEventType,
      enabled: Number(row.enabled) === 1,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private toServiceEventStateRecord(row: Record<string, unknown>): ServiceEventStateRecord {
    return {
      lastConnectedAt: row.last_connected_at ? String(row.last_connected_at) : undefined,
      lastHeartbeatSucceededAt: row.last_heartbeat_succeeded_at
        ? String(row.last_heartbeat_succeeded_at)
        : undefined,
      lastReconnectedNotifiedAt: row.last_reconnected_notified_at
        ? String(row.last_reconnected_notified_at)
        : undefined,
      updatedAt: String(row.updated_at),
    };
  }

  private toServiceEventQuietHoursRecord(
    row: Record<string, unknown>,
  ): ServiceEventQuietHoursRecord {
    return {
      actorId: String(row.actor_id),
      enabled: Number(row.enabled) === 1,
      fromTime: String(row.from_time),
      toTime: String(row.to_time),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }
}
