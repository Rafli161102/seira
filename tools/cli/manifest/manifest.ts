/**
 * Seira Project Manifest Tooling
 * Handles loading, parsing, and validating `Seira.toml`.
 */

import { readFileSync } from 'node:fs';

export interface PackageConfig {
  name: string;
  version: string;
  edition?: string;
  authors?: string[];
  license?: string;
  description?: string;
  repository?: string;
  readme?: string;
}

export interface TargetConfig {
  default?: string;
  supported?: string[];
}

export interface ProfileConfig {
  optLevel?: number;
  debug?: boolean;
  lto?: string;
}

export interface SeiraManifest {
  package: PackageConfig;
  target?: TargetConfig;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  buildDependencies?: Record<string, string>;
  profile?: Record<string, ProfileConfig>;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Minimal, zero-dependency TOML parser suited for Seira.toml manifests
 */
export function parseToml(content: string): Record<string, any> {
  const result: Record<string, any> = {};
  let currentSection: Record<string, any> = result;

  const lines = content.split(/\r?\n/);
  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith('#')) continue;

    // Section header: [section] or [section.sub]
    if (line.startsWith('[') && line.endsWith(']')) {
      const sectionPath = line.slice(1, -1).trim();
      const parts = sectionPath.split('.');
      let target = result;
      for (const part of parts) {
        if (!target[part]) {
          target[part] = {};
        }
        target = target[part];
      }
      currentSection = target;
      continue;
    }

    // Key-value pair: key = value
    const eqIdx = line.indexOf('=');
    if (eqIdx !== -1) {
      const key = line.slice(0, eqIdx).trim();
      let rawVal = line.slice(eqIdx + 1).trim();

      // Parse value
      let value: any = rawVal;
      if (rawVal.startsWith('"') && rawVal.endsWith('"')) {
        value = rawVal.slice(1, -1);
      } else if (rawVal === 'true') {
        value = true;
      } else if (rawVal === 'false') {
        value = false;
      } else if (/^\d+$/.test(rawVal)) {
        value = parseInt(rawVal, 10);
      } else if (rawVal.startsWith('[') && rawVal.endsWith(']')) {
        // Simple inline array
        const inner = rawVal.slice(1, -1).trim();
        if (inner.length === 0) {
          value = [];
        } else {
          value = inner.split(',').map((s) => s.trim().replace(/^["']|["']$/g, ''));
        }
      }

      currentSection[key] = value;
    }
  }

  return result;
}

export function loadManifest(filePath: string): SeiraManifest {
  const content = readFileSync(filePath, 'utf-8');
  const parsed = parseToml(content);
  return parsed as unknown as SeiraManifest;
}

export function validateManifest(manifest: Partial<SeiraManifest>): ValidationResult {
  const errors: string[] = [];

  if (!manifest.package) {
    errors.push("Missing required section '[package]'.");
    return { valid: false, errors };
  }

  if (!manifest.package.name || typeof manifest.package.name !== 'string') {
    errors.push("Field 'package.name' is required and must be a string.");
  } else if (!/^[a-zA-Z0-9_-]+$/.test(manifest.package.name)) {
    errors.push(`Package name '${manifest.package.name}' contains invalid characters. Use letters, numbers, hyphens, and underscores.`);
  }

  if (!manifest.package.version || typeof manifest.package.version !== 'string') {
    errors.push("Field 'package.version' is required and must be a string.");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function generateInitialManifest(projectName: string): string {
  return `# Seira Project Manifest
[package]
name = "${projectName}"
version = "0.1.0"
edition = "2026"

[dependencies]
`;
}
