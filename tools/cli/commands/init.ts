/**
 * Seira CLI Init & New Commands
 * Initializes a new Seira project directory with standard layout and manifest.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { generateInitialManifest } from '../manifest/manifest.ts';

const SAMPLE_MAIN = `// Seira Application Entry Point
// Language Version: 0.0.1-s Seed Foundation

fn main() {
    println("Hello, Seira!")
}
`;

export function runInit(cwd: string = process.cwd()): number {
  const manifestPath = join(cwd, 'Seira.toml');
  if (existsSync(manifestPath)) {
    console.error(`Error: 'Seira.toml' already exists in this directory.`);
    return 1;
  }

  const projectName = basename(cwd) || 'seira_app';
  const srcDir = join(cwd, 'src');
  if (!existsSync(srcDir)) {
    mkdirSync(srcDir, { recursive: true });
  }

  writeFileSync(manifestPath, generateInitialManifest(projectName), 'utf-8');
  writeFileSync(join(srcDir, 'main.sra'), SAMPLE_MAIN, 'utf-8');

  console.log(`✓ Initialized new Seira project '${projectName}' in ${cwd}`);
  return 0;
}

export function runNew(name?: string): number {
  if (!name) {
    console.error('Error: Project name required.');
    console.error('Usage: seira new <project_name>');
    return 1;
  }

  const projectDir = join(process.cwd(), name);
  if (existsSync(projectDir)) {
    console.error(`Error: Directory '${name}' already exists.`);
    return 1;
  }

  mkdirSync(projectDir, { recursive: true });
  return runInit(projectDir);
}
