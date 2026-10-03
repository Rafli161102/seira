/**
 * Seira High-Level Intermediate Representation (HIR) — Semantic Types
 *
 * Provides canonical, resolved type representations attached to every HIR node.
 * Translates and canonicalizes TypeChecker's static Type representation into
 * immutable, ID-bearing HIRType structures.
 */

import type { TypeAnnotation } from '../ast/ast.ts';
import type { Type } from '../typecheck/types.ts';
import { formatType } from '../typecheck/types.ts';
import { createTypeId, type TypeId } from './ids.ts';

export type HIRTypeKind =
  | 'Primitive'
  | 'Option'
  | 'Result'
  | 'List'
  | 'Tuple'
  | 'Map'
  | 'Set'
  | 'Function'
  | 'GenericParam'
  | 'Custom'
  | 'Union'
  | 'Unknown';

export interface HIRType {
  readonly id: TypeId;
  readonly kind: HIRTypeKind;
  readonly name: string;
  readonly typeArguments?: ReadonlyArray<HIRType>;
  readonly paramTypes?: ReadonlyArray<HIRType>;
  readonly returnType?: HIRType;
  readonly isEffectful?: boolean;
}

export function makePrimitiveHIRType(name: string): HIRType {
  return {
    id: createTypeId(name),
    kind: 'Primitive',
    name,
  };
}

export const HIR_INT_TYPE: HIRType = makePrimitiveHIRType('Int');
export const HIR_UINT_TYPE: HIRType = makePrimitiveHIRType('UInt');
export const HIR_FLOAT_TYPE: HIRType = makePrimitiveHIRType('Float');
export const HIR_BOOL_TYPE: HIRType = makePrimitiveHIRType('Bool');
export const HIR_CHAR_TYPE: HIRType = makePrimitiveHIRType('Char');
export const HIR_STRING_TYPE: HIRType = makePrimitiveHIRType('String');
export const HIR_BYTE_TYPE: HIRType = makePrimitiveHIRType('Byte');
export const HIR_UNIT_TYPE: HIRType = makePrimitiveHIRType('Unit');
export const HIR_UNKNOWN_TYPE: HIRType = {
  id: createTypeId('Unknown'),
  kind: 'Unknown',
  name: 'Unknown',
};

export function isHIRUnknown(t?: HIRType): boolean {
  if (!t) return true;
  return t.kind === 'Unknown' || t.name === 'Unknown' || t.id === 'type:Unknown';
}

export function typeToHIRType(t: Type): HIRType {
  const formatted = formatType(t);
  const id = createTypeId(formatted);

  switch (t.kind) {
    case 'Primitive':
      if (t.name === 'Unknown') return HIR_UNKNOWN_TYPE;
      return {
        id,
        kind: 'Primitive',
        name: t.name,
      };

    case 'Option': {
      const inner = typeToHIRType(t.inner);
      return {
        id,
        kind: 'Option',
        name: 'Option',
        typeArguments: [inner],
      };
    }

    case 'Result': {
      const ok = typeToHIRType(t.ok);
      const err = typeToHIRType(t.err);
      return {
        id,
        kind: 'Result',
        name: 'Result',
        typeArguments: [ok, err],
      };
    }

    case 'List': {
      const element = typeToHIRType(t.element);
      return {
        id,
        kind: 'List',
        name: 'List',
        typeArguments: [element],
      };
    }

    case 'Tuple': {
      const elements = t.elements.map(typeToHIRType);
      return {
        id,
        kind: 'Tuple',
        name: 'Tuple',
        typeArguments: elements,
      };
    }

    case 'Map': {
      const key = typeToHIRType(t.key);
      const val = typeToHIRType(t.value);
      return {
        id,
        kind: 'Map',
        name: 'Map',
        typeArguments: [key, val],
      };
    }

    case 'Set': {
      const element = typeToHIRType(t.element);
      return {
        id,
        kind: 'Set',
        name: 'Set',
        typeArguments: [element],
      };
    }

    case 'Function': {
      const paramTypes = t.params.map(typeToHIRType);
      const returnType = typeToHIRType(t.returnType);
      return {
        id,
        kind: 'Function',
        name: formatted,
        paramTypes,
        returnType,
        isEffectful: t.isEffectful,
      };
    }

    case 'GenericParam':
      return {
        id: createTypeId(t.name),
        kind: 'GenericParam',
        name: t.name,
      };

    case 'TypeAlias':
      return typeToHIRType(t.target);

    case 'Union': {
      const types = t.types.map(typeToHIRType);
      return {
        id,
        kind: 'Union',
        name: formatted,
        typeArguments: types,
      };
    }

    case 'Custom': {
      const typeArguments = t.typeArguments ? t.typeArguments.map(typeToHIRType) : undefined;
      return {
        id,
        kind: 'Custom',
        name: t.name,
        typeArguments,
      };
    }

    default:
      return HIR_UNKNOWN_TYPE;
  }
}

