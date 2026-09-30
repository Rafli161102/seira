/**
 * Seira Runtime Context
 *
 * Encapsulates the execution context of a Seira process or thread:
 * - Active memory scope hierarchy
 * - Ambient effect handlers
 * - Service registry
 * - Host platform adapter
 *
 * Status: Architectural skeleton for Seed Foundation (0.0.1-s).
 */

import { EffectContext } from '../effects/index.ts';
import { ResourceScope } from '../memory/index.ts';

export interface RuntimeConfig {
  readonly maxStackDepth?: number;
  readonly defaultMemoryLimitBytes?: number;
}

export class RuntimeContext {
  private readonly rootScope: ResourceScope;
  private readonly effectContext: EffectContext;
  private readonly config: RuntimeConfig;

  constructor(config: RuntimeConfig = {}) {
    this.config = config;
    this.rootScope = new ResourceScope();
    this.effectContext = new EffectContext();
  }

  public getRootScope(): ResourceScope {
    return this.rootScope;
  }

  public getEffectContext(): EffectContext {
    return this.effectContext;
  }

  public getConfig(): RuntimeConfig {
    return this.config;
  }
}
