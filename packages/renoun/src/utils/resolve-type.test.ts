import { describe, test, expect } from 'vitest'
import {
  Project,
  SyntaxKind,
  type ClassDeclaration,
  type FunctionDeclaration,
} from 'ts-morph'
import dedent from 'dedent'

import { resolveTypeProperties, resolveType } from './resolve-type.js'

const project = new Project()

describe('processProperties', () => {
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
        "kind": "Object",
        "name": "ModuleData",
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
        "properties": [
          {
            "context": "property",
            "defaultValue": undefined,
            "filePath": "test.ts",
            "isOptional": false,
            "isReadonly": false,
            "kind": "Function",
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
            "signatures": [
              {
                "kind": "FunctionSignature",
                "modifier": undefined,
                "parameters": [
                  {
                    "context": "parameter",
                    "defaultValue": undefined,
                    "description": undefined,
                    "filePath": "test.ts",
                    "isOptional": false,
                    "kind": "Object",
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
                    "properties": [
                      {
                        "context": "property",
                        "defaultValue": undefined,
                        "filePath": "test.ts",
                        "isOptional": false,
                        "isReadonly": false,
                        "kind": "Number",
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
                        "value": undefined,
                      },
                    ],
                    "text": "{ objectValue: number; }",
                  },
                ],
                "returnType": "Promise<number>",
                "text": "(parameterValue: { objectValue: number; }) => Promise<number>",
              },
            ],
            "text": "(parameterValue: { objectValue: number; }) => Promise<number>",
          },
          {
            "context": "property",
            "defaultValue": undefined,
            "element": {
              "filePath": "test.ts",
              "kind": "Reference",
              "position": {
                "end": {
                  "column": 7,
                  "line": 5,
                },
                "start": {
                  "column": 5,
                  "line": 2,
                },
              },
              "text": "ExportedType",
            },
            "filePath": "test.ts",
            "isOptional": false,
            "isReadonly": false,
            "kind": "Array",
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
            "text": "Array<ExportedType>",
          },
        ],
        "text": "ModuleData",
      }
    `)
  })

  test('complex properties', () => {
    const typeAlias = sourceFile.getTypeAliasOrThrow('ComplexType')
    const type = typeAlias.getType()
    const processedProperties = resolveTypeProperties(type)

    expect(processedProperties).toMatchInlineSnapshot(`
      [
        {
          "arguments": [
            {
              "context": "parameter",
              "filePath": "test.ts",
              "kind": "Reference",
              "position": {
                "end": {
                  "column": 7,
                  "line": 5,
                },
                "start": {
                  "column": 5,
                  "line": 2,
                },
              },
              "text": "ExportedType",
            },
          ],
          "context": "property",
          "defaultValue": undefined,
          "filePath": "test.ts",
          "isOptional": true,
          "isReadonly": false,
          "kind": "Generic",
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
          "typeName": "Promise",
        },
        {
          "arguments": [
            {
              "context": "parameter",
              "filePath": "test.ts",
              "kind": "Function",
              "name": undefined,
              "position": {
                "end": {
                  "column": 62,
                  "line": 23,
                },
                "start": {
                  "column": 32,
                  "line": 23,
                },
              },
              "signatures": [
                {
                  "kind": "FunctionSignature",
                  "modifier": undefined,
                  "parameters": [
                    {
                      "context": "parameter",
                      "defaultValue": undefined,
                      "description": undefined,
                      "filePath": "test.ts",
                      "isOptional": false,
                      "kind": "Number",
                      "name": "a",
                      "position": {
                        "end": {
                          "column": 42,
                          "line": 23,
                        },
                        "start": {
                          "column": 33,
                          "line": 23,
                        },
                      },
                      "text": "number",
                      "value": undefined,
                    },
                    {
                      "context": "parameter",
                      "defaultValue": undefined,
                      "description": undefined,
                      "filePath": "test.ts",
                      "isOptional": false,
                      "kind": "String",
                      "name": "b",
                      "position": {
                        "end": {
                          "column": 53,
                          "line": 23,
                        },
                        "start": {
                          "column": 44,
                          "line": 23,
                        },
                      },
                      "text": "string",
                      "value": undefined,
                    },
                  ],
                  "returnType": "void",
                  "text": "(a: number, b: string) => void",
                },
              ],
              "text": "(a: number, b: string) => void",
            },
          ],
          "context": "property",
          "defaultValue": undefined,
          "filePath": "test.ts",
          "isOptional": false,
          "isReadonly": false,
          "kind": "Generic",
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
          "typeName": "Promise",
        },
        {
          "arguments": [
            {
              "context": "parameter",
              "filePath": "test.ts",
              "kind": "Object",
              "name": undefined,
              "position": {
                "end": {
                  "column": 8,
                  "line": 18,
                },
                "start": {
                  "column": 14,
                  "line": 15,
                },
              },
              "properties": [
                {
                  "context": "property",
                  "defaultValue": undefined,
                  "filePath": "test.ts",
                  "isOptional": false,
                  "isReadonly": false,
                  "kind": "String",
                  "name": "slug",
                  "position": {
                    "end": {
                      "column": 20,
                      "line": 16,
                    },
                    "start": {
                      "column": 9,
                      "line": 16,
                    },
                  },
                  "text": "string",
                  "value": undefined,
                },
                {
                  "context": "property",
                  "defaultValue": undefined,
                  "filePath": "test.ts",
                  "isOptional": false,
                  "isReadonly": false,
                  "kind": "String",
                  "name": "filePath",
                  "position": {
                    "end": {
                      "column": 24,
                      "line": 17,
                    },
                    "start": {
                      "column": 9,
                      "line": 17,
                    },
                  },
                  "text": "string",
                  "value": undefined,
                },
              ],
              "text": "{ slug: string; filePath: string; }",
            },
          ],
          "context": "property",
          "defaultValue": undefined,
          "filePath": "test.ts",
          "isOptional": false,
          "isReadonly": false,
          "kind": "Generic",
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
          "typeName": "Promise",
        },
        {
          "context": "property",
          "defaultValue": undefined,
          "filePath": "test.ts",
          "isOptional": false,
          "isReadonly": false,
          "kind": "Union",
          "members": [
            {
              "filePath": "test.ts",
              "kind": "String",
              "name": undefined,
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
              "text": "string",
              "value": undefined,
            },
            {
              "filePath": "test.ts",
              "kind": "Number",
              "name": undefined,
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
              "text": "number",
              "value": undefined,
            },
          ],
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
        },
        {
          "context": "property",
          "defaultValue": undefined,
          "filePath": "test.ts",
          "isOptional": false,
          "isReadonly": false,
          "kind": "Union",
          "members": [
            {
              "filePath": "test.ts",
              "kind": "String",
              "name": undefined,
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
              "text": "string",
              "value": undefined,
            },
            {
              "filePath": "test.ts",
              "kind": "Function",
              "name": undefined,
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
              "signatures": [
                {
                  "kind": "FunctionSignature",
                  "modifier": undefined,
                  "parameters": [
                    {
                      "context": "parameter",
                      "defaultValue": undefined,
                      "description": undefined,
                      "filePath": "test.ts",
                      "isOptional": false,
                      "kind": "String",
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
                      "value": undefined,
                    },
                  ],
                  "returnType": "string | number",
                  "text": "(a: string) => string | number",
                },
              ],
              "text": "(a: string) => string | number",
            },
            {
              "filePath": "test.ts",
              "kind": "Object",
              "name": undefined,
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
              "properties": [
                {
                  "context": "property",
                  "defaultValue": undefined,
                  "filePath": "test.ts",
                  "isOptional": false,
                  "isReadonly": false,
                  "kind": "String",
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
                  "value": undefined,
                },
              ],
              "text": "{ a: string; }",
            },
            {
              "filePath": "test.ts",
              "kind": "Object",
              "name": undefined,
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
              "properties": [
                {
                  "context": "property",
                  "defaultValue": undefined,
                  "filePath": "test.ts",
                  "isOptional": false,
                  "isReadonly": false,
                  "kind": "Number",
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
                  "value": undefined,
                },
                {
                  "context": "property",
                  "defaultValue": undefined,
                  "element": {
                    "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
                    "kind": "Union",
                    "members": [
                      {
                        "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
                        "kind": "String",
                        "name": undefined,
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
                        "value": undefined,
                      },
                      {
                        "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
                        "kind": "Number",
                        "name": undefined,
                        "position": {
                          "end": {
                            "column": 4943,
                            "line": 4,
                          },
                          "start": {
                            "column": 4755,
                            "line": 4,
                          },
                        },
                        "text": "number",
                        "value": undefined,
                      },
                    ],
                    "name": undefined,
                    "position": {
                      "end": {
                        "column": 14214,
                        "line": 4,
                      },
                      "start": {
                        "column": 12443,
                        "line": 4,
                      },
                    },
                    "text": "string | number",
                  },
                  "filePath": "test.ts",
                  "isOptional": false,
                  "isReadonly": false,
                  "kind": "Array",
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
                  "text": "Array<string | number>",
                },
              ],
              "text": "{ b: number; c: (string | number)[]; }",
            },
          ],
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
        },
        {
          "context": "property",
          "defaultValue": undefined,
          "filePath": "test.ts",
          "isOptional": false,
          "isReadonly": false,
          "kind": "Object",
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
          "properties": [
            {
              "context": "property",
              "defaultValue": undefined,
              "filePath": "test.ts",
              "isOptional": false,
              "isReadonly": false,
              "kind": "String",
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
              "value": undefined,
            },
            {
              "context": "property",
              "defaultValue": undefined,
              "filePath": "test.ts",
              "isOptional": false,
              "isReadonly": false,
              "kind": "Number",
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
              "value": undefined,
            },
          ],
          "text": "{ a: string; } & { b: number; }",
        },
        {
          "context": "property",
          "defaultValue": undefined,
          "filePath": "test.ts",
          "isOptional": false,
          "isReadonly": false,
          "kind": "Intersection",
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
          "properties": [
            {
              "arguments": [
                {
                  "context": "parameter",
                  "filePath": "test.ts",
                  "kind": "Reference",
                  "position": {
                    "end": {
                      "column": 7,
                      "line": 5,
                    },
                    "start": {
                      "column": 5,
                      "line": 2,
                    },
                  },
                  "text": "ExportedType",
                },
              ],
              "filePath": "test.ts",
              "kind": "Generic",
              "name": undefined,
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
              "text": "Promise<ExportedType>",
              "typeName": "Promise",
            },
            {
              "context": "property",
              "defaultValue": undefined,
              "filePath": "test.ts",
              "isOptional": false,
              "isReadonly": false,
              "kind": "String",
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
              "value": undefined,
            },
            {
              "context": "property",
              "defaultValue": undefined,
              "filePath": "test.ts",
              "isOptional": false,
              "isReadonly": false,
              "kind": "Function",
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
              "signatures": [
                {
                  "kind": "FunctionSignature",
                  "modifier": undefined,
                  "parameters": [],
                  "returnType": "void",
                  "text": "() => void",
                },
              ],
              "text": "() => void",
            },
          ],
          "text": "Promise<ExportedType> & { a: string; } & { b(): void; }",
        },
        {
          "context": "property",
          "defaultValue": undefined,
          "elements": [
            {
              "context": "parameter",
              "filePath": "test.ts",
              "kind": "String",
              "name": "a",
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
              "text": "string",
              "value": undefined,
            },
            {
              "context": "parameter",
              "filePath": "test.ts",
              "kind": "Number",
              "name": "b",
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
              "text": "number",
              "value": undefined,
            },
            {
              "context": "parameter",
              "filePath": "test.ts",
              "kind": "String",
              "name": "string",
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
              "text": "string",
              "value": undefined,
            },
          ],
          "filePath": "test.ts",
          "isOptional": false,
          "isReadonly": false,
          "kind": "Tuple",
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
        },
        {
          "context": "property",
          "defaultValue": undefined,
          "filePath": "test.ts",
          "isOptional": false,
          "isReadonly": false,
          "kind": "Reference",
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
        "kind": "Union",
        "members": [
          {
            "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
            "kind": "String",
            "name": undefined,
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
            "value": undefined,
          },
          {
            "filePath": "test.ts",
            "kind": "Intersection",
            "name": "FillVariant",
            "position": {
              "end": {
                "column": 24,
                "line": 8,
              },
              "start": {
                "column": 9,
                "line": 6,
              },
            },
            "properties": [
              {
                "context": "property",
                "defaultValue": undefined,
                "filePath": "test.ts",
                "isOptional": false,
                "isReadonly": false,
                "kind": "String",
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
                "value": undefined,
              },
              {
                "filePath": "test.ts",
                "kind": "Reference",
                "position": {
                  "end": {
                    "column": 10,
                    "line": 4,
                  },
                  "start": {
                    "column": 9,
                    "line": 2,
                  },
                },
                "text": "BaseVariant",
              },
            ],
            "text": "FillVariant",
          },
          {
            "filePath": "test.ts",
            "kind": "Intersection",
            "name": "OutlineVariant",
            "position": {
              "end": {
                "column": 24,
                "line": 12,
              },
              "start": {
                "column": 9,
                "line": 10,
              },
            },
            "properties": [
              {
                "context": "property",
                "defaultValue": undefined,
                "filePath": "test.ts",
                "isOptional": false,
                "isReadonly": false,
                "kind": "String",
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
                "value": undefined,
              },
              {
                "filePath": "test.ts",
                "kind": "Reference",
                "position": {
                  "end": {
                    "column": 10,
                    "line": 4,
                  },
                  "start": {
                    "column": 9,
                    "line": 2,
                  },
                },
                "text": "BaseVariant",
              },
            ],
            "text": "OutlineVariant",
          },
        ],
        "name": "Variant",
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
        "kind": "Object",
        "name": "Primitives",
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
        "properties": [
          {
            "context": "property",
            "defaultValue": undefined,
            "description": "a string",
            "filePath": "test.ts",
            "isOptional": false,
            "isReadonly": false,
            "kind": "String",
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
            "value": undefined,
          },
          {
            "context": "property",
            "defaultValue": undefined,
            "description": "
      a number",
            "filePath": "test.ts",
            "isOptional": false,
            "isReadonly": false,
            "kind": "Number",
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
                "tagName": "internal",
                "text": undefined,
              },
            ],
            "text": "number",
            "value": undefined,
          },
          {
            "context": "property",
            "defaultValue": undefined,
            "filePath": "test.ts",
            "isOptional": false,
            "isReadonly": false,
            "kind": "Boolean",
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
          },
          {
            "context": "property",
            "defaultValue": undefined,
            "element": {
              "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
              "kind": "String",
              "name": undefined,
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
              "value": undefined,
            },
            "filePath": "test.ts",
            "isOptional": false,
            "isReadonly": false,
            "kind": "Array",
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
            "text": "Array<string>",
          },
          {
            "arguments": [
              {
                "context": "parameter",
                "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
                "kind": "String",
                "name": undefined,
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
                "value": undefined,
              },
              {
                "context": "parameter",
                "filePath": "test.ts",
                "kind": "Object",
                "name": undefined,
                "position": {
                  "end": {
                    "column": 48,
                    "line": 17,
                  },
                  "start": {
                    "column": 31,
                    "line": 17,
                  },
                },
                "properties": [
                  {
                    "context": "property",
                    "defaultValue": undefined,
                    "filePath": "test.ts",
                    "isOptional": false,
                    "isReadonly": false,
                    "kind": "Number",
                    "name": "value",
                    "position": {
                      "end": {
                        "column": 46,
                        "line": 17,
                      },
                      "start": {
                        "column": 33,
                        "line": 17,
                      },
                    },
                    "text": "number",
                    "value": undefined,
                  },
                ],
                "text": "{ value: number; }",
              },
            ],
            "context": "property",
            "defaultValue": undefined,
            "filePath": "test.ts",
            "isOptional": false,
            "isReadonly": false,
            "kind": "Generic",
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
            "typeName": "Record",
          },
          {
            "context": "property",
            "defaultValue": undefined,
            "description": "Accepts a string",
            "filePath": "test.ts",
            "isOptional": false,
            "isReadonly": false,
            "kind": "Function",
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
            "signatures": [
              {
                "kind": "FunctionSignature",
                "modifier": undefined,
                "parameters": [
                  {
                    "context": "parameter",
                    "defaultValue": undefined,
                    "description": "a string parameter",
                    "filePath": "test.ts",
                    "isOptional": false,
                    "kind": "String",
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
                    "value": undefined,
                  },
                ],
                "returnType": "void",
                "text": "(a: string) => void",
              },
            ],
            "tags": undefined,
            "text": "(a: string) => void",
          },
          {
            "context": "property",
            "defaultValue": undefined,
            "filePath": "test.ts",
            "isOptional": false,
            "isReadonly": false,
            "kind": "Function",
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
            "signatures": [
              {
                "kind": "FunctionSignature",
                "modifier": "async",
                "parameters": [],
                "returnType": "Promise<void>",
                "text": "function foo(): Promise<void>",
              },
            ],
            "text": "() => Promise<void>",
          },
        ],
        "text": "Primitives",
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
        "kind": "Object",
        "name": "a",
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
        "properties": [
          {
            "context": "property",
            "defaultValue": undefined,
            "filePath": "test.ts",
            "isOptional": false,
            "isReadonly": true,
            "kind": "Object",
            "name": "e",
            "position": {
              "end": {
                "column": 12,
                "line": 11,
              },
              "start": {
                "column": 11,
                "line": 9,
              },
            },
            "properties": [
              {
                "context": "property",
                "defaultValue": undefined,
                "filePath": "test.ts",
                "isOptional": false,
                "isReadonly": false,
                "kind": "Number",
                "name": "f",
                "position": {
                  "end": {
                    "column": 17,
                    "line": 10,
                  },
                  "start": {
                    "column": 13,
                    "line": 10,
                  },
                },
                "text": "number",
                "value": undefined,
              },
            ],
            "text": "{ f: number; }",
          },
          {
            "context": "property",
            "defaultValue": undefined,
            "filePath": "test.ts",
            "isOptional": false,
            "isReadonly": true,
            "kind": "String",
            "name": "g",
            "position": {
              "end": {
                "column": 22,
                "line": 12,
              },
              "start": {
                "column": 11,
                "line": 12,
              },
            },
            "text": "string",
            "value": undefined,
          },
          {
            "context": "property",
            "defaultValue": undefined,
            "filePath": "test.ts",
            "isOptional": false,
            "isReadonly": true,
            "kind": "Number",
            "name": "b",
            "position": {
              "end": {
                "column": 15,
                "line": 3,
              },
              "start": {
                "column": 11,
                "line": 3,
              },
            },
            "text": "1",
            "value": 1,
          },
          {
            "context": "property",
            "defaultValue": undefined,
            "filePath": "test.ts",
            "isOptional": false,
            "isReadonly": true,
            "kind": "String",
            "name": "c",
            "position": {
              "end": {
                "column": 22,
                "line": 4,
              },
              "start": {
                "column": 11,
                "line": 4,
              },
            },
            "text": ""string"",
            "value": "string",
          },
        ],
        "text": "{ readonly e: { f: number; }; readonly g: string; readonly b: 1; readonly c: "string"; }",
      }
    `)
  })

  test('recursive types', () => {
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
        "kind": "Object",
        "name": "SelfReferencedType",
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
        "properties": [
          {
            "context": "property",
            "defaultValue": undefined,
            "filePath": "test.ts",
            "isOptional": false,
            "isReadonly": false,
            "kind": "String",
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
            "value": undefined,
          },
          {
            "context": "property",
            "defaultValue": undefined,
            "element": {
              "filePath": "test.ts",
              "kind": "Reference",
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
            },
            "filePath": "test.ts",
            "isOptional": false,
            "isReadonly": false,
            "kind": "Array",
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
            "text": "Array<SelfReferencedType>",
          },
        ],
        "text": "SelfReferencedType",
      }
    `)
  })

  test('implicit recursive types', () => {
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
        "kind": "Object",
        "name": "DocNode",
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
        "properties": [
          {
            "context": "property",
            "defaultValue": undefined,
            "filePath": "test.ts",
            "isOptional": false,
            "isReadonly": false,
            "kind": "String",
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
            "value": undefined,
          },
          {
            "context": "property",
            "defaultValue": undefined,
            "element": {
              "filePath": "test.ts",
              "kind": "Reference",
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
            },
            "filePath": "test.ts",
            "isOptional": true,
            "isReadonly": false,
            "kind": "Array",
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
          },
        ],
        "text": "DocNode",
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
        "kind": "Object",
        "name": "DocNode",
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
        "properties": [
          {
            "context": "property",
            "defaultValue": undefined,
            "filePath": "test.ts",
            "isOptional": false,
            "isReadonly": false,
            "kind": "String",
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
            "value": undefined,
          },
          {
            "context": "property",
            "defaultValue": undefined,
            "filePath": "test.ts",
            "isOptional": true,
            "isReadonly": false,
            "kind": "Reference",
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
          },
        ],
        "text": "DocNode",
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
        "kind": "Object",
        "name": "FileSystemSource",
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
        "properties": [
          {
            "context": "property",
            "defaultValue": undefined,
            "filePath": "test.ts",
            "isOptional": true,
            "isReadonly": false,
            "kind": "Class",
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
            "properties": [
              {
                "decorators": [],
                "defaultValue": "undefined",
                "element": {
                  "filePath": "test.ts",
                  "kind": "Object",
                  "name": "FileSystemSource",
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
                  "properties": [
                    {
                      "context": "property",
                      "defaultValue": undefined,
                      "filePath": "test.ts",
                      "isOptional": true,
                      "isReadonly": false,
                      "kind": "Class",
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
                      "properties": [
                        {
                          "decorators": [],
                          "defaultValue": "undefined",
                          "filePath": "test.ts",
                          "isReadonly": false,
                          "kind": "Reference",
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
                          "scope": undefined,
                          "text": "Array<FileSystemSource<Exports>>",
                          "visibility": undefined,
                        },
                      ],
                      "text": "Collection<Exports>",
                    },
                  ],
                  "text": "FileSystemSource<Exports>",
                },
                "filePath": "test.ts",
                "isReadonly": false,
                "kind": "Array",
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
                "scope": undefined,
                "text": "Array<FileSystemSource<Exports>>",
                "visibility": undefined,
              },
            ],
            "text": "Collection<Exports>",
          },
        ],
        "text": "FileSystemSource<Exports>",
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
        "kind": "Object",
        "name": "FileSystem",
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
        "properties": [
          {
            "context": "property",
            "defaultValue": undefined,
            "filePath": "test.ts",
            "isOptional": false,
            "isReadonly": false,
            "kind": "Reference",
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
            "text": "(path: string, callback: (err: Error | null, data: Buffer) => void) => void",
          },
        ],
        "text": "FileSystem",
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
        "kind": "Object",
        "name": "AsyncString",
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
        "properties": [
          {
            "arguments": [
              {
                "context": "parameter",
                "filePath": "test.ts",
                "kind": "Object",
                "name": "Foo",
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
                "properties": [
                  {
                    "context": "property",
                    "defaultValue": undefined,
                    "filePath": "test.ts",
                    "isOptional": false,
                    "isReadonly": false,
                    "kind": "String",
                    "name": "bar",
                    "position": {
                      "end": {
                        "column": 13,
                        "line": 2,
                      },
                      "start": {
                        "column": 3,
                        "line": 2,
                      },
                    },
                    "text": ""baz"",
                    "value": "baz",
                  },
                ],
                "text": "Foo",
              },
            ],
            "context": "property",
            "defaultValue": undefined,
            "filePath": "test.ts",
            "isOptional": false,
            "isReadonly": false,
            "kind": "Generic",
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
            "typeName": "Promise",
          },
        ],
        "text": "AsyncString",
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
        "kind": "Union",
        "members": [
          {
            "filePath": "test.ts",
            "kind": "Object",
            "name": "UnwrapPromisesInMap",
            "position": {
              "end": {
                "column": 2,
                "line": 22,
              },
              "start": {
                "column": 1,
                "line": 20,
              },
            },
            "properties": [
              {
                "context": "property",
                "defaultValue": undefined,
                "filePath": "test.ts",
                "isOptional": false,
                "isReadonly": false,
                "kind": "Number",
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
                "text": "number",
                "value": undefined,
              },
              {
                "context": "property",
                "defaultValue": undefined,
                "filePath": "test.ts",
                "isOptional": false,
                "isReadonly": false,
                "kind": "String",
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
                "value": undefined,
              },
            ],
            "text": "UnwrapPromisesInMap<Omit<A, "title">>",
          },
          {
            "filePath": "test.ts",
            "kind": "Object",
            "name": "UnwrapPromisesInMap",
            "position": {
              "end": {
                "column": 2,
                "line": 22,
              },
              "start": {
                "column": 1,
                "line": 20,
              },
            },
            "properties": [
              {
                "context": "property",
                "defaultValue": undefined,
                "filePath": "test.ts",
                "isOptional": false,
                "isReadonly": false,
                "kind": "String",
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
                "value": undefined,
              },
              {
                "context": "property",
                "defaultValue": undefined,
                "filePath": "test.ts",
                "isOptional": false,
                "isReadonly": false,
                "kind": "Number",
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
                "value": undefined,
              },
            ],
            "text": "UnwrapPromisesInMap<Omit<B, "title">>",
          },
        ],
        "name": "ExportedType",
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
        "kind": "Object",
        "name": "TextProps",
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
        "properties": [
          {
            "context": "property",
            "defaultValue": undefined,
            "filePath": "test.ts",
            "isOptional": false,
            "isReadonly": false,
            "kind": "Reference",
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
          },
        ],
        "text": "TextProps",
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
  
        export type DropDollarPrefix<T> = {
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
    const types = resolveType(
      sourceFile.getTypeAliasOrThrow('TextProps').getType()
    )

    expect(types).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "Object",
        "name": "TextProps",
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
        "properties": [
          {
            "context": "property",
            "defaultValue": undefined,
            "filePath": "test.ts",
            "isOptional": true,
            "isReadonly": false,
            "kind": "Union",
            "members": [
              {
                "filePath": "test.ts",
                "kind": "String",
                "name": undefined,
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
                "text": "string",
                "value": undefined,
              },
              {
                "filePath": "test.ts",
                "kind": "Number",
                "name": undefined,
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
                "text": "number",
                "value": undefined,
              },
            ],
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
          },
          {
            "context": "property",
            "defaultValue": undefined,
            "filePath": "node_modules/@types/library/index.d.ts",
            "isOptional": false,
            "isReadonly": false,
            "kind": "Reference",
            "name": "color",
            "position": {
              "end": {
                "column": 46,
                "line": 1,
              },
              "start": {
                "column": 1,
                "line": 1,
              },
            },
            "text": "Color",
          },
        ],
        "text": "TextProps",
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
        "kind": "Object",
        "name": "ModuleData",
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
        "properties": [
          {
            "context": "property",
            "defaultValue": undefined,
            "element": {
              "filePath": "test.ts",
              "kind": "Intersection",
              "name": "ExportedType",
              "position": {
                "end": {
                  "column": 48,
                  "line": 3,
                },
                "start": {
                  "column": 1,
                  "line": 3,
                },
              },
              "properties": [
                {
                  "filePath": "node_modules/@types/library/index.d.ts",
                  "kind": "Reference",
                  "position": {
                    "end": {
                      "column": 56,
                      "line": 17,
                    },
                    "start": {
                      "column": 1,
                      "line": 17,
                    },
                  },
                  "text": "Metadata",
                },
                {
                  "filePath": "test.ts",
                  "kind": "Object",
                  "name": undefined,
                  "position": {
                    "end": {
                      "column": 48,
                      "line": 3,
                    },
                    "start": {
                      "column": 32,
                      "line": 3,
                    },
                  },
                  "properties": [
                    {
                      "context": "property",
                      "defaultValue": undefined,
                      "filePath": "test.ts",
                      "isOptional": false,
                      "isReadonly": false,
                      "kind": "String",
                      "name": "slug",
                      "position": {
                        "end": {
                          "column": 46,
                          "line": 3,
                        },
                        "start": {
                          "column": 34,
                          "line": 3,
                        },
                      },
                      "text": "string",
                      "value": undefined,
                    },
                  ],
                  "text": "{ slug: string; }",
                },
              ],
              "text": "ExportedType",
            },
            "filePath": "test.ts",
            "isOptional": false,
            "isReadonly": false,
            "kind": "Array",
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
            "text": "Array<ExportedType>",
          },
        ],
        "text": "ModuleData<Type>",
      }
    `)
  })

  // TODO: fix isComponent handling
  test.skip('function arguments that reference exported types', () => {
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
        "kind": "Function",
        "name": "Text",
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
        "signatures": [
          {
            "kind": "FunctionSignature",
            "modifier": undefined,
            "parameters": [
              {
                "context": "parameter",
                "defaultValue": undefined,
                "description": undefined,
                "filePath": "test.ts",
                "isOptional": false,
                "kind": "Reference",
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
              },
            ],
            "returnType": "void",
            "text": "(color: Color) => void",
          },
        ],
        "text": "Text",
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
            "kind": "ComponentSignature",
            "modifier": undefined,
            "parameter": {
              "context": "parameter",
              "defaultValue": undefined,
              "description": undefined,
              "filePath": "test.ts",
              "isOptional": true,
              "kind": "Object",
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
              "properties": [
                {
                  "context": "property",
                  "defaultValue": undefined,
                  "filePath": "test.ts",
                  "isOptional": false,
                  "isReadonly": false,
                  "kind": "Reference",
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
                },
              ],
              "text": "TextProps",
            },
            "returnType": "void",
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
        "kind": "Component",
        "name": "Text",
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
        "signatures": [
          {
            "kind": "ComponentSignature",
            "modifier": undefined,
            "parameter": {
              "context": "parameter",
              "defaultValue": undefined,
              "description": undefined,
              "filePath": "test.ts",
              "isOptional": false,
              "kind": "Reference",
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
            },
            "returnType": "void",
            "text": "(props: TextProps) => void",
          },
        ],
        "text": "Text",
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
            "kind": "ComponentSignature",
            "modifier": undefined,
            "parameter": {
              "context": "parameter",
              "defaultValue": {
                "color": "red",
              },
              "description": undefined,
              "filePath": "test.ts",
              "isOptional": false,
              "kind": "Reference",
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
            },
            "returnType": "void",
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
            "kind": "ComponentSignature",
            "modifier": undefined,
            "parameter": {
              "context": "parameter",
              "defaultValue": {
                "style": {
                  "color": "blue",
                  "fontWeight": 400,
                },
              },
              "description": undefined,
              "filePath": "test.ts",
              "isOptional": false,
              "kind": "Object",
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
              "properties": [
                {
                  "context": "property",
                  "defaultValue": {
                    "color": "blue",
                    "fontWeight": 400,
                  },
                  "filePath": "test.ts",
                  "isOptional": true,
                  "isReadonly": false,
                  "kind": "Object",
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
                  "properties": [
                    {
                      "context": "property",
                      "defaultValue": undefined,
                      "filePath": "test.ts",
                      "isOptional": false,
                      "isReadonly": false,
                      "kind": "Number",
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
                      "value": undefined,
                    },
                    {
                      "context": "property",
                      "defaultValue": 400,
                      "filePath": "test.ts",
                      "isOptional": true,
                      "isReadonly": false,
                      "kind": "Number",
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
                      "value": undefined,
                    },
                    {
                      "context": "property",
                      "defaultValue": "blue",
                      "filePath": "test.ts",
                      "isOptional": true,
                      "isReadonly": false,
                      "kind": "String",
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
                      "value": undefined,
                    },
                  ],
                  "text": "{ fontSize: number; fontWeight: number; color?: string; }",
                },
              ],
              "text": "TextProps",
            },
            "returnType": "void",
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
        "kind": "Union",
        "members": [
          {
            "filePath": "test.ts",
            "kind": "Object",
            "name": undefined,
            "position": {
              "end": {
                "column": 43,
                "line": 3,
              },
              "start": {
                "column": 7,
                "line": 3,
              },
            },
            "properties": [
              {
                "arguments": [
                  {
                    "context": "parameter",
                    "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
                    "kind": "String",
                    "name": undefined,
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
                    "value": undefined,
                  },
                  {
                    "context": "parameter",
                    "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
                    "kind": "Primitive",
                    "position": {
                      "end": {
                        "column": 315,
                        "line": 6,
                      },
                      "start": {
                        "column": 266,
                        "line": 6,
                      },
                    },
                    "text": "any",
                  },
                ],
                "context": "property",
                "defaultValue": undefined,
                "filePath": "test.ts",
                "isOptional": false,
                "isReadonly": false,
                "kind": "Generic",
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
                "typeName": "Record",
              },
            ],
            "text": "{ frontMatter: Record<string, any>; }",
          },
          {
            "filePath": "test.ts",
            "kind": "Object",
            "name": undefined,
            "position": {
              "end": {
                "column": 66,
                "line": 1,
              },
              "start": {
                "column": 30,
                "line": 1,
              },
            },
            "properties": [
              {
                "arguments": [
                  {
                    "context": "parameter",
                    "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
                    "kind": "String",
                    "name": undefined,
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
                    "value": undefined,
                  },
                  {
                    "context": "parameter",
                    "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
                    "kind": "Primitive",
                    "position": {
                      "end": {
                        "column": 315,
                        "line": 6,
                      },
                      "start": {
                        "column": 266,
                        "line": 6,
                      },
                    },
                    "text": "any",
                  },
                ],
                "context": "property",
                "defaultValue": undefined,
                "filePath": "test.ts",
                "isOptional": false,
                "isReadonly": false,
                "kind": "Generic",
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
                "typeName": "Record",
              },
            ],
            "text": "{ frontMatter: Record<string, any>; }",
          },
        ],
        "name": undefined,
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
        "text": "{ frontMatter: Record<string, any>; } | { frontMatter: Record<string, any>; }",
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
            "kind": "FunctionSignature",
            "modifier": undefined,
            "parameters": [
              {
                "context": "parameter",
                "defaultValue": undefined,
                "description": undefined,
                "filePath": "test.ts",
                "isOptional": false,
                "kind": "Object",
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
                "properties": [
                  {
                    "context": "property",
                    "defaultValue": undefined,
                    "filePath": "test.ts",
                    "isOptional": false,
                    "isReadonly": false,
                    "kind": "Number",
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
                    "value": undefined,
                  },
                  {
                    "context": "property",
                    "defaultValue": undefined,
                    "filePath": "test.ts",
                    "isOptional": false,
                    "isReadonly": false,
                    "kind": "Number",
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
                    "value": undefined,
                  },
                ],
                "text": "GridProps",
              },
            ],
            "returnType": "void",
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
        "kind": "Object",
        "name": "TextProps",
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
        "properties": [
          {
            "context": "property",
            "defaultValue": undefined,
            "filePath": "test.ts",
            "isOptional": false,
            "isReadonly": false,
            "kind": "Union",
            "members": [
              {
                "filePath": "test.ts",
                "kind": "Primitive",
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
                "text": "undefined",
              },
              {
                "filePath": "test.ts",
                "kind": "String",
                "name": undefined,
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
                "text": "string",
                "value": undefined,
              },
            ],
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
          },
        ],
        "text": "TextProps",
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
        "kind": "Primitive",
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
        "members": {
          "Blue": "blue",
          "Green": "green",
          "Red": "red",
        },
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
        "kind": "Object",
        "name": "TextProps",
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
        "properties": [
          {
            "context": "property",
            "defaultValue": undefined,
            "filePath": "test.ts",
            "isOptional": false,
            "isReadonly": false,
            "kind": "Enum",
            "members": {
              "Blue": "blue",
              "Green": "green",
              "Red": "red",
            },
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
          },
        ],
        "text": "TextProps",
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
        "filePath": "test.ts",
        "kind": "Class",
        "methods": [
          {
            "decorators": [],
            "kind": "ClassMethod",
            "name": "setValue",
            "scope": undefined,
            "signatures": [
              {
                "kind": "FunctionSignature",
                "modifier": undefined,
                "parameters": [
                  {
                    "context": "parameter",
                    "defaultValue": undefined,
                    "description": undefined,
                    "filePath": "test.ts",
                    "isOptional": false,
                    "kind": "String",
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
                    "value": undefined,
                  },
                ],
                "returnType": "void",
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
            "decorators": [],
            "defaultValue": undefined,
            "filePath": "test.ts",
            "isReadonly": false,
            "kind": "String",
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
            "scope": undefined,
            "text": "string",
            "value": undefined,
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
        "kind": "Object",
        "name": "CardViewProps",
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
        "properties": [
          {
            "context": "property",
            "defaultValue": undefined,
            "filePath": "test.ts",
            "isOptional": false,
            "isReadonly": false,
            "kind": "Class",
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
            "properties": [
              {
                "decorators": [],
                "defaultValue": "#666",
                "filePath": "test.ts",
                "isReadonly": false,
                "kind": "String",
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
                "scope": undefined,
                "text": "string",
                "value": undefined,
                "visibility": undefined,
              },
            ],
            "text": "TextView",
          },
        ],
        "text": "CardViewProps",
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
        "kind": "String",
        "name": "color",
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
        "value": "blue",
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
        "kind": "Object",
        "name": "color",
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
        "properties": [
          {
            "context": "property",
            "defaultValue": undefined,
            "filePath": "test.ts",
            "isOptional": false,
            "isReadonly": true,
            "kind": "String",
            "name": "red",
            "position": {
              "end": {
                "column": 41,
                "line": 1,
              },
              "start": {
                "column": 31,
                "line": 1,
              },
            },
            "text": ""red"",
            "value": "red",
          },
          {
            "context": "property",
            "defaultValue": undefined,
            "filePath": "test.ts",
            "isOptional": false,
            "isReadonly": true,
            "kind": "String",
            "name": "blue",
            "position": {
              "end": {
                "column": 55,
                "line": 1,
              },
              "start": {
                "column": 43,
                "line": 1,
              },
            },
            "text": ""blue"",
            "value": "blue",
          },
          {
            "context": "property",
            "defaultValue": undefined,
            "filePath": "test.ts",
            "isOptional": false,
            "isReadonly": true,
            "kind": "String",
            "name": "green",
            "position": {
              "end": {
                "column": 71,
                "line": 1,
              },
              "start": {
                "column": 57,
                "line": 1,
              },
            },
            "text": ""green"",
            "value": "green",
          },
        ],
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
        "kind": "Object",
        "name": "TextProps",
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
        "properties": [
          {
            "context": "property",
            "defaultValue": undefined,
            "filePath": "test.ts",
            "isOptional": false,
            "isReadonly": false,
            "kind": "Union",
            "members": [
              {
                "filePath": "test.ts",
                "kind": "String",
                "name": undefined,
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
                "text": ""red"",
                "value": "red",
              },
              {
                "filePath": "test.ts",
                "kind": "String",
                "name": undefined,
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
                "text": ""blue"",
                "value": "blue",
              },
              {
                "filePath": "test.ts",
                "kind": "String",
                "name": undefined,
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
                "text": ""green"",
                "value": "green",
              },
            ],
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
          },
        ],
        "text": "TextProps",
      }
    `)
  })

  test('references locally exported generic arguments', () => {
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
        "kind": "Object",
        "name": "TextProps",
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
        "properties": [
          {
            "arguments": [
              {
                "context": "parameter",
                "filePath": "test.ts",
                "kind": "Reference",
                "position": {
                  "end": {
                    "column": 66,
                    "line": 3,
                  },
                  "start": {
                    "column": 25,
                    "line": 3,
                  },
                },
                "text": "(key: keyof typeof colors) => "red" | "blue" | "green"",
                "type": "typeof getColor",
              },
            ],
            "context": "property",
            "defaultValue": undefined,
            "filePath": "test.ts",
            "isOptional": false,
            "isReadonly": false,
            "kind": "Generic",
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
            "text": "ReturnType<typeof getColor>",
            "typeName": "ReturnType",
          },
        ],
        "text": "TextProps",
      }
    `)
  })

  test('references external generic arguments', () => {
    project.createSourceFile(
      'node_modules/@types/colors/index.d.ts',
      dedent`
        const colors = { red: 'red', blue: 'blue', green: 'green' } as const;
        export const getColor = (key: keyof typeof colors) => colors[key];
        `
    )

    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
        import type { getColor } from 'colors';
  
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
        "kind": "Object",
        "name": "TextProps",
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
        "properties": [
          {
            "arguments": [
              {
                "context": "parameter",
                "filePath": "node_modules/@types/colors/index.d.ts",
                "kind": "Reference",
                "position": {
                  "end": {
                    "column": 66,
                    "line": 2,
                  },
                  "start": {
                    "column": 25,
                    "line": 2,
                  },
                },
                "text": "(key: keyof typeof colors) => "red" | "blue" | "green"",
                "type": "typeof getColor",
              },
            ],
            "context": "property",
            "defaultValue": undefined,
            "filePath": "test.ts",
            "isOptional": false,
            "isReadonly": false,
            "kind": "Generic",
            "name": "color",
            "position": {
              "end": {
                "column": 38,
                "line": 4,
              },
              "start": {
                "column": 3,
                "line": 4,
              },
            },
            "text": "ReturnType<typeof getColor>",
            "typeName": "ReturnType",
          },
        ],
        "text": "TextProps",
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
        "kind": "Object",
        "name": "ComplexType",
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
        "properties": [
          {
            "arguments": [
              {
                "context": "parameter",
                "filePath": "test.ts",
                "kind": "Object",
                "name": undefined,
                "position": {
                  "end": {
                    "column": 4,
                    "line": 5,
                  },
                  "start": {
                    "column": 10,
                    "line": 2,
                  },
                },
                "properties": [
                  {
                    "context": "property",
                    "defaultValue": undefined,
                    "filePath": "test.ts",
                    "isOptional": false,
                    "isReadonly": false,
                    "kind": "String",
                    "name": "slug",
                    "position": {
                      "end": {
                        "column": 16,
                        "line": 3,
                      },
                      "start": {
                        "column": 5,
                        "line": 3,
                      },
                    },
                    "text": "string",
                    "value": undefined,
                  },
                  {
                    "context": "property",
                    "defaultValue": undefined,
                    "filePath": "test.ts",
                    "isOptional": false,
                    "isReadonly": false,
                    "kind": "String",
                    "name": "filePath",
                    "position": {
                      "end": {
                        "column": 20,
                        "line": 4,
                      },
                      "start": {
                        "column": 5,
                        "line": 4,
                      },
                    },
                    "text": "string",
                    "value": undefined,
                  },
                ],
                "text": "{ slug: string; filePath: string; }",
              },
            ],
            "context": "property",
            "defaultValue": undefined,
            "filePath": "test.ts",
            "isOptional": false,
            "isReadonly": false,
            "kind": "Generic",
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
            "typeName": "Promise",
          },
        ],
        "text": "ComplexType",
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
            "kind": "ComponentSignature",
            "modifier": undefined,
            "parameter": undefined,
            "returnType": "ReactNode",
            "text": "function Text(): ReactNode",
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
            "kind": "FunctionSignature",
            "modifier": undefined,
            "parameters": [
              {
                "context": "parameter",
                "defaultValue": 0,
                "description": "Provides the initial count.",
                "filePath": "test.ts",
                "isOptional": false,
                "kind": "Number",
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
                "value": undefined,
              },
            ],
            "returnType": "void",
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
        "description": "Provides a counter state. ",
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
            "kind": "FunctionSignature",
            "modifier": undefined,
            "parameters": [
              {
                "context": "parameter",
                "defaultValue": {
                  "initialCount": 0,
                },
                "description": undefined,
                "filePath": "test.ts",
                "isOptional": false,
                "kind": "Object",
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
                "properties": [
                  {
                    "context": "property",
                    "defaultValue": 0,
                    "description": "Provides the initial count.",
                    "filePath": "test.ts",
                    "isOptional": true,
                    "isReadonly": false,
                    "kind": "Number",
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
                    "value": undefined,
                  },
                ],
                "text": "{ initialCount?: number; }",
              },
            ],
            "returnType": "void",
            "text": "function useCounter({ initialCount?: number; }): void",
          },
        ],
        "tags": [
          {
            "tagName": "deprecated",
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
            "kind": "FunctionSignature",
            "modifier": undefined,
            "parameters": [
              {
                "context": "parameter",
                "defaultValue": {
                  "initial": {
                    "count": 0,
                  },
                },
                "description": undefined,
                "filePath": "test.ts",
                "isOptional": true,
                "kind": "Object",
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
                "properties": [
                  {
                    "context": "property",
                    "defaultValue": {
                      "count": 0,
                    },
                    "filePath": "test.ts",
                    "isOptional": true,
                    "isReadonly": false,
                    "kind": "Object",
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
                    "properties": [
                      {
                        "context": "property",
                        "defaultValue": 0,
                        "filePath": "test.ts",
                        "isOptional": false,
                        "isReadonly": false,
                        "kind": "Number",
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
                        "value": undefined,
                      },
                    ],
                    "text": "{ count: number; }",
                  },
                ],
                "text": "{ initial?: { count: number; }; }",
              },
            ],
            "returnType": "void",
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
        "kind": "Function",
        "name": "useCounter",
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
        "signatures": [
          {
            "kind": "FunctionSignature",
            "modifier": undefined,
            "parameters": [
              {
                "context": "parameter",
                "defaultValue": 0,
                "description": undefined,
                "filePath": "test.ts",
                "isOptional": false,
                "kind": "Number",
                "name": "initialCount",
                "position": {
                  "end": {
                    "column": 45,
                    "line": 1,
                  },
                  "start": {
                    "column": 21,
                    "line": 1,
                  },
                },
                "text": "number",
                "value": undefined,
              },
            ],
            "returnType": "void",
            "text": "(initialCount: number) => void",
          },
        ],
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
        "kind": "Function",
        "name": "useCounter",
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
        "signatures": [
          {
            "kind": "FunctionSignature",
            "modifier": undefined,
            "parameters": [
              {
                "context": "parameter",
                "defaultValue": 0,
                "description": undefined,
                "filePath": "test.ts",
                "isOptional": false,
                "kind": "Number",
                "name": "initialCount",
                "position": {
                  "end": {
                    "column": 54,
                    "line": 1,
                  },
                  "start": {
                    "column": 30,
                    "line": 1,
                  },
                },
                "text": "number",
                "value": undefined,
              },
            ],
            "returnType": "void",
            "text": "(initialCount: number) => void",
          },
        ],
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
            "kind": "FunctionSignature",
            "modifier": undefined,
            "parameters": [
              {
                "context": "parameter",
                "defaultValue": {
                  "initialCount": 0,
                },
                "description": undefined,
                "filePath": "test.ts",
                "isOptional": false,
                "kind": "Reference",
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
              },
            ],
            "returnType": "void",
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
            "kind": "FunctionSignature",
            "modifier": undefined,
            "parameters": [
              {
                "context": "parameter",
                "defaultValue": {
                  "initialCount": 0,
                },
                "description": undefined,
                "filePath": "test.ts",
                "isOptional": false,
                "kind": "Reference",
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
              },
            ],
            "returnType": "void",
            "text": "function useCounterOverride({ initialCount: number; }): void",
          },
        ],
        "text": "({ initialCount }: ReturnType<typeof useCounter>) => void",
      }
    `)
  })

  test('imported function object return types should not be parsed', () => {
    project.createSourceFile(
      'types.ts',
      `export function useCounter() { return { initialCount: 0 } }`,
      { overwrite: true }
    )
    const sourceFile = project.createSourceFile(
      'test.ts',
      `import { useCounter } from './types' function useCounterOverride({ counterState }: { counterState: ReturnType<typeof useCounter> }) {}`,
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
            "column": 135,
            "line": 1,
          },
          "start": {
            "column": 38,
            "line": 1,
          },
        },
        "signatures": [
          {
            "kind": "FunctionSignature",
            "modifier": undefined,
            "parameters": [
              {
                "context": "parameter",
                "defaultValue": undefined,
                "description": undefined,
                "filePath": "test.ts",
                "isOptional": false,
                "kind": "Object",
                "name": undefined,
                "position": {
                  "end": {
                    "column": 131,
                    "line": 1,
                  },
                  "start": {
                    "column": 66,
                    "line": 1,
                  },
                },
                "properties": [
                  {
                    "arguments": [
                      {
                        "context": "parameter",
                        "filePath": "types.ts",
                        "kind": "Reference",
                        "position": {
                          "end": {
                            "column": 60,
                            "line": 1,
                          },
                          "start": {
                            "column": 1,
                            "line": 1,
                          },
                        },
                        "text": "() => { initialCount: number; }",
                        "type": "typeof useCounter",
                      },
                    ],
                    "context": "property",
                    "defaultValue": undefined,
                    "filePath": "test.ts",
                    "isOptional": false,
                    "isReadonly": false,
                    "kind": "Generic",
                    "name": "counterState",
                    "position": {
                      "end": {
                        "column": 129,
                        "line": 1,
                      },
                      "start": {
                        "column": 86,
                        "line": 1,
                      },
                    },
                    "text": "ReturnType<typeof useCounter>",
                    "typeName": "ReturnType",
                  },
                ],
                "text": "{ counterState: ReturnType<typeof useCounter>; }",
              },
            ],
            "returnType": "void",
            "text": "function useCounterOverride({ counterState: ReturnType<typeof useCounter>; }): void",
          },
        ],
        "text": "({ counterState }: { counterState: ReturnType<typeof useCounter>; }) => void",
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
            "kind": "ComponentSignature",
            "modifier": undefined,
            "parameter": {
              "context": "parameter",
              "defaultValue": undefined,
              "description": undefined,
              "filePath": "test.ts",
              "isOptional": false,
              "kind": "Union",
              "members": [
                {
                  "filePath": "test.ts",
                  "kind": "Object",
                  "name": undefined,
                  "position": {
                    "end": {
                      "column": 77,
                      "line": 3,
                    },
                    "start": {
                      "column": 1,
                      "line": 3,
                    },
                  },
                  "properties": [
                    {
                      "context": "property",
                      "defaultValue": undefined,
                      "filePath": "test.ts",
                      "isOptional": false,
                      "isReadonly": false,
                      "kind": "String",
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
                      "value": undefined,
                    },
                    {
                      "context": "property",
                      "defaultValue": undefined,
                      "filePath": "test.ts",
                      "isOptional": false,
                      "isReadonly": false,
                      "kind": "String",
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
                      "value": undefined,
                    },
                  ],
                  "text": "BaseProps & { source: string; }",
                },
                {
                  "filePath": "test.ts",
                  "kind": "Object",
                  "name": undefined,
                  "position": {
                    "end": {
                      "column": 77,
                      "line": 3,
                    },
                    "start": {
                      "column": 1,
                      "line": 3,
                    },
                  },
                  "properties": [
                    {
                      "context": "property",
                      "defaultValue": undefined,
                      "filePath": "test.ts",
                      "isOptional": false,
                      "isReadonly": false,
                      "kind": "String",
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
                      "value": undefined,
                    },
                    {
                      "context": "property",
                      "defaultValue": undefined,
                      "filePath": "test.ts",
                      "isOptional": false,
                      "isReadonly": false,
                      "kind": "String",
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
                      "value": undefined,
                    },
                  ],
                  "text": "BaseProps & { value: string; }",
                },
              ],
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
            },
            "returnType": "void",
            "text": "function Component(props: Props): void",
          },
        ],
        "text": "(props: Props) => void",
      }
    `)
  })

  // TODO: fix isComponent handling
  test.skip('union types with primitive types', () => {
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
            "kind": "FunctionSignature",
            "modifier": undefined,
            "parameters": [
              {
                "context": "parameter",
                "defaultValue": undefined,
                "description": undefined,
                "filePath": "test.ts",
                "isOptional": false,
                "kind": "Union",
                "members": [
                  {
                    "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
                    "kind": "String",
                    "name": undefined,
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
                    "value": undefined,
                  },
                  {
                    "filePath": "test.ts",
                    "kind": "Object",
                    "name": undefined,
                    "position": {
                      "end": {
                        "column": 31,
                        "line": 1,
                      },
                      "start": {
                        "column": 14,
                        "line": 1,
                      },
                    },
                    "properties": [
                      {
                        "context": "property",
                        "defaultValue": undefined,
                        "filePath": "test.ts",
                        "isOptional": false,
                        "isReadonly": false,
                        "kind": "String",
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
                        "value": undefined,
                      },
                    ],
                    "text": "{ color: string; }",
                  },
                ],
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
              },
            ],
            "returnType": "void",
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
            "kind": "ComponentSignature",
            "modifier": undefined,
            "parameter": {
              "context": "parameter",
              "defaultValue": undefined,
              "description": undefined,
              "filePath": "test.ts",
              "isOptional": false,
              "kind": "Union",
              "members": [
                {
                  "filePath": "test.ts",
                  "kind": "Intersection",
                  "name": undefined,
                  "position": {
                    "end": {
                      "column": 77,
                      "line": 3,
                    },
                    "start": {
                      "column": 1,
                      "line": 3,
                    },
                  },
                  "properties": [
                    {
                      "filePath": "types.ts",
                      "kind": "Reference",
                      "position": {
                        "end": {
                          "column": 42,
                          "line": 1,
                        },
                        "start": {
                          "column": 1,
                          "line": 1,
                        },
                      },
                      "text": "BaseProps",
                    },
                    {
                      "context": "property",
                      "defaultValue": undefined,
                      "filePath": "test.ts",
                      "isOptional": false,
                      "isReadonly": false,
                      "kind": "String",
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
                      "value": undefined,
                    },
                  ],
                  "text": "BaseProps & { source: string; }",
                },
                {
                  "filePath": "test.ts",
                  "kind": "Intersection",
                  "name": undefined,
                  "position": {
                    "end": {
                      "column": 77,
                      "line": 3,
                    },
                    "start": {
                      "column": 1,
                      "line": 3,
                    },
                  },
                  "properties": [
                    {
                      "filePath": "types.ts",
                      "kind": "Reference",
                      "position": {
                        "end": {
                          "column": 42,
                          "line": 1,
                        },
                        "start": {
                          "column": 1,
                          "line": 1,
                        },
                      },
                      "text": "BaseProps",
                    },
                    {
                      "context": "property",
                      "defaultValue": undefined,
                      "filePath": "test.ts",
                      "isOptional": false,
                      "isReadonly": false,
                      "kind": "String",
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
                      "value": undefined,
                    },
                  ],
                  "text": "BaseProps & { value: string; }",
                },
              ],
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
            },
            "returnType": "void",
            "text": "function Component(props: Props): void",
          },
        ],
        "text": "(props: Props) => void",
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
        "kind": "Object",
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
        "properties": [
          {
            "key": {
              "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
              "kind": "String",
              "name": undefined,
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
              "value": undefined,
            },
            "kind": "Index",
            "text": "[key: string]: unknown",
            "value": {
              "filePath": "test.ts",
              "kind": "Primitive",
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
              "text": "unknown",
            },
          },
        ],
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
        "kind": "Object",
        "name": "FileExports",
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
        "properties": [
          {
            "key": {
              "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
              "kind": "String",
              "name": undefined,
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
              "value": undefined,
            },
            "kind": "Index",
            "text": "[key: string]: unknown",
            "value": {
              "filePath": "test.ts",
              "kind": "Primitive",
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
              "text": "unknown",
            },
          },
          {
            "context": "property",
            "defaultValue": undefined,
            "filePath": "test.ts",
            "isOptional": false,
            "isReadonly": false,
            "kind": "String",
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
            "value": undefined,
          },
        ],
        "text": "FileExports",
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
        "kind": "Component",
        "name": "Text",
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
        "signatures": [
          {
            "kind": "ComponentSignature",
            "modifier": undefined,
            "parameter": {
              "context": "parameter",
              "defaultValue": {
                "variant": "body1",
              },
              "description": undefined,
              "filePath": "test.ts",
              "isOptional": false,
              "kind": "Reference",
              "name": "props",
              "position": {
                "end": {
                  "column": 38,
                  "line": 21,
                },
                "start": {
                  "column": 22,
                  "line": 21,
                },
              },
              "text": "TextProps",
            },
            "returnType": "void",
            "text": "(props: TextProps) => void",
          },
        ],
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
        "kind": "Primitive",
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
        "kind": "Primitive",
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
        "kind": "Object",
        "name": "Props",
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
        "properties": [
          {
            "context": "property",
            "defaultValue": undefined,
            "filePath": "test.ts",
            "isOptional": false,
            "isReadonly": false,
            "kind": "Union",
            "members": [
              {
                "filePath": "test.ts",
                "kind": "String",
                "name": undefined,
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
                "text": ""heading1"",
                "value": "heading1",
              },
              {
                "filePath": "test.ts",
                "kind": "String",
                "name": undefined,
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
                "text": ""heading2"",
                "value": "heading2",
              },
              {
                "filePath": "test.ts",
                "kind": "String",
                "name": undefined,
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
                "text": ""heading3"",
                "value": "heading3",
              },
              {
                "filePath": "test.ts",
                "kind": "String",
                "name": undefined,
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
                "text": ""body1"",
                "value": "body1",
              },
              {
                "filePath": "test.ts",
                "kind": "String",
                "name": undefined,
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
                "text": ""body2"",
                "value": "body2",
              },
            ],
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
          },
          {
            "context": "property",
            "defaultValue": undefined,
            "filePath": "test.ts",
            "isOptional": true,
            "isReadonly": false,
            "kind": "Union",
            "members": [
              {
                "filePath": "test.ts",
                "kind": "String",
                "name": undefined,
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
                "text": "string",
                "value": undefined,
              },
              {
                "filePath": "test.ts",
                "kind": "Number",
                "name": undefined,
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
                "text": "number",
                "value": undefined,
              },
            ],
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
          },
        ],
        "text": "Props",
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
        "kind": "Object",
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
        "properties": [
          {
            "context": "property",
            "defaultValue": undefined,
            "filePath": "test.ts",
            "isOptional": false,
            "isReadonly": false,
            "kind": "Union",
            "members": [
              {
                "filePath": "test.ts",
                "kind": "String",
                "name": undefined,
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
                "text": ""heading1"",
                "value": "heading1",
              },
              {
                "filePath": "test.ts",
                "kind": "String",
                "name": undefined,
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
                "text": ""heading2"",
                "value": "heading2",
              },
              {
                "filePath": "test.ts",
                "kind": "String",
                "name": undefined,
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
                "text": ""heading3"",
                "value": "heading3",
              },
              {
                "filePath": "test.ts",
                "kind": "String",
                "name": undefined,
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
                "text": ""body1"",
                "value": "body1",
              },
              {
                "filePath": "test.ts",
                "kind": "String",
                "name": undefined,
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
                "text": ""body2"",
                "value": "body2",
              },
            ],
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
          },
          {
            "context": "property",
            "defaultValue": undefined,
            "filePath": "test.ts",
            "isOptional": true,
            "isReadonly": false,
            "kind": "Union",
            "members": [
              {
                "filePath": "test.ts",
                "kind": "String",
                "name": undefined,
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
                "text": "string",
                "value": undefined,
              },
              {
                "filePath": "test.ts",
                "kind": "Number",
                "name": undefined,
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
                "text": "number",
                "value": undefined,
              },
            ],
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
          },
          {
            "context": "property",
            "defaultValue": undefined,
            "filePath": "test.ts",
            "isOptional": false,
            "isReadonly": false,
            "kind": "String",
            "name": "color",
            "position": {
              "end": {
                "column": 16,
                "line": 2,
              },
              "start": {
                "column": 3,
                "line": 2,
              },
            },
            "text": "string",
            "value": undefined,
          },
        ],
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
        "members": {
          "Blue": "BLUE",
          "Green": "GREEN",
          "Red": "RED",
        },
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
            "decorators": [],
            "description": "Sets the count.",
            "kind": "ClassSetAccessor",
            "modifier": undefined,
            "name": "accessorCount",
            "parameters": [
              {
                "context": "parameter",
                "defaultValue": undefined,
                "description": undefined,
                "filePath": "test.ts",
                "isOptional": false,
                "kind": "Number",
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
                "value": undefined,
              },
            ],
            "returnType": "void",
            "scope": undefined,
            "tags": undefined,
            "text": "number",
            "visibility": undefined,
          },
          {
            "decorators": [],
            "description": "Returns the current count.",
            "kind": "ClassGetAccessor",
            "name": "accessorCount",
            "scope": undefined,
            "tags": undefined,
            "text": "number",
            "visibility": undefined,
          },
        ],
        "constructors": [
          {
            "kind": "FunctionSignature",
            "modifier": undefined,
            "parameters": [
              {
                "context": "parameter",
                "defaultValue": 0,
                "description": undefined,
                "filePath": "test.ts",
                "isOptional": false,
                "kind": "Number",
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
                "value": undefined,
              },
            ],
            "returnType": "Counter",
            "text": "(initialCount: number) => Counter",
          },
        ],
        "filePath": "test.ts",
        "kind": "Class",
        "methods": [
          {
            "decorators": [],
            "description": "Increments the count.",
            "kind": "ClassMethod",
            "name": "increment",
            "scope": undefined,
            "signatures": [
              {
                "kind": "FunctionSignature",
                "modifier": undefined,
                "parameters": [],
                "returnType": "void",
                "text": "() => void",
              },
            ],
            "tags": undefined,
            "text": "() => void",
            "visibility": undefined,
          },
          {
            "decorators": [],
            "description": "Decrements the count.",
            "kind": "ClassMethod",
            "name": "decrement",
            "scope": undefined,
            "signatures": [
              {
                "kind": "FunctionSignature",
                "modifier": undefined,
                "parameters": [],
                "returnType": "void",
                "text": "() => void",
              },
            ],
            "tags": undefined,
            "text": "() => void",
            "visibility": undefined,
          },
          {
            "decorators": [],
            "description": "Returns the current count.",
            "kind": "ClassMethod",
            "name": "getCount",
            "scope": undefined,
            "signatures": [
              {
                "kind": "FunctionSignature",
                "modifier": undefined,
                "parameters": [
                  {
                    "context": "parameter",
                    "defaultValue": true,
                    "description": undefined,
                    "filePath": "test.ts",
                    "isOptional": true,
                    "kind": "Boolean",
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
                  },
                ],
                "returnType": "number",
                "text": "(isFloored?: boolean) => number",
              },
            ],
            "tags": undefined,
            "text": "(isFloored?: boolean) => number",
            "visibility": "public",
          },
          {
            "decorators": [],
            "kind": "ClassMethod",
            "name": "getStaticCount",
            "scope": "static",
            "signatures": [
              {
                "kind": "FunctionSignature",
                "modifier": undefined,
                "parameters": [],
                "returnType": "number",
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
            "decorators": [],
            "defaultValue": 0,
            "filePath": "test.ts",
            "isReadonly": false,
            "kind": "Number",
            "name": "initialCount",
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
            "scope": undefined,
            "text": "number",
            "value": undefined,
            "visibility": undefined,
          },
          {
            "decorators": [],
            "defaultValue": 0,
            "filePath": "test.ts",
            "isReadonly": false,
            "kind": "Number",
            "name": "staticCount",
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
            "scope": "static",
            "text": "number",
            "value": undefined,
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
            "kind": "FunctionSignature",
            "modifier": undefined,
            "parameters": [
              {
                "context": "parameter",
                "defaultValue": {
                  "initialCount": 0,
                },
                "description": undefined,
                "filePath": "test.ts",
                "isOptional": false,
                "kind": "Object",
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
                "properties": [
                  {
                    "context": "property",
                    "defaultValue": 0,
                    "filePath": "test.ts",
                    "isOptional": false,
                    "isReadonly": false,
                    "kind": "Number",
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
                    "value": undefined,
                  },
                ],
                "text": "{ initialCount: number; }",
              },
            ],
            "returnType": "void",
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
            "kind": "FunctionSignature",
            "modifier": undefined,
            "parameters": [
              {
                "context": "parameter",
                "defaultValue": undefined,
                "description": undefined,
                "filePath": "test.ts",
                "isOptional": false,
                "kind": "Number",
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
                "value": undefined,
              },
              {
                "context": "parameter",
                "defaultValue": 0,
                "description": undefined,
                "filePath": "test.ts",
                "isOptional": false,
                "kind": "Number",
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
                "value": undefined,
              },
            ],
            "returnType": "number",
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
        "kind": "Intersection",
        "name": "ButtonVariants",
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
        "properties": [
          {
            "filePath": "test.ts",
            "kind": "Object",
            "name": undefined,
            "position": {
              "end": {
                "column": 39,
                "line": 1,
              },
              "start": {
                "column": 23,
                "line": 1,
              },
            },
            "properties": [
              {
                "context": "property",
                "defaultValue": undefined,
                "filePath": "test.ts",
                "isOptional": false,
                "isReadonly": false,
                "kind": "String",
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
                "value": undefined,
              },
            ],
            "text": "{ color: string; }",
          },
          {
            "filePath": "test.ts",
            "kind": "Union",
            "members": [
              {
                "filePath": "test.ts",
                "kind": "Object",
                "name": undefined,
                "position": {
                  "end": {
                    "column": 70,
                    "line": 1,
                  },
                  "start": {
                    "column": 43,
                    "line": 1,
                  },
                },
                "properties": [
                  {
                    "context": "property",
                    "defaultValue": undefined,
                    "filePath": "test.ts",
                    "isOptional": false,
                    "isReadonly": false,
                    "kind": "String",
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
                    "value": undefined,
                  },
                ],
                "text": "{ backgroundColor: string; }",
              },
              {
                "filePath": "test.ts",
                "kind": "Object",
                "name": undefined,
                "position": {
                  "end": {
                    "column": 96,
                    "line": 1,
                  },
                  "start": {
                    "column": 73,
                    "line": 1,
                  },
                },
                "properties": [
                  {
                    "context": "property",
                    "defaultValue": undefined,
                    "filePath": "test.ts",
                    "isOptional": false,
                    "isReadonly": false,
                    "kind": "String",
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
                    "value": undefined,
                  },
                ],
                "text": "{ borderColor: string; }",
              },
            ],
            "name": undefined,
            "position": {
              "end": {
                "column": 97,
                "line": 1,
              },
              "start": {
                "column": 42,
                "line": 1,
              },
            },
            "text": "{ backgroundColor: string; } | { borderColor: string; }",
          },
        ],
        "text": "ButtonVariants",
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
        "kind": "Object",
        "name": "Config",
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
        "properties": [
          {
            "context": "property",
            "defaultValue": undefined,
            "filePath": "test.ts",
            "isOptional": false,
            "isReadonly": false,
            "kind": "String",
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
            "value": undefined,
          },
          {
            "context": "property",
            "defaultValue": undefined,
            "filePath": "test.ts",
            "isOptional": false,
            "isReadonly": false,
            "kind": "Union",
            "members": [
              {
                "filePath": "test.ts",
                "kind": "Object",
                "name": undefined,
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
                "properties": [
                  {
                    "context": "property",
                    "defaultValue": undefined,
                    "filePath": "test.ts",
                    "isOptional": false,
                    "isReadonly": false,
                    "kind": "String",
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
                    "value": undefined,
                  },
                  {
                    "context": "property",
                    "defaultValue": undefined,
                    "filePath": "test.ts",
                    "isOptional": false,
                    "isReadonly": false,
                    "kind": "String",
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
                    "value": undefined,
                  },
                ],
                "text": "{ apiEndpoint: string; apiKey: string; }",
              },
              {
                "filePath": "test.ts",
                "kind": "Object",
                "name": undefined,
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
                "properties": [
                  {
                    "context": "property",
                    "defaultValue": undefined,
                    "filePath": "test.ts",
                    "isOptional": false,
                    "isReadonly": false,
                    "kind": "String",
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
                    "value": undefined,
                  },
                  {
                    "context": "property",
                    "defaultValue": undefined,
                    "filePath": "test.ts",
                    "isOptional": false,
                    "isReadonly": false,
                    "kind": "Number",
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
                    "value": undefined,
                  },
                  {
                    "context": "property",
                    "defaultValue": undefined,
                    "filePath": "test.ts",
                    "isOptional": false,
                    "isReadonly": false,
                    "kind": "String",
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
                    "value": undefined,
                  },
                ],
                "text": "{ dbHost: string; dbPort: number; dbName: string; }",
              },
            ],
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
          },
        ],
        "text": "Config",
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
            "kind": "FunctionSignature",
            "modifier": undefined,
            "parameters": [
              {
                "context": "parameter",
                "defaultValue": undefined,
                "description": undefined,
                "filePath": "test.ts",
                "isOptional": false,
                "kind": "Union",
                "members": [
                  {
                    "filePath": "test.ts",
                    "kind": "Object",
                    "name": undefined,
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
                    "properties": [
                      {
                        "context": "property",
                        "defaultValue": undefined,
                        "filePath": "test.ts",
                        "isOptional": false,
                        "isReadonly": false,
                        "kind": "String",
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
                        "value": undefined,
                      },
                      {
                        "context": "property",
                        "defaultValue": undefined,
                        "filePath": "test.ts",
                        "isOptional": false,
                        "isReadonly": false,
                        "kind": "String",
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
                        "value": undefined,
                      },
                    ],
                    "text": "{ apiEndpoint: string; apiKey: string; }",
                  },
                  {
                    "filePath": "test.ts",
                    "kind": "Object",
                    "name": undefined,
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
                    "properties": [
                      {
                        "context": "property",
                        "defaultValue": undefined,
                        "filePath": "test.ts",
                        "isOptional": false,
                        "isReadonly": false,
                        "kind": "String",
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
                        "value": undefined,
                      },
                      {
                        "context": "property",
                        "defaultValue": undefined,
                        "filePath": "test.ts",
                        "isOptional": false,
                        "isReadonly": false,
                        "kind": "Number",
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
                        "value": undefined,
                      },
                      {
                        "context": "property",
                        "defaultValue": undefined,
                        "filePath": "test.ts",
                        "isOptional": false,
                        "isReadonly": false,
                        "kind": "String",
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
                        "value": undefined,
                      },
                    ],
                    "text": "{ dbHost: string; dbPort: number; dbName: string; }",
                  },
                ],
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
              },
            ],
            "returnType": "void",
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
      variableDeclaration,
      (symbolMetadata) => {
        if (symbolMetadata.name === 'onClick') {
          return true
        }
        return !symbolMetadata.isInNodeModules
      }
    )

    expect(types).toMatchInlineSnapshot(`
      {
        "filePath": "test.tsx",
        "kind": "Component",
        "name": "Button",
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
        "signatures": [
          {
            "kind": "ComponentSignature",
            "modifier": undefined,
            "parameter": {
              "context": "parameter",
              "defaultValue": undefined,
              "description": undefined,
              "filePath": "test.tsx",
              "isOptional": false,
              "kind": "Object",
              "name": "props",
              "position": {
                "end": {
                  "column": 42,
                  "line": 9,
                },
                "start": {
                  "column": 24,
                  "line": 9,
                },
              },
              "properties": [
                {
                  "context": "property",
                  "defaultValue": undefined,
                  "filePath": "test.tsx",
                  "isOptional": true,
                  "isReadonly": false,
                  "kind": "Union",
                  "members": [
                    {
                      "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
                      "kind": "String",
                      "name": undefined,
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
                      "text": ""primary"",
                      "value": "primary",
                    },
                    {
                      "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
                      "kind": "String",
                      "name": undefined,
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
                      "text": ""secondary"",
                      "value": "secondary",
                    },
                    {
                      "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
                      "kind": "String",
                      "name": undefined,
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
                      "text": ""danger"",
                      "value": "danger",
                    },
                  ],
                  "name": "variant",
                  "position": {
                    "end": {
                      "column": 27,
                      "line": 6,
                    },
                    "start": {
                      "column": 3,
                      "line": 6,
                    },
                  },
                  "text": "ButtonVariant",
                },
                {
                  "context": "property",
                  "defaultValue": undefined,
                  "filePath": "node_modules/@types/react/index.d.ts",
                  "isOptional": true,
                  "isReadonly": false,
                  "kind": "Function",
                  "name": "onClick",
                  "position": {
                    "end": {
                      "column": 52,
                      "line": 2495,
                    },
                    "start": {
                      "column": 9,
                      "line": 2495,
                    },
                  },
                  "signatures": [],
                  "text": "MouseEventHandler<HTMLButtonElement>",
                },
              ],
              "text": "ButtonProps",
            },
            "returnType": "Element",
            "text": "(props: ButtonProps) => Element",
          },
        ],
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
            "kind": "ComponentSignature",
            "modifier": undefined,
            "parameter": {
              "context": "parameter",
              "defaultValue": undefined,
              "description": undefined,
              "filePath": "test.ts",
              "isOptional": false,
              "kind": "Union",
              "members": [
                {
                  "filePath": "test.ts",
                  "kind": "Object",
                  "name": undefined,
                  "position": {
                    "end": {
                      "column": 67,
                      "line": 24,
                    },
                    "start": {
                      "column": 1,
                      "line": 22,
                    },
                  },
                  "properties": [
                    {
                      "context": "property",
                      "defaultValue": undefined,
                      "filePath": "test.ts",
                      "isOptional": false,
                      "isReadonly": false,
                      "kind": "String",
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
                      "value": undefined,
                    },
                    {
                      "context": "property",
                      "defaultValue": undefined,
                      "description": "Controls how types are rendered.",
                      "filePath": "test.ts",
                      "isOptional": true,
                      "isReadonly": false,
                      "kind": "Function",
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
                      "signatures": [
                        {
                          "kind": "FunctionSignature",
                          "modifier": undefined,
                          "parameters": [
                            {
                              "context": "parameter",
                              "defaultValue": undefined,
                              "description": undefined,
                              "element": {
                                "filePath": "test.ts",
                                "kind": "Object",
                                "name": undefined,
                                "position": {
                                  "end": {
                                    "column": 6,
                                    "line": 11,
                                  },
                                  "start": {
                                    "column": 5,
                                    "line": 5,
                                  },
                                },
                                "properties": [
                                  {
                                    "context": "property",
                                    "defaultValue": undefined,
                                    "filePath": "test.ts",
                                    "isOptional": false,
                                    "isReadonly": false,
                                    "kind": "String",
                                    "name": "name",
                                    "position": {
                                      "end": {
                                        "column": 21,
                                        "line": 7,
                                      },
                                      "start": {
                                        "column": 7,
                                        "line": 7,
                                      },
                                    },
                                    "text": "string",
                                    "value": undefined,
                                  },
                                  {
                                    "context": "property",
                                    "defaultValue": undefined,
                                    "filePath": "test.ts",
                                    "isOptional": false,
                                    "isReadonly": false,
                                    "kind": "String",
                                    "name": "description",
                                    "position": {
                                      "end": {
                                        "column": 40,
                                        "line": 10,
                                      },
                                      "start": {
                                        "column": 7,
                                        "line": 10,
                                      },
                                    },
                                    "text": "string",
                                    "value": undefined,
                                  },
                                ],
                                "text": "{ name: string; description: string; }",
                              },
                              "filePath": "test.ts",
                              "isOptional": false,
                              "kind": "Array",
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
                              "text": "Array<{ name: string; description: string; }>",
                            },
                          ],
                          "returnType": "ReactNode",
                          "text": "(exportedTypes: Array<{ name: string; description: string; }>) => ReactNode",
                        },
                      ],
                      "tags": undefined,
                      "text": "(exportedTypes: ReturnType<typeof getExportedTypes>) => React.ReactNode",
                    },
                  ],
                  "text": "{ source: string; } & BaseExportedTypesProps",
                },
                {
                  "filePath": "test.ts",
                  "kind": "Object",
                  "name": undefined,
                  "position": {
                    "end": {
                      "column": 67,
                      "line": 24,
                    },
                    "start": {
                      "column": 1,
                      "line": 22,
                    },
                  },
                  "properties": [
                    {
                      "context": "property",
                      "defaultValue": undefined,
                      "filePath": "test.ts",
                      "isOptional": false,
                      "isReadonly": false,
                      "kind": "String",
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
                      "value": undefined,
                    },
                    {
                      "context": "property",
                      "defaultValue": undefined,
                      "filePath": "test.ts",
                      "isOptional": false,
                      "isReadonly": false,
                      "kind": "String",
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
                      "value": undefined,
                    },
                    {
                      "context": "property",
                      "defaultValue": undefined,
                      "description": "Controls how types are rendered.",
                      "filePath": "test.ts",
                      "isOptional": true,
                      "isReadonly": false,
                      "kind": "Function",
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
                      "signatures": [
                        {
                          "kind": "FunctionSignature",
                          "modifier": undefined,
                          "parameters": [
                            {
                              "context": "parameter",
                              "defaultValue": undefined,
                              "description": undefined,
                              "element": {
                                "filePath": "test.ts",
                                "kind": "Object",
                                "name": undefined,
                                "position": {
                                  "end": {
                                    "column": 6,
                                    "line": 11,
                                  },
                                  "start": {
                                    "column": 5,
                                    "line": 5,
                                  },
                                },
                                "properties": [
                                  {
                                    "context": "property",
                                    "defaultValue": undefined,
                                    "filePath": "test.ts",
                                    "isOptional": false,
                                    "isReadonly": false,
                                    "kind": "String",
                                    "name": "name",
                                    "position": {
                                      "end": {
                                        "column": 21,
                                        "line": 7,
                                      },
                                      "start": {
                                        "column": 7,
                                        "line": 7,
                                      },
                                    },
                                    "text": "string",
                                    "value": undefined,
                                  },
                                  {
                                    "context": "property",
                                    "defaultValue": undefined,
                                    "filePath": "test.ts",
                                    "isOptional": false,
                                    "isReadonly": false,
                                    "kind": "String",
                                    "name": "description",
                                    "position": {
                                      "end": {
                                        "column": 40,
                                        "line": 10,
                                      },
                                      "start": {
                                        "column": 7,
                                        "line": 10,
                                      },
                                    },
                                    "text": "string",
                                    "value": undefined,
                                  },
                                ],
                                "text": "{ name: string; description: string; }",
                              },
                              "filePath": "test.ts",
                              "isOptional": false,
                              "kind": "Array",
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
                              "text": "Array<{ name: string; description: string; }>",
                            },
                          ],
                          "returnType": "ReactNode",
                          "text": "(exportedTypes: Array<{ name: string; description: string; }>) => ReactNode",
                        },
                      ],
                      "tags": undefined,
                      "text": "(exportedTypes: ReturnType<typeof getExportedTypes>) => React.ReactNode",
                    },
                  ],
                  "text": "{ filename: string; value: string; } & BaseExportedTypesProps",
                },
              ],
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
            },
            "returnType": "void",
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
        "kind": "Union",
        "members": [
          {
            "filePath": "node_modules/library/index.d.ts",
            "kind": "Reference",
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
            "text": "InterfaceMetadata",
          },
          {
            "filePath": "test.ts",
            "kind": "Object",
            "name": "TypeAliasMetadata",
            "position": {
              "end": {
                "column": 2,
                "line": 6,
              },
              "start": {
                "column": 1,
                "line": 3,
              },
            },
            "properties": [
              {
                "context": "property",
                "defaultValue": undefined,
                "filePath": "test.ts",
                "isOptional": false,
                "isReadonly": false,
                "kind": "String",
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
                "value": "TypeAlias",
              },
              {
                "context": "property",
                "defaultValue": undefined,
                "filePath": "test.ts",
                "isOptional": false,
                "isReadonly": false,
                "kind": "String",
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
                "value": undefined,
              },
            ],
            "text": "TypeAliasMetadata",
          },
        ],
        "name": "AllMetadata",
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
        "description": "
      The initial count of the counter.",
        "filePath": "test.ts",
        "kind": "Number",
        "name": "initialCount",
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
            "tagName": "internal",
            "text": "only for internal use",
          },
        ],
        "text": "0",
        "value": 0,
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
        "kind": "Object",
        "name": "colors",
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
        "properties": [
          {
            "context": "property",
            "defaultValue": undefined,
            "filePath": "test.ts",
            "isOptional": false,
            "isReadonly": true,
            "kind": "String",
            "name": "primary",
            "position": {
              "end": {
                "column": 21,
                "line": 2,
              },
              "start": {
                "column": 3,
                "line": 2,
              },
            },
            "text": ""#ff0000"",
            "value": "#ff0000",
          },
          {
            "context": "property",
            "defaultValue": undefined,
            "filePath": "test.ts",
            "isOptional": false,
            "isReadonly": true,
            "kind": "String",
            "name": "secondary",
            "position": {
              "end": {
                "column": 23,
                "line": 3,
              },
              "start": {
                "column": 3,
                "line": 3,
              },
            },
            "text": ""#00ff00"",
            "value": "#00ff00",
          },
          {
            "context": "property",
            "defaultValue": undefined,
            "filePath": "test.ts",
            "isOptional": false,
            "isReadonly": true,
            "kind": "String",
            "name": "tertiary",
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
            "text": ""#0000ff"",
            "value": "#0000ff",
          },
        ],
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
          "kind": "Number",
          "name": "awaited",
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
          "value": undefined,
        },
        "counterTypes": {
          "filePath": "test.ts",
          "kind": "Class",
          "methods": [
            {
              "decorators": [],
              "kind": "ClassMethod",
              "name": "increment",
              "scope": undefined,
              "signatures": [
                {
                  "kind": "FunctionSignature",
                  "modifier": undefined,
                  "parameters": [],
                  "returnType": "void",
                  "text": "() => void",
                },
              ],
              "text": "() => void",
              "visibility": undefined,
            },
          ],
          "name": "counter",
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
          "properties": [
            {
              "decorators": [],
              "defaultValue": 0,
              "filePath": "test.ts",
              "isReadonly": false,
              "kind": "Number",
              "name": "count",
              "position": {
                "end": {
                  "column": 21,
                  "line": 2,
                },
                "start": {
                  "column": 3,
                  "line": 2,
                },
              },
              "scope": undefined,
              "text": "number",
              "value": undefined,
              "visibility": undefined,
            },
          ],
          "text": "Counter",
        },
        "promiseTypes": {
          "arguments": [
            {
              "context": "parameter",
              "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
              "kind": "Number",
              "name": undefined,
              "position": {
                "end": {
                  "column": 4943,
                  "line": 4,
                },
                "start": {
                  "column": 4755,
                  "line": 4,
                },
              },
              "text": "number",
              "value": undefined,
            },
          ],
          "filePath": "test.ts",
          "kind": "Generic",
          "name": "promise",
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
          "typeName": "Promise",
        },
      }
    `)
  })

  test('avoids printing primitives in computed-like generics', () => {
    const project = new Project()

    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
        type Compute<Type> = Type extends Function
          ? Type
          : {
              [Key in keyof Type]: Type[Key] extends object
                ? Compute<Type[Key]>
                : Type[Key]
            } & {}
        
        function getGitMetadata() {
          return undefined as unknown as { authors: string }
        }
  
        export type Module = Compute<{ authors?: string[] } & ReturnType<typeof getGitMetadata>>
        `,
      { overwrite: true }
    )
    const typeAlias = sourceFile.getTypeAliasOrThrow('Module')
    const types = resolveType(typeAlias.getType(), typeAlias)

    expect(types).toBeUndefined()
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
        "kind": "Intersection",
        "name": "Foo",
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
        "properties": [
          {
            "filePath": "test.ts",
            "kind": "Reference",
            "position": {
              "end": {
                "column": 48,
                "line": 9,
              },
              "start": {
                "column": 1,
                "line": 9,
              },
            },
            "text": "AllTypes",
          },
          {
            "filePath": "test.ts",
            "kind": "Object",
            "name": undefined,
            "position": {
              "end": {
                "column": 80,
                "line": 11,
              },
              "start": {
                "column": 23,
                "line": 11,
              },
            },
            "properties": [
              {
                "context": "property",
                "defaultValue": undefined,
                "filePath": "test.ts",
                "isOptional": false,
                "isReadonly": false,
                "kind": "Union",
                "members": [
                  {
                    "filePath": "test.ts",
                    "kind": "String",
                    "name": undefined,
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
                    "text": "string",
                    "value": undefined,
                  },
                  {
                    "filePath": "test.ts",
                    "kind": "Boolean",
                    "name": undefined,
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
                    "text": "boolean",
                  },
                ],
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
              },
              {
                "context": "property",
                "defaultValue": undefined,
                "filePath": "test.ts",
                "isOptional": false,
                "isReadonly": false,
                "kind": "Function",
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
                "signatures": [
                  {
                    "kind": "FunctionSignature",
                    "modifier": undefined,
                    "parameters": [],
                    "returnType": "string | boolean",
                    "text": "() => string | boolean",
                  },
                ],
                "text": "() => string | boolean",
              },
            ],
            "text": "{ value: string | boolean; getValue(): string | boolean; }",
          },
        ],
        "text": "Foo",
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
        const methodName = String(context.name);

        function replacementMethod(this: This, ...args: Args): Return {
            console.log("LOG: Entering method.")
            const result = target.call(this, ...args);
            console.log("LOG: Exiting method.")
            return result;
        }

        return replacementMethod;
      }

      class Person {
        name: string;

        constructor(name: string) {
          this.name = name;
        }

        @loggedMethod
        greet(): void {
          console.log("Hello, " + this.name);
        }
      }`,
      { overwrite: true }
    )
    const classDeclaration = sourceFile.getClassOrThrow('Person')
    const types = resolveType(classDeclaration.getType(), classDeclaration)

    expect(types).toMatchInlineSnapshot(`
      {
        "constructors": [
          {
            "kind": "FunctionSignature",
            "modifier": undefined,
            "parameters": [
              {
                "context": "parameter",
                "defaultValue": undefined,
                "description": undefined,
                "filePath": "test.ts",
                "isOptional": false,
                "kind": "String",
                "name": "name",
                "position": {
                  "end": {
                    "column": 27,
                    "line": 20,
                  },
                  "start": {
                    "column": 15,
                    "line": 20,
                  },
                },
                "text": "string",
                "value": undefined,
              },
            ],
            "returnType": "Person",
            "text": "(name: string) => Person",
          },
        ],
        "filePath": "test.ts",
        "kind": "Class",
        "methods": [
          {
            "decorators": [
              {
                "arguments": [],
                "name": "loggedMethod",
              },
            ],
            "kind": "ClassMethod",
            "name": "greet",
            "scope": undefined,
            "signatures": [
              {
                "kind": "FunctionSignature",
                "modifier": undefined,
                "parameters": [],
                "returnType": "void",
                "text": "() => void",
              },
            ],
            "text": "() => void",
            "visibility": undefined,
          },
        ],
        "name": "Person",
        "position": {
          "end": {
            "column": 2,
            "line": 28,
          },
          "start": {
            "column": 1,
            "line": 17,
          },
        },
        "properties": [
          {
            "decorators": [],
            "defaultValue": undefined,
            "filePath": "test.ts",
            "isReadonly": false,
            "kind": "String",
            "name": "name",
            "position": {
              "end": {
                "column": 16,
                "line": 18,
              },
              "start": {
                "column": 3,
                "line": 18,
              },
            },
            "scope": undefined,
            "text": "string",
            "value": undefined,
            "visibility": undefined,
          },
        ],
        "text": "Person",
      }
    `)
  })
})
