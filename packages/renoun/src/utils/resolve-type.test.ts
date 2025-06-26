import { describe, test, expect } from 'vitest'
import {
  Project,
  SyntaxKind,
  type ClassDeclaration,
  type FunctionDeclaration,
} from 'ts-morph'
import dedent from 'dedent'

import {
  resolvePropertySignatures,
  resolveType,
  resolveTypeExpression,
} from './resolve-type.js'

const project = new Project()

describe('resolveType', () => {
  const sourceFile = project.createSourceFile(
    'test.ts',
    `
    export type ExportedType = {
      slug: string;
      filePath: string;
    };
  
    export type ModuleData = {
      method(parameterValue: { objectValue: number }): Promise<number>;
      exportedTypes: Array<ExportedType>;
    };
  
    export type FunctionType = (param1: string, param2?: number) => Promise<ExportedType>;
  
    const foo = async () => {
      return {
        slug: 'foo',
        filePath: 'bar',
      }
    }
  
    export type ComplexType = {
      promiseObject?: Promise<ExportedType>;
      promiseFunction: Promise<(a: number, b: string) => void>;
      promiseVariable: ReturnType<typeof foo>;
      union: string | number;
      complexUnion: ((a: string) => string | number) | { a: string } | { b: number, c: (string | number)[] } | string;
      intersection: { a: string } & { b: number };
      complexIntersection: ReturnType<FunctionType> & { a: string } & { b(): void };
      tuple: [a: string, b: number, string];
      function: FunctionType;
    };
  `
  )

  test('process generic properties', () => {
    const typeAlias = sourceFile.getTypeAliasOrThrow('ModuleData')
    const processedProperties = resolveType(typeAlias.getType())

    expect(processedProperties).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "TypeAlias",
        "name": "ModuleData",
        "parameters": [],
        "position": {
          "end": {
            "column": 7,
            "line": 10,
          },
          "start": {
            "column": 5,
            "line": 7,
          },
        },
        "text": "ModuleData",
        "type": {
          "kind": "TypeLiteral",
          "members": [
            {
              "filePath": "test.ts",
              "isOptional": false,
              "isReadonly": false,
              "kind": "PropertySignature",
              "name": "method",
              "position": {
                "end": {
                  "column": 72,
                  "line": 8,
                },
                "start": {
                  "column": 7,
                  "line": 8,
                },
              },
              "text": "(parameterValue: { objectValue: number; }) => Promise<number>",
              "type": {
                "isAsync": true,
                "kind": "FunctionType",
                "parameters": [
                  {
                    "description": undefined,
                    "filePath": "test.ts",
                    "initializer": undefined,
                    "isOptional": false,
                    "kind": "Parameter",
                    "name": "parameterValue",
                    "position": {
                      "end": {
                        "column": 53,
                        "line": 8,
                      },
                      "start": {
                        "column": 14,
                        "line": 8,
                      },
                    },
                    "text": "{ objectValue: number; }",
                    "type": {
                      "kind": "TypeLiteral",
                      "members": [
                        {
                          "filePath": "test.ts",
                          "isOptional": false,
                          "isReadonly": false,
                          "kind": "PropertySignature",
                          "name": "objectValue",
                          "position": {
                            "end": {
                              "column": 51,
                              "line": 8,
                            },
                            "start": {
                              "column": 32,
                              "line": 8,
                            },
                          },
                          "text": "number",
                          "type": {
                            "kind": "Number",
                            "text": "number",
                            "value": undefined,
                          },
                        },
                      ],
                      "text": "{ objectValue: number; }",
                    },
                  },
                ],
                "returnType": {
                  "kind": "TypeReference",
                  "text": "Promise<number>",
                },
                "text": "(parameterValue: { objectValue: number; }) => Promise<number>",
              },
            },
            {
              "filePath": "test.ts",
              "isOptional": false,
              "isReadonly": false,
              "kind": "PropertySignature",
              "name": "exportedTypes",
              "position": {
                "end": {
                  "column": 42,
                  "line": 9,
                },
                "start": {
                  "column": 7,
                  "line": 9,
                },
              },
              "text": "ExportedType[]",
              "type": {
                "kind": "TypeReference",
                "text": "ExportedType[]",
              },
            },
          ],
          "text": "ModuleData",
        },
      }
    `)
  })

  test('complex properties', () => {
    const typeAlias = sourceFile.getTypeAliasOrThrow('ComplexType')
    const type = typeAlias.getType()
    const resolvedPropertySignatures = resolvePropertySignatures(type)

    expect(resolvedPropertySignatures).toMatchInlineSnapshot(`
      [
        {
          "filePath": "test.ts",
          "isOptional": true,
          "isReadonly": false,
          "kind": "PropertySignature",
          "name": "promiseObject",
          "position": {
            "end": {
              "column": 45,
              "line": 22,
            },
            "start": {
              "column": 7,
              "line": 22,
            },
          },
          "text": "Promise<ExportedType>",
          "type": {
            "kind": "TypeReference",
            "text": "Promise<ExportedType>",
          },
        },
        {
          "filePath": "test.ts",
          "isOptional": false,
          "isReadonly": false,
          "kind": "PropertySignature",
          "name": "promiseFunction",
          "position": {
            "end": {
              "column": 64,
              "line": 23,
            },
            "start": {
              "column": 7,
              "line": 23,
            },
          },
          "text": "Promise<(a: number, b: string) => void>",
          "type": {
            "kind": "TypeReference",
            "text": "Promise<(a: number, b: string) => void>",
          },
        },
        {
          "filePath": "test.ts",
          "isOptional": false,
          "isReadonly": false,
          "kind": "PropertySignature",
          "name": "promiseVariable",
          "position": {
            "end": {
              "column": 47,
              "line": 24,
            },
            "start": {
              "column": 7,
              "line": 24,
            },
          },
          "text": "Promise<{ slug: string; filePath: string; }>",
          "type": {
            "kind": "TypeReference",
            "text": "Promise<{ slug: string; filePath: string; }>",
          },
        },
        {
          "filePath": "test.ts",
          "isOptional": false,
          "isReadonly": false,
          "kind": "PropertySignature",
          "name": "union",
          "position": {
            "end": {
              "column": 30,
              "line": 25,
            },
            "start": {
              "column": 7,
              "line": 25,
            },
          },
          "text": "string | number",
          "type": {
            "kind": "UnionType",
            "text": "string | number",
            "types": [
              {
                "kind": "String",
                "text": "string",
                "value": undefined,
              },
              {
                "kind": "Number",
                "text": "number",
                "value": undefined,
              },
            ],
          },
        },
        {
          "filePath": "test.ts",
          "isOptional": false,
          "isReadonly": false,
          "kind": "PropertySignature",
          "name": "complexUnion",
          "position": {
            "end": {
              "column": 119,
              "line": 26,
            },
            "start": {
              "column": 7,
              "line": 26,
            },
          },
          "text": "string | ((a: string) => string | number) | { a: string; } | { b: number; c: (string | number)[]; }",
          "type": {
            "kind": "UnionType",
            "text": "(a: string) => string | number | { a: string; } | { b: number; c: (string | number)[]; } | string",
            "types": [
              {
                "isAsync": false,
                "kind": "FunctionType",
                "parameters": [
                  {
                    "description": undefined,
                    "filePath": "test.ts",
                    "initializer": undefined,
                    "isOptional": false,
                    "kind": "Parameter",
                    "name": "a",
                    "position": {
                      "end": {
                        "column": 32,
                        "line": 26,
                      },
                      "start": {
                        "column": 23,
                        "line": 26,
                      },
                    },
                    "text": "string",
                    "type": {
                      "kind": "String",
                      "text": "string",
                      "value": undefined,
                    },
                  },
                ],
                "returnType": {
                  "kind": "UnionType",
                  "text": "string | number",
                  "types": [
                    {
                      "kind": "String",
                      "text": "string",
                      "value": undefined,
                    },
                    {
                      "kind": "Number",
                      "text": "number",
                      "value": undefined,
                    },
                  ],
                },
                "text": "(a: string) => string | number",
              },
              {
                "kind": "TypeLiteral",
                "members": [
                  {
                    "filePath": "test.ts",
                    "isOptional": false,
                    "isReadonly": false,
                    "kind": "PropertySignature",
                    "name": "a",
                    "position": {
                      "end": {
                        "column": 67,
                        "line": 26,
                      },
                      "start": {
                        "column": 58,
                        "line": 26,
                      },
                    },
                    "text": "string",
                    "type": {
                      "kind": "String",
                      "text": "string",
                      "value": undefined,
                    },
                  },
                ],
                "text": "{ a: string; }",
              },
              {
                "kind": "TypeLiteral",
                "members": [
                  {
                    "filePath": "test.ts",
                    "isOptional": false,
                    "isReadonly": false,
                    "kind": "PropertySignature",
                    "name": "b",
                    "position": {
                      "end": {
                        "column": 84,
                        "line": 26,
                      },
                      "start": {
                        "column": 74,
                        "line": 26,
                      },
                    },
                    "text": "number",
                    "type": {
                      "kind": "Number",
                      "text": "number",
                      "value": undefined,
                    },
                  },
                  {
                    "filePath": "test.ts",
                    "isOptional": false,
                    "isReadonly": false,
                    "kind": "PropertySignature",
                    "name": "c",
                    "position": {
                      "end": {
                        "column": 107,
                        "line": 26,
                      },
                      "start": {
                        "column": 85,
                        "line": 26,
                      },
                    },
                    "text": "(string | number)[]",
                    "type": {
                      "kind": "TypeReference",
                      "text": "(string | number)[]",
                    },
                  },
                ],
                "text": "{ b: number; c: (string | number)[]; }",
              },
              {
                "kind": "String",
                "text": "string",
                "value": undefined,
              },
            ],
          },
        },
        {
          "filePath": "test.ts",
          "isOptional": false,
          "isReadonly": false,
          "kind": "PropertySignature",
          "name": "intersection",
          "position": {
            "end": {
              "column": 51,
              "line": 27,
            },
            "start": {
              "column": 7,
              "line": 27,
            },
          },
          "text": "{ a: string; } & { b: number; }",
          "type": {
            "kind": "TypeLiteral",
            "members": [
              {
                "filePath": "test.ts",
                "isOptional": false,
                "isReadonly": false,
                "kind": "PropertySignature",
                "name": "a",
                "position": {
                  "end": {
                    "column": 32,
                    "line": 27,
                  },
                  "start": {
                    "column": 23,
                    "line": 27,
                  },
                },
                "text": "string",
                "type": {
                  "kind": "String",
                  "text": "string",
                  "value": undefined,
                },
              },
              {
                "filePath": "test.ts",
                "isOptional": false,
                "isReadonly": false,
                "kind": "PropertySignature",
                "name": "b",
                "position": {
                  "end": {
                    "column": 48,
                    "line": 27,
                  },
                  "start": {
                    "column": 39,
                    "line": 27,
                  },
                },
                "text": "number",
                "type": {
                  "kind": "Number",
                  "text": "number",
                  "value": undefined,
                },
              },
            ],
            "text": "{ a: string; } & { b: number; }",
          },
        },
        {
          "filePath": "test.ts",
          "isOptional": false,
          "isReadonly": false,
          "kind": "PropertySignature",
          "name": "complexIntersection",
          "position": {
            "end": {
              "column": 85,
              "line": 28,
            },
            "start": {
              "column": 7,
              "line": 28,
            },
          },
          "text": "Promise<ExportedType> & { a: string; } & { b(): void; }",
          "type": {
            "kind": "IntersectionType",
            "text": "Promise<ExportedType> & { a: string; } & { b(): void; }",
            "types": [
              {
                "kind": "TypeReference",
                "text": "Promise<ExportedType>",
              },
              {
                "kind": "TypeLiteral",
                "members": [
                  {
                    "filePath": "test.ts",
                    "isOptional": false,
                    "isReadonly": false,
                    "kind": "PropertySignature",
                    "name": "a",
                    "position": {
                      "end": {
                        "column": 66,
                        "line": 28,
                      },
                      "start": {
                        "column": 57,
                        "line": 28,
                      },
                    },
                    "text": "string",
                    "type": {
                      "kind": "String",
                      "text": "string",
                      "value": undefined,
                    },
                  },
                ],
                "text": "{ a: string; }",
              },
              {
                "kind": "TypeLiteral",
                "members": [
                  {
                    "filePath": "test.ts",
                    "isOptional": false,
                    "isReadonly": false,
                    "kind": "PropertySignature",
                    "name": "b",
                    "position": {
                      "end": {
                        "column": 82,
                        "line": 28,
                      },
                      "start": {
                        "column": 73,
                        "line": 28,
                      },
                    },
                    "text": "() => void",
                    "type": {
                      "isAsync": false,
                      "kind": "FunctionType",
                      "parameters": [],
                      "returnType": {
                        "kind": "Void",
                        "text": "void",
                      },
                      "text": "() => void",
                    },
                  },
                ],
                "text": "{ b(): void; }",
              },
            ],
          },
        },
        {
          "filePath": "test.ts",
          "isOptional": false,
          "isReadonly": false,
          "kind": "PropertySignature",
          "name": "tuple",
          "position": {
            "end": {
              "column": 45,
              "line": 29,
            },
            "start": {
              "column": 7,
              "line": 29,
            },
          },
          "text": "[a: string, b: number, string]",
          "type": {
            "elements": [
              {
                "kind": "TupleElement",
                "name": "a",
                "text": "string",
                "type": {
                  "kind": "String",
                  "text": "string",
                  "value": undefined,
                },
              },
              {
                "kind": "TupleElement",
                "name": "b",
                "text": "number",
                "type": {
                  "kind": "Number",
                  "text": "number",
                  "value": undefined,
                },
              },
              {
                "kind": "TupleElement",
                "name": "string",
                "text": "string",
                "type": {
                  "kind": "String",
                  "text": "string",
                  "value": undefined,
                },
              },
            ],
            "kind": "Tuple",
            "text": "[a: string, b: number, string]",
          },
        },
        {
          "filePath": "test.ts",
          "isOptional": false,
          "isReadonly": false,
          "kind": "PropertySignature",
          "name": "function",
          "position": {
            "end": {
              "column": 30,
              "line": 30,
            },
            "start": {
              "column": 7,
              "line": 30,
            },
          },
          "text": "FunctionType",
          "type": {
            "isAsync": true,
            "kind": "FunctionType",
            "parameters": [
              {
                "description": undefined,
                "filePath": "test.ts",
                "initializer": undefined,
                "isOptional": false,
                "kind": "Parameter",
                "name": "param1",
                "position": {
                  "end": {
                    "column": 47,
                    "line": 12,
                  },
                  "start": {
                    "column": 33,
                    "line": 12,
                  },
                },
                "text": "string",
                "type": {
                  "kind": "String",
                  "text": "string",
                  "value": undefined,
                },
              },
              {
                "description": undefined,
                "filePath": "test.ts",
                "initializer": undefined,
                "isOptional": true,
                "kind": "Parameter",
                "name": "param2",
                "position": {
                  "end": {
                    "column": 64,
                    "line": 12,
                  },
                  "start": {
                    "column": 49,
                    "line": 12,
                  },
                },
                "text": "number",
                "type": {
                  "kind": "Number",
                  "text": "number",
                  "value": undefined,
                },
              },
            ],
            "returnType": {
              "kind": "TypeReference",
              "text": "Promise<ExportedType>",
            },
            "text": "FunctionType",
          },
        },
      ]
    `)
  })

  test('intersection and union', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      `
        export type BaseVariant = {
          color: string;
        }
  
        type FillVariant = {
          backgroundColor: string;
        } & BaseVariant
  
        type OutlineVariant = {
          borderColor: string;
        } & BaseVariant
  
        type Variant<T> = FillVariant | OutlineVariant | string;
      `,
      { overwrite: true }
    )
    const typeAlias = sourceFile.getTypeAliasOrThrow('Variant')
    const processedProperties = resolveType(typeAlias.getType())

    expect(processedProperties).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "TypeAlias",
        "name": "Variant",
        "parameters": [
          {
            "constraint": {
              "kind": "TypeReference",
              "text": "Variant<T>",
            },
            "defaultType": undefined,
            "filePath": "test.ts",
            "kind": "TypeParameter",
            "name": "T",
            "position": {
              "end": {
                "column": 23,
                "line": 14,
              },
              "start": {
                "column": 22,
                "line": 14,
              },
            },
            "text": "T",
          },
        ],
        "position": {
          "end": {
            "column": 65,
            "line": 14,
          },
          "start": {
            "column": 9,
            "line": 14,
          },
        },
        "text": "Variant<T>",
        "type": {
          "kind": "UnionType",
          "text": "FillVariant | OutlineVariant | string",
          "types": [
            {
              "kind": "TypeLiteral",
              "members": [
                {
                  "filePath": "test.ts",
                  "isOptional": false,
                  "isReadonly": false,
                  "kind": "PropertySignature",
                  "name": "backgroundColor",
                  "position": {
                    "end": {
                      "column": 35,
                      "line": 7,
                    },
                    "start": {
                      "column": 11,
                      "line": 7,
                    },
                  },
                  "text": "string",
                  "type": {
                    "kind": "String",
                    "text": "string",
                    "value": undefined,
                  },
                },
                {
                  "filePath": "test.ts",
                  "isOptional": false,
                  "isReadonly": false,
                  "kind": "PropertySignature",
                  "name": "color",
                  "position": {
                    "end": {
                      "column": 25,
                      "line": 3,
                    },
                    "start": {
                      "column": 11,
                      "line": 3,
                    },
                  },
                  "text": "string",
                  "type": {
                    "kind": "TypeReference",
                    "text": "string",
                  },
                },
              ],
              "text": "FillVariant",
            },
            {
              "kind": "IntersectionType",
              "text": "OutlineVariant",
              "types": [
                {
                  "kind": "TypeLiteral",
                  "members": [
                    {
                      "filePath": "test.ts",
                      "isOptional": false,
                      "isReadonly": false,
                      "kind": "PropertySignature",
                      "name": "borderColor",
                      "position": {
                        "end": {
                          "column": 31,
                          "line": 11,
                        },
                        "start": {
                          "column": 11,
                          "line": 11,
                        },
                      },
                      "text": "string",
                      "type": {
                        "kind": "TypeReference",
                        "text": "string",
                      },
                    },
                  ],
                  "text": "{ borderColor: string; }",
                },
                {
                  "kind": "TypeReference",
                  "text": "BaseVariant",
                },
              ],
            },
            {
              "kind": "TypeReference",
              "text": "string",
            },
          ],
        },
      }
    `)
  })

  test('primitives', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      `
        type Primitives = {
          /** a string */
          str: string;
          
          /**
           * a number
           * @internal
           */
          num: number;
          
          bool: boolean;
          
          arr: string[];
          
          /* non js doc */
          obj: Record<string, { value: number }>;
          
          /** Accepts a string */
          func: (
            /** a string parameter */
            a: string,
          ) => void;
  
          asyncFunc: typeof foo;
        }
  
        async function foo() {}
      `,
      { overwrite: true }
    )
    const typeAlias = sourceFile.getTypeAliasOrThrow('Primitives')
    const processedProperties = resolveType(typeAlias.getType())

    expect(processedProperties).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "TypeAlias",
        "name": "Primitives",
        "parameters": [],
        "position": {
          "end": {
            "column": 10,
            "line": 26,
          },
          "start": {
            "column": 9,
            "line": 2,
          },
        },
        "text": "Primitives",
        "type": {
          "kind": "TypeLiteral",
          "members": [
            {
              "description": "a string",
              "filePath": "test.ts",
              "isOptional": false,
              "isReadonly": false,
              "kind": "PropertySignature",
              "name": "str",
              "position": {
                "end": {
                  "column": 23,
                  "line": 4,
                },
                "start": {
                  "column": 11,
                  "line": 4,
                },
              },
              "tags": undefined,
              "text": "string",
              "type": {
                "kind": "String",
                "text": "string",
                "value": undefined,
              },
            },
            {
              "description": "a number",
              "filePath": "test.ts",
              "isOptional": false,
              "isReadonly": false,
              "kind": "PropertySignature",
              "name": "num",
              "position": {
                "end": {
                  "column": 23,
                  "line": 10,
                },
                "start": {
                  "column": 11,
                  "line": 10,
                },
              },
              "tags": [
                {
                  "name": "internal",
                  "text": undefined,
                },
              ],
              "text": "number",
              "type": {
                "kind": "Number",
                "text": "number",
                "value": undefined,
              },
            },
            {
              "filePath": "test.ts",
              "isOptional": false,
              "isReadonly": false,
              "kind": "PropertySignature",
              "name": "bool",
              "position": {
                "end": {
                  "column": 25,
                  "line": 12,
                },
                "start": {
                  "column": 11,
                  "line": 12,
                },
              },
              "text": "boolean",
              "type": {
                "kind": "Boolean",
                "text": "boolean",
              },
            },
            {
              "filePath": "test.ts",
              "isOptional": false,
              "isReadonly": false,
              "kind": "PropertySignature",
              "name": "arr",
              "position": {
                "end": {
                  "column": 25,
                  "line": 14,
                },
                "start": {
                  "column": 11,
                  "line": 14,
                },
              },
              "text": "string[]",
              "type": {
                "kind": "TypeReference",
                "text": "string[]",
              },
            },
            {
              "filePath": "test.ts",
              "isOptional": false,
              "isReadonly": false,
              "kind": "PropertySignature",
              "name": "obj",
              "position": {
                "end": {
                  "column": 50,
                  "line": 17,
                },
                "start": {
                  "column": 11,
                  "line": 17,
                },
              },
              "text": "Record<string, { value: number; }>",
              "type": {
                "kind": "TypeReference",
                "text": "Record<string, { value: number; }>",
              },
            },
            {
              "description": "Accepts a string",
              "filePath": "test.ts",
              "isOptional": false,
              "isReadonly": false,
              "kind": "PropertySignature",
              "name": "func",
              "position": {
                "end": {
                  "column": 21,
                  "line": 23,
                },
                "start": {
                  "column": 11,
                  "line": 20,
                },
              },
              "tags": undefined,
              "text": "(a: string) => void",
              "type": {
                "isAsync": false,
                "kind": "FunctionType",
                "parameters": [
                  {
                    "description": "a string parameter",
                    "filePath": "test.ts",
                    "initializer": undefined,
                    "isOptional": false,
                    "kind": "Parameter",
                    "name": "a",
                    "position": {
                      "end": {
                        "column": 22,
                        "line": 22,
                      },
                      "start": {
                        "column": 13,
                        "line": 22,
                      },
                    },
                    "text": "string",
                    "type": {
                      "kind": "TypeReference",
                      "text": "string",
                    },
                  },
                ],
                "returnType": {
                  "kind": "Void",
                  "text": "void",
                },
                "text": "(a: string) => void",
              },
            },
            {
              "filePath": "test.ts",
              "isOptional": false,
              "isReadonly": false,
              "kind": "PropertySignature",
              "name": "asyncFunc",
              "position": {
                "end": {
                  "column": 33,
                  "line": 25,
                },
                "start": {
                  "column": 11,
                  "line": 25,
                },
              },
              "text": "() => Promise<void>",
              "type": {
                "isAsync": true,
                "kind": "FunctionType",
                "parameters": [],
                "returnType": {
                  "kind": "TypeReference",
                  "text": "Promise<void>",
                },
                "text": "() => Promise<void>",
              },
            },
          ],
          "text": "Primitives",
        },
      }
    `)
  })

  test('variable declarations', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      `
        const a = {
          b: 1,
          c: 'string',
          ...d
        } as const
  
        const d = {
          e: {
            f: 1,
          },
          g: 'string',
        }
      `,
      { overwrite: true }
    )
    const variableDeclaration = sourceFile.getVariableDeclarationOrThrow('a')
    const processedProperties = resolveType(
      variableDeclaration.getType(),
      variableDeclaration
    )

    expect(processedProperties).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "TypeReference",
        "position": {
          "end": {
            "column": 19,
            "line": 6,
          },
          "start": {
            "column": 15,
            "line": 2,
          },
        },
        "text": "{ readonly e: { f: number; }; readonly g: string; readonly b: 1; readonly c: "string"; }",
      }
    `)
  })

  test('self referenced types', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      `
        type SelfReferencedType = {
          id: string;
          children: SelfReferencedType[];
        }
      `,
      { overwrite: true }
    )
    const typeAlias = sourceFile.getTypeAliasOrThrow('SelfReferencedType')
    const processedProperties = resolveType(typeAlias.getType())

    expect(processedProperties).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "TypeAlias",
        "name": "SelfReferencedType",
        "parameters": [],
        "position": {
          "end": {
            "column": 10,
            "line": 5,
          },
          "start": {
            "column": 9,
            "line": 2,
          },
        },
        "text": "SelfReferencedType",
        "type": {
          "kind": "TypeLiteral",
          "members": [
            {
              "filePath": "test.ts",
              "isOptional": false,
              "isReadonly": false,
              "kind": "PropertySignature",
              "name": "id",
              "position": {
                "end": {
                  "column": 22,
                  "line": 3,
                },
                "start": {
                  "column": 11,
                  "line": 3,
                },
              },
              "text": "string",
              "type": {
                "kind": "String",
                "text": "string",
                "value": undefined,
              },
            },
            {
              "filePath": "test.ts",
              "isOptional": false,
              "isReadonly": false,
              "kind": "PropertySignature",
              "name": "children",
              "position": {
                "end": {
                  "column": 42,
                  "line": 4,
                },
                "start": {
                  "column": 11,
                  "line": 4,
                },
              },
              "text": "SelfReferencedType[]",
              "type": {
                "kind": "TypeReference",
                "text": "SelfReferencedType[]",
              },
            },
          ],
          "text": "SelfReferencedType",
        },
      }
    `)
  })

  test('mutually referenced types', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
      export type DocNode = {
        title: string;
        children?: DocChildren;
      }
      type DocChildren = DocNode[];
      `,
      { overwrite: true }
    )
    const typeAlias = sourceFile.getTypeAliasOrThrow('DocNode')
    const processedProperties = resolveType(typeAlias.getType())

    expect(processedProperties).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "TypeAlias",
        "name": "DocNode",
        "parameters": [],
        "position": {
          "end": {
            "column": 2,
            "line": 4,
          },
          "start": {
            "column": 1,
            "line": 1,
          },
        },
        "text": "DocNode",
        "type": {
          "kind": "TypeLiteral",
          "members": [
            {
              "filePath": "test.ts",
              "isOptional": false,
              "isReadonly": false,
              "kind": "PropertySignature",
              "name": "title",
              "position": {
                "end": {
                  "column": 17,
                  "line": 2,
                },
                "start": {
                  "column": 3,
                  "line": 2,
                },
              },
              "text": "string",
              "type": {
                "kind": "String",
                "text": "string",
                "value": undefined,
              },
            },
            {
              "filePath": "test.ts",
              "isOptional": true,
              "isReadonly": false,
              "kind": "PropertySignature",
              "name": "children",
              "position": {
                "end": {
                  "column": 26,
                  "line": 3,
                },
                "start": {
                  "column": 3,
                  "line": 3,
                },
              },
              "text": "DocChildren",
              "type": {
                "kind": "TypeReference",
                "text": "DocChildren",
              },
            },
          ],
          "text": "DocNode",
        },
      }
    `)
  })

  test('implicit recursive exported types', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
      export type DocNode = {
        title: string;
        children?: DocChildren;
      }
      export type DocChildren = DocNode[];
      `,
      { overwrite: true }
    )
    const typeAlias = sourceFile.getTypeAliasOrThrow('DocNode')
    const processedProperties = resolveType(typeAlias.getType())

    expect(processedProperties).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "TypeAlias",
        "name": "DocNode",
        "parameters": [],
        "position": {
          "end": {
            "column": 2,
            "line": 4,
          },
          "start": {
            "column": 1,
            "line": 1,
          },
        },
        "text": "DocNode",
        "type": {
          "kind": "TypeLiteral",
          "members": [
            {
              "filePath": "test.ts",
              "isOptional": false,
              "isReadonly": false,
              "kind": "PropertySignature",
              "name": "title",
              "position": {
                "end": {
                  "column": 17,
                  "line": 2,
                },
                "start": {
                  "column": 3,
                  "line": 2,
                },
              },
              "text": "string",
              "type": {
                "kind": "String",
                "text": "string",
                "value": undefined,
              },
            },
            {
              "filePath": "test.ts",
              "isOptional": true,
              "isReadonly": false,
              "kind": "PropertySignature",
              "name": "children",
              "position": {
                "end": {
                  "column": 26,
                  "line": 3,
                },
                "start": {
                  "column": 3,
                  "line": 3,
                },
              },
              "text": "DocChildren",
              "type": {
                "kind": "TypeReference",
                "text": "DocChildren",
              },
            },
          ],
          "text": "DocNode",
        },
      }
    `)
  })

  test('recursive types with classes', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
      type FileSystemSource<Exports> = {
        collection?: Collection<Exports>
      }

      class Collection<Exports> {
        sources?: FileSystemSource<Exports>[] = undefined
      }
      `,
      { overwrite: true }
    )
    const typeAlias = sourceFile.getTypeAliasOrThrow('FileSystemSource')
    const processedProperties = resolveType(typeAlias.getType(), typeAlias)

    expect(processedProperties).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "TypeAlias",
        "name": "FileSystemSource",
        "parameters": [
          {
            "constraint": undefined,
            "defaultType": undefined,
            "filePath": "test.ts",
            "kind": "TypeParameter",
            "name": "Exports",
            "position": {
              "end": {
                "column": 30,
                "line": 1,
              },
              "start": {
                "column": 23,
                "line": 1,
              },
            },
            "text": "Exports",
          },
        ],
        "position": {
          "end": {
            "column": 2,
            "line": 3,
          },
          "start": {
            "column": 1,
            "line": 1,
          },
        },
        "text": "FileSystemSource<Exports>",
        "type": {
          "kind": "TypeLiteral",
          "members": [
            {
              "filePath": "test.ts",
              "isOptional": true,
              "isReadonly": false,
              "kind": "PropertySignature",
              "name": "collection",
              "position": {
                "end": {
                  "column": 35,
                  "line": 2,
                },
                "start": {
                  "column": 3,
                  "line": 2,
                },
              },
              "text": "Collection<Exports>",
              "type": {
                "kind": "TypeLiteral",
                "members": [
                  {
                    "filePath": "test.ts",
                    "isOptional": true,
                    "isReadonly": false,
                    "kind": "PropertySignature",
                    "name": "sources",
                    "position": {
                      "end": {
                        "column": 52,
                        "line": 6,
                      },
                      "start": {
                        "column": 3,
                        "line": 6,
                      },
                    },
                    "text": "FileSystemSource<Exports>[]",
                    "type": {
                      "kind": "TypeReference",
                      "text": "FileSystemSource<Exports>[]",
                    },
                  },
                ],
                "text": "Collection<Exports>",
              },
            },
          ],
          "text": "FileSystemSource<Exports>",
        },
      }
    `)
  })

  test('references property signature types located in node_modules', () => {
    const project = new Project()

    project.createSourceFile(
      'node_modules/@types/library/index.d.ts',
      dedent`
        export function readFile(path: string, callback: (err: Error | null, data: Buffer) => void): void;
        `
    )

    const sourceFile = project.createSourceFile(
      'test.ts',
      `
        import { readFile } from 'library';
  
        type FileSystem = { readFile: typeof readFile };
        `
    )

    const typeAlias = sourceFile.getTypeAliasOrThrow('FileSystem')
    const processedProperties = resolveType(typeAlias.getType(), typeAlias)

    expect(processedProperties).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "TypeAlias",
        "name": "FileSystem",
        "parameters": [],
        "position": {
          "end": {
            "column": 57,
            "line": 4,
          },
          "start": {
            "column": 9,
            "line": 4,
          },
        },
        "text": "FileSystem",
        "type": {
          "kind": "TypeLiteral",
          "members": [
            {
              "filePath": "test.ts",
              "isOptional": false,
              "isReadonly": false,
              "kind": "PropertySignature",
              "name": "readFile",
              "position": {
                "end": {
                  "column": 54,
                  "line": 4,
                },
                "start": {
                  "column": 29,
                  "line": 4,
                },
              },
              "text": "(path: string, callback: (err: Error, data: Buffer<ArrayBufferLike>) => void) => void",
              "type": {
                "kind": "TypeReference",
                "text": "(path: string, callback: (err: Error, data: Buffer<ArrayBufferLike>) => void) => void",
              },
            },
          ],
          "text": "FileSystem",
        },
      }
    `)
  })

  test('avoids analyzing prototype properties and methods', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
        type Foo = {
          bar: 'baz'
        }
        
        type AsyncString = {
          value: Promise<Foo>
        }
        `,
      { overwrite: true }
    )

    const typeAlias = sourceFile.getTypeAliasOrThrow('AsyncString')
    const processedProperties = resolveType(typeAlias.getType())

    expect(processedProperties).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "TypeAlias",
        "name": "AsyncString",
        "parameters": [],
        "position": {
          "end": {
            "column": 2,
            "line": 7,
          },
          "start": {
            "column": 1,
            "line": 5,
          },
        },
        "text": "AsyncString",
        "type": {
          "kind": "TypeLiteral",
          "members": [
            {
              "filePath": "test.ts",
              "isOptional": false,
              "isReadonly": false,
              "kind": "PropertySignature",
              "name": "value",
              "position": {
                "end": {
                  "column": 22,
                  "line": 6,
                },
                "start": {
                  "column": 3,
                  "line": 6,
                },
              },
              "text": "Promise<Foo>",
              "type": {
                "kind": "TypeReference",
                "text": "Promise<Foo>",
              },
            },
          ],
          "text": "AsyncString",
        },
      }
    `)
  })

  test('unwraps generic types', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
        type DistributiveOmit<T, K extends PropertyKey> = T extends any
          ? Omit<T, K>
          : never
  
        type BaseType = {
          url: string
          title: string
        }
  
        type A = {
          a: Promise<number>
        } & BaseType
  
        type B = {
          b: number
        } & BaseType
  
        type UnionType = A | B
  
        type UnwrapPromisesInMap<T> = {
          [K in keyof T]: T[K] extends Promise<infer U> ? U : T[K]
        }
  
        type ExportedType = UnwrapPromisesInMap<DistributiveOmit<UnionType, 'title'>>
        `,
      { overwrite: true }
    )

    const typeAlias = sourceFile.getTypeAliasOrThrow('ExportedType')
    const processedProperties = resolveType(typeAlias.getType())

    expect(processedProperties).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "TypeAlias",
        "name": "ExportedType",
        "parameters": [],
        "position": {
          "end": {
            "column": 78,
            "line": 24,
          },
          "start": {
            "column": 1,
            "line": 24,
          },
        },
        "text": "ExportedType",
        "type": {
          "kind": "UnionType",
          "text": "UnwrapPromisesInMap<Omit<A, "title">> | UnwrapPromisesInMap<Omit<B, "title">>",
          "types": [
            {
              "kind": "TypeLiteral",
              "members": [
                {
                  "filePath": "test.ts",
                  "isOptional": false,
                  "isReadonly": false,
                  "kind": "PropertySignature",
                  "name": "a",
                  "position": {
                    "end": {
                      "column": 21,
                      "line": 11,
                    },
                    "start": {
                      "column": 3,
                      "line": 11,
                    },
                  },
                  "text": "Promise<number>",
                  "type": {
                    "kind": "TypeReference",
                    "text": "Promise<number>",
                  },
                },
                {
                  "filePath": "test.ts",
                  "isOptional": false,
                  "isReadonly": false,
                  "kind": "PropertySignature",
                  "name": "url",
                  "position": {
                    "end": {
                      "column": 14,
                      "line": 6,
                    },
                    "start": {
                      "column": 3,
                      "line": 6,
                    },
                  },
                  "text": "string",
                  "type": {
                    "kind": "String",
                    "text": "string",
                    "value": undefined,
                  },
                },
              ],
              "text": "UnwrapPromisesInMap<Omit<A, "title">>",
            },
            {
              "kind": "TypeLiteral",
              "members": [
                {
                  "filePath": "test.ts",
                  "isOptional": false,
                  "isReadonly": false,
                  "kind": "PropertySignature",
                  "name": "url",
                  "position": {
                    "end": {
                      "column": 14,
                      "line": 6,
                    },
                    "start": {
                      "column": 3,
                      "line": 6,
                    },
                  },
                  "text": "string",
                  "type": {
                    "kind": "TypeReference",
                    "text": "string",
                  },
                },
                {
                  "filePath": "test.ts",
                  "isOptional": false,
                  "isReadonly": false,
                  "kind": "PropertySignature",
                  "name": "b",
                  "position": {
                    "end": {
                      "column": 12,
                      "line": 15,
                    },
                    "start": {
                      "column": 3,
                      "line": 15,
                    },
                  },
                  "text": "number",
                  "type": {
                    "kind": "Number",
                    "text": "number",
                    "value": undefined,
                  },
                },
              ],
              "text": "UnwrapPromisesInMap<Omit<B, "title">>",
            },
          ],
        },
      }
    `)
  })

  test('creates reference for external types', () => {
    const project = new Project()

    project.createSourceFile(
      './library/index.d.ts',
      dedent`
        export type Color = 'red' | 'blue' | 'green';
        `
    )

    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
        import { Color } from './library';
  
        export type TextProps = {
          color: Color
        }
        `,
      { overwrite: true }
    )
    const types = resolveType(
      sourceFile.getTypeAliasOrThrow('TextProps').getType()
    )

    expect(types).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "TypeAlias",
        "name": "TextProps",
        "parameters": [],
        "position": {
          "end": {
            "column": 2,
            "line": 5,
          },
          "start": {
            "column": 1,
            "line": 3,
          },
        },
        "text": "TextProps",
        "type": {
          "kind": "TypeLiteral",
          "members": [
            {
              "filePath": "test.ts",
              "isOptional": false,
              "isReadonly": false,
              "kind": "PropertySignature",
              "name": "color",
              "position": {
                "end": {
                  "column": 15,
                  "line": 4,
                },
                "start": {
                  "column": 3,
                  "line": 4,
                },
              },
              "text": "Color",
              "type": {
                "kind": "UnionType",
                "text": ""red" | "blue" | "green"",
                "types": [
                  {
                    "kind": "String",
                    "text": ""red"",
                    "value": "red",
                  },
                  {
                    "kind": "String",
                    "text": ""blue"",
                    "value": "blue",
                  },
                  {
                    "kind": "String",
                    "text": ""green"",
                    "value": "green",
                  },
                ],
              },
            },
          ],
          "text": "TextProps",
        },
      }
    `)
  })

  test('creates reference for virtual types pointing to node modules', () => {
    const project = new Project()

    project.createSourceFile(
      'node_modules/@types/library/index.d.ts',
      dedent`
        export type Color = 'red' | 'blue' | 'green';
        `
    )

    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
        import type { Color } from 'library';
  
        type DropDollarPrefix<T> = {
          [K in keyof T as K extends \`$\${infer I}\` ? I : K]: T[K]
        }
        
        type StyledTextProps = {
          $color?: Color
        }
        
        export type TextProps = {
          fontWeight?: string | number
        } & DropDollarPrefix<StyledTextProps>
        `,
      { overwrite: true }
    )
    const typeAlias = sourceFile.getTypeAliasOrThrow('TextProps')
    const types = resolveType(typeAlias.getType(), typeAlias)

    expect(types).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "TypeAlias",
        "name": "TextProps",
        "parameters": [],
        "position": {
          "end": {
            "column": 38,
            "line": 13,
          },
          "start": {
            "column": 1,
            "line": 11,
          },
        },
        "text": "TextProps",
        "type": {
          "kind": "TypeLiteral",
          "members": [
            {
              "filePath": "test.ts",
              "isOptional": true,
              "isReadonly": false,
              "kind": "PropertySignature",
              "name": "fontWeight",
              "position": {
                "end": {
                  "column": 31,
                  "line": 12,
                },
                "start": {
                  "column": 3,
                  "line": 12,
                },
              },
              "text": "string | number",
              "type": {
                "kind": "UnionType",
                "text": "string | number",
                "types": [
                  {
                    "kind": "String",
                    "text": "string",
                    "value": undefined,
                  },
                  {
                    "kind": "Number",
                    "text": "number",
                    "value": undefined,
                  },
                ],
              },
            },
            {
              "filePath": "test.ts",
              "isOptional": true,
              "isReadonly": false,
              "kind": "PropertySignature",
              "name": "color",
              "position": {
                "end": {
                  "column": 2,
                  "line": 5,
                },
                "start": {
                  "column": 28,
                  "line": 3,
                },
              },
              "text": "Color",
              "type": {
                "kind": "UnionType",
                "text": ""red" | "blue" | "green"",
                "types": [
                  {
                    "kind": "String",
                    "text": ""red"",
                    "value": "red",
                  },
                  {
                    "kind": "String",
                    "text": ""blue"",
                    "value": "blue",
                  },
                  {
                    "kind": "String",
                    "text": ""green"",
                    "value": "green",
                  },
                ],
              },
            },
          ],
          "text": "TextProps",
        },
      }
    `)
  })

  test('simplifies complex generic types', () => {
    const project = new Project()

    project.createSourceFile(
      'node_modules/@types/library/index.d.ts',
      dedent`
        interface SharedMetadata {
          name: string;
        }
  
        export interface FunctionMetadata extends SharedMetadata {
          parameters: Array<PropertyMetadata>;
        }
  
        export interface TypeMetadata extends SharedMetadata {
          properties: Array<PropertyMetadata>;
        }
  
        export interface PropertyMetadata extends SharedMetadata {
          type: string;
        }
  
        export type Metadata = FunctionMetadata | TypeMetadata;
        `
    )

    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
        import type { Metadata } from 'library';
  
        type ExportedType = Metadata & { slug: string }
  
        type ModuleData<Type extends { frontMatter: Record<string, any> }> = {
          exportedTypes: Array<ExportedType>
        }
        `,
      { overwrite: true }
    )
    const types = resolveType(
      sourceFile.getTypeAliasOrThrow('ModuleData').getType()
    )

    expect(types).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "TypeAlias",
        "name": "ModuleData",
        "parameters": [
          {
            "constraint": undefined,
            "defaultType": undefined,
            "filePath": "test.ts",
            "kind": "TypeParameter",
            "name": "Type",
            "position": {
              "end": {
                "column": 66,
                "line": 5,
              },
              "start": {
                "column": 17,
                "line": 5,
              },
            },
            "text": "Type extends { frontMatter: Record<string, any> }",
          },
        ],
        "position": {
          "end": {
            "column": 2,
            "line": 7,
          },
          "start": {
            "column": 1,
            "line": 5,
          },
        },
        "text": "ModuleData<Type>",
        "type": {
          "kind": "TypeLiteral",
          "members": [
            {
              "filePath": "test.ts",
              "isOptional": false,
              "isReadonly": false,
              "kind": "PropertySignature",
              "name": "exportedTypes",
              "position": {
                "end": {
                  "column": 37,
                  "line": 6,
                },
                "start": {
                  "column": 3,
                  "line": 6,
                },
              },
              "text": "ExportedType[]",
              "type": {
                "kind": "TypeReference",
                "text": "ExportedType[]",
              },
            },
          ],
          "text": "ModuleData<Type>",
        },
      }
    `)
  })

  test('function arguments that reference exported types', () => {
    const project = new Project()

    project.createSourceFile(
      'node_modules/@types/library/index.d.ts',
      dedent`
        export type Color = 'red' | 'blue' | 'green';
        `
    )

    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
        import type { Color } from 'library';
  
        export type Text = (color: Color) => void
        `,
      { overwrite: true }
    )
    const typeAlias = sourceFile.getTypeAliasOrThrow('Text')
    const processedProperties = resolveType(typeAlias.getType())

    expect(processedProperties).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "TypeAlias",
        "name": "Text",
        "parameters": [],
        "position": {
          "end": {
            "column": 42,
            "line": 3,
          },
          "start": {
            "column": 1,
            "line": 3,
          },
        },
        "text": "Text",
        "type": {
          "isAsync": false,
          "kind": "FunctionType",
          "parameters": [
            {
              "description": undefined,
              "filePath": "test.ts",
              "initializer": undefined,
              "isOptional": false,
              "kind": "Parameter",
              "name": "color",
              "position": {
                "end": {
                  "column": 33,
                  "line": 3,
                },
                "start": {
                  "column": 21,
                  "line": 3,
                },
              },
              "text": "Color",
              "type": {
                "kind": "UnionType",
                "text": ""red" | "blue" | "green"",
                "types": [
                  {
                    "kind": "String",
                    "text": ""red"",
                    "value": "red",
                  },
                  {
                    "kind": "String",
                    "text": ""blue"",
                    "value": "blue",
                  },
                  {
                    "kind": "String",
                    "text": ""green"",
                    "value": "green",
                  },
                ],
              },
            },
          ],
          "returnType": {
            "kind": "Void",
            "text": "void",
          },
          "text": "Text",
        },
      }
    `)
  })

  test('function arguments that reference interfaces', () => {
    const project = new Project()

    project.createSourceFile(
      'node_modules/@types/library/index.d.ts',
      dedent`
        export type Color = 'red' | 'blue' | 'green';
        `
    )

    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
        import type { Color } from 'library';
  
        interface TextProps {
          color: Color;
        }
        
        export function Text(props?: TextProps) {}
        `,
      { overwrite: true }
    )
    const typeAlias = sourceFile.getFunctionOrThrow('Text')
    const processedProperties = resolveType(typeAlias.getType())

    expect(processedProperties).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "Component",
        "name": "Text",
        "position": {
          "end": {
            "column": 43,
            "line": 7,
          },
          "start": {
            "column": 1,
            "line": 7,
          },
        },
        "signatures": [
          {
            "filePath": "test.ts",
            "isAsync": false,
            "kind": "ComponentSignature",
            "parameter": {
              "description": undefined,
              "filePath": "test.ts",
              "initializer": undefined,
              "isOptional": true,
              "kind": "Parameter",
              "name": "props",
              "position": {
                "end": {
                  "column": 39,
                  "line": 7,
                },
                "start": {
                  "column": 22,
                  "line": 7,
                },
              },
              "text": "TextProps",
              "type": {
                "kind": "TypeLiteral",
                "members": [
                  {
                    "filePath": "test.ts",
                    "isOptional": false,
                    "isReadonly": false,
                    "kind": "PropertySignature",
                    "name": "color",
                    "position": {
                      "end": {
                        "column": 16,
                        "line": 4,
                      },
                      "start": {
                        "column": 3,
                        "line": 4,
                      },
                    },
                    "text": "Color",
                    "type": {
                      "kind": "UnionType",
                      "text": ""red" | "blue" | "green"",
                      "types": [
                        {
                          "kind": "String",
                          "text": ""red"",
                          "value": "red",
                        },
                        {
                          "kind": "String",
                          "text": ""blue"",
                          "value": "blue",
                        },
                        {
                          "kind": "String",
                          "text": ""green"",
                          "value": "green",
                        },
                      ],
                    },
                  },
                ],
                "text": "TextProps",
              },
            },
            "position": {
              "end": {
                "column": 43,
                "line": 7,
              },
              "start": {
                "column": 1,
                "line": 7,
              },
            },
            "returnType": {
              "kind": "Void",
              "text": "void",
            },
            "text": "function Text(props?: TextProps): void",
          },
        ],
        "text": "(props?: TextProps) => void",
      }
    `)
  })

  test('function arguments create reference to exported type aliases', () => {
    const project = new Project()

    project.createSourceFile(
      'node_modules/@types/library/index.d.ts',
      dedent`
        export type Color = 'red' | 'blue' | 'green';
        `
    )

    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
        import type { Color } from 'library';
  
        export type TextProps = {
          fontWeight: number;
          color: Color;
        }
        
        export type Text = (props: TextProps) => void
        `,
      { overwrite: true }
    )
    const typeAlias = sourceFile.getTypeAliasOrThrow('Text')
    const processedProperties = resolveType(typeAlias.getType())

    expect(processedProperties).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "TypeAlias",
        "name": "Text",
        "parameters": [],
        "position": {
          "end": {
            "column": 46,
            "line": 8,
          },
          "start": {
            "column": 1,
            "line": 8,
          },
        },
        "text": "Text",
        "type": {
          "isAsync": false,
          "kind": "FunctionType",
          "parameters": [
            {
              "description": undefined,
              "filePath": "test.ts",
              "initializer": undefined,
              "isOptional": false,
              "kind": "Parameter",
              "name": "props",
              "position": {
                "end": {
                  "column": 37,
                  "line": 8,
                },
                "start": {
                  "column": 21,
                  "line": 8,
                },
              },
              "text": "TextProps",
              "type": {
                "kind": "TypeLiteral",
                "members": [
                  {
                    "filePath": "test.ts",
                    "isOptional": false,
                    "isReadonly": false,
                    "kind": "PropertySignature",
                    "name": "fontWeight",
                    "position": {
                      "end": {
                        "column": 22,
                        "line": 4,
                      },
                      "start": {
                        "column": 3,
                        "line": 4,
                      },
                    },
                    "text": "number",
                    "type": {
                      "kind": "Number",
                      "text": "number",
                      "value": undefined,
                    },
                  },
                  {
                    "filePath": "test.ts",
                    "isOptional": false,
                    "isReadonly": false,
                    "kind": "PropertySignature",
                    "name": "color",
                    "position": {
                      "end": {
                        "column": 16,
                        "line": 5,
                      },
                      "start": {
                        "column": 3,
                        "line": 5,
                      },
                    },
                    "text": "Color",
                    "type": {
                      "kind": "UnionType",
                      "text": ""red" | "blue" | "green"",
                      "types": [
                        {
                          "kind": "String",
                          "text": ""red"",
                          "value": "red",
                        },
                        {
                          "kind": "String",
                          "text": ""blue"",
                          "value": "blue",
                        },
                        {
                          "kind": "String",
                          "text": ""green"",
                          "value": "green",
                        },
                      ],
                    },
                  },
                ],
                "text": "TextProps",
              },
            },
          ],
          "returnType": {
            "kind": "Void",
            "text": "void",
          },
          "text": "Text",
        },
      }
    `)
  })

  test('default parameter values', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
        export type TextProps = {
          color: string;
          fontSize?: number;
        }
  
        export function Text(props: TextProps = { color: 'red' }) {}
        `,
      { overwrite: true }
    )
    const typeAlias = sourceFile.getFunctionOrThrow('Text')
    const processedProperties = resolveType(typeAlias.getType())

    expect(processedProperties).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "Component",
        "name": "Text",
        "position": {
          "end": {
            "column": 61,
            "line": 6,
          },
          "start": {
            "column": 1,
            "line": 6,
          },
        },
        "signatures": [
          {
            "filePath": "test.ts",
            "isAsync": false,
            "kind": "ComponentSignature",
            "parameter": {
              "description": undefined,
              "filePath": "test.ts",
              "initializer": {
                "text": "{ color: 'red' }",
                "value": {
                  "color": "red",
                },
              },
              "isOptional": false,
              "kind": "Parameter",
              "name": "props",
              "position": {
                "end": {
                  "column": 57,
                  "line": 6,
                },
                "start": {
                  "column": 22,
                  "line": 6,
                },
              },
              "text": "TextProps",
              "type": {
                "kind": "TypeLiteral",
                "members": [
                  {
                    "filePath": "test.ts",
                    "isOptional": true,
                    "isReadonly": false,
                    "kind": "PropertySignature",
                    "name": "color",
                    "position": {
                      "end": {
                        "column": 17,
                        "line": 2,
                      },
                      "start": {
                        "column": 3,
                        "line": 2,
                      },
                    },
                    "text": "string",
                    "type": {
                      "kind": "String",
                      "text": "string",
                      "value": undefined,
                    },
                  },
                  {
                    "filePath": "test.ts",
                    "isOptional": true,
                    "isReadonly": false,
                    "kind": "PropertySignature",
                    "name": "fontSize",
                    "position": {
                      "end": {
                        "column": 21,
                        "line": 3,
                      },
                      "start": {
                        "column": 3,
                        "line": 3,
                      },
                    },
                    "text": "number",
                    "type": {
                      "kind": "Number",
                      "text": "number",
                      "value": undefined,
                    },
                  },
                ],
                "text": "TextProps",
              },
            },
            "position": {
              "end": {
                "column": 61,
                "line": 6,
              },
              "start": {
                "column": 1,
                "line": 6,
              },
            },
            "returnType": {
              "kind": "Void",
              "text": "void",
            },
            "text": "function Text(props: TextProps): void",
          },
        ],
        "text": "(props?: TextProps) => void",
      }
    `)
  })

  test('default object values', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
        type TextProps = {
          style: {
            fontSize: number;
            fontWeight: number;
            color?: string;
          };
        }
  
        export function Text({ style: { fontSize, color } }: TextProps = { style: { fontWeight: 400, color: 'blue' } }) {}
        `,
      { overwrite: true }
    )
    const typeAlias = sourceFile.getFunctionOrThrow('Text')
    const processedProperties = resolveType(typeAlias.getType())

    expect(processedProperties).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "Component",
        "name": "Text",
        "position": {
          "end": {
            "column": 115,
            "line": 9,
          },
          "start": {
            "column": 1,
            "line": 9,
          },
        },
        "signatures": [
          {
            "filePath": "test.ts",
            "isAsync": false,
            "kind": "ComponentSignature",
            "parameter": {
              "description": undefined,
              "filePath": "test.ts",
              "initializer": {
                "text": "{ style: { fontWeight: 400, color: 'blue' } }",
                "value": {
                  "style": {
                    "color": "blue",
                    "fontWeight": 400,
                  },
                },
              },
              "isOptional": false,
              "kind": "Parameter",
              "name": undefined,
              "position": {
                "end": {
                  "column": 111,
                  "line": 9,
                },
                "start": {
                  "column": 22,
                  "line": 9,
                },
              },
              "text": "TextProps",
              "type": {
                "kind": "TypeLiteral",
                "members": [
                  {
                    "filePath": "test.ts",
                    "isOptional": true,
                    "isReadonly": false,
                    "kind": "PropertySignature",
                    "name": "style",
                    "position": {
                      "end": {
                        "column": 5,
                        "line": 6,
                      },
                      "start": {
                        "column": 3,
                        "line": 2,
                      },
                    },
                    "text": "{ fontSize: number; fontWeight: number; color?: string; }",
                    "type": {
                      "kind": "TypeLiteral",
                      "members": [
                        {
                          "filePath": "test.ts",
                          "isOptional": false,
                          "isReadonly": false,
                          "kind": "PropertySignature",
                          "name": "fontSize",
                          "position": {
                            "end": {
                              "column": 22,
                              "line": 3,
                            },
                            "start": {
                              "column": 5,
                              "line": 3,
                            },
                          },
                          "text": "number",
                          "type": {
                            "kind": "Number",
                            "text": "number",
                            "value": undefined,
                          },
                        },
                        {
                          "filePath": "test.ts",
                          "isOptional": true,
                          "isReadonly": false,
                          "kind": "PropertySignature",
                          "name": "fontWeight",
                          "position": {
                            "end": {
                              "column": 24,
                              "line": 4,
                            },
                            "start": {
                              "column": 5,
                              "line": 4,
                            },
                          },
                          "text": "number",
                          "type": {
                            "kind": "Number",
                            "text": "number",
                            "value": undefined,
                          },
                        },
                        {
                          "filePath": "test.ts",
                          "isOptional": true,
                          "isReadonly": false,
                          "kind": "PropertySignature",
                          "name": "color",
                          "position": {
                            "end": {
                              "column": 20,
                              "line": 5,
                            },
                            "start": {
                              "column": 5,
                              "line": 5,
                            },
                          },
                          "text": "string",
                          "type": {
                            "kind": "String",
                            "text": "string",
                            "value": undefined,
                          },
                        },
                      ],
                      "text": "{ fontSize: number; fontWeight: number; color?: string; }",
                    },
                  },
                ],
                "text": "TextProps",
              },
            },
            "position": {
              "end": {
                "column": 115,
                "line": 9,
              },
              "start": {
                "column": 1,
                "line": 9,
              },
            },
            "returnType": {
              "kind": "Void",
              "text": "void",
            },
            "text": "function Text(TextProps): void",
          },
        ],
        "text": "({ style: { fontSize, color } }?: TextProps) => void",
      }
    `)
  })

  test('conditional generic', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
        type ModuleData<Type extends { frontMatter: Record<string, any> }> = 'frontMatter' extends keyof Type
            ? Type
            : { frontMatter: Record<string, any> }
        `,
      { overwrite: true }
    )
    const typeAlias = sourceFile.getTypeAliasOrThrow('ModuleData')
    const types = resolveType(typeAlias.getType(), typeAlias)

    expect(types).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "TypeAlias",
        "name": "ModuleData",
        "parameters": [
          {
            "constraint": {
              "kind": "UnionType",
              "text": "{ frontMatter: Record<string, any>; } | { frontMatter: Record<string, any>; }",
              "types": [
                {
                  "kind": "TypeReference",
                  "text": "{ frontMatter: Record<string, any>; }",
                },
                {
                  "kind": "TypeLiteral",
                  "members": [
                    {
                      "filePath": "test.ts",
                      "isOptional": false,
                      "isReadonly": false,
                      "kind": "PropertySignature",
                      "name": "frontMatter",
                      "position": {
                        "end": {
                          "column": 64,
                          "line": 1,
                        },
                        "start": {
                          "column": 32,
                          "line": 1,
                        },
                      },
                      "text": "Record<string, any>",
                      "type": {
                        "kind": "TypeReference",
                        "text": "Record<string, any>",
                      },
                    },
                  ],
                  "text": "{ frontMatter: Record<string, any>; }",
                },
              ],
            },
            "defaultType": undefined,
            "filePath": "test.ts",
            "kind": "TypeParameter",
            "name": "Type",
            "position": {
              "end": {
                "column": 66,
                "line": 1,
              },
              "start": {
                "column": 17,
                "line": 1,
              },
            },
            "text": "Type extends { frontMatter: Record<string, any> }",
          },
        ],
        "position": {
          "end": {
            "column": 43,
            "line": 3,
          },
          "start": {
            "column": 1,
            "line": 1,
          },
        },
        "text": "ModuleData<Type>",
        "type": {
          "checkType": {
            "kind": "String",
            "text": ""frontMatter"",
            "value": "frontMatter",
          },
          "extendsType": {
            "kind": "TypeOperator",
            "operator": "143",
            "text": "keyof Type",
            "type": {
              "kind": "TypeReference",
              "text": "keyof Type",
            },
          },
          "falseType": {
            "kind": "TypeLiteral",
            "members": [
              {
                "filePath": "test.ts",
                "isOptional": false,
                "isReadonly": false,
                "kind": "PropertySignature",
                "name": "frontMatter",
                "position": {
                  "end": {
                    "column": 41,
                    "line": 3,
                  },
                  "start": {
                    "column": 9,
                    "line": 3,
                  },
                },
                "text": "Record<string, any>",
                "type": {
                  "kind": "TypeReference",
                  "text": "Record<string, any>",
                },
              },
            ],
            "text": "{ frontMatter: Record<string, any>; }",
          },
          "isDistributive": false,
          "kind": "ConditionalType",
          "text": "ModuleData<Type>",
          "trueType": {
            "kind": "TypeReference",
            "text": "Type",
          },
        },
      }
    `)
  })

  test('generic function parameters', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
        const createComponent = (
          <Props extends Record<string, any>>(tagName: string) => (props: Props) => {}
        )
        
        type GridProps = { columns: number, rows: number }
        
        const Grid = createComponent<GridProps>('div')
        `,
      { overwrite: true }
    )
    const functionDeclaration = sourceFile.getVariableDeclarationOrThrow('Grid')
    const processedProperties = resolveType(functionDeclaration.getType())

    expect(processedProperties).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "Function",
        "name": undefined,
        "position": {
          "end": {
            "column": 79,
            "line": 2,
          },
          "start": {
            "column": 59,
            "line": 2,
          },
        },
        "signatures": [
          {
            "filePath": "test.ts",
            "kind": "FunctionSignature",
            "parameters": [
              {
                "description": undefined,
                "filePath": "test.ts",
                "initializer": undefined,
                "isOptional": false,
                "kind": "Parameter",
                "name": "props",
                "position": {
                  "end": {
                    "column": 72,
                    "line": 2,
                  },
                  "start": {
                    "column": 60,
                    "line": 2,
                  },
                },
                "text": "GridProps",
                "type": {
                  "kind": "TypeLiteral",
                  "members": [
                    {
                      "filePath": "test.ts",
                      "isOptional": false,
                      "isReadonly": false,
                      "kind": "PropertySignature",
                      "name": "columns",
                      "position": {
                        "end": {
                          "column": 36,
                          "line": 5,
                        },
                        "start": {
                          "column": 20,
                          "line": 5,
                        },
                      },
                      "text": "number",
                      "type": {
                        "kind": "Number",
                        "text": "number",
                        "value": undefined,
                      },
                    },
                    {
                      "filePath": "test.ts",
                      "isOptional": false,
                      "isReadonly": false,
                      "kind": "PropertySignature",
                      "name": "rows",
                      "position": {
                        "end": {
                          "column": 49,
                          "line": 5,
                        },
                        "start": {
                          "column": 37,
                          "line": 5,
                        },
                      },
                      "text": "number",
                      "type": {
                        "kind": "Number",
                        "text": "number",
                        "value": undefined,
                      },
                    },
                  ],
                  "text": "GridProps",
                },
              },
            ],
            "position": {
              "end": {
                "column": 79,
                "line": 2,
              },
              "start": {
                "column": 59,
                "line": 2,
              },
            },
            "returnType": {
              "kind": "Void",
              "text": "void",
            },
            "text": "(props: GridProps) => void",
          },
        ],
        "text": "(props: GridProps) => void",
      }
    `)
  })

  test('explicit undefined is a union', () => {
    const project = new Project({
      compilerOptions: {
        strictNullChecks: true,
      },
    })
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
        type TextProps = {
          color: string | undefined;
        }
        `,
      { overwrite: true }
    )
    const typeAlias = sourceFile.getTypeAliasOrThrow('TextProps')
    const processedProperties = resolveType(typeAlias.getType())

    expect(processedProperties).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "TypeAlias",
        "name": "TextProps",
        "parameters": [],
        "position": {
          "end": {
            "column": 2,
            "line": 3,
          },
          "start": {
            "column": 1,
            "line": 1,
          },
        },
        "text": "TextProps",
        "type": {
          "kind": "TypeLiteral",
          "members": [
            {
              "filePath": "test.ts",
              "isOptional": false,
              "isReadonly": false,
              "kind": "PropertySignature",
              "name": "color",
              "position": {
                "end": {
                  "column": 29,
                  "line": 2,
                },
                "start": {
                  "column": 3,
                  "line": 2,
                },
              },
              "text": "string | undefined",
              "type": {
                "kind": "UnionType",
                "text": "string | undefined",
                "types": [
                  {
                    "kind": "String",
                    "text": "string",
                    "value": undefined,
                  },
                  {
                    "kind": "Undefined",
                    "text": "undefined",
                  },
                ],
              },
            },
          ],
          "text": "TextProps",
        },
      }
    `)
  })

  test('complex library generic types', () => {
    const project = new Project({
      compilerOptions: { strictNullChecks: false },
      tsConfigFilePath: 'tsconfig.json',
    })
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
        import styled from 'styled-components'
        export const Text = styled.span<{ fontSize: number; fontWeight?: number }>({})
        `
    )
    const variableDeclaration = sourceFile.getVariableDeclarationOrThrow('Text')
    const processedType = resolveType(
      variableDeclaration.getType(),
      variableDeclaration,
      (symbolMetadata) => {
        if (symbolMetadata.name === 'theme') {
          return true
        }
        return !symbolMetadata.isInNodeModules
      }
    )

    expect(processedType).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "Any",
        "position": {
          "end": {
            "column": 79,
            "line": 2,
          },
          "start": {
            "column": 14,
            "line": 2,
          },
        },
        "text": "any",
      }
    `)
  })

  test('enum', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
        enum Color {
          Red = 'red',
          Blue = 'blue',
          Green = 'green',
        }
        `,
      { overwrite: true }
    )
    const typeAlias = sourceFile.getEnumOrThrow('Color')
    const processedProperties = resolveType(typeAlias.getType(), typeAlias)

    expect(processedProperties).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "Enum",
        "members": [
          {
            "filePath": "test.ts",
            "kind": "EnumMember",
            "name": "Red",
            "position": {
              "end": {
                "column": 14,
                "line": 2,
              },
              "start": {
                "column": 3,
                "line": 2,
              },
            },
            "text": "Red = 'red'",
            "value": "red",
          },
          {
            "filePath": "test.ts",
            "kind": "EnumMember",
            "name": "Blue",
            "position": {
              "end": {
                "column": 16,
                "line": 3,
              },
              "start": {
                "column": 3,
                "line": 3,
              },
            },
            "text": "Blue = 'blue'",
            "value": "blue",
          },
          {
            "filePath": "test.ts",
            "kind": "EnumMember",
            "name": "Green",
            "position": {
              "end": {
                "column": 18,
                "line": 4,
              },
              "start": {
                "column": 3,
                "line": 4,
              },
            },
            "text": "Green = 'green'",
            "value": "green",
          },
        ],
        "name": "Color",
        "position": {
          "end": {
            "column": 2,
            "line": 5,
          },
          "start": {
            "column": 1,
            "line": 1,
          },
        },
        "text": "Color",
      }
    `)
  })

  test('enum property', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
        enum Color {
          Red = 'red',
          Blue = 'blue',
          Green = 'green',
        }
  
        type TextProps = {
          color: Color;
        }
        `,
      { overwrite: true }
    )
    const typeAlias = sourceFile.getTypeAliasOrThrow('TextProps')
    const processedProperties = resolveType(typeAlias.getType(), typeAlias)

    expect(processedProperties).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "TypeAlias",
        "name": "TextProps",
        "parameters": [],
        "position": {
          "end": {
            "column": 2,
            "line": 9,
          },
          "start": {
            "column": 1,
            "line": 7,
          },
        },
        "text": "TextProps",
        "type": {
          "kind": "TypeLiteral",
          "members": [
            {
              "filePath": "test.ts",
              "isOptional": false,
              "isReadonly": false,
              "kind": "PropertySignature",
              "name": "color",
              "position": {
                "end": {
                  "column": 16,
                  "line": 8,
                },
                "start": {
                  "column": 3,
                  "line": 8,
                },
              },
              "text": "Color",
              "type": {
                "kind": "UnionType",
                "text": "Color.Red | Color.Blue | Color.Green",
                "types": [
                  {
                    "kind": "String",
                    "text": "Color.Red",
                    "value": "red",
                  },
                  {
                    "kind": "String",
                    "text": "Color.Blue",
                    "value": "blue",
                  },
                  {
                    "kind": "String",
                    "text": "Color.Green",
                    "value": "green",
                  },
                ],
              },
            },
          ],
          "text": "TextProps",
        },
      }
    `)
  })

  test('class', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
        class Text {
          color: string;
  
          setValue(value: string) {
            this.color = value;
          }
        }
        `,
      { overwrite: true }
    )
    const classDeclaration = sourceFile.getClassOrThrow('Text')
    const processedProperties = resolveType(
      classDeclaration.getType(),
      classDeclaration
    )

    expect(processedProperties).toMatchInlineSnapshot(`
      {
        "constructor": undefined,
        "filePath": "test.ts",
        "kind": "Class",
        "methods": [
          {
            "kind": "ClassMethod",
            "name": "setValue",
            "scope": undefined,
            "signatures": [
              {
                "filePath": "test.ts",
                "isAsync": false,
                "isGenerator": false,
                "kind": "FunctionSignature",
                "parameters": [
                  {
                    "description": undefined,
                    "filePath": "test.ts",
                    "initializer": undefined,
                    "isOptional": false,
                    "kind": "Parameter",
                    "name": "value",
                    "position": {
                      "end": {
                        "column": 25,
                        "line": 4,
                      },
                      "start": {
                        "column": 12,
                        "line": 4,
                      },
                    },
                    "text": "string",
                    "type": {
                      "kind": "String",
                      "text": "string",
                      "value": undefined,
                    },
                  },
                ],
                "position": {
                  "end": {
                    "column": 4,
                    "line": 6,
                  },
                  "start": {
                    "column": 3,
                    "line": 4,
                  },
                },
                "returnType": {
                  "kind": "Void",
                  "text": "void",
                },
                "text": "(value: string) => void",
              },
            ],
            "text": "(value: string) => void",
            "visibility": undefined,
          },
        ],
        "name": "Text",
        "position": {
          "end": {
            "column": 2,
            "line": 7,
          },
          "start": {
            "column": 1,
            "line": 1,
          },
        },
        "properties": [
          {
            "initializer": undefined,
            "isOptional": false,
            "isReadonly": false,
            "kind": "ClassProperty",
            "name": "color",
            "scope": undefined,
            "text": "string",
            "type": {
              "filePath": "test.ts",
              "kind": "TypeReference",
              "position": {
                "end": {
                  "column": 17,
                  "line": 2,
                },
                "start": {
                  "column": 3,
                  "line": 2,
                },
              },
              "text": "string",
            },
            "visibility": undefined,
          },
        ],
        "text": "Text",
      }
    `)
  })

  test('class as property', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
        class TextView {
          color: string = '#666'
        }
  
        type CardViewProps = {
          text: TextView;
        }
        `,
      { overwrite: true }
    )
    const typeAlias = sourceFile.getTypeAliasOrThrow('CardViewProps')
    const processedProperties = resolveType(typeAlias.getType(), typeAlias)

    expect(processedProperties).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "TypeAlias",
        "name": "CardViewProps",
        "parameters": [],
        "position": {
          "end": {
            "column": 2,
            "line": 7,
          },
          "start": {
            "column": 1,
            "line": 5,
          },
        },
        "text": "CardViewProps",
        "type": {
          "kind": "TypeLiteral",
          "members": [
            {
              "filePath": "test.ts",
              "isOptional": false,
              "isReadonly": false,
              "kind": "PropertySignature",
              "name": "text",
              "position": {
                "end": {
                  "column": 18,
                  "line": 6,
                },
                "start": {
                  "column": 3,
                  "line": 6,
                },
              },
              "text": "TextView",
              "type": {
                "kind": "TypeLiteral",
                "members": [
                  {
                    "filePath": "test.ts",
                    "isOptional": false,
                    "isReadonly": false,
                    "kind": "PropertySignature",
                    "name": "color",
                    "position": {
                      "end": {
                        "column": 25,
                        "line": 2,
                      },
                      "start": {
                        "column": 3,
                        "line": 2,
                      },
                    },
                    "text": "string",
                    "type": {
                      "kind": "String",
                      "text": "string",
                      "value": undefined,
                    },
                  },
                ],
                "text": "TextView",
              },
            },
          ],
          "text": "CardViewProps",
        },
      }
    `)
  })

  test('variable declaration', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
        const color = 'blue'
        `,
      { overwrite: true }
    )
    const variableDeclaration =
      sourceFile.getVariableDeclarationOrThrow('color')
    const processedProperties = resolveType(
      variableDeclaration.getType(),
      variableDeclaration
    )

    expect(processedProperties).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "TypeReference",
        "position": {
          "end": {
            "column": 21,
            "line": 1,
          },
          "start": {
            "column": 7,
            "line": 1,
          },
        },
        "text": ""blue"",
      }
    `)
  })

  test('frozen objects marked as readonly', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
        const color = Object.freeze({ red: 'red', blue: 'blue', green: 'green' })
        `,
      { overwrite: true }
    )
    const variableDeclaration =
      sourceFile.getVariableDeclarationOrThrow('color')
    const processedProperties = resolveType(
      variableDeclaration.getType(),
      variableDeclaration
    )

    expect(processedProperties).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "TypeReference",
        "position": {
          "end": {
            "column": 74,
            "line": 1,
          },
          "start": {
            "column": 7,
            "line": 1,
          },
        },
        "text": "Readonly<{ red: "red"; blue: "blue"; green: "green"; }>",
      }
    `)
  })

  test('computes local generic arguments', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
        const colors = { red: 'red', blue: 'blue', green: 'green' } as const;
        
        const getColor = (key: keyof typeof colors) => colors[key];
  
        export type TextProps = {
          color: ReturnType<typeof getColor>;
        }
        `,
      { overwrite: true }
    )
    const typeAlias = sourceFile.getTypeAliasOrThrow('TextProps')
    const processedProperties = resolveType(typeAlias.getType(), typeAlias)

    expect(processedProperties).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "TypeAlias",
        "name": "TextProps",
        "parameters": [],
        "position": {
          "end": {
            "column": 2,
            "line": 7,
          },
          "start": {
            "column": 1,
            "line": 5,
          },
        },
        "text": "TextProps",
        "type": {
          "kind": "TypeLiteral",
          "members": [
            {
              "filePath": "test.ts",
              "isOptional": false,
              "isReadonly": false,
              "kind": "PropertySignature",
              "name": "color",
              "position": {
                "end": {
                  "column": 38,
                  "line": 6,
                },
                "start": {
                  "column": 3,
                  "line": 6,
                },
              },
              "text": ""red" | "blue" | "green"",
              "type": {
                "kind": "UnionType",
                "text": ""red" | "blue" | "green"",
                "types": [
                  {
                    "kind": "String",
                    "text": ""red"",
                    "value": "red",
                  },
                  {
                    "kind": "String",
                    "text": ""blue"",
                    "value": "blue",
                  },
                  {
                    "kind": "String",
                    "text": ""green"",
                    "value": "green",
                  },
                ],
              },
            },
          ],
          "text": "TextProps",
        },
      }
    `)
  })

  test('computes generic arguments', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
        const colors = { red: 'red', blue: 'blue', green: 'green' } as const;
        
        export const getColor = (key: keyof typeof colors) => colors[key];
  
        export type TextProps = {
          color: ReturnType<typeof getColor>;
        }
        `,
      { overwrite: true }
    )
    const typeAlias = sourceFile.getTypeAliasOrThrow('TextProps')
    const processedProperties = resolveType(typeAlias.getType(), typeAlias)

    expect(processedProperties).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "TypeAlias",
        "name": "TextProps",
        "parameters": [],
        "position": {
          "end": {
            "column": 2,
            "line": 7,
          },
          "start": {
            "column": 1,
            "line": 5,
          },
        },
        "text": "TextProps",
        "type": {
          "kind": "TypeLiteral",
          "members": [
            {
              "filePath": "test.ts",
              "isOptional": false,
              "isReadonly": false,
              "kind": "PropertySignature",
              "name": "color",
              "position": {
                "end": {
                  "column": 38,
                  "line": 6,
                },
                "start": {
                  "column": 3,
                  "line": 6,
                },
              },
              "text": ""red" | "blue" | "green"",
              "type": {
                "kind": "UnionType",
                "text": ""red" | "blue" | "green"",
                "types": [
                  {
                    "kind": "String",
                    "text": ""red"",
                    "value": "red",
                  },
                  {
                    "kind": "String",
                    "text": ""blue"",
                    "value": "blue",
                  },
                  {
                    "kind": "String",
                    "text": ""green"",
                    "value": "green",
                  },
                ],
              },
            },
          ],
          "text": "TextProps",
        },
      }
    `)
  })

  test('references external types', () => {
    project.createSourceFile(
      'node_modules/@types/colors/index.d.ts',
      dedent`
        const colors = { red: 'red', blue: 'blue', green: 'green' } as const;
        export type Colors = typeof colors;
        `
    )

    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
        import type { Colors } from 'colors';
  
        export type TextProps = {
          color: Colors;
        }
        `,
      { overwrite: true }
    )
    const typeAlias = sourceFile.getTypeAliasOrThrow('TextProps')
    const processedProperties = resolveType(typeAlias.getType(), typeAlias)

    expect(processedProperties).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "TypeAlias",
        "name": "TextProps",
        "parameters": [],
        "position": {
          "end": {
            "column": 2,
            "line": 5,
          },
          "start": {
            "column": 1,
            "line": 3,
          },
        },
        "text": "TextProps",
        "type": {
          "kind": "TypeLiteral",
          "members": [
            {
              "filePath": "test.ts",
              "isOptional": false,
              "isReadonly": false,
              "kind": "PropertySignature",
              "name": "color",
              "position": {
                "end": {
                  "column": 17,
                  "line": 4,
                },
                "start": {
                  "column": 3,
                  "line": 4,
                },
              },
              "text": "{ readonly red: "red"; readonly blue: "blue"; readonly green: "green"; }",
              "type": {
                "kind": "TypeReference",
                "text": "{ readonly red: "red"; readonly blue: "blue"; readonly green: "green"; }",
              },
            },
          ],
          "text": "TextProps",
        },
      }
    `)
  })

  test('uses immediate generic for type and type name', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
        const foo = async () => {
          return {
            slug: 'foo',
            filePath: 'bar',
          }
        }
  
        export type ComplexType = {
          functionReturn: ReturnType<typeof foo>;
        };
        `,
      { overwrite: true }
    )
    const typeAlias = sourceFile.getTypeAliasOrThrow('ComplexType')
    const processedProperties = resolveType(typeAlias.getType(), typeAlias)

    expect(processedProperties).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "TypeAlias",
        "name": "ComplexType",
        "parameters": [],
        "position": {
          "end": {
            "column": 3,
            "line": 10,
          },
          "start": {
            "column": 1,
            "line": 8,
          },
        },
        "text": "ComplexType",
        "type": {
          "kind": "TypeLiteral",
          "members": [
            {
              "filePath": "test.ts",
              "isOptional": false,
              "isReadonly": false,
              "kind": "PropertySignature",
              "name": "functionReturn",
              "position": {
                "end": {
                  "column": 42,
                  "line": 9,
                },
                "start": {
                  "column": 3,
                  "line": 9,
                },
              },
              "text": "Promise<{ slug: string; filePath: string; }>",
              "type": {
                "kind": "TypeReference",
                "text": "Promise<{ slug: string; filePath: string; }>",
              },
            },
          ],
          "text": "ComplexType",
        },
      }
    `)
  })

  test('infers component with no parameter from return type', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
        import * as React from 'react'
        export function Text(): React.ReactNode {
          return null
        }
        `,
      { overwrite: true }
    )
    const typeAlias = sourceFile.getFunctionOrThrow('Text')
    const processedProperties = resolveType(typeAlias.getType())

    expect(processedProperties).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "Component",
        "name": "Text",
        "position": {
          "end": {
            "column": 2,
            "line": 4,
          },
          "start": {
            "column": 1,
            "line": 2,
          },
        },
        "signatures": [
          {
            "filePath": "test.ts",
            "isAsync": false,
            "kind": "ComponentSignature",
            "parameter": undefined,
            "position": {
              "end": {
                "column": 2,
                "line": 4,
              },
              "start": {
                "column": 1,
                "line": 2,
              },
            },
            "returnType": {
              "kind": "UnionType",
              "text": "string | number | bigint | boolean | ReactElement<unknown, string | JSXElementConstructor<any>> | Iterable<ReactNode> | ReactPortal | Promise<AwaitedReactNode>",
              "types": [
                {
                  "kind": "String",
                  "text": "string",
                  "value": undefined,
                },
                {
                  "kind": "Number",
                  "text": "number",
                  "value": undefined,
                },
                {
                  "kind": "BigInt",
                  "text": "bigint",
                  "value": undefined,
                },
                {
                  "kind": "Boolean",
                  "text": "boolean",
                },
                {
                  "kind": "TypeReference",
                  "text": "ReactElement<unknown, string | JSXElementConstructor<any>>",
                },
                {
                  "kind": "TypeReference",
                  "text": "Iterable<ReactNode>",
                },
                {
                  "kind": "TypeReference",
                  "text": "ReactPortal",
                },
                {
                  "kind": "TypeReference",
                  "text": "Promise<AwaitedReactNode>",
                },
              ],
            },
            "text": "function Text(): string | number | bigint | boolean | ReactElement<unknown, string | JSXElementConstructor<any>> | Iterable<ReactNode> | ReactPortal | Promise<AwaitedReactNode>",
          },
        ],
        "text": "() => ReactNode",
      }
    `)
  })

  test('parses a function with parameters', () => {
    const description = 'Provides the initial count.'
    const sourceFile = project.createSourceFile(
      'test.ts',
      `function useCounter(\n/** ${description} */ initialCount: number = 0) {}`,
      { overwrite: true }
    )
    const functionDeclaration = sourceFile.getFunctionOrThrow('useCounter')
    const types = resolveType(
      functionDeclaration.getType(),
      functionDeclaration
    )

    expect(types).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "Function",
        "name": "useCounter",
        "position": {
          "end": {
            "column": 64,
            "line": 2,
          },
          "start": {
            "column": 1,
            "line": 1,
          },
        },
        "signatures": [
          {
            "filePath": "test.ts",
            "isAsync": false,
            "isGenerator": false,
            "kind": "FunctionSignature",
            "parameters": [
              {
                "description": "Provides the initial count.",
                "filePath": "test.ts",
                "initializer": undefined,
                "isOptional": false,
                "kind": "Parameter",
                "name": "initialCount",
                "position": {
                  "end": {
                    "column": 60,
                    "line": 2,
                  },
                  "start": {
                    "column": 36,
                    "line": 2,
                  },
                },
                "text": "number",
                "type": {
                  "kind": "Number",
                  "text": "number",
                  "value": undefined,
                },
              },
            ],
            "position": {
              "end": {
                "column": 64,
                "line": 2,
              },
              "start": {
                "column": 1,
                "line": 1,
              },
            },
            "returnType": {
              "kind": "Void",
              "text": "void",
            },
            "text": "function useCounter(initialCount: number): void",
          },
        ],
        "text": "(initialCount?: number) => void",
      }
    `)
  })

  test('parses a function with an object parameter', () => {
    const description = 'Provides the initial count.'
    const sourceFile = project.createSourceFile(
      'test.ts',
      `/** Provides a counter state. \n* @deprecated use \`Counter\` component\n */\nfunction useCounter({ initialCount = 0 }: {\n/** ${description} */ initialCount?: number }) {}`,
      { overwrite: true }
    )
    const functionDeclaration = sourceFile.getFunctionOrThrow('useCounter')
    const types = resolveType(
      functionDeclaration.getType(),
      functionDeclaration
    )

    expect(types).toMatchInlineSnapshot(`
      {
        "description": "Provides a counter state.",
        "filePath": "test.ts",
        "kind": "Function",
        "name": "useCounter",
        "position": {
          "end": {
            "column": 63,
            "line": 5,
          },
          "start": {
            "column": 1,
            "line": 4,
          },
        },
        "signatures": [
          {
            "description": "Provides a counter state.",
            "filePath": "test.ts",
            "isAsync": false,
            "isGenerator": false,
            "kind": "FunctionSignature",
            "parameters": [
              {
                "description": undefined,
                "filePath": "test.ts",
                "initializer": {
                  "text": "",
                  "value": {
                    "initialCount": 0,
                  },
                },
                "isOptional": false,
                "kind": "Parameter",
                "name": undefined,
                "position": {
                  "end": {
                    "column": 59,
                    "line": 5,
                  },
                  "start": {
                    "column": 21,
                    "line": 4,
                  },
                },
                "text": "{ initialCount?: number; }",
                "type": {
                  "kind": "TypeLiteral",
                  "members": [
                    {
                      "description": "Provides the initial count.",
                      "filePath": "test.ts",
                      "isOptional": true,
                      "isReadonly": false,
                      "kind": "PropertySignature",
                      "name": "initialCount",
                      "position": {
                        "end": {
                          "column": 57,
                          "line": 5,
                        },
                        "start": {
                          "column": 36,
                          "line": 5,
                        },
                      },
                      "tags": undefined,
                      "text": "number",
                      "type": {
                        "kind": "Number",
                        "text": "number",
                        "value": undefined,
                      },
                    },
                  ],
                  "text": "{ initialCount?: number; }",
                },
              },
            ],
            "position": {
              "end": {
                "column": 63,
                "line": 5,
              },
              "start": {
                "column": 1,
                "line": 4,
              },
            },
            "returnType": {
              "kind": "Void",
              "text": "void",
            },
            "tags": [
              {
                "name": "deprecated",
                "text": "use \`Counter\` component",
              },
            ],
            "text": "function useCounter({ initialCount?: number; }): void",
          },
        ],
        "tags": [
          {
            "name": "deprecated",
            "text": "use \`Counter\` component",
          },
        ],
        "text": "({ initialCount }: { initialCount?: number; }) => void",
      }
    `)
  })

  test('parses a function with an object parameter with a nested object', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      `function useCounter({ initial = { count: 0 } }?: { initial?: { count: number } } = {}) {}`,
      { overwrite: true }
    )
    const functionDeclaration = sourceFile.getFunctionOrThrow('useCounter')
    const types = resolveType(
      functionDeclaration.getType(),
      functionDeclaration
    )

    expect(types).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "Function",
        "name": "useCounter",
        "position": {
          "end": {
            "column": 90,
            "line": 1,
          },
          "start": {
            "column": 1,
            "line": 1,
          },
        },
        "signatures": [
          {
            "filePath": "test.ts",
            "isAsync": false,
            "isGenerator": false,
            "kind": "FunctionSignature",
            "parameters": [
              {
                "description": undefined,
                "filePath": "test.ts",
                "initializer": {
                  "text": "{}",
                  "value": {
                    "initial": {
                      "count": 0,
                    },
                  },
                },
                "isOptional": true,
                "kind": "Parameter",
                "name": undefined,
                "position": {
                  "end": {
                    "column": 86,
                    "line": 1,
                  },
                  "start": {
                    "column": 21,
                    "line": 1,
                  },
                },
                "text": "{ initial?: { count: number; }; }",
                "type": {
                  "kind": "TypeLiteral",
                  "members": [
                    {
                      "filePath": "test.ts",
                      "isOptional": true,
                      "isReadonly": false,
                      "kind": "PropertySignature",
                      "name": "initial",
                      "position": {
                        "end": {
                          "column": 79,
                          "line": 1,
                        },
                        "start": {
                          "column": 52,
                          "line": 1,
                        },
                      },
                      "text": "{ count: number; }",
                      "type": {
                        "kind": "TypeLiteral",
                        "members": [
                          {
                            "filePath": "test.ts",
                            "isOptional": true,
                            "isReadonly": false,
                            "kind": "PropertySignature",
                            "name": "count",
                            "position": {
                              "end": {
                                "column": 77,
                                "line": 1,
                              },
                              "start": {
                                "column": 64,
                                "line": 1,
                              },
                            },
                            "text": "number",
                            "type": {
                              "kind": "Number",
                              "text": "number",
                              "value": undefined,
                            },
                          },
                        ],
                        "text": "{ count: number; }",
                      },
                    },
                  ],
                  "text": "{ initial?: { count: number; }; }",
                },
              },
            ],
            "position": {
              "end": {
                "column": 90,
                "line": 1,
              },
              "start": {
                "column": 1,
                "line": 1,
              },
            },
            "returnType": {
              "kind": "Void",
              "text": "void",
            },
            "text": "function useCounter({ initial?: { count: number; }; }): void",
          },
        ],
        "text": "({ initial }?: { initial?: { count: number; }; }) => void",
      }
    `)
  })

  test('parses arrow function parameters', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      `const useCounter = (initialCount: number = 0) => {}`,
      { overwrite: true }
    )
    const variableDeclaration =
      sourceFile.getVariableDeclarationOrThrow('useCounter')
    const types = resolveType(
      variableDeclaration.getType(),
      variableDeclaration
    )

    expect(types).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "TypeReference",
        "position": {
          "end": {
            "column": 52,
            "line": 1,
          },
          "start": {
            "column": 7,
            "line": 1,
          },
        },
        "text": "(initialCount?: number) => void",
      }
    `)
  })

  test('parses function expression parameters', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      `const useCounter = function (initialCount: number = 0) {}`,
      { overwrite: true }
    )
    const variableDeclaration =
      sourceFile.getVariableDeclarationOrThrow('useCounter')
    const types = resolveType(
      variableDeclaration.getType(),
      variableDeclaration
    )

    expect(types).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "TypeReference",
        "position": {
          "end": {
            "column": 58,
            "line": 1,
          },
          "start": {
            "column": 7,
            "line": 1,
          },
        },
        "text": "(initialCount?: number) => void",
      }
    `)
  })

  test('imported type should not be parsed', () => {
    project.createSourceFile(
      'types.ts',
      `export type CounterOptions = { initialCount?: number }`
    )
    const sourceFile = project.createSourceFile(
      'test.ts',
      `import { CounterOptions } from './types' function useCounter({ initialCount = 0 }: CounterOptions) {}`,
      { overwrite: true }
    )
    const functionDeclaration = sourceFile.getFunctionOrThrow('useCounter')
    const types = resolveType(
      functionDeclaration.getType(),
      functionDeclaration
    )

    expect(types).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "Function",
        "name": "useCounter",
        "position": {
          "end": {
            "column": 102,
            "line": 1,
          },
          "start": {
            "column": 42,
            "line": 1,
          },
        },
        "signatures": [
          {
            "filePath": "test.ts",
            "isAsync": false,
            "isGenerator": false,
            "kind": "FunctionSignature",
            "parameters": [
              {
                "description": undefined,
                "filePath": "test.ts",
                "initializer": {
                  "text": "",
                  "value": {
                    "initialCount": 0,
                  },
                },
                "isOptional": false,
                "kind": "Parameter",
                "name": undefined,
                "position": {
                  "end": {
                    "column": 98,
                    "line": 1,
                  },
                  "start": {
                    "column": 62,
                    "line": 1,
                  },
                },
                "text": "CounterOptions",
                "type": {
                  "kind": "TypeLiteral",
                  "members": [
                    {
                      "filePath": "types.ts",
                      "isOptional": true,
                      "isReadonly": false,
                      "kind": "PropertySignature",
                      "name": "initialCount",
                      "position": {
                        "end": {
                          "column": 53,
                          "line": 1,
                        },
                        "start": {
                          "column": 32,
                          "line": 1,
                        },
                      },
                      "text": "number",
                      "type": {
                        "kind": "Number",
                        "text": "number",
                        "value": undefined,
                      },
                    },
                  ],
                  "text": "CounterOptions",
                },
              },
            ],
            "position": {
              "end": {
                "column": 102,
                "line": 1,
              },
              "start": {
                "column": 42,
                "line": 1,
              },
            },
            "returnType": {
              "kind": "Void",
              "text": "void",
            },
            "text": "function useCounter(CounterOptions): void",
          },
        ],
        "text": "({ initialCount }: CounterOptions) => void",
      }
    `)
  })

  test('imported function return types should not be parsed', () => {
    project.createSourceFile(
      'types.ts',
      `export function useCounter() { return { initialCount: 0 } }`,
      { overwrite: true }
    )
    const sourceFile = project.createSourceFile(
      'test.ts',
      `import { useCounter } from './types' function useCounterOverride({ initialCount = 0 }: ReturnType<typeof useCounter>) {}`,
      { overwrite: true }
    )
    const functionDeclaration =
      sourceFile.getFunctionOrThrow('useCounterOverride')
    const types = resolveType(
      functionDeclaration.getType(),
      functionDeclaration
    )

    expect(types).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "Function",
        "name": "useCounterOverride",
        "position": {
          "end": {
            "column": 121,
            "line": 1,
          },
          "start": {
            "column": 38,
            "line": 1,
          },
        },
        "signatures": [
          {
            "filePath": "test.ts",
            "isAsync": false,
            "isGenerator": false,
            "kind": "FunctionSignature",
            "parameters": [
              {
                "description": undefined,
                "filePath": "test.ts",
                "initializer": {
                  "text": "",
                  "value": {
                    "initialCount": 0,
                  },
                },
                "isOptional": false,
                "kind": "Parameter",
                "name": undefined,
                "position": {
                  "end": {
                    "column": 117,
                    "line": 1,
                  },
                  "start": {
                    "column": 66,
                    "line": 1,
                  },
                },
                "text": "{ initialCount: number; }",
                "type": {
                  "kind": "TypeLiteral",
                  "members": [
                    {
                      "filePath": "types.ts",
                      "isOptional": true,
                      "isReadonly": false,
                      "kind": "PropertySignature",
                      "name": "initialCount",
                      "position": {
                        "end": {
                          "column": 56,
                          "line": 1,
                        },
                        "start": {
                          "column": 41,
                          "line": 1,
                        },
                      },
                      "text": "number",
                      "type": {
                        "kind": "Number",
                        "text": "number",
                        "value": undefined,
                      },
                    },
                  ],
                  "text": "{ initialCount: number; }",
                },
              },
            ],
            "position": {
              "end": {
                "column": 121,
                "line": 1,
              },
              "start": {
                "column": 38,
                "line": 1,
              },
            },
            "returnType": {
              "kind": "Void",
              "text": "void",
            },
            "text": "function useCounterOverride({ initialCount: number; }): void",
          },
        ],
        "text": "({ initialCount }: ReturnType<typeof useCounter>) => void",
      }
    `)
  })

  test('union types', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
        type BaseProps = { color: string };
        
        type Props = BaseProps & { source: string } | BaseProps & { value: string };
        
        function Component(props: Props) {}
        `,
      { overwrite: true }
    )
    const types = resolveType(
      sourceFile.getFunctionOrThrow('Component').getType(),
      sourceFile.getFunctionOrThrow('Component')
    )

    expect(types).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "Component",
        "name": "Component",
        "position": {
          "end": {
            "column": 36,
            "line": 5,
          },
          "start": {
            "column": 1,
            "line": 5,
          },
        },
        "signatures": [
          {
            "filePath": "test.ts",
            "isAsync": false,
            "kind": "ComponentSignature",
            "parameter": {
              "description": undefined,
              "filePath": "test.ts",
              "initializer": undefined,
              "isOptional": false,
              "kind": "Parameter",
              "name": "props",
              "position": {
                "end": {
                  "column": 32,
                  "line": 5,
                },
                "start": {
                  "column": 20,
                  "line": 5,
                },
              },
              "text": "Props",
              "type": {
                "kind": "UnionType",
                "text": "BaseProps & { source: string; } | BaseProps & { value: string; }",
                "types": [
                  {
                    "kind": "TypeLiteral",
                    "members": [
                      {
                        "filePath": "test.ts",
                        "isOptional": false,
                        "isReadonly": false,
                        "kind": "PropertySignature",
                        "name": "color",
                        "position": {
                          "end": {
                            "column": 33,
                            "line": 1,
                          },
                          "start": {
                            "column": 20,
                            "line": 1,
                          },
                        },
                        "text": "string",
                        "type": {
                          "kind": "String",
                          "text": "string",
                          "value": undefined,
                        },
                      },
                      {
                        "filePath": "test.ts",
                        "isOptional": false,
                        "isReadonly": false,
                        "kind": "PropertySignature",
                        "name": "source",
                        "position": {
                          "end": {
                            "column": 42,
                            "line": 3,
                          },
                          "start": {
                            "column": 28,
                            "line": 3,
                          },
                        },
                        "text": "string",
                        "type": {
                          "kind": "String",
                          "text": "string",
                          "value": undefined,
                        },
                      },
                    ],
                    "text": "BaseProps & { source: string; }",
                  },
                  {
                    "kind": "TypeLiteral",
                    "members": [
                      {
                        "filePath": "test.ts",
                        "isOptional": false,
                        "isReadonly": false,
                        "kind": "PropertySignature",
                        "name": "color",
                        "position": {
                          "end": {
                            "column": 33,
                            "line": 1,
                          },
                          "start": {
                            "column": 20,
                            "line": 1,
                          },
                        },
                        "text": "string",
                        "type": {
                          "kind": "String",
                          "text": "string",
                          "value": undefined,
                        },
                      },
                      {
                        "filePath": "test.ts",
                        "isOptional": false,
                        "isReadonly": false,
                        "kind": "PropertySignature",
                        "name": "value",
                        "position": {
                          "end": {
                            "column": 74,
                            "line": 3,
                          },
                          "start": {
                            "column": 61,
                            "line": 3,
                          },
                        },
                        "text": "string",
                        "type": {
                          "kind": "String",
                          "text": "string",
                          "value": undefined,
                        },
                      },
                    ],
                    "text": "BaseProps & { value: string; }",
                  },
                ],
              },
            },
            "position": {
              "end": {
                "column": 36,
                "line": 5,
              },
              "start": {
                "column": 1,
                "line": 5,
              },
            },
            "returnType": {
              "kind": "Void",
              "text": "void",
            },
            "text": "function Component(props: Props): void",
          },
        ],
        "text": "(props: Props) => void",
      }
    `)
  })

  test('union types with primitive types', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
        type Props = { color: string } | string;
  
        function Component(props: Props) {}
        `,
      { overwrite: true }
    )
    const types = resolveType(
      sourceFile.getFunctionOrThrow('Component').getType(),
      sourceFile.getFunctionOrThrow('Component')
    )

    expect(types).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "Function",
        "name": "Component",
        "position": {
          "end": {
            "column": 36,
            "line": 3,
          },
          "start": {
            "column": 1,
            "line": 3,
          },
        },
        "signatures": [
          {
            "filePath": "test.ts",
            "isAsync": false,
            "isGenerator": false,
            "kind": "FunctionSignature",
            "parameters": [
              {
                "description": undefined,
                "filePath": "test.ts",
                "initializer": undefined,
                "isOptional": false,
                "kind": "Parameter",
                "name": "props",
                "position": {
                  "end": {
                    "column": 32,
                    "line": 3,
                  },
                  "start": {
                    "column": 20,
                    "line": 3,
                  },
                },
                "text": "Props",
                "type": {
                  "kind": "UnionType",
                  "text": "string | { color: string; }",
                  "types": [
                    {
                      "kind": "String",
                      "text": "string",
                      "value": undefined,
                    },
                    {
                      "kind": "TypeLiteral",
                      "members": [
                        {
                          "filePath": "test.ts",
                          "isOptional": false,
                          "isReadonly": false,
                          "kind": "PropertySignature",
                          "name": "color",
                          "position": {
                            "end": {
                              "column": 29,
                              "line": 1,
                            },
                            "start": {
                              "column": 16,
                              "line": 1,
                            },
                          },
                          "text": "string",
                          "type": {
                            "kind": "String",
                            "text": "string",
                            "value": undefined,
                          },
                        },
                      ],
                      "text": "{ color: string; }",
                    },
                  ],
                },
              },
            ],
            "position": {
              "end": {
                "column": 36,
                "line": 3,
              },
              "start": {
                "column": 1,
                "line": 3,
              },
            },
            "returnType": {
              "kind": "Void",
              "text": "void",
            },
            "text": "function Component(props: Props): void",
          },
        ],
        "text": "(props: Props) => void",
      }
    `)
  })

  test('union types with external types', () => {
    project.createSourceFile(
      'types.ts',
      `export type BaseProps = { color: string }`,
      { overwrite: true }
    )
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
        import { BaseProps } from './types';
        
        type Props = BaseProps & { source: string } | BaseProps & { value: string };
        
        function Component(props: Props) {}`,
      { overwrite: true }
    )
    const functionDeclaration = sourceFile.getFirstDescendantByKindOrThrow(
      SyntaxKind.FunctionDeclaration
    )
    const types = resolveType(
      functionDeclaration.getType(),
      functionDeclaration
    )

    expect(types).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "Component",
        "name": "Component",
        "position": {
          "end": {
            "column": 36,
            "line": 5,
          },
          "start": {
            "column": 1,
            "line": 5,
          },
        },
        "signatures": [
          {
            "filePath": "test.ts",
            "isAsync": false,
            "kind": "ComponentSignature",
            "parameter": {
              "description": undefined,
              "filePath": "test.ts",
              "initializer": undefined,
              "isOptional": false,
              "kind": "Parameter",
              "name": "props",
              "position": {
                "end": {
                  "column": 32,
                  "line": 5,
                },
                "start": {
                  "column": 20,
                  "line": 5,
                },
              },
              "text": "Props",
              "type": {
                "kind": "UnionType",
                "text": "BaseProps & { source: string; } | BaseProps & { value: string; }",
                "types": [
                  {
                    "kind": "TypeLiteral",
                    "members": [
                      {
                        "filePath": "types.ts",
                        "isOptional": false,
                        "isReadonly": false,
                        "kind": "PropertySignature",
                        "name": "color",
                        "position": {
                          "end": {
                            "column": 40,
                            "line": 1,
                          },
                          "start": {
                            "column": 27,
                            "line": 1,
                          },
                        },
                        "text": "string",
                        "type": {
                          "kind": "String",
                          "text": "string",
                          "value": undefined,
                        },
                      },
                      {
                        "filePath": "test.ts",
                        "isOptional": false,
                        "isReadonly": false,
                        "kind": "PropertySignature",
                        "name": "source",
                        "position": {
                          "end": {
                            "column": 42,
                            "line": 3,
                          },
                          "start": {
                            "column": 28,
                            "line": 3,
                          },
                        },
                        "text": "string",
                        "type": {
                          "kind": "String",
                          "text": "string",
                          "value": undefined,
                        },
                      },
                    ],
                    "text": "BaseProps & { source: string; }",
                  },
                  {
                    "kind": "TypeLiteral",
                    "members": [
                      {
                        "filePath": "types.ts",
                        "isOptional": false,
                        "isReadonly": false,
                        "kind": "PropertySignature",
                        "name": "color",
                        "position": {
                          "end": {
                            "column": 40,
                            "line": 1,
                          },
                          "start": {
                            "column": 27,
                            "line": 1,
                          },
                        },
                        "text": "string",
                        "type": {
                          "kind": "String",
                          "text": "string",
                          "value": undefined,
                        },
                      },
                      {
                        "filePath": "test.ts",
                        "isOptional": false,
                        "isReadonly": false,
                        "kind": "PropertySignature",
                        "name": "value",
                        "position": {
                          "end": {
                            "column": 74,
                            "line": 3,
                          },
                          "start": {
                            "column": 61,
                            "line": 3,
                          },
                        },
                        "text": "string",
                        "type": {
                          "kind": "String",
                          "text": "string",
                          "value": undefined,
                        },
                      },
                    ],
                    "text": "BaseProps & { value: string; }",
                  },
                ],
              },
            },
            "position": {
              "end": {
                "column": 36,
                "line": 5,
              },
              "start": {
                "column": 1,
                "line": 5,
              },
            },
            "returnType": {
              "kind": "Void",
              "text": "void",
            },
            "text": "function Component(props: Props): void",
          },
        ],
        "text": "(props: Props) => void",
      }
    `)
  })

  test('union types with member references', () => {
    project.createSourceFile(
      'types.ts',
      dedent`
  export type Languages = 'jsx' | 'tsx'
  `,
      { overwrite: true }
    )
    const sourceFile = project.createSourceFile(
      'test.tsx',
      dedent`
    import type { Languages } from './types'

    export interface CodeBlockProps {
      language?: Languages | 'mdx'
    }

    export function CodeBlock({ language }: CodeBlockProps) {
      return <pre />
    }
    `,
      { overwrite: true }
    )
    const declaration = sourceFile.getInterfaceOrThrow('CodeBlockProps')
    const types = resolveType(declaration.getType(), declaration)

    expect(types).toMatchInlineSnapshot(`
      {
        "filePath": "test.tsx",
        "kind": "Interface",
        "members": [
          {
            "filePath": "test.tsx",
            "isOptional": true,
            "isReadonly": false,
            "kind": "PropertySignature",
            "name": "language",
            "position": {
              "end": {
                "column": 31,
                "line": 4,
              },
              "start": {
                "column": 3,
                "line": 4,
              },
            },
            "text": "Languages | "mdx"",
            "type": {
              "kind": "UnionType",
              "text": ""jsx" | "tsx" | "mdx"",
              "types": [
                {
                  "kind": "String",
                  "text": ""jsx"",
                  "value": "jsx",
                },
                {
                  "kind": "String",
                  "text": ""tsx"",
                  "value": "tsx",
                },
                {
                  "kind": "String",
                  "text": ""mdx"",
                  "value": "mdx",
                },
              ],
            },
          },
        ],
        "name": "CodeBlockProps",
        "position": {
          "end": {
            "column": 2,
            "line": 5,
          },
          "start": {
            "column": 1,
            "line": 3,
          },
        },
        "text": "CodeBlockProps",
      }
    `)
  })

  test('union type filters undefined types', () => {
    const project = new Project({
      compilerOptions: {
        strictNullChecks: true,
      },
    })
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
      function Button(props: { variant?: 'primary' | 'secondary' }) {}
      `,
      { overwrite: true }
    )
    const functionDeclaration = sourceFile.getFunctionOrThrow('Button')
    const types = resolveType(
      functionDeclaration.getType(),
      functionDeclaration
    )
    expect(types).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "Component",
        "name": "Button",
        "position": {
          "end": {
            "column": 65,
            "line": 1,
          },
          "start": {
            "column": 1,
            "line": 1,
          },
        },
        "signatures": [
          {
            "filePath": "test.ts",
            "isAsync": false,
            "kind": "ComponentSignature",
            "parameter": {
              "description": undefined,
              "filePath": "test.ts",
              "initializer": undefined,
              "isOptional": false,
              "kind": "Parameter",
              "name": "props",
              "position": {
                "end": {
                  "column": 61,
                  "line": 1,
                },
                "start": {
                  "column": 17,
                  "line": 1,
                },
              },
              "text": "{ variant?: "primary" | "secondary" | undefined; }",
              "type": {
                "kind": "TypeLiteral",
                "members": [
                  {
                    "filePath": "test.ts",
                    "isOptional": true,
                    "isReadonly": false,
                    "kind": "PropertySignature",
                    "name": "variant",
                    "position": {
                      "end": {
                        "column": 59,
                        "line": 1,
                      },
                      "start": {
                        "column": 26,
                        "line": 1,
                      },
                    },
                    "text": ""primary" | "secondary"",
                    "type": {
                      "kind": "UnionType",
                      "text": ""primary" | "secondary"",
                      "types": [
                        {
                          "kind": "String",
                          "text": ""primary"",
                          "value": "primary",
                        },
                        {
                          "kind": "String",
                          "text": ""secondary"",
                          "value": "secondary",
                        },
                      ],
                    },
                  },
                ],
                "text": "{ variant?: "primary" | "secondary" | undefined; }",
              },
            },
            "position": {
              "end": {
                "column": 65,
                "line": 1,
              },
              "start": {
                "column": 1,
                "line": 1,
              },
            },
            "returnType": {
              "kind": "Void",
              "text": "void",
            },
            "text": "function Button(props: { variant?: "primary" | "secondary" | undefined; }): void",
          },
        ],
        "text": "(props: { variant?: "primary" | "secondary"; }) => void",
      }
    `)
  })

  test('index types', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
      export interface FileExports {
        [key: string]: unknown
      }`,
      { overwrite: true }
    )
    const interfaceDeclaration = sourceFile.getInterfaceOrThrow('FileExports')
    const types = resolveType(
      interfaceDeclaration.getType(),
      interfaceDeclaration
    )

    expect(types).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "Interface",
        "members": [
          {
            "filePath": "test.ts",
            "kind": "IndexSignature",
            "parameter": {
              "kind": "IndexSignatureParameter",
              "name": "key",
              "text": "key: string",
              "type": {
                "kind": "String",
                "text": "string",
                "value": undefined,
              },
            },
            "position": {
              "end": {
                "column": 25,
                "line": 2,
              },
              "start": {
                "column": 3,
                "line": 2,
              },
            },
            "text": "[key: string]: unknown",
            "type": {
              "kind": "Unknown",
              "text": "unknown",
            },
          },
        ],
        "name": "FileExports",
        "position": {
          "end": {
            "column": 2,
            "line": 3,
          },
          "start": {
            "column": 1,
            "line": 1,
          },
        },
        "text": "FileExports",
      }
    `)
  })

  test('index signature mixed with property signature', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
      export type FileExports = {
        [key: string]: unknown
        foo: string
      }`,
      { overwrite: true }
    )
    const typeAlias = sourceFile.getTypeAliasOrThrow('FileExports')
    const types = resolveType(typeAlias.getType(), typeAlias)

    expect(types).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "TypeAlias",
        "name": "FileExports",
        "parameters": [],
        "position": {
          "end": {
            "column": 2,
            "line": 4,
          },
          "start": {
            "column": 1,
            "line": 1,
          },
        },
        "text": "FileExports",
        "type": {
          "kind": "TypeLiteral",
          "members": [
            {
              "filePath": "test.ts",
              "isOptional": false,
              "isReadonly": false,
              "kind": "PropertySignature",
              "name": "foo",
              "position": {
                "end": {
                  "column": 14,
                  "line": 3,
                },
                "start": {
                  "column": 3,
                  "line": 3,
                },
              },
              "text": "string",
              "type": {
                "kind": "String",
                "text": "string",
                "value": undefined,
              },
            },
          ],
          "text": "FileExports",
        },
      }
    `)
  })

  test('mapped types without declarations', () => {
    project.createSourceFile(
      'theme.ts',
      `export const textStyles = { heading1: {}, heading2: {}, heading3: {}, body1: {}, }`
    )
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
        import { textStyles } from './theme'
  
        export type DropDollarPrefix<T> = {
          [K in keyof T as K extends \`$\${infer I}\` ? I : K]: T[K]
        }
        
        export type TextVariants = keyof typeof textStyles
        
        type StyledTextProps = {
          $variant?: TextVariants
          $alignment?: 'start' | 'center' | 'end'
          $width?: string | number
          $lineHeight?: string
        }
        
        export type TextProps = {
          className?: string
          children: ReactNode
        } & DropDollarPrefix<StyledTextProps>
        
        export const Text = (props: TextProps) => {
          const {
            variant = 'body1',
            alignment,
            width,
            lineHeight,
            children,
          } = props
        }`,
      { overwrite: true }
    )
    const variableDeclaration = sourceFile.getVariableDeclarationOrThrow('Text')
    const types = resolveType(
      variableDeclaration.getType(),
      variableDeclaration
    )

    expect(types).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "TypeReference",
        "position": {
          "end": {
            "column": 2,
            "line": 29,
          },
          "start": {
            "column": 14,
            "line": 21,
          },
        },
        "text": "(props: TextProps) => void",
      }
    `)
  })

  test('library call expression generic types', () => {
    const project = new Project({
      compilerOptions: { strictNullChecks: false },
      tsConfigFilePath: 'tsconfig.json',
    })
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
        import styled from 'styled-components'
  
        type GridProps = {
          gridTemplateColumns: string
          gridTemplateRows?: string
        }
  
        export const Grid = styled.div<GridProps>((props) => ({
          display: 'grid',
          gridTemplateColumns: props.gridTemplateColumns,
          gridTemplateRows: props.gridTemplateRows,
        }))
        `
    )
    const variableDeclaration = sourceFile.getVariableDeclarationOrThrow('Grid')
    const types = resolveType(
      variableDeclaration.getType(),
      variableDeclaration
    )

    expect(types).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "Any",
        "position": {
          "end": {
            "column": 4,
            "line": 12,
          },
          "start": {
            "column": 14,
            "line": 8,
          },
        },
        "text": "any",
      }
    `)
  })

  test('library tagged template literal generic types', () => {
    const project = new Project({ tsConfigFilePath: 'tsconfig.json' })
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
        import * as React from 'react'
        import styled from 'styled-components'
  
        export const Grid = styled.div<{
          $gridTemplateColumns: string
          $gridTemplateRows: string
        }>\`
          display: grid;
          grid-template-columns: \${({ $gridTemplateColumns }) => $gridTemplateColumns};
          grid-template-rows: \${({ $gridTemplateRows }) => $gridTemplateRows};
        \`
        `,
      { overwrite: true }
    )
    const variableDeclaration = sourceFile.getVariableDeclarationOrThrow('Grid')
    const types = resolveType(
      variableDeclaration.getType(),
      variableDeclaration
    )

    expect(types).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "Any",
        "position": {
          "end": {
            "column": 2,
            "line": 11,
          },
          "start": {
            "column": 14,
            "line": 4,
          },
        },
        "text": "any",
      }
    `)
  })

  test('type aliases', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
        export type Props = {
          variant: 'heading1' | 'heading2' | 'heading3' | 'body1' | 'body2'
          width?: string | number
        }
        `,
      { overwrite: true }
    )
    const typeAlias = sourceFile.getTypeAliasOrThrow('Props')
    const types = resolveType(typeAlias.getType(), typeAlias)

    expect(types).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "TypeAlias",
        "name": "Props",
        "parameters": [],
        "position": {
          "end": {
            "column": 2,
            "line": 4,
          },
          "start": {
            "column": 1,
            "line": 1,
          },
        },
        "text": "Props",
        "type": {
          "kind": "TypeLiteral",
          "members": [
            {
              "filePath": "test.ts",
              "isOptional": false,
              "isReadonly": false,
              "kind": "PropertySignature",
              "name": "variant",
              "position": {
                "end": {
                  "column": 68,
                  "line": 2,
                },
                "start": {
                  "column": 3,
                  "line": 2,
                },
              },
              "text": ""heading1" | "heading2" | "heading3" | "body1" | "body2"",
              "type": {
                "kind": "UnionType",
                "text": ""heading1" | "heading2" | "heading3" | "body1" | "body2"",
                "types": [
                  {
                    "kind": "String",
                    "text": ""heading1"",
                    "value": "heading1",
                  },
                  {
                    "kind": "String",
                    "text": ""heading2"",
                    "value": "heading2",
                  },
                  {
                    "kind": "String",
                    "text": ""heading3"",
                    "value": "heading3",
                  },
                  {
                    "kind": "String",
                    "text": ""body1"",
                    "value": "body1",
                  },
                  {
                    "kind": "String",
                    "text": ""body2"",
                    "value": "body2",
                  },
                ],
              },
            },
            {
              "filePath": "test.ts",
              "isOptional": true,
              "isReadonly": false,
              "kind": "PropertySignature",
              "name": "width",
              "position": {
                "end": {
                  "column": 26,
                  "line": 3,
                },
                "start": {
                  "column": 3,
                  "line": 3,
                },
              },
              "text": "string | number",
              "type": {
                "kind": "UnionType",
                "text": "string | number",
                "types": [
                  {
                    "kind": "String",
                    "text": "string",
                    "value": undefined,
                  },
                  {
                    "kind": "Number",
                    "text": "number",
                    "value": undefined,
                  },
                ],
              },
            },
          ],
          "text": "Props",
        },
      }
    `)
  })

  test('interface declarations', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
        interface BaseProps {
          color: string
        }
        interface Props extends BaseProps {
          variant: 'heading1' | 'heading2' | 'heading3' | 'body1' | 'body2'
          width?: string | number
        }
        `,
      { overwrite: true }
    )
    const interfaceDeclaration = sourceFile.getInterfaceOrThrow('Props')
    const types = resolveType(
      interfaceDeclaration.getType(),
      interfaceDeclaration
    )

    expect(types).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "Interface",
        "members": [
          {
            "filePath": "test.ts",
            "isOptional": false,
            "isReadonly": false,
            "kind": "PropertySignature",
            "name": "variant",
            "position": {
              "end": {
                "column": 68,
                "line": 5,
              },
              "start": {
                "column": 3,
                "line": 5,
              },
            },
            "text": ""heading1" | "heading2" | "heading3" | "body1" | "body2"",
            "type": {
              "kind": "UnionType",
              "text": ""heading1" | "heading2" | "heading3" | "body1" | "body2"",
              "types": [
                {
                  "kind": "String",
                  "text": ""heading1"",
                  "value": "heading1",
                },
                {
                  "kind": "String",
                  "text": ""heading2"",
                  "value": "heading2",
                },
                {
                  "kind": "String",
                  "text": ""heading3"",
                  "value": "heading3",
                },
                {
                  "kind": "String",
                  "text": ""body1"",
                  "value": "body1",
                },
                {
                  "kind": "String",
                  "text": ""body2"",
                  "value": "body2",
                },
              ],
            },
          },
          {
            "filePath": "test.ts",
            "isOptional": true,
            "isReadonly": false,
            "kind": "PropertySignature",
            "name": "width",
            "position": {
              "end": {
                "column": 26,
                "line": 6,
              },
              "start": {
                "column": 3,
                "line": 6,
              },
            },
            "text": "string | number",
            "type": {
              "kind": "UnionType",
              "text": "string | number",
              "types": [
                {
                  "kind": "String",
                  "text": "string",
                  "value": undefined,
                },
                {
                  "kind": "Number",
                  "text": "number",
                  "value": undefined,
                },
              ],
            },
          },
        ],
        "name": "Props",
        "position": {
          "end": {
            "column": 2,
            "line": 7,
          },
          "start": {
            "column": 1,
            "line": 4,
          },
        },
        "text": "Props",
      }
    `)
  })

  test('enum declarations', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      `enum Colors {
          Red = 'RED',
          Green = 'GREEN',
          Blue = 'BLUE'
        }`,
      { overwrite: true }
    )
    const enumDeclaration = sourceFile.getEnumOrThrow('Colors')
    const types = resolveType(enumDeclaration.getType(), enumDeclaration)

    expect(types).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "Enum",
        "members": [
          {
            "filePath": "test.ts",
            "kind": "EnumMember",
            "name": "Red",
            "position": {
              "end": {
                "column": 22,
                "line": 2,
              },
              "start": {
                "column": 11,
                "line": 2,
              },
            },
            "text": "Red = 'RED'",
            "value": "RED",
          },
          {
            "filePath": "test.ts",
            "kind": "EnumMember",
            "name": "Green",
            "position": {
              "end": {
                "column": 26,
                "line": 3,
              },
              "start": {
                "column": 11,
                "line": 3,
              },
            },
            "text": "Green = 'GREEN'",
            "value": "GREEN",
          },
          {
            "filePath": "test.ts",
            "kind": "EnumMember",
            "name": "Blue",
            "position": {
              "end": {
                "column": 24,
                "line": 4,
              },
              "start": {
                "column": 11,
                "line": 4,
              },
            },
            "text": "Blue = 'BLUE'",
            "value": "BLUE",
          },
        ],
        "name": "Colors",
        "position": {
          "end": {
            "column": 10,
            "line": 5,
          },
          "start": {
            "column": 1,
            "line": 1,
          },
        },
        "text": "Colors",
      }
    `)
  })

  test('class declarations', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
        class Counter {
          initialCount: number = 0;
          
          private count: number = 0;
          
          static staticCount: number = 0;
    
          /** Constructs a new counter. */
          constructor(initialCount: number = 0) {
            this.count = count;
            this.initialCount = initialCount;
            Counter.staticCount++;
          }
    
          /** Increments the count. */
          increment() {
            this.count++;
          }
  
          /** Decrements the count. */
          decrement() {
            this.count--;
          }
  
          /** Sets the count. */
          set accessorCount(value: number) {
            this.count = value;
          }
  
          /** Returns the current count. */
          get accessorCount(): number {
            return this.count;
          }
    
          /** Returns the current count. */
          public getCount(isFloored?: boolean = true): number {
            return isFloored ? Math.floor(this.count) : this.count;
          }
    
          static getStaticCount(): number {
            return Counter.staticCount;
          }
        }
        `,
      { overwrite: true }
    )
    const classDeclaration = sourceFile.getClassOrThrow('Counter')
    const types = resolveType(classDeclaration.getType(), classDeclaration)

    expect(types).toMatchInlineSnapshot(`
      {
        "accessors": [
          {
            "description": "Sets the count.",
            "kind": "ClassSetAccessor",
            "name": "accessorCount",
            "parameter": {
              "description": undefined,
              "filePath": "test.ts",
              "initializer": undefined,
              "isOptional": false,
              "kind": "Parameter",
              "name": "value",
              "position": {
                "end": {
                  "column": 34,
                  "line": 26,
                },
                "start": {
                  "column": 21,
                  "line": 26,
                },
              },
              "text": "number",
              "type": {
                "kind": "Number",
                "text": "number",
                "value": undefined,
              },
            },
            "scope": undefined,
            "tags": undefined,
            "text": "number",
            "visibility": undefined,
          },
          {
            "description": "Returns the current count.",
            "kind": "ClassGetAccessor",
            "name": "accessorCount",
            "returnType": {
              "kind": "Number",
              "text": "number",
              "value": undefined,
            },
            "scope": undefined,
            "tags": undefined,
            "text": "number",
            "visibility": undefined,
          },
        ],
        "constructor": {
          "description": "Constructs a new counter.",
          "filePath": "test.ts",
          "kind": "ClassConstructor",
          "position": {
            "end": {
              "column": 4,
              "line": 13,
            },
            "start": {
              "column": 3,
              "line": 9,
            },
          },
          "signatures": [
            {
              "description": "Constructs a new counter.",
              "filePath": "test.ts",
              "kind": "FunctionSignature",
              "parameters": [
                {
                  "description": undefined,
                  "filePath": "test.ts",
                  "initializer": undefined,
                  "isOptional": false,
                  "kind": "Parameter",
                  "name": "initialCount",
                  "position": {
                    "end": {
                      "column": 39,
                      "line": 9,
                    },
                    "start": {
                      "column": 15,
                      "line": 9,
                    },
                  },
                  "text": "number",
                  "type": {
                    "kind": "Number",
                    "text": "number",
                    "value": undefined,
                  },
                },
              ],
              "position": {
                "end": {
                  "column": 4,
                  "line": 13,
                },
                "start": {
                  "column": 3,
                  "line": 9,
                },
              },
              "returnType": {
                "kind": "TypeReference",
                "text": "Counter",
              },
              "tags": undefined,
              "text": "(initialCount: number) => Counter",
            },
          ],
          "tags": undefined,
          "text": "constructor(initialCount: number = 0) {
          this.count = count;
          this.initialCount = initialCount;
          Counter.staticCount++;
        }",
        },
        "filePath": "test.ts",
        "kind": "Class",
        "methods": [
          {
            "description": "Increments the count.",
            "kind": "ClassMethod",
            "name": "increment",
            "scope": undefined,
            "signatures": [
              {
                "description": "Increments the count.",
                "filePath": "test.ts",
                "isAsync": false,
                "isGenerator": false,
                "kind": "FunctionSignature",
                "parameters": [],
                "position": {
                  "end": {
                    "column": 4,
                    "line": 18,
                  },
                  "start": {
                    "column": 3,
                    "line": 16,
                  },
                },
                "returnType": {
                  "kind": "Void",
                  "text": "void",
                },
                "tags": undefined,
                "text": "() => void",
              },
            ],
            "tags": undefined,
            "text": "() => void",
            "visibility": undefined,
          },
          {
            "description": "Decrements the count.",
            "kind": "ClassMethod",
            "name": "decrement",
            "scope": undefined,
            "signatures": [
              {
                "description": "Decrements the count.",
                "filePath": "test.ts",
                "isAsync": false,
                "isGenerator": false,
                "kind": "FunctionSignature",
                "parameters": [],
                "position": {
                  "end": {
                    "column": 4,
                    "line": 23,
                  },
                  "start": {
                    "column": 3,
                    "line": 21,
                  },
                },
                "returnType": {
                  "kind": "Void",
                  "text": "void",
                },
                "tags": undefined,
                "text": "() => void",
              },
            ],
            "tags": undefined,
            "text": "() => void",
            "visibility": undefined,
          },
          {
            "description": "Returns the current count.",
            "kind": "ClassMethod",
            "name": "getCount",
            "scope": undefined,
            "signatures": [
              {
                "description": "Returns the current count.",
                "filePath": "test.ts",
                "isAsync": false,
                "isGenerator": false,
                "kind": "FunctionSignature",
                "parameters": [
                  {
                    "description": undefined,
                    "filePath": "test.ts",
                    "initializer": {
                      "text": "true",
                      "value": true,
                    },
                    "isOptional": true,
                    "kind": "Parameter",
                    "name": "isFloored",
                    "position": {
                      "end": {
                        "column": 45,
                        "line": 36,
                      },
                      "start": {
                        "column": 19,
                        "line": 36,
                      },
                    },
                    "text": "boolean",
                    "type": {
                      "kind": "Boolean",
                      "text": "boolean",
                    },
                  },
                ],
                "position": {
                  "end": {
                    "column": 4,
                    "line": 38,
                  },
                  "start": {
                    "column": 3,
                    "line": 36,
                  },
                },
                "returnType": {
                  "kind": "Number",
                  "text": "number",
                  "value": undefined,
                },
                "tags": undefined,
                "text": "(isFloored?: boolean) => number",
              },
            ],
            "tags": undefined,
            "text": "(isFloored?: boolean) => number",
            "visibility": "public",
          },
          {
            "kind": "ClassMethod",
            "name": "getStaticCount",
            "scope": "static",
            "signatures": [
              {
                "filePath": "test.ts",
                "isAsync": false,
                "isGenerator": false,
                "kind": "FunctionSignature",
                "parameters": [],
                "position": {
                  "end": {
                    "column": 4,
                    "line": 42,
                  },
                  "start": {
                    "column": 3,
                    "line": 40,
                  },
                },
                "returnType": {
                  "kind": "Number",
                  "text": "number",
                  "value": undefined,
                },
                "text": "() => number",
              },
            ],
            "text": "() => number",
            "visibility": undefined,
          },
        ],
        "name": "Counter",
        "position": {
          "end": {
            "column": 2,
            "line": 43,
          },
          "start": {
            "column": 1,
            "line": 1,
          },
        },
        "properties": [
          {
            "initializer": undefined,
            "isOptional": true,
            "isReadonly": false,
            "kind": "ClassProperty",
            "name": "initialCount",
            "scope": undefined,
            "text": "number",
            "type": {
              "filePath": "test.ts",
              "kind": "TypeReference",
              "position": {
                "end": {
                  "column": 28,
                  "line": 2,
                },
                "start": {
                  "column": 3,
                  "line": 2,
                },
              },
              "text": "number",
            },
            "visibility": undefined,
          },
          {
            "initializer": undefined,
            "isOptional": true,
            "isReadonly": false,
            "kind": "ClassProperty",
            "name": "staticCount",
            "scope": "static",
            "text": "number",
            "type": {
              "filePath": "test.ts",
              "kind": "TypeReference",
              "position": {
                "end": {
                  "column": 34,
                  "line": 6,
                },
                "start": {
                  "column": 3,
                  "line": 6,
                },
              },
              "text": "number",
            },
            "visibility": undefined,
          },
        ],
        "text": "Counter",
      }
    `)
  })

  test('renamed property default values', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      `function useCounter({ initialCount: renamedInitialCount = 0 }: { initialCount: number } = {}) {}`,
      { overwrite: true }
    )
    const functionDeclaration = sourceFile.getFunctionOrThrow('useCounter')
    const types = resolveType(
      functionDeclaration.getType(),
      functionDeclaration
    )

    expect(types).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "Function",
        "name": "useCounter",
        "position": {
          "end": {
            "column": 97,
            "line": 1,
          },
          "start": {
            "column": 1,
            "line": 1,
          },
        },
        "signatures": [
          {
            "filePath": "test.ts",
            "isAsync": false,
            "isGenerator": false,
            "kind": "FunctionSignature",
            "parameters": [
              {
                "description": undefined,
                "filePath": "test.ts",
                "initializer": {
                  "text": "{}",
                  "value": {
                    "initialCount": 0,
                  },
                },
                "isOptional": false,
                "kind": "Parameter",
                "name": undefined,
                "position": {
                  "end": {
                    "column": 93,
                    "line": 1,
                  },
                  "start": {
                    "column": 21,
                    "line": 1,
                  },
                },
                "text": "{ initialCount: number; }",
                "type": {
                  "kind": "TypeLiteral",
                  "members": [
                    {
                      "filePath": "test.ts",
                      "isOptional": true,
                      "isReadonly": false,
                      "kind": "PropertySignature",
                      "name": "initialCount",
                      "position": {
                        "end": {
                          "column": 86,
                          "line": 1,
                        },
                        "start": {
                          "column": 66,
                          "line": 1,
                        },
                      },
                      "text": "number",
                      "type": {
                        "kind": "Number",
                        "text": "number",
                        "value": undefined,
                      },
                    },
                  ],
                  "text": "{ initialCount: number; }",
                },
              },
            ],
            "position": {
              "end": {
                "column": 97,
                "line": 1,
              },
              "start": {
                "column": 1,
                "line": 1,
              },
            },
            "returnType": {
              "kind": "Void",
              "text": "void",
            },
            "text": "function useCounter({ initialCount: number; }): void",
          },
        ],
        "text": "({ initialCount: renamedInitialCount }?: { initialCount: number; }) => void",
      }
    `)
  })

  test('multiple arguments', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      `function add(a: number, b: number = 0): number { return a + b }`,
      { overwrite: true }
    )
    const functionDeclaration = sourceFile.getFunctionOrThrow('add')
    const types = resolveType(
      functionDeclaration.getType(),
      functionDeclaration
    )

    expect(types).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "Function",
        "name": "add",
        "position": {
          "end": {
            "column": 64,
            "line": 1,
          },
          "start": {
            "column": 1,
            "line": 1,
          },
        },
        "signatures": [
          {
            "filePath": "test.ts",
            "isAsync": false,
            "isGenerator": false,
            "kind": "FunctionSignature",
            "parameters": [
              {
                "description": undefined,
                "filePath": "test.ts",
                "initializer": undefined,
                "isOptional": false,
                "kind": "Parameter",
                "name": "a",
                "position": {
                  "end": {
                    "column": 23,
                    "line": 1,
                  },
                  "start": {
                    "column": 14,
                    "line": 1,
                  },
                },
                "text": "number",
                "type": {
                  "kind": "Number",
                  "text": "number",
                  "value": undefined,
                },
              },
              {
                "description": undefined,
                "filePath": "test.ts",
                "initializer": undefined,
                "isOptional": false,
                "kind": "Parameter",
                "name": "b",
                "position": {
                  "end": {
                    "column": 38,
                    "line": 1,
                  },
                  "start": {
                    "column": 25,
                    "line": 1,
                  },
                },
                "text": "number",
                "type": {
                  "kind": "Number",
                  "text": "number",
                  "value": undefined,
                },
              },
            ],
            "position": {
              "end": {
                "column": 64,
                "line": 1,
              },
              "start": {
                "column": 1,
                "line": 1,
              },
            },
            "returnType": {
              "kind": "Number",
              "text": "number",
              "value": undefined,
            },
            "text": "function add(a: number, b: number): number",
          },
        ],
        "text": "(a: number, b?: number) => number",
      }
    `)
  })

  test('type with union', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
        type ButtonVariants = { color:string } & ({ backgroundColor: string } | { borderColor: string })
        `,
      { overwrite: true }
    )
    const typeAlias = sourceFile.getTypeAliasOrThrow('ButtonVariants')
    const types = resolveType(typeAlias.getType(), typeAlias)

    expect(types).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "TypeAlias",
        "name": "ButtonVariants",
        "parameters": [],
        "position": {
          "end": {
            "column": 97,
            "line": 1,
          },
          "start": {
            "column": 1,
            "line": 1,
          },
        },
        "text": "ButtonVariants",
        "type": {
          "kind": "UnionType",
          "text": "{ color: string; } & { backgroundColor: string; } | { color: string; } & { borderColor: string; }",
          "types": [
            {
              "kind": "TypeLiteral",
              "members": [
                {
                  "filePath": "test.ts",
                  "isOptional": false,
                  "isReadonly": false,
                  "kind": "PropertySignature",
                  "name": "color",
                  "position": {
                    "end": {
                      "column": 37,
                      "line": 1,
                    },
                    "start": {
                      "column": 25,
                      "line": 1,
                    },
                  },
                  "text": "string",
                  "type": {
                    "kind": "String",
                    "text": "string",
                    "value": undefined,
                  },
                },
                {
                  "filePath": "test.ts",
                  "isOptional": false,
                  "isReadonly": false,
                  "kind": "PropertySignature",
                  "name": "backgroundColor",
                  "position": {
                    "end": {
                      "column": 68,
                      "line": 1,
                    },
                    "start": {
                      "column": 45,
                      "line": 1,
                    },
                  },
                  "text": "string",
                  "type": {
                    "kind": "TypeReference",
                    "text": "string",
                  },
                },
              ],
              "text": "{ color: string; } & { backgroundColor: string; }",
            },
            {
              "kind": "IntersectionType",
              "text": "{ color: string; } & { borderColor: string; }",
              "types": [
                {
                  "kind": "TypeReference",
                  "text": "{ color: string; }",
                },
                {
                  "kind": "TypeLiteral",
                  "members": [
                    {
                      "filePath": "test.ts",
                      "isOptional": false,
                      "isReadonly": false,
                      "kind": "PropertySignature",
                      "name": "borderColor",
                      "position": {
                        "end": {
                          "column": 94,
                          "line": 1,
                        },
                        "start": {
                          "column": 75,
                          "line": 1,
                        },
                      },
                      "text": "string",
                      "type": {
                        "kind": "TypeReference",
                        "text": "string",
                      },
                    },
                  ],
                  "text": "{ borderColor: string; }",
                },
              ],
            },
          ],
        },
      }
    `)
  })

  test('property with union', () => {
    const project = new Project()
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
        type Config = {
          siteName: string
          settings: {
            apiEndpoint: string;
            apiKey: string;
          } | {
            dbHost: string;
            dbPort: number;
            dbName: string;
          };
        }
        `,
      { overwrite: true }
    )
    const typeAlias = sourceFile.getTypeAliasOrThrow('Config')
    const types = resolveType(typeAlias.getType(), typeAlias)

    expect(types).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "TypeAlias",
        "name": "Config",
        "parameters": [],
        "position": {
          "end": {
            "column": 2,
            "line": 11,
          },
          "start": {
            "column": 1,
            "line": 1,
          },
        },
        "text": "Config",
        "type": {
          "kind": "TypeLiteral",
          "members": [
            {
              "filePath": "test.ts",
              "isOptional": false,
              "isReadonly": false,
              "kind": "PropertySignature",
              "name": "siteName",
              "position": {
                "end": {
                  "column": 19,
                  "line": 2,
                },
                "start": {
                  "column": 3,
                  "line": 2,
                },
              },
              "text": "string",
              "type": {
                "kind": "String",
                "text": "string",
                "value": undefined,
              },
            },
            {
              "filePath": "test.ts",
              "isOptional": false,
              "isReadonly": false,
              "kind": "PropertySignature",
              "name": "settings",
              "position": {
                "end": {
                  "column": 5,
                  "line": 10,
                },
                "start": {
                  "column": 3,
                  "line": 3,
                },
              },
              "text": "{ apiEndpoint: string; apiKey: string; } | { dbHost: string; dbPort: number; dbName: string; }",
              "type": {
                "kind": "UnionType",
                "text": "{ apiEndpoint: string; apiKey: string; } | { dbHost: string; dbPort: number; dbName: string; }",
                "types": [
                  {
                    "kind": "TypeLiteral",
                    "members": [
                      {
                        "filePath": "test.ts",
                        "isOptional": false,
                        "isReadonly": false,
                        "kind": "PropertySignature",
                        "name": "apiEndpoint",
                        "position": {
                          "end": {
                            "column": 25,
                            "line": 4,
                          },
                          "start": {
                            "column": 5,
                            "line": 4,
                          },
                        },
                        "text": "string",
                        "type": {
                          "kind": "TypeReference",
                          "text": "string",
                        },
                      },
                      {
                        "filePath": "test.ts",
                        "isOptional": false,
                        "isReadonly": false,
                        "kind": "PropertySignature",
                        "name": "apiKey",
                        "position": {
                          "end": {
                            "column": 20,
                            "line": 5,
                          },
                          "start": {
                            "column": 5,
                            "line": 5,
                          },
                        },
                        "text": "string",
                        "type": {
                          "kind": "TypeReference",
                          "text": "string",
                        },
                      },
                    ],
                    "text": "{ apiEndpoint: string; apiKey: string; }",
                  },
                  {
                    "kind": "TypeLiteral",
                    "members": [
                      {
                        "filePath": "test.ts",
                        "isOptional": false,
                        "isReadonly": false,
                        "kind": "PropertySignature",
                        "name": "dbHost",
                        "position": {
                          "end": {
                            "column": 20,
                            "line": 7,
                          },
                          "start": {
                            "column": 5,
                            "line": 7,
                          },
                        },
                        "text": "string",
                        "type": {
                          "kind": "TypeReference",
                          "text": "string",
                        },
                      },
                      {
                        "filePath": "test.ts",
                        "isOptional": false,
                        "isReadonly": false,
                        "kind": "PropertySignature",
                        "name": "dbPort",
                        "position": {
                          "end": {
                            "column": 20,
                            "line": 8,
                          },
                          "start": {
                            "column": 5,
                            "line": 8,
                          },
                        },
                        "text": "number",
                        "type": {
                          "kind": "Number",
                          "text": "number",
                          "value": undefined,
                        },
                      },
                      {
                        "filePath": "test.ts",
                        "isOptional": false,
                        "isReadonly": false,
                        "kind": "PropertySignature",
                        "name": "dbName",
                        "position": {
                          "end": {
                            "column": 20,
                            "line": 9,
                          },
                          "start": {
                            "column": 5,
                            "line": 9,
                          },
                        },
                        "text": "string",
                        "type": {
                          "kind": "TypeReference",
                          "text": "string",
                        },
                      },
                    ],
                    "text": "{ dbHost: string; dbPort: number; dbName: string; }",
                  },
                ],
              },
            },
          ],
          "text": "Config",
        },
      }
    `)
  })

  test('argument with union', () => {
    const project = new Project()
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
        function useCounter(
          settings: { apiEndpoint: string; apiKey: string; } | { dbHost: string; dbPort: number; dbName: string; }
        ) {}
        `,
      { overwrite: true }
    )
    const functionDeclaration = sourceFile.getFunctionOrThrow('useCounter')
    const types = resolveType(
      functionDeclaration.getType(),
      functionDeclaration
    )

    expect(types).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "Function",
        "name": "useCounter",
        "position": {
          "end": {
            "column": 5,
            "line": 3,
          },
          "start": {
            "column": 1,
            "line": 1,
          },
        },
        "signatures": [
          {
            "filePath": "test.ts",
            "isAsync": false,
            "isGenerator": false,
            "kind": "FunctionSignature",
            "parameters": [
              {
                "description": undefined,
                "filePath": "test.ts",
                "initializer": undefined,
                "isOptional": false,
                "kind": "Parameter",
                "name": "settings",
                "position": {
                  "end": {
                    "column": 107,
                    "line": 2,
                  },
                  "start": {
                    "column": 3,
                    "line": 2,
                  },
                },
                "text": "{ apiEndpoint: string; apiKey: string; } | { dbHost: string; dbPort: number; dbName: string; }",
                "type": {
                  "kind": "UnionType",
                  "text": "{ apiEndpoint: string; apiKey: string; } | { dbHost: string; dbPort: number; dbName: string; }",
                  "types": [
                    {
                      "kind": "TypeLiteral",
                      "members": [
                        {
                          "filePath": "test.ts",
                          "isOptional": false,
                          "isReadonly": false,
                          "kind": "PropertySignature",
                          "name": "apiEndpoint",
                          "position": {
                            "end": {
                              "column": 35,
                              "line": 2,
                            },
                            "start": {
                              "column": 15,
                              "line": 2,
                            },
                          },
                          "text": "string",
                          "type": {
                            "kind": "String",
                            "text": "string",
                            "value": undefined,
                          },
                        },
                        {
                          "filePath": "test.ts",
                          "isOptional": false,
                          "isReadonly": false,
                          "kind": "PropertySignature",
                          "name": "apiKey",
                          "position": {
                            "end": {
                              "column": 51,
                              "line": 2,
                            },
                            "start": {
                              "column": 36,
                              "line": 2,
                            },
                          },
                          "text": "string",
                          "type": {
                            "kind": "String",
                            "text": "string",
                            "value": undefined,
                          },
                        },
                      ],
                      "text": "{ apiEndpoint: string; apiKey: string; }",
                    },
                    {
                      "kind": "TypeLiteral",
                      "members": [
                        {
                          "filePath": "test.ts",
                          "isOptional": false,
                          "isReadonly": false,
                          "kind": "PropertySignature",
                          "name": "dbHost",
                          "position": {
                            "end": {
                              "column": 73,
                              "line": 2,
                            },
                            "start": {
                              "column": 58,
                              "line": 2,
                            },
                          },
                          "text": "string",
                          "type": {
                            "kind": "String",
                            "text": "string",
                            "value": undefined,
                          },
                        },
                        {
                          "filePath": "test.ts",
                          "isOptional": false,
                          "isReadonly": false,
                          "kind": "PropertySignature",
                          "name": "dbPort",
                          "position": {
                            "end": {
                              "column": 89,
                              "line": 2,
                            },
                            "start": {
                              "column": 74,
                              "line": 2,
                            },
                          },
                          "text": "number",
                          "type": {
                            "kind": "Number",
                            "text": "number",
                            "value": undefined,
                          },
                        },
                        {
                          "filePath": "test.ts",
                          "isOptional": false,
                          "isReadonly": false,
                          "kind": "PropertySignature",
                          "name": "dbName",
                          "position": {
                            "end": {
                              "column": 105,
                              "line": 2,
                            },
                            "start": {
                              "column": 90,
                              "line": 2,
                            },
                          },
                          "text": "string",
                          "type": {
                            "kind": "String",
                            "text": "string",
                            "value": undefined,
                          },
                        },
                      ],
                      "text": "{ dbHost: string; dbPort: number; dbName: string; }",
                    },
                  ],
                },
              },
            ],
            "position": {
              "end": {
                "column": 5,
                "line": 3,
              },
              "start": {
                "column": 1,
                "line": 1,
              },
            },
            "returnType": {
              "kind": "Void",
              "text": "void",
            },
            "text": "function useCounter(settings: { apiEndpoint: string; apiKey: string; } | { dbHost: string; dbPort: number; dbName: string; }): void",
          },
        ],
        "text": "(settings: { apiEndpoint: string; apiKey: string; } | { dbHost: string; dbPort: number; dbName: string; }) => void",
      }
    `)
  })

  test('allows filtering specific node module types', () => {
    const sourceFile = project.createSourceFile(
      'test.tsx',
      dedent`
        import * as React from 'react';
  
        type ButtonVariant = 'primary' | 'secondary' | 'danger';
  
        type ButtonProps = {
          variant?: ButtonVariant;
        } & React.ButtonHTMLAttributes<HTMLButtonElement>
  
        export const Button = (props: ButtonProps) => {
          return <button {...props} />
        };
        `,
      { overwrite: true }
    )
    const variableDeclaration =
      sourceFile.getVariableDeclarationOrThrow('Button')
    const types = resolveType(
      variableDeclaration.getType(),
      variableDeclaration
    )
    // TODO: we need to normalize variable declarations with an immediate function expression
    // we might want to capture this as FunctionType kind, but most likely we want to normalize
    // this into Function kind which is essentially a function declaration or a function expression assigned to a variable declaration

    expect(types).toMatchInlineSnapshot(`
      {
        "filePath": "test.tsx",
        "kind": "TypeReference",
        "position": {
          "end": {
            "column": 2,
            "line": 11,
          },
          "start": {
            "column": 14,
            "line": 9,
          },
        },
        "text": "(props: ButtonProps) => React.JSX.Element",
      }
    `)
  })

  test('function types', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
        import * as React from 'react';
  
        export function getExportedTypes() {
          return [
            { 
              /** The name of the component. */ 
              name: 'Button',
  
              /** The description of the component. */
              description: 'A button component' 
            }
          ]
        }
        
        type BaseExportedTypesProps = {
          /** Controls how types are rendered. */
          children?: (
            exportedTypes: ReturnType<typeof getExportedTypes>
          ) => React.ReactNode
        }
  
        type ExportedTypesProps =
          | ({ source: string } & BaseExportedTypesProps)
          | ({ filename: string; value: string } & BaseExportedTypesProps)
        
        function ExportedTypes({ children }: ExportedTypesProps) {}
        `,
      { overwrite: true }
    )
    const functionDeclaration = sourceFile.getFunctionOrThrow('ExportedTypes')
    const types = resolveType(
      functionDeclaration.getType(),
      functionDeclaration
    )

    expect(types).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "Component",
        "name": "ExportedTypes",
        "position": {
          "end": {
            "column": 60,
            "line": 26,
          },
          "start": {
            "column": 1,
            "line": 26,
          },
        },
        "signatures": [
          {
            "filePath": "test.ts",
            "isAsync": false,
            "kind": "ComponentSignature",
            "parameter": {
              "description": undefined,
              "filePath": "test.ts",
              "initializer": undefined,
              "isOptional": false,
              "kind": "Parameter",
              "name": undefined,
              "position": {
                "end": {
                  "column": 56,
                  "line": 26,
                },
                "start": {
                  "column": 24,
                  "line": 26,
                },
              },
              "text": "ExportedTypesProps",
              "type": {
                "kind": "UnionType",
                "text": "{ source: string; } & BaseExportedTypesProps | { filename: string; value: string; } & BaseExportedTypesProps",
                "types": [
                  {
                    "kind": "TypeLiteral",
                    "members": [
                      {
                        "filePath": "test.ts",
                        "isOptional": false,
                        "isReadonly": false,
                        "kind": "PropertySignature",
                        "name": "source",
                        "position": {
                          "end": {
                            "column": 22,
                            "line": 23,
                          },
                          "start": {
                            "column": 8,
                            "line": 23,
                          },
                        },
                        "text": "string",
                        "type": {
                          "kind": "String",
                          "text": "string",
                          "value": undefined,
                        },
                      },
                      {
                        "description": "Controls how types are rendered.",
                        "filePath": "test.ts",
                        "isOptional": true,
                        "isReadonly": false,
                        "kind": "PropertySignature",
                        "name": "children",
                        "position": {
                          "end": {
                            "column": 23,
                            "line": 19,
                          },
                          "start": {
                            "column": 3,
                            "line": 17,
                          },
                        },
                        "tags": undefined,
                        "text": "(exportedTypes: { name: string; description: string; }[]) => ReactNode",
                        "type": {
                          "isAsync": true,
                          "kind": "FunctionType",
                          "parameters": [
                            {
                              "description": undefined,
                              "filePath": "test.ts",
                              "initializer": undefined,
                              "isOptional": false,
                              "kind": "Parameter",
                              "name": "exportedTypes",
                              "position": {
                                "end": {
                                  "column": 55,
                                  "line": 18,
                                },
                                "start": {
                                  "column": 5,
                                  "line": 18,
                                },
                              },
                              "text": "{ name: string; description: string; }[]",
                              "type": {
                                "kind": "TypeReference",
                                "text": "{ name: string; description: string; }[]",
                              },
                            },
                          ],
                          "returnType": {
                            "kind": "UnionType",
                            "text": "string | number | bigint | boolean | ReactElement<unknown, string | JSXElementConstructor<any>> | Iterable<ReactNode> | ReactPortal | Promise<AwaitedReactNode>",
                            "types": [
                              {
                                "kind": "String",
                                "text": "string",
                                "value": undefined,
                              },
                              {
                                "kind": "Number",
                                "text": "number",
                                "value": undefined,
                              },
                              {
                                "kind": "BigInt",
                                "text": "bigint",
                                "value": undefined,
                              },
                              {
                                "kind": "Boolean",
                                "text": "boolean",
                              },
                              {
                                "kind": "TypeReference",
                                "text": "ReactElement<unknown, string | JSXElementConstructor<any>>",
                              },
                              {
                                "kind": "TypeReference",
                                "text": "Iterable<ReactNode>",
                              },
                              {
                                "kind": "TypeReference",
                                "text": "ReactPortal",
                              },
                              {
                                "kind": "TypeReference",
                                "text": "Promise<AwaitedReactNode>",
                              },
                            ],
                          },
                          "text": "(exportedTypes: { name: string; description: string; }[]) => ReactNode",
                        },
                      },
                    ],
                    "text": "{ source: string; } & BaseExportedTypesProps",
                  },
                  {
                    "kind": "TypeLiteral",
                    "members": [
                      {
                        "filePath": "test.ts",
                        "isOptional": false,
                        "isReadonly": false,
                        "kind": "PropertySignature",
                        "name": "filename",
                        "position": {
                          "end": {
                            "column": 25,
                            "line": 24,
                          },
                          "start": {
                            "column": 8,
                            "line": 24,
                          },
                        },
                        "text": "string",
                        "type": {
                          "kind": "String",
                          "text": "string",
                          "value": undefined,
                        },
                      },
                      {
                        "filePath": "test.ts",
                        "isOptional": false,
                        "isReadonly": false,
                        "kind": "PropertySignature",
                        "name": "value",
                        "position": {
                          "end": {
                            "column": 39,
                            "line": 24,
                          },
                          "start": {
                            "column": 26,
                            "line": 24,
                          },
                        },
                        "text": "string",
                        "type": {
                          "kind": "String",
                          "text": "string",
                          "value": undefined,
                        },
                      },
                      {
                        "description": "Controls how types are rendered.",
                        "filePath": "test.ts",
                        "isOptional": true,
                        "isReadonly": false,
                        "kind": "PropertySignature",
                        "name": "children",
                        "position": {
                          "end": {
                            "column": 23,
                            "line": 19,
                          },
                          "start": {
                            "column": 3,
                            "line": 17,
                          },
                        },
                        "tags": undefined,
                        "text": "(exportedTypes: { name: string; description: string; }[]) => ReactNode",
                        "type": {
                          "isAsync": true,
                          "kind": "FunctionType",
                          "parameters": [
                            {
                              "description": undefined,
                              "filePath": "test.ts",
                              "initializer": undefined,
                              "isOptional": false,
                              "kind": "Parameter",
                              "name": "exportedTypes",
                              "position": {
                                "end": {
                                  "column": 55,
                                  "line": 18,
                                },
                                "start": {
                                  "column": 5,
                                  "line": 18,
                                },
                              },
                              "text": "{ name: string; description: string; }[]",
                              "type": {
                                "kind": "TypeReference",
                                "text": "{ name: string; description: string; }[]",
                              },
                            },
                          ],
                          "returnType": {
                            "kind": "UnionType",
                            "text": "string | number | bigint | boolean | ReactElement<unknown, string | JSXElementConstructor<any>> | Iterable<ReactNode> | ReactPortal | Promise<AwaitedReactNode>",
                            "types": [
                              {
                                "kind": "String",
                                "text": "string",
                                "value": undefined,
                              },
                              {
                                "kind": "Number",
                                "text": "number",
                                "value": undefined,
                              },
                              {
                                "kind": "BigInt",
                                "text": "bigint",
                                "value": undefined,
                              },
                              {
                                "kind": "Boolean",
                                "text": "boolean",
                              },
                              {
                                "kind": "TypeReference",
                                "text": "ReactElement<unknown, string | JSXElementConstructor<any>>",
                              },
                              {
                                "kind": "TypeReference",
                                "text": "Iterable<ReactNode>",
                              },
                              {
                                "kind": "TypeReference",
                                "text": "ReactPortal",
                              },
                              {
                                "kind": "TypeReference",
                                "text": "Promise<AwaitedReactNode>",
                              },
                            ],
                          },
                          "text": "(exportedTypes: { name: string; description: string; }[]) => ReactNode",
                        },
                      },
                    ],
                    "text": "{ filename: string; value: string; } & BaseExportedTypesProps",
                  },
                ],
              },
            },
            "position": {
              "end": {
                "column": 60,
                "line": 26,
              },
              "start": {
                "column": 1,
                "line": 26,
              },
            },
            "returnType": {
              "kind": "Void",
              "text": "void",
            },
            "text": "function ExportedTypes(ExportedTypesProps): void",
          },
        ],
        "text": "({ children }: ExportedTypesProps) => void",
      }
    `)
  })

  test('accepts mixed types', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
        export class Counter {
          count: number = 0;
  
          increment() {
            this.count++;
          }
        }
  
        export function useCounter() {
          const counter = new Counter();
          return counter;
        }
        `,
      { overwrite: true }
    )
    const nodes = Array.from(sourceFile.getExportedDeclarations()).map(
      ([, [declaration]]) => declaration
    ) as (FunctionDeclaration | ClassDeclaration)[]

    nodes
      .map((node) => resolveType(node.getType(), node))
      .forEach((doc) => {
        if (doc?.kind === 'Class') {
          doc.accessors
          // @ts-expect-error - should not have parameters
          doc.parameters
        }
        if (doc?.kind === 'Function') {
          doc.signatures.at(0)!.parameters
          // @ts-expect-error - should not have accessors
          doc.accessors
        }
      })
  })

  test('printing imported node module union types', () => {
    project.createSourceFile(
      'node_modules/library/index.d.ts',
      dedent`
        export type InterfaceMetadata = {
          kind: 'Interface'
          name: string
        }
        `
    )

    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
        import type { InterfaceMetadata } from 'library'
  
        type TypeAliasMetadata = {
          kind: 'TypeAlias'
          name: string
        }
  
        type AllMetadata = InterfaceMetadata | TypeAliasMetadata
        `,
      { overwrite: true }
    )
    const typeAliasDeclaration = sourceFile.getTypeAliasOrThrow('AllMetadata')
    const types = resolveType(
      typeAliasDeclaration.getType(),
      typeAliasDeclaration
    )

    expect(types).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "TypeAlias",
        "name": "AllMetadata",
        "parameters": [],
        "position": {
          "end": {
            "column": 57,
            "line": 8,
          },
          "start": {
            "column": 1,
            "line": 8,
          },
        },
        "text": "AllMetadata",
        "type": {
          "kind": "UnionType",
          "text": "InterfaceMetadata | TypeAliasMetadata",
          "types": [
            {
              "kind": "TypeReference",
              "text": "InterfaceMetadata",
            },
            {
              "kind": "TypeLiteral",
              "members": [
                {
                  "filePath": "test.ts",
                  "isOptional": false,
                  "isReadonly": false,
                  "kind": "PropertySignature",
                  "name": "kind",
                  "position": {
                    "end": {
                      "column": 20,
                      "line": 4,
                    },
                    "start": {
                      "column": 3,
                      "line": 4,
                    },
                  },
                  "text": ""TypeAlias"",
                  "type": {
                    "kind": "String",
                    "text": ""TypeAlias"",
                    "value": "TypeAlias",
                  },
                },
                {
                  "filePath": "test.ts",
                  "isOptional": false,
                  "isReadonly": false,
                  "kind": "PropertySignature",
                  "name": "name",
                  "position": {
                    "end": {
                      "column": 15,
                      "line": 5,
                    },
                    "start": {
                      "column": 3,
                      "line": 5,
                    },
                  },
                  "text": "string",
                  "type": {
                    "kind": "String",
                    "text": "string",
                    "value": undefined,
                  },
                },
              ],
              "text": "TypeAliasMetadata",
            },
          ],
        },
      }
    `)
  })

  test('variable declaration with primitive value', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
        /**
         * The initial count of the counter.
         * @internal only for internal use
         */
        export const initialCount = 0
        `,
      { overwrite: true }
    )
    const variableDeclaration =
      sourceFile.getVariableDeclarationOrThrow('initialCount')
    const types = resolveType(
      variableDeclaration.getType(),
      variableDeclaration
    )

    expect(types).toMatchInlineSnapshot(`
      {
        "description": "The initial count of the counter.",
        "filePath": "test.ts",
        "kind": "TypeReference",
        "position": {
          "end": {
            "column": 30,
            "line": 5,
          },
          "start": {
            "column": 14,
            "line": 5,
          },
        },
        "tags": [
          {
            "name": "internal",
            "text": "only for internal use",
          },
        ],
        "text": "0",
      }
    `)
  })

  test('variable declaration with "as const" object', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
        export const colors = {
          primary: '#ff0000',
          secondary: '#00ff00',
          tertiary: '#0000ff'
        } as const
        `,
      { overwrite: true }
    )
    const variableDeclaration =
      sourceFile.getVariableDeclarationOrThrow('colors')
    const types = resolveType(
      variableDeclaration.getType(),
      variableDeclaration
    )

    expect(types).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "TypeReference",
        "position": {
          "end": {
            "column": 11,
            "line": 5,
          },
          "start": {
            "column": 14,
            "line": 1,
          },
        },
        "text": "{ readonly primary: "#ff0000"; readonly secondary: "#00ff00"; readonly tertiary: "#0000ff"; }",
      }
    `)
  })

  test('unknown initializers', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
        class Counter {
          count: number = 0;
          increment() {
            this.count++;
          }
        }
  
        const counter = new Counter();
        const promise = new Promise<number>((resolve) => resolve(0));
        const awaited = await promise;
        `,
      { overwrite: true }
    )
    const counterVariable = sourceFile.getVariableDeclarationOrThrow('counter')
    const counterTypes = resolveType(counterVariable.getType(), counterVariable)
    const promiseVariable = sourceFile.getVariableDeclarationOrThrow('promise')
    const promiseTypes = resolveType(promiseVariable.getType(), promiseVariable)
    const awaitedVariable = sourceFile.getVariableDeclarationOrThrow('awaited')
    const awaitedTypes = resolveType(awaitedVariable.getType(), awaitedVariable)

    expect({ counterTypes, promiseTypes, awaitedTypes }).toMatchInlineSnapshot(`
      {
        "awaitedTypes": {
          "filePath": "test.ts",
          "kind": "TypeReference",
          "position": {
            "end": {
              "column": 30,
              "line": 10,
            },
            "start": {
              "column": 7,
              "line": 10,
            },
          },
          "text": "number",
        },
        "counterTypes": {
          "filePath": "test.ts",
          "kind": "TypeReference",
          "position": {
            "end": {
              "column": 30,
              "line": 8,
            },
            "start": {
              "column": 7,
              "line": 8,
            },
          },
          "text": "Counter",
        },
        "promiseTypes": {
          "filePath": "test.ts",
          "kind": "TypeReference",
          "position": {
            "end": {
              "column": 61,
              "line": 9,
            },
            "start": {
              "column": 7,
              "line": 9,
            },
          },
          "text": "Promise<number>",
        },
      }
    `)
  })

  test('mixed union reference and intersection', () => {
    const sourceFile = project.createSourceFile(
      `test.ts`,
      dedent`
        export interface StringType {
          kind: 'String'
        }
  
        export interface BooleanType {
          kind: 'Boolean'
        }
  
        export type AllTypes = StringType | BooleanType
  
        type Foo = AllTypes & { value: string | boolean, getValue(): string | boolean }
        `,
      { overwrite: true }
    )

    const typeAlias = sourceFile.getTypeAliasOrThrow('Foo')

    const types = resolveType(typeAlias.getType(), typeAlias)

    expect(types).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "TypeAlias",
        "name": "Foo",
        "parameters": [],
        "position": {
          "end": {
            "column": 80,
            "line": 11,
          },
          "start": {
            "column": 1,
            "line": 11,
          },
        },
        "text": "Foo",
        "type": {
          "kind": "UnionType",
          "text": "StringType & { value: string | boolean; getValue(): string | boolean; } | BooleanType & { value: string | boolean; getValue(): string | boolean; }",
          "types": [
            {
              "kind": "TypeLiteral",
              "members": [
                {
                  "filePath": "test.ts",
                  "isOptional": false,
                  "isReadonly": false,
                  "kind": "PropertySignature",
                  "name": "kind",
                  "position": {
                    "end": {
                      "column": 17,
                      "line": 2,
                    },
                    "start": {
                      "column": 3,
                      "line": 2,
                    },
                  },
                  "text": ""String"",
                  "type": {
                    "kind": "String",
                    "text": ""String"",
                    "value": "String",
                  },
                },
                {
                  "filePath": "test.ts",
                  "isOptional": false,
                  "isReadonly": false,
                  "kind": "PropertySignature",
                  "name": "value",
                  "position": {
                    "end": {
                      "column": 49,
                      "line": 11,
                    },
                    "start": {
                      "column": 25,
                      "line": 11,
                    },
                  },
                  "text": "string | boolean",
                  "type": {
                    "kind": "UnionType",
                    "text": "string | boolean",
                    "types": [
                      {
                        "kind": "String",
                        "text": "string",
                        "value": undefined,
                      },
                      {
                        "kind": "Boolean",
                        "text": "boolean",
                      },
                    ],
                  },
                },
                {
                  "filePath": "test.ts",
                  "isOptional": false,
                  "isReadonly": false,
                  "kind": "PropertySignature",
                  "name": "getValue",
                  "position": {
                    "end": {
                      "column": 78,
                      "line": 11,
                    },
                    "start": {
                      "column": 50,
                      "line": 11,
                    },
                  },
                  "text": "() => string | boolean",
                  "type": {
                    "isAsync": false,
                    "kind": "FunctionType",
                    "parameters": [],
                    "returnType": {
                      "kind": "TypeReference",
                      "text": "string | boolean",
                    },
                    "text": "() => string | boolean",
                  },
                },
              ],
              "text": "StringType & { value: string | boolean; getValue(): string | boolean; }",
            },
            {
              "kind": "IntersectionType",
              "text": "BooleanType & { value: string | boolean; getValue(): string | boolean; }",
              "types": [
                {
                  "kind": "TypeLiteral",
                  "members": [
                    {
                      "filePath": "test.ts",
                      "isOptional": false,
                      "isReadonly": false,
                      "kind": "PropertySignature",
                      "name": "kind",
                      "position": {
                        "end": {
                          "column": 18,
                          "line": 6,
                        },
                        "start": {
                          "column": 3,
                          "line": 6,
                        },
                      },
                      "text": ""Boolean"",
                      "type": {
                        "kind": "String",
                        "text": ""Boolean"",
                        "value": "Boolean",
                      },
                    },
                  ],
                  "text": "BooleanType",
                },
                {
                  "kind": "TypeReference",
                  "text": "{ value: string | boolean; getValue(): string | boolean; }",
                },
              ],
            },
          ],
        },
      }
    `)
  })

  test('generic parameters', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
      declare function loggedMethod<Args extends string[]>(...args: Args): void;`,
      { overwrite: true }
    )
    const classDeclaration = sourceFile.getFunctionOrThrow('loggedMethod')
    const types = resolveType(classDeclaration.getType(), classDeclaration)

    expect(types).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "Function",
        "name": "loggedMethod",
        "position": {
          "end": {
            "column": 75,
            "line": 1,
          },
          "start": {
            "column": 1,
            "line": 1,
          },
        },
        "signatures": [
          {
            "filePath": "test.ts",
            "isAsync": false,
            "isGenerator": false,
            "kind": "FunctionSignature",
            "parameters": [
              {
                "description": undefined,
                "filePath": "test.ts",
                "initializer": undefined,
                "isOptional": false,
                "kind": "Parameter",
                "name": "args",
                "position": {
                  "end": {
                    "column": 67,
                    "line": 1,
                  },
                  "start": {
                    "column": 54,
                    "line": 1,
                  },
                },
                "text": "Args",
                "type": {
                  "kind": "TypeReference",
                  "text": "Args",
                },
              },
            ],
            "position": {
              "end": {
                "column": 75,
                "line": 1,
              },
              "start": {
                "column": 1,
                "line": 1,
              },
            },
            "returnType": {
              "kind": "Void",
              "text": "void",
            },
            "text": "function loggedMethod<Args extends string[]>(args: Args): void",
            "typeParameters": [
              {
                "constraint": {
                  "kind": "TypeReference",
                  "text": "string[]",
                },
                "defaultType": undefined,
                "kind": "TypeParameter",
                "name": "Args",
                "text": "Args extends string[]",
              },
            ],
          },
        ],
        "text": "<Args extends string[]>(...args: Args) => void",
      }
    `)
  })

  test('class decorators', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
      function loggedMethod<This, Args extends any[], Return>(
        target: (this: This, ...args: Args) => Return,
        context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Return>
      ) {
        return function replacementMethod(this: This, ...args: Args): Return {
            console.log("Entering method")
            const result = target.call(this, ...args);
            console.log("Exiting method")
            return result;
        }
      }

      class Person {
        @loggedMethod
        greet(name: string) {
          return "Hello, " + name
        }
      }`,
      { overwrite: true }
    )
    const classDeclaration = sourceFile.getClassOrThrow('Person')
    const types = resolveType(classDeclaration.getType(), classDeclaration)

    expect(types).toMatchInlineSnapshot(`
      {
        "constructor": undefined,
        "filePath": "test.ts",
        "kind": "Class",
        "methods": [
          {
            "kind": "ClassMethod",
            "name": "greet",
            "scope": undefined,
            "signatures": [
              {
                "filePath": "test.ts",
                "isAsync": false,
                "isGenerator": false,
                "kind": "FunctionSignature",
                "parameters": [
                  {
                    "description": undefined,
                    "filePath": "test.ts",
                    "initializer": undefined,
                    "isOptional": false,
                    "kind": "Parameter",
                    "name": "name",
                    "position": {
                      "end": {
                        "column": 21,
                        "line": 15,
                      },
                      "start": {
                        "column": 9,
                        "line": 15,
                      },
                    },
                    "text": "string",
                    "type": {
                      "kind": "String",
                      "text": "string",
                      "value": undefined,
                    },
                  },
                ],
                "position": {
                  "end": {
                    "column": 4,
                    "line": 17,
                  },
                  "start": {
                    "column": 3,
                    "line": 14,
                  },
                },
                "returnType": {
                  "kind": "String",
                  "text": "string",
                  "value": undefined,
                },
                "text": "(name: string) => string",
              },
            ],
            "text": "(name: string) => string",
            "visibility": undefined,
          },
        ],
        "name": "Person",
        "position": {
          "end": {
            "column": 2,
            "line": 18,
          },
          "start": {
            "column": 1,
            "line": 13,
          },
        },
        "text": "Person",
      }
    `)
  })

  test('overloads', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
      type Loader<Types> = (path: string) => Promise<Types>;

      type Schema<Types extends Record<string, any>> = {
        [Key in keyof Types]: (value: Types[Key]) => boolean | void;
      };

      /** A loader function. */
      function withSchema<Types>(loader: Loader<Types>): Loader<Types>;

      /** A schema and a loader function. */
      function withSchema<Types extends Record<string, any>>(
        schema: Schema<Types>,
        loader: Loader<{ [Key in keyof Types]: Types[Key] }>
      ): Loader<{ [Key in keyof Types]: Types[Key] }>;

      /** Implementation of withSchema handling both overloads. */
      function withSchema<Types extends Record<string, any>>(
        a: Schema<Types> | Loader<any>,
        b?: Loader<any>
      ): Loader<any> {
      return undefined as any
      }
      `,
      { overwrite: true }
    )
    const functionDeclaration = sourceFile.getFunctionOrThrow('withSchema')
    const types = resolveType(
      functionDeclaration.getType(),
      functionDeclaration
    )

    expect(types).toMatchInlineSnapshot(`
      {
        "description": "Implementation of withSchema handling both overloads.",
        "filePath": "test.ts",
        "kind": "Function",
        "name": "withSchema",
        "position": {
          "end": {
            "column": 2,
            "line": 22,
          },
          "start": {
            "column": 1,
            "line": 17,
          },
        },
        "signatures": [
          {
            "description": "A loader function.",
            "filePath": "test.ts",
            "isAsync": false,
            "isGenerator": false,
            "kind": "FunctionSignature",
            "parameters": [
              {
                "description": undefined,
                "filePath": "test.ts",
                "initializer": undefined,
                "isOptional": false,
                "kind": "Parameter",
                "name": "loader",
                "position": {
                  "end": {
                    "column": 49,
                    "line": 8,
                  },
                  "start": {
                    "column": 28,
                    "line": 8,
                  },
                },
                "text": "Loader<Types>",
                "type": {
                  "isAsync": true,
                  "kind": "FunctionType",
                  "parameters": [
                    {
                      "description": undefined,
                      "filePath": "test.ts",
                      "initializer": undefined,
                      "isOptional": false,
                      "kind": "Parameter",
                      "name": "path",
                      "position": {
                        "end": {
                          "column": 35,
                          "line": 1,
                        },
                        "start": {
                          "column": 23,
                          "line": 1,
                        },
                      },
                      "text": "string",
                      "type": {
                        "kind": "String",
                        "text": "string",
                        "value": undefined,
                      },
                    },
                  ],
                  "returnType": {
                    "kind": "TypeReference",
                    "text": "Promise<Types>",
                  },
                  "text": "Loader<Types>",
                },
              },
            ],
            "position": {
              "end": {
                "column": 66,
                "line": 8,
              },
              "start": {
                "column": 1,
                "line": 8,
              },
            },
            "returnType": {
              "isAsync": true,
              "kind": "FunctionType",
              "parameters": [
                {
                  "description": undefined,
                  "filePath": "test.ts",
                  "initializer": undefined,
                  "isOptional": false,
                  "kind": "Parameter",
                  "name": "path",
                  "position": {
                    "end": {
                      "column": 35,
                      "line": 1,
                    },
                    "start": {
                      "column": 23,
                      "line": 1,
                    },
                  },
                  "text": "string",
                  "type": {
                    "kind": "String",
                    "text": "string",
                    "value": undefined,
                  },
                },
              ],
              "returnType": {
                "kind": "TypeReference",
                "text": "Promise<Types>",
              },
              "text": "Loader<Types>",
            },
            "tags": undefined,
            "text": "function withSchema<Types>(loader: Loader<Types>): Loader<Types>",
            "typeParameters": [
              {
                "constraint": undefined,
                "defaultType": undefined,
                "kind": "TypeParameter",
                "name": "Types",
                "text": "Types",
              },
            ],
          },
          {
            "description": "A schema and a loader function.",
            "filePath": "test.ts",
            "isAsync": false,
            "isGenerator": false,
            "kind": "FunctionSignature",
            "parameters": [
              {
                "description": undefined,
                "filePath": "test.ts",
                "initializer": undefined,
                "isOptional": false,
                "kind": "Parameter",
                "name": "loader",
                "position": {
                  "end": {
                    "column": 55,
                    "line": 13,
                  },
                  "start": {
                    "column": 3,
                    "line": 13,
                  },
                },
                "text": "Loader<{ [Key in keyof Types]: Types[Key]; }>",
                "type": {
                  "isAsync": true,
                  "kind": "FunctionType",
                  "parameters": [
                    {
                      "description": undefined,
                      "filePath": "test.ts",
                      "initializer": undefined,
                      "isOptional": false,
                      "kind": "Parameter",
                      "name": "path",
                      "position": {
                        "end": {
                          "column": 35,
                          "line": 1,
                        },
                        "start": {
                          "column": 23,
                          "line": 1,
                        },
                      },
                      "text": "string",
                      "type": {
                        "kind": "String",
                        "text": "string",
                        "value": undefined,
                      },
                    },
                  ],
                  "returnType": {
                    "kind": "TypeReference",
                    "text": "Promise<{ [Key in keyof Types]: Types[Key]; }>",
                  },
                  "text": "Loader<{ [Key in keyof Types]: Types[Key]; }>",
                },
              },
            ],
            "position": {
              "end": {
                "column": 49,
                "line": 14,
              },
              "start": {
                "column": 1,
                "line": 11,
              },
            },
            "returnType": {
              "isAsync": true,
              "kind": "FunctionType",
              "parameters": [
                {
                  "description": undefined,
                  "filePath": "test.ts",
                  "initializer": undefined,
                  "isOptional": false,
                  "kind": "Parameter",
                  "name": "path",
                  "position": {
                    "end": {
                      "column": 35,
                      "line": 1,
                    },
                    "start": {
                      "column": 23,
                      "line": 1,
                    },
                  },
                  "text": "string",
                  "type": {
                    "kind": "String",
                    "text": "string",
                    "value": undefined,
                  },
                },
              ],
              "returnType": {
                "kind": "TypeReference",
                "text": "Promise<{ [Key in keyof Types]: Types[Key]; }>",
              },
              "text": "Loader<{ [Key in keyof Types]: Types[Key]; }>",
            },
            "tags": undefined,
            "text": "function withSchema<Types extends Record<string, any>>(loader: Loader<{ [Key in keyof Types]: Types[Key]; }>): Loader<{ [Key in keyof Types]: Types[Key]; }>",
            "typeParameters": [
              {
                "constraint": {
                  "kind": "TypeReference",
                  "text": "Record<string, any>",
                },
                "defaultType": undefined,
                "kind": "TypeParameter",
                "name": "Types",
                "text": "Types extends Record<string, any>",
              },
            ],
          },
        ],
        "tags": undefined,
        "text": "{ <Types>(loader: Loader<Types>): Loader<Types>; <Types extends Record<string, any>>(schema: Schema<Types>, loader: Loader<{ [Key in keyof Types]: Types[Key]; }>): Loader<{ [Key in keyof Types]: Types[Key]; }>; }",
      }
    `)
  })

  test('property references work with strict null checks', () => {
    const project = new Project({
      compilerOptions: {
        strictNullChecks: true,
      },
    })
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
  import React from 'react'
  
  /** All appearance variants supported by \`Button\`. */
  export type ButtonVariant = 'primary' | 'secondary' | 'danger'
  
  export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    /** Visual style to apply. */
    variant?: ButtonVariant
  }

  /** A minimal, accessible button that follows design‑system color tokens. */
  export function Button({
    variant = 'primary',
    className = '',
    children,
    ...props
  }: ButtonProps) {
    return (
      <button
        {...props}
      >
        {children}
      </button>
    )
  }
  `,
      { overwrite: true }
    )
    const exportedDeclarations = sourceFile.getExportedDeclarations()
    const exportedTypes = Array.from(exportedDeclarations.entries()).map(
      ([name, declarations]) => [
        name,
        declarations.map((declaration) =>
          resolveType(declaration.getType(), declaration)
        ),
      ]
    )

    expect(exportedTypes).toMatchInlineSnapshot(`
      [
        [
          "Button",
          [
            {
              "description": "A minimal, accessible button that follows design‑system color tokens.",
              "filePath": "test.ts",
              "kind": "Component",
              "name": "Button",
              "position": {
                "end": {
                  "column": 2,
                  "line": 26,
                },
                "start": {
                  "column": 1,
                  "line": 13,
                },
              },
              "signatures": [
                {
                  "description": "A minimal, accessible button that follows design‑system color tokens.",
                  "filePath": "test.ts",
                  "isAsync": false,
                  "kind": "ComponentSignature",
                  "parameter": {
                    "description": undefined,
                    "filePath": "test.ts",
                    "initializer": {
                      "text": "",
                      "value": {
                        "className": "",
                        "variant": "primary",
                      },
                    },
                    "isOptional": false,
                    "kind": "Parameter",
                    "name": undefined,
                    "position": {
                      "end": {
                        "column": 15,
                        "line": 18,
                      },
                      "start": {
                        "column": 24,
                        "line": 13,
                      },
                    },
                    "text": "ButtonProps",
                    "type": {
                      "filePath": "test.ts",
                      "kind": "TypeReference",
                      "position": {
                        "end": {
                          "column": 2,
                          "line": 10,
                        },
                        "start": {
                          "column": 1,
                          "line": 6,
                        },
                      },
                      "text": "ButtonProps",
                    },
                  },
                  "position": {
                    "end": {
                      "column": 2,
                      "line": 26,
                    },
                    "start": {
                      "column": 1,
                      "line": 13,
                    },
                  },
                  "returnType": {
                    "kind": "Boolean",
                    "text": "boolean",
                  },
                  "tags": undefined,
                  "text": "function Button(ButtonProps): boolean",
                },
              ],
              "tags": undefined,
              "text": "({ variant, className, children, ...props }: ButtonProps) => boolean",
            },
          ],
        ],
        [
          "ButtonVariant",
          [
            {
              "description": "All appearance variants supported by \`Button\`.",
              "filePath": "test.ts",
              "kind": "TypeAlias",
              "name": "ButtonVariant",
              "parameters": [],
              "position": {
                "end": {
                  "column": 63,
                  "line": 4,
                },
                "start": {
                  "column": 1,
                  "line": 4,
                },
              },
              "tags": undefined,
              "text": "ButtonVariant",
              "type": {
                "kind": "UnionType",
                "text": ""primary" | "secondary" | "danger"",
                "types": [
                  {
                    "kind": "String",
                    "text": ""primary"",
                    "value": "primary",
                  },
                  {
                    "kind": "String",
                    "text": ""secondary"",
                    "value": "secondary",
                  },
                  {
                    "kind": "String",
                    "text": ""danger"",
                    "value": "danger",
                  },
                ],
              },
            },
          ],
        ],
        [
          "ButtonProps",
          [
            {
              "filePath": "test.ts",
              "kind": "Interface",
              "members": [
                {
                  "description": "Visual style to apply.",
                  "filePath": "test.ts",
                  "isOptional": true,
                  "isReadonly": false,
                  "kind": "PropertySignature",
                  "name": "variant",
                  "position": {
                    "end": {
                      "column": 26,
                      "line": 9,
                    },
                    "start": {
                      "column": 3,
                      "line": 9,
                    },
                  },
                  "tags": undefined,
                  "text": "ButtonVariant | undefined",
                  "type": {
                    "kind": "UnionType",
                    "text": "undefined | "primary" | "secondary" | "danger"",
                    "types": [
                      {
                        "kind": "Undefined",
                        "text": "undefined",
                      },
                      {
                        "kind": "TypeReference",
                        "text": ""primary"",
                      },
                      {
                        "kind": "TypeReference",
                        "text": ""secondary"",
                      },
                      {
                        "kind": "TypeReference",
                        "text": ""danger"",
                      },
                    ],
                  },
                },
              ],
              "name": "ButtonProps",
              "position": {
                "end": {
                  "column": 2,
                  "line": 10,
                },
                "start": {
                  "column": 1,
                  "line": 6,
                },
              },
              "text": "ButtonProps",
            },
          ],
        ],
      ]
    `)
  })

  test('mapped types', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
      export type SemanticTags =
        | 'section'
        | 'h2'
        | 'h3'
        | 'h4'
        | 'p'
        | 'dl'
        | 'dt'
        | 'dd'
        | 'table'
        | 'thead'
        | 'tbody'
        | 'tr'
        | 'th'
        | 'td'
        | 'details'
        | 'summary'
        | 'code'

      interface MarkdownProps {
        children: React.ReactNode
      }

      export type TypeReferenceComponents = {
        [Tag in SemanticTags]: Tag | React.ComponentType<React.ComponentProps<Tag>>
      } & {
        Markdown: React.ComponentType<MarkdownProps>
      }
    `,
      { overwrite: true }
    )
    const typeAlias = sourceFile.getTypeAliasOrThrow('TypeReferenceComponents')
    const types = resolveType(typeAlias.getType(), typeAlias)

    expect(types).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "TypeAlias",
        "name": "TypeReferenceComponents",
        "parameters": [],
        "position": {
          "end": {
            "column": 2,
            "line": 28,
          },
          "start": {
            "column": 1,
            "line": 24,
          },
        },
        "text": "TypeReferenceComponents",
        "type": {
          "kind": "TypeLiteral",
          "members": [
            {
              "filePath": "test.ts",
              "isOptional": false,
              "isReadonly": false,
              "kind": "PropertySignature",
              "name": "section",
              "position": {
                "end": {
                  "column": 2,
                  "line": 26,
                },
                "start": {
                  "column": 39,
                  "line": 24,
                },
              },
              "text": ""section" | ComponentType<DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>>",
              "type": {
                "kind": "UnionType",
                "text": ""section" | ComponentClass<DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>, any> | FunctionComponent<DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>>",
                "types": [
                  {
                    "kind": "String",
                    "text": ""section"",
                    "value": "section",
                  },
                  {
                    "kind": "TypeReference",
                    "text": "ComponentClass<DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>, any>",
                  },
                  {
                    "kind": "TypeReference",
                    "text": "FunctionComponent<DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>>",
                  },
                ],
              },
            },
            {
              "filePath": "test.ts",
              "isOptional": false,
              "isReadonly": false,
              "kind": "PropertySignature",
              "name": "h2",
              "position": {
                "end": {
                  "column": 2,
                  "line": 26,
                },
                "start": {
                  "column": 39,
                  "line": 24,
                },
              },
              "text": ""h2" | ComponentType<DetailedHTMLProps<HTMLAttributes<HTMLHeadingElement>, HTMLHeadingElement>>",
              "type": {
                "kind": "UnionType",
                "text": ""h2" | ComponentClass<DetailedHTMLProps<HTMLAttributes<HTMLHeadingElement>, HTMLHeadingElement>, any> | FunctionComponent<DetailedHTMLProps<HTMLAttributes<HTMLHeadingElement>, HTMLHeadingElement>>",
                "types": [
                  {
                    "kind": "String",
                    "text": ""h2"",
                    "value": "h2",
                  },
                  {
                    "kind": "TypeReference",
                    "text": "ComponentClass<DetailedHTMLProps<HTMLAttributes<HTMLHeadingElement>, HTMLHeadingElement>, any>",
                  },
                  {
                    "kind": "TypeReference",
                    "text": "FunctionComponent<DetailedHTMLProps<HTMLAttributes<HTMLHeadingElement>, HTMLHeadingElement>>",
                  },
                ],
              },
            },
            {
              "filePath": "test.ts",
              "isOptional": false,
              "isReadonly": false,
              "kind": "PropertySignature",
              "name": "h3",
              "position": {
                "end": {
                  "column": 2,
                  "line": 26,
                },
                "start": {
                  "column": 39,
                  "line": 24,
                },
              },
              "text": ""h3" | ComponentType<DetailedHTMLProps<HTMLAttributes<HTMLHeadingElement>, HTMLHeadingElement>>",
              "type": {
                "kind": "UnionType",
                "text": ""h3" | ComponentClass<DetailedHTMLProps<HTMLAttributes<HTMLHeadingElement>, HTMLHeadingElement>, any> | FunctionComponent<DetailedHTMLProps<HTMLAttributes<HTMLHeadingElement>, HTMLHeadingElement>>",
                "types": [
                  {
                    "kind": "String",
                    "text": ""h3"",
                    "value": "h3",
                  },
                  {
                    "kind": "TypeReference",
                    "text": "ComponentClass<DetailedHTMLProps<HTMLAttributes<HTMLHeadingElement>, HTMLHeadingElement>, any>",
                  },
                  {
                    "kind": "TypeReference",
                    "text": "FunctionComponent<DetailedHTMLProps<HTMLAttributes<HTMLHeadingElement>, HTMLHeadingElement>>",
                  },
                ],
              },
            },
            {
              "filePath": "test.ts",
              "isOptional": false,
              "isReadonly": false,
              "kind": "PropertySignature",
              "name": "h4",
              "position": {
                "end": {
                  "column": 2,
                  "line": 26,
                },
                "start": {
                  "column": 39,
                  "line": 24,
                },
              },
              "text": ""h4" | ComponentType<DetailedHTMLProps<HTMLAttributes<HTMLHeadingElement>, HTMLHeadingElement>>",
              "type": {
                "kind": "UnionType",
                "text": ""h4" | ComponentClass<DetailedHTMLProps<HTMLAttributes<HTMLHeadingElement>, HTMLHeadingElement>, any> | FunctionComponent<DetailedHTMLProps<HTMLAttributes<HTMLHeadingElement>, HTMLHeadingElement>>",
                "types": [
                  {
                    "kind": "String",
                    "text": ""h4"",
                    "value": "h4",
                  },
                  {
                    "kind": "TypeReference",
                    "text": "ComponentClass<DetailedHTMLProps<HTMLAttributes<HTMLHeadingElement>, HTMLHeadingElement>, any>",
                  },
                  {
                    "kind": "TypeReference",
                    "text": "FunctionComponent<DetailedHTMLProps<HTMLAttributes<HTMLHeadingElement>, HTMLHeadingElement>>",
                  },
                ],
              },
            },
            {
              "filePath": "test.ts",
              "isOptional": false,
              "isReadonly": false,
              "kind": "PropertySignature",
              "name": "p",
              "position": {
                "end": {
                  "column": 2,
                  "line": 26,
                },
                "start": {
                  "column": 39,
                  "line": 24,
                },
              },
              "text": ""p" | ComponentType<DetailedHTMLProps<HTMLAttributes<HTMLParagraphElement>, HTMLParagraphElement>>",
              "type": {
                "kind": "UnionType",
                "text": ""p" | ComponentClass<DetailedHTMLProps<HTMLAttributes<HTMLParagraphElement>, HTMLParagraphElement>, any> | FunctionComponent<DetailedHTMLProps<HTMLAttributes<HTMLParagraphElement>, HTMLParagraphElement>>",
                "types": [
                  {
                    "kind": "String",
                    "text": ""p"",
                    "value": "p",
                  },
                  {
                    "kind": "TypeReference",
                    "text": "ComponentClass<DetailedHTMLProps<HTMLAttributes<HTMLParagraphElement>, HTMLParagraphElement>, any>",
                  },
                  {
                    "kind": "TypeReference",
                    "text": "FunctionComponent<DetailedHTMLProps<HTMLAttributes<HTMLParagraphElement>, HTMLParagraphElement>>",
                  },
                ],
              },
            },
            {
              "filePath": "test.ts",
              "isOptional": false,
              "isReadonly": false,
              "kind": "PropertySignature",
              "name": "dl",
              "position": {
                "end": {
                  "column": 2,
                  "line": 26,
                },
                "start": {
                  "column": 39,
                  "line": 24,
                },
              },
              "text": ""dl" | ComponentType<DetailedHTMLProps<HTMLAttributes<HTMLDListElement>, HTMLDListElement>>",
              "type": {
                "kind": "UnionType",
                "text": ""dl" | ComponentClass<DetailedHTMLProps<HTMLAttributes<HTMLDListElement>, HTMLDListElement>, any> | FunctionComponent<DetailedHTMLProps<HTMLAttributes<HTMLDListElement>, HTMLDListElement>>",
                "types": [
                  {
                    "kind": "String",
                    "text": ""dl"",
                    "value": "dl",
                  },
                  {
                    "kind": "TypeReference",
                    "text": "ComponentClass<DetailedHTMLProps<HTMLAttributes<HTMLDListElement>, HTMLDListElement>, any>",
                  },
                  {
                    "kind": "TypeReference",
                    "text": "FunctionComponent<DetailedHTMLProps<HTMLAttributes<HTMLDListElement>, HTMLDListElement>>",
                  },
                ],
              },
            },
            {
              "filePath": "test.ts",
              "isOptional": false,
              "isReadonly": false,
              "kind": "PropertySignature",
              "name": "dt",
              "position": {
                "end": {
                  "column": 2,
                  "line": 26,
                },
                "start": {
                  "column": 39,
                  "line": 24,
                },
              },
              "text": ""dt" | ComponentType<DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>>",
              "type": {
                "kind": "UnionType",
                "text": ""dt" | ComponentClass<DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>, any> | FunctionComponent<DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>>",
                "types": [
                  {
                    "kind": "String",
                    "text": ""dt"",
                    "value": "dt",
                  },
                  {
                    "kind": "TypeReference",
                    "text": "ComponentClass<DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>, any>",
                  },
                  {
                    "kind": "TypeReference",
                    "text": "FunctionComponent<DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>>",
                  },
                ],
              },
            },
            {
              "filePath": "test.ts",
              "isOptional": false,
              "isReadonly": false,
              "kind": "PropertySignature",
              "name": "dd",
              "position": {
                "end": {
                  "column": 2,
                  "line": 26,
                },
                "start": {
                  "column": 39,
                  "line": 24,
                },
              },
              "text": ""dd" | ComponentType<DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>>",
              "type": {
                "kind": "UnionType",
                "text": ""dd" | ComponentClass<DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>, any> | FunctionComponent<DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>>",
                "types": [
                  {
                    "kind": "String",
                    "text": ""dd"",
                    "value": "dd",
                  },
                  {
                    "kind": "TypeReference",
                    "text": "ComponentClass<DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>, any>",
                  },
                  {
                    "kind": "TypeReference",
                    "text": "FunctionComponent<DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>>",
                  },
                ],
              },
            },
            {
              "filePath": "test.ts",
              "isOptional": false,
              "isReadonly": false,
              "kind": "PropertySignature",
              "name": "table",
              "position": {
                "end": {
                  "column": 2,
                  "line": 26,
                },
                "start": {
                  "column": 39,
                  "line": 24,
                },
              },
              "text": ""table" | ComponentType<DetailedHTMLProps<TableHTMLAttributes<HTMLTableElement>, HTMLTableElement>>",
              "type": {
                "kind": "UnionType",
                "text": ""table" | ComponentClass<DetailedHTMLProps<TableHTMLAttributes<HTMLTableElement>, HTMLTableElement>, any> | FunctionComponent<DetailedHTMLProps<TableHTMLAttributes<HTMLTableElement>, HTMLTableElement>>",
                "types": [
                  {
                    "kind": "String",
                    "text": ""table"",
                    "value": "table",
                  },
                  {
                    "kind": "TypeReference",
                    "text": "ComponentClass<DetailedHTMLProps<TableHTMLAttributes<HTMLTableElement>, HTMLTableElement>, any>",
                  },
                  {
                    "kind": "TypeReference",
                    "text": "FunctionComponent<DetailedHTMLProps<TableHTMLAttributes<HTMLTableElement>, HTMLTableElement>>",
                  },
                ],
              },
            },
            {
              "filePath": "test.ts",
              "isOptional": false,
              "isReadonly": false,
              "kind": "PropertySignature",
              "name": "thead",
              "position": {
                "end": {
                  "column": 2,
                  "line": 26,
                },
                "start": {
                  "column": 39,
                  "line": 24,
                },
              },
              "text": ""thead" | ComponentType<DetailedHTMLProps<HTMLAttributes<HTMLTableSectionElement>, HTMLTableSectionElement>>",
              "type": {
                "kind": "UnionType",
                "text": ""thead" | ComponentClass<DetailedHTMLProps<HTMLAttributes<HTMLTableSectionElement>, HTMLTableSectionElement>, any> | FunctionComponent<DetailedHTMLProps<HTMLAttributes<HTMLTableSectionElement>, HTMLTableSectionElement>>",
                "types": [
                  {
                    "kind": "String",
                    "text": ""thead"",
                    "value": "thead",
                  },
                  {
                    "kind": "TypeReference",
                    "text": "ComponentClass<DetailedHTMLProps<HTMLAttributes<HTMLTableSectionElement>, HTMLTableSectionElement>, any>",
                  },
                  {
                    "kind": "TypeReference",
                    "text": "FunctionComponent<DetailedHTMLProps<HTMLAttributes<HTMLTableSectionElement>, HTMLTableSectionElement>>",
                  },
                ],
              },
            },
            {
              "filePath": "test.ts",
              "isOptional": false,
              "isReadonly": false,
              "kind": "PropertySignature",
              "name": "tbody",
              "position": {
                "end": {
                  "column": 2,
                  "line": 26,
                },
                "start": {
                  "column": 39,
                  "line": 24,
                },
              },
              "text": ""tbody" | ComponentType<DetailedHTMLProps<HTMLAttributes<HTMLTableSectionElement>, HTMLTableSectionElement>>",
              "type": {
                "kind": "UnionType",
                "text": ""tbody" | ComponentClass<DetailedHTMLProps<HTMLAttributes<HTMLTableSectionElement>, HTMLTableSectionElement>, any> | FunctionComponent<DetailedHTMLProps<HTMLAttributes<HTMLTableSectionElement>, HTMLTableSectionElement>>",
                "types": [
                  {
                    "kind": "String",
                    "text": ""tbody"",
                    "value": "tbody",
                  },
                  {
                    "kind": "TypeReference",
                    "text": "ComponentClass<DetailedHTMLProps<HTMLAttributes<HTMLTableSectionElement>, HTMLTableSectionElement>, any>",
                  },
                  {
                    "kind": "TypeReference",
                    "text": "FunctionComponent<DetailedHTMLProps<HTMLAttributes<HTMLTableSectionElement>, HTMLTableSectionElement>>",
                  },
                ],
              },
            },
            {
              "filePath": "test.ts",
              "isOptional": false,
              "isReadonly": false,
              "kind": "PropertySignature",
              "name": "tr",
              "position": {
                "end": {
                  "column": 2,
                  "line": 26,
                },
                "start": {
                  "column": 39,
                  "line": 24,
                },
              },
              "text": ""tr" | ComponentType<DetailedHTMLProps<HTMLAttributes<HTMLTableRowElement>, HTMLTableRowElement>>",
              "type": {
                "kind": "UnionType",
                "text": ""tr" | ComponentClass<DetailedHTMLProps<HTMLAttributes<HTMLTableRowElement>, HTMLTableRowElement>, any> | FunctionComponent<DetailedHTMLProps<HTMLAttributes<HTMLTableRowElement>, HTMLTableRowElement>>",
                "types": [
                  {
                    "kind": "String",
                    "text": ""tr"",
                    "value": "tr",
                  },
                  {
                    "kind": "TypeReference",
                    "text": "ComponentClass<DetailedHTMLProps<HTMLAttributes<HTMLTableRowElement>, HTMLTableRowElement>, any>",
                  },
                  {
                    "kind": "TypeReference",
                    "text": "FunctionComponent<DetailedHTMLProps<HTMLAttributes<HTMLTableRowElement>, HTMLTableRowElement>>",
                  },
                ],
              },
            },
            {
              "filePath": "test.ts",
              "isOptional": false,
              "isReadonly": false,
              "kind": "PropertySignature",
              "name": "th",
              "position": {
                "end": {
                  "column": 2,
                  "line": 26,
                },
                "start": {
                  "column": 39,
                  "line": 24,
                },
              },
              "text": ""th" | ComponentType<DetailedHTMLProps<ThHTMLAttributes<HTMLTableHeaderCellElement>, HTMLTableHeaderCellElement>>",
              "type": {
                "kind": "UnionType",
                "text": ""th" | ComponentClass<DetailedHTMLProps<ThHTMLAttributes<HTMLTableHeaderCellElement>, HTMLTableHeaderCellElement>, any> | FunctionComponent<DetailedHTMLProps<ThHTMLAttributes<HTMLTableHeaderCellElement>, HTMLTableHeaderCellElement>>",
                "types": [
                  {
                    "kind": "String",
                    "text": ""th"",
                    "value": "th",
                  },
                  {
                    "kind": "TypeReference",
                    "text": "ComponentClass<DetailedHTMLProps<ThHTMLAttributes<HTMLTableHeaderCellElement>, HTMLTableHeaderCellElement>, any>",
                  },
                  {
                    "kind": "TypeReference",
                    "text": "FunctionComponent<DetailedHTMLProps<ThHTMLAttributes<HTMLTableHeaderCellElement>, HTMLTableHeaderCellElement>>",
                  },
                ],
              },
            },
            {
              "filePath": "test.ts",
              "isOptional": false,
              "isReadonly": false,
              "kind": "PropertySignature",
              "name": "td",
              "position": {
                "end": {
                  "column": 2,
                  "line": 26,
                },
                "start": {
                  "column": 39,
                  "line": 24,
                },
              },
              "text": ""td" | ComponentType<DetailedHTMLProps<TdHTMLAttributes<HTMLTableDataCellElement>, HTMLTableDataCellElement>>",
              "type": {
                "kind": "UnionType",
                "text": ""td" | ComponentClass<DetailedHTMLProps<TdHTMLAttributes<HTMLTableDataCellElement>, HTMLTableDataCellElement>, any> | FunctionComponent<DetailedHTMLProps<TdHTMLAttributes<HTMLTableDataCellElement>, HTMLTableDataCellElement>>",
                "types": [
                  {
                    "kind": "String",
                    "text": ""td"",
                    "value": "td",
                  },
                  {
                    "kind": "TypeReference",
                    "text": "ComponentClass<DetailedHTMLProps<TdHTMLAttributes<HTMLTableDataCellElement>, HTMLTableDataCellElement>, any>",
                  },
                  {
                    "kind": "TypeReference",
                    "text": "FunctionComponent<DetailedHTMLProps<TdHTMLAttributes<HTMLTableDataCellElement>, HTMLTableDataCellElement>>",
                  },
                ],
              },
            },
            {
              "filePath": "test.ts",
              "isOptional": false,
              "isReadonly": false,
              "kind": "PropertySignature",
              "name": "details",
              "position": {
                "end": {
                  "column": 2,
                  "line": 26,
                },
                "start": {
                  "column": 39,
                  "line": 24,
                },
              },
              "text": ""details" | ComponentType<DetailedHTMLProps<DetailsHTMLAttributes<HTMLDetailsElement>, HTMLDetailsElement>>",
              "type": {
                "kind": "UnionType",
                "text": ""details" | ComponentClass<DetailedHTMLProps<DetailsHTMLAttributes<HTMLDetailsElement>, HTMLDetailsElement>, any> | FunctionComponent<DetailedHTMLProps<DetailsHTMLAttributes<HTMLDetailsElement>, HTMLDetailsElement>>",
                "types": [
                  {
                    "kind": "String",
                    "text": ""details"",
                    "value": "details",
                  },
                  {
                    "kind": "TypeReference",
                    "text": "ComponentClass<DetailedHTMLProps<DetailsHTMLAttributes<HTMLDetailsElement>, HTMLDetailsElement>, any>",
                  },
                  {
                    "kind": "TypeReference",
                    "text": "FunctionComponent<DetailedHTMLProps<DetailsHTMLAttributes<HTMLDetailsElement>, HTMLDetailsElement>>",
                  },
                ],
              },
            },
            {
              "filePath": "test.ts",
              "isOptional": false,
              "isReadonly": false,
              "kind": "PropertySignature",
              "name": "summary",
              "position": {
                "end": {
                  "column": 2,
                  "line": 26,
                },
                "start": {
                  "column": 39,
                  "line": 24,
                },
              },
              "text": ""summary" | ComponentType<DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>>",
              "type": {
                "kind": "UnionType",
                "text": ""summary" | ComponentClass<DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>, any> | FunctionComponent<DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>>",
                "types": [
                  {
                    "kind": "String",
                    "text": ""summary"",
                    "value": "summary",
                  },
                  {
                    "kind": "TypeReference",
                    "text": "ComponentClass<DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>, any>",
                  },
                  {
                    "kind": "TypeReference",
                    "text": "FunctionComponent<DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>>",
                  },
                ],
              },
            },
            {
              "filePath": "test.ts",
              "isOptional": false,
              "isReadonly": false,
              "kind": "PropertySignature",
              "name": "code",
              "position": {
                "end": {
                  "column": 2,
                  "line": 26,
                },
                "start": {
                  "column": 39,
                  "line": 24,
                },
              },
              "text": ""code" | ComponentType<DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>>",
              "type": {
                "kind": "UnionType",
                "text": ""code" | ComponentClass<DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>, any> | FunctionComponent<DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>>",
                "types": [
                  {
                    "kind": "String",
                    "text": ""code"",
                    "value": "code",
                  },
                  {
                    "kind": "TypeReference",
                    "text": "ComponentClass<DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>, any>",
                  },
                  {
                    "kind": "TypeReference",
                    "text": "FunctionComponent<DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>>",
                  },
                ],
              },
            },
            {
              "filePath": "test.ts",
              "isOptional": false,
              "isReadonly": false,
              "kind": "PropertySignature",
              "name": "Markdown",
              "position": {
                "end": {
                  "column": 47,
                  "line": 27,
                },
                "start": {
                  "column": 3,
                  "line": 27,
                },
              },
              "text": "ComponentType<MarkdownProps>",
              "type": {
                "kind": "UnionType",
                "text": "ComponentClass<MarkdownProps, any> | FunctionComponent<MarkdownProps>",
                "types": [
                  {
                    "kind": "TypeReference",
                    "text": "ComponentClass<MarkdownProps, any>",
                  },
                  {
                    "kind": "TypeReference",
                    "text": "FunctionComponent<MarkdownProps>",
                  },
                ],
              },
            },
          ],
          "text": "TypeReferenceComponents",
        },
      }
    `)
  })

  test('interfaces', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
      interface User {
        firstName: string
        lastName: string
        getFullName(): string
      }
      `,
      { overwrite: true }
    )
    const interfaceDeclaration = sourceFile.getInterfaceOrThrow('User')
    const types = resolveType(
      interfaceDeclaration.getType(),
      interfaceDeclaration
    )

    expect(types).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "Interface",
        "members": [
          {
            "filePath": "test.ts",
            "isOptional": false,
            "isReadonly": false,
            "kind": "PropertySignature",
            "name": "firstName",
            "position": {
              "end": {
                "column": 20,
                "line": 2,
              },
              "start": {
                "column": 3,
                "line": 2,
              },
            },
            "text": "string",
            "type": {
              "kind": "String",
              "text": "string",
              "value": undefined,
            },
          },
          {
            "filePath": "test.ts",
            "isOptional": false,
            "isReadonly": false,
            "kind": "PropertySignature",
            "name": "lastName",
            "position": {
              "end": {
                "column": 19,
                "line": 3,
              },
              "start": {
                "column": 3,
                "line": 3,
              },
            },
            "text": "string",
            "type": {
              "kind": "String",
              "text": "string",
              "value": undefined,
            },
          },
          {
            "filePath": "test.ts",
            "kind": "MethodSignature",
            "name": "getFullName",
            "parameters": [],
            "position": {
              "end": {
                "column": 24,
                "line": 4,
              },
              "start": {
                "column": 3,
                "line": 4,
              },
            },
            "returnType": {
              "kind": "String",
              "text": "string",
              "value": undefined,
            },
            "text": "() => string",
          },
        ],
        "name": "User",
        "position": {
          "end": {
            "column": 2,
            "line": 5,
          },
          "start": {
            "column": 1,
            "line": 1,
          },
        },
        "text": "User",
      }
    `)
  })

  test('component with intersection props', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
      import React from 'react'

      type RequiredProps = { required: string }
      
      type Props = Partial<RequiredProps> & { additional: string }

      function Component(props: Props) {}
      `,
      { overwrite: true }
    )
    const functionDeclaration = sourceFile.getFunctionOrThrow('Component')
    const types = resolveType(
      functionDeclaration.getType(),
      functionDeclaration
    )

    expect(types).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "Component",
        "name": "Component",
        "position": {
          "end": {
            "column": 36,
            "line": 7,
          },
          "start": {
            "column": 1,
            "line": 7,
          },
        },
        "signatures": [
          {
            "filePath": "test.ts",
            "isAsync": false,
            "kind": "ComponentSignature",
            "parameter": {
              "description": undefined,
              "filePath": "test.ts",
              "initializer": undefined,
              "isOptional": false,
              "kind": "Parameter",
              "name": "props",
              "position": {
                "end": {
                  "column": 32,
                  "line": 7,
                },
                "start": {
                  "column": 20,
                  "line": 7,
                },
              },
              "text": "Props",
              "type": {
                "kind": "IntersectionType",
                "text": "Props",
                "types": [
                  {
                    "kind": "TypeReference",
                    "text": "Partial<RequiredProps>",
                  },
                  {
                    "kind": "TypeLiteral",
                    "members": [
                      {
                        "filePath": "test.ts",
                        "isOptional": false,
                        "isReadonly": false,
                        "kind": "PropertySignature",
                        "name": "additional",
                        "position": {
                          "end": {
                            "column": 59,
                            "line": 5,
                          },
                          "start": {
                            "column": 41,
                            "line": 5,
                          },
                        },
                        "text": "string",
                        "type": {
                          "kind": "String",
                          "text": "string",
                          "value": undefined,
                        },
                      },
                    ],
                    "text": "{ additional: string; }",
                  },
                ],
              },
            },
            "position": {
              "end": {
                "column": 36,
                "line": 7,
              },
              "start": {
                "column": 1,
                "line": 7,
              },
            },
            "returnType": {
              "kind": "Void",
              "text": "void",
            },
            "text": "function Component(props: Props): void",
          },
        ],
        "text": "(props: Props) => void",
      }
    `)
  })

  test('captures anonymous arrow function return type', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
      function returnsFn() {
        return () => false
      }
      `,
      { overwrite: true }
    )
    const functionDeclaration = sourceFile.getFunctionOrThrow('returnsFn')
    const types = resolveType(
      functionDeclaration.getType(),
      functionDeclaration
    )

    expect(types).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "Function",
        "name": "returnsFn",
        "position": {
          "end": {
            "column": 2,
            "line": 3,
          },
          "start": {
            "column": 1,
            "line": 1,
          },
        },
        "signatures": [
          {
            "filePath": "test.ts",
            "isAsync": false,
            "isGenerator": false,
            "kind": "FunctionSignature",
            "parameters": [],
            "position": {
              "end": {
                "column": 2,
                "line": 3,
              },
              "start": {
                "column": 1,
                "line": 1,
              },
            },
            "returnType": {
              "isAsync": false,
              "kind": "FunctionType",
              "parameters": [],
              "returnType": {
                "kind": "Boolean",
                "text": "boolean",
              },
              "text": "() => boolean",
            },
            "text": "function returnsFn(): () => boolean",
          },
        ],
        "text": "() => () => boolean",
      }
    `)
  })

  test('complex type parameters', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
      type LoaderTypes = {
        mdx: { default: any }
      }

      function getFile<
        ExtensionType extends keyof LoaderTypes | (string & {}),
      >(extension?: ExtensionType | ExtensionType[]) {}
      `,
      { overwrite: true }
    )
    const functionDeclaration = sourceFile.getFunctionOrThrow('getFile')
    const types = resolveType(
      functionDeclaration.getType(),
      functionDeclaration
    )

    expect(types).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "Function",
        "name": "getFile",
        "position": {
          "end": {
            "column": 50,
            "line": 7,
          },
          "start": {
            "column": 1,
            "line": 5,
          },
        },
        "signatures": [
          {
            "filePath": "test.ts",
            "isAsync": false,
            "isGenerator": false,
            "kind": "FunctionSignature",
            "parameters": [
              {
                "description": undefined,
                "filePath": "test.ts",
                "initializer": undefined,
                "isOptional": true,
                "kind": "Parameter",
                "name": "extension",
                "position": {
                  "end": {
                    "column": 46,
                    "line": 7,
                  },
                  "start": {
                    "column": 3,
                    "line": 7,
                  },
                },
                "text": "ExtensionType | ExtensionType[]",
                "type": {
                  "kind": "UnionType",
                  "text": "ExtensionType | ExtensionType[]",
                  "types": [
                    {
                      "kind": "TypeReference",
                      "text": "ExtensionType",
                    },
                    {
                      "kind": "TypeReference",
                      "text": "ExtensionType[]",
                    },
                  ],
                },
              },
            ],
            "position": {
              "end": {
                "column": 50,
                "line": 7,
              },
              "start": {
                "column": 1,
                "line": 5,
              },
            },
            "returnType": {
              "kind": "Void",
              "text": "void",
            },
            "text": "function getFile<ExtensionType extends "mdx" | string>(extension?: ExtensionType | ExtensionType[]): void",
            "typeParameters": [
              {
                "constraint": {
                  "kind": "UnionType",
                  "text": ""mdx" | string",
                  "types": [
                    {
                      "kind": "String",
                      "text": ""mdx"",
                      "value": "mdx",
                    },
                    {
                      "kind": "String",
                      "text": "string",
                      "value": undefined,
                    },
                  ],
                },
                "defaultType": undefined,
                "kind": "TypeParameter",
                "name": "ExtensionType",
                "text": "ExtensionType extends keyof LoaderTypes | (string & {})",
              },
            ],
          },
        ],
        "text": "<ExtensionType extends keyof LoaderTypes | (string & {})>(extension?: ExtensionType | ExtensionType[]) => void",
      }
    `)
  })

  test('type alias string', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
      type Keys = string;
      `,
      { overwrite: true }
    )
    const typeAlias = sourceFile.getTypeAliasOrThrow('Keys')
    const types = resolveType(typeAlias.getType(), typeAlias)

    expect(types).toMatchInlineSnapshot(`
      {
        "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
        "kind": "TypeReference",
        "position": {
          "end": {
            "column": 4402,
            "line": 4,
          },
          "start": {
            "column": 3482,
            "line": 4,
          },
        },
        "text": "string",
      }
    `)
  })

  test('indexed access type', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
      interface Baz {
        foo: string
        bar: number
      }

      export type Foo = Baz['foo']
      `,
      { overwrite: true }
    )
    const typeAlias = sourceFile.getTypeAliasOrThrow('Foo')
    const type = resolveTypeExpression(typeAlias.getType(), typeAlias)

    expect(type).toMatchInlineSnapshot(`
      {
        "indexType": {
          "kind": "String",
          "text": ""foo"",
          "value": "foo",
        },
        "kind": "IndexedAccessType",
        "objectType": {
          "kind": "TypeLiteral",
          "members": [
            {
              "filePath": "test.ts",
              "isOptional": false,
              "isReadonly": false,
              "kind": "PropertySignature",
              "name": "foo",
              "position": {
                "end": {
                  "column": 14,
                  "line": 2,
                },
                "start": {
                  "column": 3,
                  "line": 2,
                },
              },
              "text": "string",
              "type": {
                "kind": "TypeReference",
                "text": "string",
              },
            },
            {
              "filePath": "test.ts",
              "isOptional": false,
              "isReadonly": false,
              "kind": "PropertySignature",
              "name": "bar",
              "position": {
                "end": {
                  "column": 14,
                  "line": 3,
                },
                "start": {
                  "column": 3,
                  "line": 3,
                },
              },
              "text": "number",
              "type": {
                "kind": "Number",
                "text": "number",
                "value": undefined,
              },
            },
          ],
          "text": "Baz",
        },
        "text": "string",
      }
    `)
  })

  test('indexed access type with export', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
      export interface Baz {
        foo: string
        bar: number
      }

      export type Foo = Baz['foo']
      `,
      { overwrite: true }
    )
    const typeAlias = sourceFile.getTypeAliasOrThrow('Foo')
    const type = resolveTypeExpression(typeAlias.getType(), typeAlias)

    expect(type).toMatchInlineSnapshot(`
      {
        "indexType": {
          "kind": "String",
          "text": ""foo"",
          "value": "foo",
        },
        "kind": "IndexedAccessType",
        "objectType": {
          "filePath": "test.ts",
          "kind": "TypeReference",
          "position": {
            "end": {
              "column": 2,
              "line": 4,
            },
            "start": {
              "column": 1,
              "line": 1,
            },
          },
          "text": "Baz",
        },
        "text": "string",
      }
    `)
  })

  test.skip('resolves complex conditional and indexed access type', () => {
    const sourceFile = project.createSourceFile(
      'index.ts',
      dedent`
        export type LoadersWithRuntimeKeys<Loaders> = Extract<
          keyof Loaders,
          'js' | 'jsx' | 'ts' | 'tsx' | 'mdx'
        >

        export type LoaderExportValue<Loaders, Name extends string> = {
          [Extension in LoadersWithRuntimeKeys<Loaders>]: Name extends keyof Loaders[Extension]
            ? Loaders[Extension][Name]
            : never
        }[LoadersWithRuntimeKeys<Loaders>]
      `,
      { overwrite: true }
    )
    const declaration = sourceFile.getTypeAliasOrThrow('LoaderExportValue')
    const type = resolveTypeExpression(declaration.getType(), declaration)

    console.log(type)
  })
})
