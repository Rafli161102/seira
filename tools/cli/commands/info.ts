/**
 * Seira CLI Info Command
 * Reports environment, toolchain details, and project status.
 */

import { existsSync } from 'node:fs';
import { arch, platform } from 'node:os';
import { join } from 'node:path';
import { loadManifest, validateManifest } from '../manifest/manifest.ts';
import { SEIRA_VERSION } from './version.ts';

export function runInfo(): void {
  console.log('Seira Environment & Toolchain Information');
  console.log('========================================');
  console.log(`Seira Version:         ${SEIRA_VERSION} (Standard Library & Core Contract Foundation)`);
  console.log(`Language Axiom:        Everything is a Value. Programs are Transformations.`);
  console.log(`Host Platform:         ${platform()} (${arch()})`);
  console.log(`Host Node.js:          ${process.version}`);
  console.log(`File Extension:        .sr (also supports .sra)`);
  console.log(`CLI Command:           sr (also supports seira)`);
  console.log(`License:               MIT License`);
  console.log('');
  console.log('Compiler Pipeline Status:');
  console.log('  [x] Source Manager:  Active (0.0.2-s)');
  console.log('  [x] Lexer:           Active (0.0.3-s, 0.0.7-s, 0.0.8-s)');
  console.log('  [x] Parser:          Active (0.0.3-s, 0.0.6-s, 0.0.7-s, 0.0.8-s)');
  console.log('  [x] Diagnostics:     Active (0.0.3-s, 0.0.6-s, 0.0.7-s, 0.0.8-s)');
  console.log('  [x] Module Manager:  Active (0.0.8-s)');
  console.log('  [x] Package Manager: Active (0.0.8-s)');
  console.log('  [x] Standard Library: Active (0.0.9-s)');
  console.log('  [x] Compiler Driver: Active (0.0.3-s, 0.0.8-s)');
  console.log('  [x] Resolver:        Active (0.0.4-s, 0.0.6-s, 0.0.7-s, 0.0.8-s, 0.0.9-s)');
  console.log('  [x] Typecheck:       Active (0.0.4-s, 0.0.6-s, 0.0.7-s, 0.0.8-s, 0.0.9-s)');
  console.log('  [x] Execution Engine: Active — Tree-Walking (0.0.5-s, 0.0.6-s, 0.0.7-s, 0.0.8-s, 0.0.9-s)');
  console.log('  [ ] HIR:             Skeleton (Reserved: 0.0.11-d)');
  console.log('  [ ] MIR:             Skeleton (Reserved: 0.0.11-d)');
  console.log('  [ ] Native Codegen:  Skeleton (Reserved: 0.1.0-alpha)');
  console.log('  [ ] Wasm Codegen:    Skeleton (Reserved: 0.1.0-alpha)');
  console.log('');

  const manifestPath = join(process.cwd(), 'Seira.toml');
  if (existsSync(manifestPath)) {
    console.log(`Project Manifest:     ${manifestPath}`);
    try {
      const manifest = loadManifest(manifestPath);
      const validation = validateManifest(manifest);
      if (validation.valid) {
        console.log(`  Package Name:        ${manifest.package.name}`);
        console.log(`  Package Version:     ${manifest.package.version}`);
        console.log(`  Edition:             ${manifest.package.edition ?? 'default'}`);
        console.log(`  Target:              ${manifest.target?.default ?? 'native'}`);
      } else {
        console.log(`  Manifest Status:     Invalid (${validation.errors.join(', ')})`);
      }
    } catch (err: any) {
      console.log(`  Manifest Read Error: ${err.message}`);
    }
  } else {
    console.log('Project Manifest:      None detected in current directory.');
  }
}
