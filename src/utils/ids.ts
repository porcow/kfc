import { randomUUID } from 'node:crypto';

export function createRunId(): string {
  return `run_${randomUUID()}`;
}

export function createConfirmationId(): string {
  return `confirm_${randomUUID()}`;
}
