/**
 * Seira High-Level Intermediate Representation (HIR) — Semantic Identifiers
 *
 * Provides strongly-typed, deterministic identifiers for all semantic entities in HIR:
 * - NodeId: Unique node identifier within an HIR program
 * - SymbolId: Semantic symbol identity from Resolver
 * - ModuleId: Module identity
 * - FunctionId: Function identity
 * - FieldId: Struct field identity
 * - TypeId: Semantic type identity
 * - TraitId: Trait identity
 * - ImplId: Trait implementation identity
 * - GenericParamId: Generic type parameter identity
 */

export type NodeId = number;
export type SymbolId = string;
export type ModuleId = string;
export type FunctionId = string;
export type FieldId = string;
export type TypeId = string;
export type TraitId = string;
export type ImplId = string;
export type GenericParamId = string;

export function createNodeId(id: number): NodeId {
  return id;
}

export function createSymbolId(scope: string, name: string, disambiguator?: number): SymbolId {
  return disambiguator !== undefined ? `sym:${scope}:${name}#${disambiguator}` : `sym:${scope}:${name}`;
}

export function createModuleId(modulePath: string): ModuleId {
  return `mod:${modulePath}`;
}

export function createFunctionId(container: string, name: string): FunctionId {
  return container ? `fn:${container}::${name}` : `fn:${name}`;
}

export function createFieldId(structName: string, fieldName: string): FieldId {
  return `field:${structName}.${fieldName}`;
}

export function createTypeId(canonicalName: string): TypeId {
  return `type:${canonicalName}`;
}

export function createTraitId(traitName: string): TraitId {
  return `trait:${traitName}`;
}

export function createImplId(targetType: string, traitName: string): ImplId {
  return `impl:${targetType}:${traitName}`;
}

export function createGenericParamId(container: string, paramName: string): GenericParamId {
  return `gen:${container}:${paramName}`;
}

export type CleanupContractId = string;

export function createCleanupContractId(containerOrType: string, operationName: string): CleanupContractId {
  return `cleanup:${containerOrType}::${operationName}`;
}
