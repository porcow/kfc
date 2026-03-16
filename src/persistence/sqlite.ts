import { createRequire } from 'node:module';

export type SQLiteRunResult = {
  changes?: number | bigint;
  lastInsertRowid?: number | bigint;
};

export interface SQLiteStatement {
  run(...parameters: unknown[]): SQLiteRunResult;
  get(...parameters: unknown[]): unknown;
  all(...parameters: unknown[]): unknown[];
}

export interface SQLiteDatabase {
  exec(sql: string): void;
  prepare(sql: string): SQLiteStatement;
  close(): void;
}

type BunStatementLike = {
  run(...parameters: unknown[]): SQLiteRunResult;
  get(...parameters: unknown[]): unknown;
  all(...parameters: unknown[]): unknown[];
};

type BunDatabaseLike = {
  exec(sql: string): void;
  prepare(sql: string): BunStatementLike;
  close(): void;
};

class SQLiteStatementAdapter implements SQLiteStatement {
  private readonly statement: BunStatementLike;

  constructor(statement: BunStatementLike) {
    this.statement = statement;
  }

  run(...parameters: unknown[]): SQLiteRunResult {
    return this.statement.run(...parameters);
  }

  get(...parameters: unknown[]): unknown {
    return this.statement.get(...parameters);
  }

  all(...parameters: unknown[]): unknown[] {
    return this.statement.all(...parameters);
  }
}

class SQLiteDatabaseAdapter implements SQLiteDatabase {
  private readonly database: BunDatabaseLike;

  constructor(database: BunDatabaseLike) {
    this.database = database;
  }

  exec(sql: string): void {
    this.database.exec(sql);
  }

  prepare(sql: string): SQLiteStatement {
    return new SQLiteStatementAdapter(this.database.prepare(sql));
  }

  close(): void {
    this.database.close();
  }
}

export function openSqliteDatabase(path: string): SQLiteDatabase {
  const require = createRequire(import.meta.url);
  const { Database } = require('bun:sqlite') as {
    Database: new (filename: string) => BunDatabaseLike;
  };
  return new SQLiteDatabaseAdapter(new Database(path));
}
