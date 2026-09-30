/**
 * Seira Runtime Effect System Architecture
 *
 * Implements the core axiom:
 * «The outside world is an Effect.»
 *
 * Principles:
 * - Effectful operations are explicit and tracked via `!`
 * - Effects are handled by structured, pluggable effect handlers
 * - Pure code remains isolated from side-effecting operations
 */

import type { SeiraValue } from '../value/index.ts';

export interface EffectDescriptor {
  readonly name: string;
  readonly payload: unknown;
}

export interface EffectHandler {
  canHandle(effect: EffectDescriptor): boolean;
  handle(effect: EffectDescriptor): Promise<SeiraValue> | SeiraValue;
}

export class EffectContext {
  private handlers: EffectHandler[] = [];

  public pushHandler(handler: EffectHandler): void {
    this.handlers.unshift(handler);
  }

  public popHandler(): EffectHandler | undefined {
    return this.handlers.shift();
  }

  public async perform(effect: EffectDescriptor): Promise<SeiraValue> {
    for (const handler of this.handlers) {
      if (handler.canHandle(effect)) {
        return await handler.handle(effect);
      }
    }

    throw new Error(`Unhandled effect: '${effect.name}'`);
  }
}
