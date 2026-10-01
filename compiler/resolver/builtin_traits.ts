/**
 * Seira Canonical Built-in Trait Registry
 *
 * Defines the authoritative TraitDecl AST definitions for standard built-in traits.
 * Consumed by both Resolver (to attach declNode to globalScope symbols) and
 * TypeChecker (to populate this.traits for contract validation in checkImplDecl).
 */

import type { TraitDecl, FunctionDecl, Param, TypeAnnotation } from '../ast/ast.ts';
import type { Span } from '../source/span.ts';

const dummySpan: Span = { start: 0, end: 0, line: 1, column: 1 };

function makeTypeAnnotation(name: string, generics?: TypeAnnotation[]): TypeAnnotation {
  return {
    kind: 'TypeAnnotation',
    name,
    generics,
    span: dummySpan,
  };
}

function makeParam(name: string, typeName: string, generics?: TypeAnnotation[]): Param {
  return {
    kind: 'Param',
    name,
    isMut: false,
    typeAnnotation: makeTypeAnnotation(typeName, generics),
    span: dummySpan,
  };
}

function makeMethod(
  name: string,
  params: Param[],
  returnTypeName?: string,
  returnGenerics?: TypeAnnotation[]
): FunctionDecl {
  return {
    kind: 'FunctionDecl',
    name,
    isEffectful: false,
    params,
    returnType: returnTypeName ? makeTypeAnnotation(returnTypeName, returnGenerics) : undefined,
    body: { kind: 'Block', statements: [], span: dummySpan },
    span: dummySpan,
  };
}

function makeTraitDecl(name: string, methods: FunctionDecl[]): TraitDecl {
  return {
    kind: 'TraitDecl',
    name,
    methods,
    isPublic: true,
    span: dummySpan,
  };
}

const BUILTIN_TRAIT_MAP = new Map<string, TraitDecl>([
  [
    'Reader',
    makeTraitDecl('Reader', [
      makeMethod('read', [makeParam('n', 'Int')], 'Option', [makeTypeAnnotation('String')]),
    ]),
  ],
  [
    'Writer',
    makeTraitDecl('Writer', [
      makeMethod('write', [makeParam('data', 'String')], 'Result', [
        makeTypeAnnotation('Int'),
        makeTypeAnnotation('String'),
      ]),
    ]),
  ],
  [
    'Seekable',
    makeTraitDecl('Seekable', [
      makeMethod('seek', [makeParam('offset', 'Int')], 'Result', [
        makeTypeAnnotation('Int'),
        makeTypeAnnotation('String'),
      ]),
      makeMethod('position', [], 'Int'),
    ]),
  ],
  [
    'Flushable',
    makeTraitDecl('Flushable', [
      makeMethod('flush', [], 'Result', [
        makeTypeAnnotation('Unit'),
        makeTypeAnnotation('String'),
      ]),
    ]),
  ],
  [
    'Sized',
    makeTraitDecl('Sized', [
      makeMethod('length', [], 'Int'),
      makeMethod('is_empty', [], 'Bool'),
    ]),
  ],
  [
    'Resource',
    makeTraitDecl('Resource', [
      makeMethod('close', [], 'Result', [
        makeTypeAnnotation('Unit'),
        makeTypeAnnotation('String'),
      ]),
      makeMethod('is_closed', [], 'Bool'),
    ]),
  ],
  [
    'Iterator',
    makeTraitDecl('Iterator', [
      makeMethod('next', [], 'Option', [makeTypeAnnotation('Unknown')]),
    ]),
  ],
  [
    'Eq',
    makeTraitDecl('Eq', [
      makeMethod('eq', [makeParam('other', 'Unknown')], 'Bool'),
    ]),
  ],
  [
    'Ord',
    makeTraitDecl('Ord', [
      makeMethod('cmp', [makeParam('other', 'Unknown')], 'Int'),
    ]),
  ],
  [
    'Hash',
    makeTraitDecl('Hash', [
      makeMethod('hash', [], 'Int'),
    ]),
  ],
  [
    'Display',
    makeTraitDecl('Display', [
      makeMethod('to_string', [], 'String'),
    ]),
  ],
  [
    'Debug',
    makeTraitDecl('Debug', [
      makeMethod('debug_string', [], 'String'),
    ]),
  ],
  [
    'Clone',
    makeTraitDecl('Clone', [
      makeMethod('clone', [], 'Unknown'),
    ]),
  ],
  [
    'Default',
    makeTraitDecl('Default', [
      makeMethod('default', [], 'Unknown'),
    ]),
  ],
]);

export const BUILTIN_TRAIT_NAMES = Array.from(BUILTIN_TRAIT_MAP.keys());

export function getBuiltinTraitDecls(): ReadonlyMap<string, TraitDecl> {
  return BUILTIN_TRAIT_MAP;
}

export function isBuiltinTrait(name: string): boolean {
  return BUILTIN_TRAIT_MAP.has(name);
}
