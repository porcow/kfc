import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import type {
  ServiceRefreshOperationRecord,
  ServiceRefreshOperationState,
} from '../domain.ts';
import { openSqliteDatabase, type SQLiteDatabase } from './sqlite.ts';

export class ServiceRefreshRepository {
  readonly database: SQLiteDatabase;

  constructor(sqlitePath: string) {
    mkdirSync(dirname(sqlitePath), { recursive: true });
    this.database = openSqliteDatabase(sqlitePath);
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS service_refresh_operations (
        operation_id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        state TEXT NOT NULL,
        config_path TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        run_id TEXT,
        bot_id TEXT,
        sqlite_path TEXT,
        helper_label TEXT,
        helper_plist_path TEXT,
        summary TEXT,
        notification_pending INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        finished_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_service_refresh_state
        ON service_refresh_operations(state, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_service_refresh_notification_pending
        ON service_refresh_operations(notification_pending, updated_at DESC);
    `);
  }

  close(): void {
    this.database.close();
  }

  createOperation(record: ServiceRefreshOperationRecord): ServiceRefreshOperationRecord {
    this.database
      .prepare(`
        INSERT INTO service_refresh_operations (
          operation_id, kind, state, config_path, payload_json, run_id, bot_id, sqlite_path,
          helper_label, helper_plist_path, summary, notification_pending, created_at, updated_at, finished_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        record.operationId,
        record.kind,
        record.state,
        record.configPath,
        record.payloadJson,
        record.runId ?? null,
        record.botId ?? null,
        record.sqlitePath ?? null,
        record.helperLabel ?? null,
        record.helperPlistPath ?? null,
        record.summary ?? null,
        record.notificationPending ? 1 : 0,
        record.createdAt,
        record.updatedAt,
        record.finishedAt ?? null,
      );
    return this.getOperation(record.operationId)!;
  }

  getOperation(operationId: string): ServiceRefreshOperationRecord | undefined {
    const row = this.database
      .prepare('SELECT * FROM service_refresh_operations WHERE operation_id = ?')
      .get(operationId) as Record<string, unknown> | undefined;
    return row ? this.toRecord(row) : undefined;
  }

  updateOperation(
    operationId: string,
    updates: Partial<
      Pick<
        ServiceRefreshOperationRecord,
        | 'state'
        | 'summary'
        | 'helperLabel'
        | 'helperPlistPath'
        | 'notificationPending'
        | 'updatedAt'
        | 'finishedAt'
      >
    >,
  ): ServiceRefreshOperationRecord {
    const current = this.getOperation(operationId);
    if (!current) {
      throw new Error(`Service refresh operation not found: ${operationId}`);
    }
    const next: ServiceRefreshOperationRecord = {
      ...current,
      ...updates,
      updatedAt: updates.updatedAt ?? new Date().toISOString(),
    };
    this.database
      .prepare(`
        UPDATE service_refresh_operations
        SET state = ?, summary = ?, helper_label = ?, helper_plist_path = ?,
            notification_pending = ?, updated_at = ?, finished_at = ?
        WHERE operation_id = ?
      `)
      .run(
        next.state,
        next.summary ?? null,
        next.helperLabel ?? null,
        next.helperPlistPath ?? null,
        next.notificationPending ? 1 : 0,
        next.updatedAt,
        next.finishedAt ?? null,
        operationId,
      );
    return this.getOperation(operationId)!;
  }

  claimOperation(operationId: string, fromState: ServiceRefreshOperationState = 'helper_bootstrapped'): boolean {
    const result = this.database
      .prepare(`
        UPDATE service_refresh_operations
        SET state = ?, updated_at = ?
        WHERE operation_id = ? AND state = ?
      `)
      .run('refreshing', new Date().toISOString(), operationId, fromState);
    return Number(result.changes ?? 0) > 0;
  }

  listByStates(states: ServiceRefreshOperationState[]): ServiceRefreshOperationRecord[] {
    if (states.length === 0) {
      return [];
    }
    const rows = this.database
      .prepare(
        `SELECT * FROM service_refresh_operations WHERE state IN (${states.map(() => '?').join(', ')}) ORDER BY updated_at ASC`,
      )
      .all(...states) as Record<string, unknown>[];
    return rows.map((row) => this.toRecord(row));
  }

  listNotificationPending(): ServiceRefreshOperationRecord[] {
    const rows = this.database
      .prepare(
        `SELECT * FROM service_refresh_operations
         WHERE notification_pending = 1
         ORDER BY updated_at ASC`,
      )
      .all() as Record<string, unknown>[];
    return rows.map((row) => this.toRecord(row));
  }

  private toRecord(row: Record<string, unknown>): ServiceRefreshOperationRecord {
    return {
      operationId: String(row.operation_id),
      kind: String(row.kind) as ServiceRefreshOperationRecord['kind'],
      state: String(row.state) as ServiceRefreshOperationRecord['state'],
      configPath: String(row.config_path),
      payloadJson: String(row.payload_json),
      runId: row.run_id ? String(row.run_id) : undefined,
      botId: row.bot_id ? String(row.bot_id) : undefined,
      sqlitePath: row.sqlite_path ? String(row.sqlite_path) : undefined,
      helperLabel: row.helper_label ? String(row.helper_label) : undefined,
      helperPlistPath: row.helper_plist_path ? String(row.helper_plist_path) : undefined,
      summary: row.summary ? String(row.summary) : undefined,
      notificationPending: Number(row.notification_pending) === 1,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      finishedAt: row.finished_at ? String(row.finished_at) : undefined,
    };
  }
}
