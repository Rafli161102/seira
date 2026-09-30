/**
 * Seira Runtime Services & Resource Manager
 *
 * Provides a modular service registry for:
 * - Memory service (allocations, bounds enforcement)
 * - Resource manager (active file descriptors, handles, lifecycle tracking)
 * - Clock / Time service
 *
 * Status: Architectural skeleton for Seed Foundation (0.0.1-s).
 */

export interface RuntimeService {
  readonly serviceName: string;
  initialize(): Promise<void> | void;
  shutdown(): Promise<void> | void;
}

export class ServiceRegistry {
  private readonly services = new Map<string, RuntimeService>();

  public register(service: RuntimeService): void {
    this.services.set(service.serviceName, service);
  }

  public get<T extends RuntimeService>(name: string): T | undefined {
    return this.services.get(name) as T | undefined;
  }

  public async shutdownAll(): Promise<void> {
    for (const service of this.services.values()) {
      await service.shutdown();
    }
    this.services.clear();
  }
}
