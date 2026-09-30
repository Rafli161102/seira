/**
 * Seira Async Execution Model & Concurrency (Architectural Skeleton)
 *
 * Principles:
 * - Structured concurrency: child tasks cannot outlive their enclosing scope
 * - Cooperative execution model
 * - Zero cost when async is not used
 *
 * Milestone: Planned for Development Series.
 */

import type { SeiraValue } from '../value/index.ts';

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface Task<T = SeiraValue> {
  readonly id: string;
  readonly status: TaskStatus;
  poll(): Promise<T>;
  cancel(): void;
}

export interface AsyncScheduler {
  spawn<T>(task: () => Promise<T>): Task<T>;
  run(): Promise<void>;
}
