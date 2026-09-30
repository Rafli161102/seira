/**
 * Seira Runtime Memory & Deterministic Resource Management
 *
 * Implements deterministic resource cleanup:
 * - Scoped resource cleanup via `with` mechanics
 * - Predictable execution without stop-the-world garbage collection pauses
 */

export interface ResourceCleaner {
  dispose(): void;
}

export class ResourceScope {
  private cleaners: ResourceCleaner[] = [];
  private isDisposed: boolean = false;

  public register(cleaner: ResourceCleaner): void {
    if (this.isDisposed) {
      throw new Error('Cannot register resource in already disposed scope.');
    }
    this.cleaners.push(cleaner);
  }

  public dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;

    // Dispose resources in reverse order of registration (LIFO)
    while (this.cleaners.length > 0) {
      const cleaner = this.cleaners.pop();
      try {
        cleaner?.dispose();
      } catch (err) {
        console.error('Error during resource cleanup:', err);
      }
    }
  }

  public runWith<T>(action: (scope: ResourceScope) => T): T {
    try {
      return action(this);
    } finally {
      this.dispose();
    }
  }
}

export interface MemoryAllocator {
  allocate(size: number): ArrayBuffer;
  free(buffer: ArrayBuffer): void;
}
