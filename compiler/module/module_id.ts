/**
 * Seira Module Identity
 *
 * Implements deterministic module identity:
 * package::module::declaration
 */

export interface ModuleId {
  readonly packageName: string;
  readonly package?: string; // alias for packageName
  readonly path: string; // e.g. "main", "user", "http.client"
}

export function createModuleId(packageName: string, modulePath: string): ModuleId {
  const normalizedPath = normalizeModulePath(modulePath);
  return {
    packageName,
    package: packageName,
    path: normalizedPath,
  };
}

export function normalizeModulePath(path: string): string {
  // Normalize Windows/Unix path separators to forward slash, then to dot notation
  let normalized = path.replace(/\\/g, '/');
  // Strip leading and trailing slashes/dots
  normalized = normalized.replace(/^[/.]+/, '').replace(/[/.]+$/, '');
  // Replace slashes with dots
  normalized = normalized.replace(/\/+/g, '.');
  return normalized;
}

export function formatModuleId(id: ModuleId): string {
  return `${id.packageName}::${id.path}`;
}

export function isValidModulePath(path: string): boolean {
  if (!path || path.trim().length === 0) return false;
  // Cannot contain path traversal
  if (path.includes('..') || path.includes('/.') || path.includes('\\.')) return false;
  // Valid segments: identifiers separated by dots or slashes
  const segments = path.split(/[./\\]/);
  const identRegex = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
  return segments.every((seg) => identRegex.test(seg));
}