export function typeAnnotationToHIRType(ann: TypeAnnotation): HIRType {
  if (!ann) return HIR_UNKNOWN_TYPE;

  // Union type
  if (ann.unionTypes && ann.unionTypes.length > 0) {
    const types = ann.unionTypes.map(typeAnnotationToHIRType);
    const formatted = types.map((t) => t.name).join(' | ');
    return {
      id: createTypeId(formatted),
      kind: 'Union',
      name: formatted,
      typeArguments: types,
    };
  }

  // Function type
  if (ann.functionParams !== undefined) {
    const paramTypes = ann.functionParams.map(typeAnnotationToHIRType);
    const returnType = ann.returnType ? typeAnnotationToHIRType(ann.returnType) : HIR_UNIT_TYPE;
    const formatted = `(${paramTypes.map((p) => p.name).join(', ')}) -> ${returnType.name}`;
    return {
      id: createTypeId(formatted),
      kind: 'Function',
      name: formatted,
      paramTypes,
      returnType,
      isEffectful: ann.isEffectful,
    };
  }

  // Standard primitives
  const PRIMITIVES = new Set(['Int', 'UInt', 'Float', 'Bool', 'Char', 'String', 'Byte', 'Unit']);
  if (PRIMITIVES.has(ann.name)) {
    return makePrimitiveHIRType(ann.name);
  }

  // Option
  if (ann.name === 'Option') {
    const inner =
      ann.generics && ann.generics.length > 0
        ? typeAnnotationToHIRType(ann.generics[0])
        : HIR_UNIT_TYPE;
    return {
      id: createTypeId(`Option[${inner.name}]`),
      kind: 'Option',
      name: 'Option',
      typeArguments: [inner],
    };
  }

  // Result
  if (ann.name === 'Result') {
    const ok =
      ann.generics && ann.generics.length > 0
        ? typeAnnotationToHIRType(ann.generics[0])
        : HIR_UNIT_TYPE;
    const err =
      ann.generics && ann.generics.length > 1
        ? typeAnnotationToHIRType(ann.generics[1])
        : HIR_STRING_TYPE;
    return {
      id: createTypeId(`Result[${ok.name}, ${err.name}]`),
      kind: 'Result',
      name: 'Result',
      typeArguments: [ok, err],
    };
  }

  // List
  if (ann.name === 'List') {
    const elem =
      ann.generics && ann.generics.length > 0
        ? typeAnnotationToHIRType(ann.generics[0])
        : HIR_UNKNOWN_TYPE;
    return {
      id: createTypeId(`List[${elem.name}]`),
      kind: 'List',
      name: 'List',
      typeArguments: [elem],
    };
  }

  // Map
  if (ann.name === 'Map') {
    const key =
      ann.generics && ann.generics.length > 0
        ? typeAnnotationToHIRType(ann.generics[0])
        : HIR_UNKNOWN_TYPE;
    const val =
      ann.generics && ann.generics.length > 1
        ? typeAnnotationToHIRType(ann.generics[1])
        : HIR_UNKNOWN_TYPE;
    return {
      id: createTypeId(`Map[${key.name}, ${val.name}]`),
      kind: 'Map',
      name: 'Map',
      typeArguments: [key, val],
    };
  }

  // Set
  if (ann.name === 'Set') {
    const elem =
      ann.generics && ann.generics.length > 0
        ? typeAnnotationToHIRType(ann.generics[0])
        : HIR_UNKNOWN_TYPE;
    return {
      id: createTypeId(`Set[${elem.name}]`),
      kind: 'Set',
      name: 'Set',
      typeArguments: [elem],
    };
  }

  // Tuple
  if (ann.name === 'Tuple') {
    const elems = ann.generics ? ann.generics.map(typeAnnotationToHIRType) : [];
    const formatted = `(${elems.map((e) => e.name).join(', ')})`;
    return {
      id: createTypeId(formatted),
      kind: 'Tuple',
      name: 'Tuple',
      typeArguments: elems,
    };
  }

  // Custom / GenericParam / Named types
  const typeArgs = ann.generics ? ann.generics.map(typeAnnotationToHIRType) : undefined;
  const formatted =
    typeArgs && typeArgs.length > 0
      ? `${ann.name}[${typeArgs.map((a) => a.name).join(', ')}]`
      : ann.name;

  return {
    id: createTypeId(formatted),
    kind: 'Custom',
    name: ann.name,
    typeArguments: typeArgs,
  };
}

