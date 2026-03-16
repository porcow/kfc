import { createRequire } from 'node:module';

type TestFunction = typeof import('bun:test').test;

const require = createRequire(import.meta.url);

export const test: TestFunction = (require('bun:test') as { test: TestFunction }).test;
