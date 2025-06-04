import { describe, test, expect } from 'vitest'
import {
  Project,
  SyntaxKind,
  type ClassDeclaration,
  type FunctionDeclaration,
} from 'ts-morph'
import dedent from 'dedent'

import { resolvePropertySignatures, resolveType } from './resolve-type.js'

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
              "filePath": "test.ts",
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
                  "filePath": "test.ts",
                  "kind": "FunctionSignature",
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
                        "filePath": "test.ts",
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
                              "filePath": "test.ts",
                              "kind": "Number",
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
                          },
                        ],
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
                      },
                    },
                  ],
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
                  "returnType": {
                    "arguments": [
                      {
                        "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
                        "kind": "Number",
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
                    "kind": "TypeReference",
                    "name": "Promise",
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
                    "text": "Promise<number>",
                  },
                  "text": "(parameterValue: { objectValue: number; }) => Promise<number>",
                },
              ],
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
              "element": {
                "filePath": "test.ts",
                "kind": "TypeReference",
                "name": "ExportedType",
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
              "kind": "Array",
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
          },
        ],
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
            "arguments": [
              {
                "filePath": "test.ts",
                "kind": "TypeReference",
                "name": "ExportedType",
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
            "kind": "TypeReference",
            "name": "Promise",
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
            "arguments": [
              {
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
                    "filePath": "test.ts",
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
                            "column": 42,
                            "line": 23,
                          },
                          "start": {
                            "column": 33,
                            "line": 23,
                          },
                        },
                        "text": "number",
                        "type": {
                          "filePath": "test.ts",
                          "kind": "Number",
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
                            "column": 53,
                            "line": 23,
                          },
                          "start": {
                            "column": 44,
                            "line": 23,
                          },
                        },
                        "text": "string",
                        "type": {
                          "filePath": "test.ts",
                          "kind": "String",
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
                      },
                    ],
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
                    "returnType": {
                      "filePath": "test.ts",
                      "kind": "Unknown",
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
                      "text": "void",
                    },
                    "text": "(a: number, b: string) => void",
                  },
                ],
                "text": "(a: number, b: string) => void",
              },
            ],
            "filePath": "test.ts",
            "kind": "TypeReference",
            "name": "Promise",
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
            "arguments": [
              {
                "filePath": "test.ts",
                "kind": "TypeLiteral",
                "members": [
                  {
                    "filePath": "test.ts",
                    "isOptional": false,
                    "isReadonly": false,
                    "kind": "PropertySignature",
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
                    "type": {
                      "filePath": "test.ts",
                      "kind": "String",
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
                  },
                  {
                    "filePath": "test.ts",
                    "isOptional": false,
                    "isReadonly": false,
                    "kind": "PropertySignature",
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
                    "type": {
                      "filePath": "test.ts",
                      "kind": "String",
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
                  },
                ],
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
                "text": "{ slug: string; filePath: string; }",
              },
            ],
            "filePath": "test.ts",
            "kind": "TypeReference",
            "name": "Promise",
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
            "filePath": "test.ts",
            "kind": "UnionType",
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
            "types": [
              {
                "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
                "kind": "String",
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
            "filePath": "test.ts",
            "kind": "UnionType",
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
            "types": [
              {
                "filePath": "test.ts",
                "kind": "Function",
                "name": undefined,
                "position": {
                  "end": {
                    "column": 52,
                    "line": 26,
                  },
                  "start": {
                    "column": 22,
                    "line": 26,
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
                          "filePath": "test.ts",
                          "kind": "String",
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
                      },
                    ],
                    "position": {
                      "end": {
                        "column": 52,
                        "line": 26,
                      },
                      "start": {
                        "column": 22,
                        "line": 26,
                      },
                    },
                    "returnType": {
                      "filePath": "test.ts",
                      "kind": "UnionType",
                      "position": {
                        "end": {
                          "column": 52,
                          "line": 26,
                        },
                        "start": {
                          "column": 22,
                          "line": 26,
                        },
                      },
                      "text": "string | number",
                      "types": [
                        {
                          "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
                          "kind": "String",
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
                    },
                    "text": "(a: string) => string | number",
                  },
                ],
                "text": "(a: string) => string | number",
              },
              {
                "filePath": "test.ts",
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
                      "filePath": "test.ts",
                      "kind": "String",
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
                  },
                ],
                "position": {
                  "end": {
                    "column": 69,
                    "line": 26,
                  },
                  "start": {
                    "column": 56,
                    "line": 26,
                  },
                },
                "text": "{ a: string; }",
              },
              {
                "filePath": "test.ts",
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
                      "filePath": "test.ts",
                      "kind": "Number",
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
                      "element": {
                        "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
                        "kind": "UnionType",
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
                        "types": [
                          {
                            "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
                            "kind": "String",
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
                      },
                      "filePath": "test.ts",
                      "kind": "Array",
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
                  },
                ],
                "position": {
                  "end": {
                    "column": 109,
                    "line": 26,
                  },
                  "start": {
                    "column": 72,
                    "line": 26,
                  },
                },
                "text": "{ b: number; c: (string | number)[]; }",
              },
              {
                "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
                "kind": "String",
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
            "filePath": "test.ts",
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
                  "filePath": "test.ts",
                  "kind": "String",
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
                  "filePath": "test.ts",
                  "kind": "Number",
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
              },
            ],
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
            "filePath": "test.ts",
            "kind": "IntersectionType",
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
            "types": [
              {
                "arguments": [
                  {
                    "filePath": "test.ts",
                    "kind": "TypeReference",
                    "name": "ExportedType",
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
                "kind": "TypeReference",
                "name": "Promise",
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
              },
              {
                "filePath": "test.ts",
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
                      "filePath": "test.ts",
                      "kind": "String",
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
                  },
                ],
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
                "text": "{ a: string; }",
              },
              {
                "filePath": "test.ts",
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
                      "filePath": "test.ts",
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
                          "filePath": "test.ts",
                          "kind": "FunctionSignature",
                          "parameters": [],
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
                          "returnType": {
                            "filePath": "test.ts",
                            "kind": "Unknown",
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
                            "text": "void",
                          },
                          "text": "() => void",
                        },
                      ],
                      "text": "() => void",
                    },
                  },
                ],
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
                  "filePath": "test.ts",
                  "kind": "String",
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
              },
              {
                "kind": "TupleElement",
                "name": "b",
                "text": "number",
                "type": {
                  "filePath": "test.ts",
                  "kind": "Number",
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
              },
              {
                "kind": "TupleElement",
                "name": "string",
                "text": "string",
                "type": {
                  "filePath": "test.ts",
                  "kind": "String",
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
              },
            ],
            "filePath": "test.ts",
            "kind": "Tuple",
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
            "filePath": "test.ts",
            "kind": "TypeReference",
            "name": "FunctionType",
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
        "kind": "UnionType",
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
        "types": [
          {
            "filePath": "test.ts",
            "kind": "IntersectionType",
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
            "text": "FillVariant",
            "types": [
              {
                "filePath": "test.ts",
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
                      "filePath": "test.ts",
                      "kind": "String",
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
                  },
                ],
                "position": {
                  "end": {
                    "column": 10,
                    "line": 8,
                  },
                  "start": {
                    "column": 28,
                    "line": 6,
                  },
                },
                "text": "{ backgroundColor: string; }",
              },
              {
                "filePath": "test.ts",
                "kind": "TypeReference",
                "name": "BaseVariant",
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
          },
          {
            "filePath": "test.ts",
            "kind": "IntersectionType",
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
            "text": "OutlineVariant",
            "types": [
              {
                "filePath": "test.ts",
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
                      "filePath": "test.ts",
                      "kind": "String",
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
                  },
                ],
                "position": {
                  "end": {
                    "column": 10,
                    "line": 12,
                  },
                  "start": {
                    "column": 31,
                    "line": 10,
                  },
                },
                "text": "{ borderColor: string; }",
              },
              {
                "filePath": "test.ts",
                "kind": "TypeReference",
                "name": "BaseVariant",
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
          },
          {
            "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
            "kind": "String",
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
        ],
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
              "filePath": "test.ts",
              "kind": "String",
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
              "filePath": "test.ts",
              "kind": "Number",
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
              "filePath": "test.ts",
              "kind": "Boolean",
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
              "element": {
                "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
                "kind": "String",
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
              "kind": "Array",
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
              "arguments": [
                {
                  "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
                  "kind": "String",
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
                          "column": 46,
                          "line": 17,
                        },
                        "start": {
                          "column": 33,
                          "line": 17,
                        },
                      },
                      "text": "number",
                      "type": {
                        "filePath": "test.ts",
                        "kind": "Number",
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
                    },
                  ],
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
                  "text": "{ value: number; }",
                },
              ],
              "filePath": "test.ts",
              "kind": "TypeReference",
              "name": "Record",
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
              "filePath": "test.ts",
              "kind": "Function",
              "name": undefined,
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
                  "filePath": "test.ts",
                  "kind": "FunctionSignature",
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
                        "filePath": "test.ts",
                        "kind": "String",
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
                    },
                  ],
                  "position": {
                    "end": {
                      "column": 20,
                      "line": 23,
                    },
                    "start": {
                      "column": 17,
                      "line": 20,
                    },
                  },
                  "returnType": {
                    "filePath": "test.ts",
                    "kind": "Unknown",
                    "position": {
                      "end": {
                        "column": 20,
                        "line": 23,
                      },
                      "start": {
                        "column": 17,
                        "line": 20,
                      },
                    },
                    "text": "void",
                  },
                  "text": "(a: string) => void",
                },
              ],
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
              "filePath": "test.ts",
              "kind": "Function",
              "name": "foo",
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
                  "filePath": "test.ts",
                  "isAsync": true,
                  "isGenerator": false,
                  "kind": "FunctionSignature",
                  "parameters": [],
                  "position": {
                    "end": {
                      "column": 32,
                      "line": 28,
                    },
                    "start": {
                      "column": 9,
                      "line": 28,
                    },
                  },
                  "returnType": {
                    "arguments": [
                      {
                        "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
                        "kind": "Unknown",
                        "position": {
                          "end": {
                            "column": 15356,
                            "line": 4,
                          },
                          "start": {
                            "column": 15015,
                            "line": 4,
                          },
                        },
                        "text": "void",
                      },
                    ],
                    "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
                    "kind": "TypeReference",
                    "name": "Promise",
                    "position": {
                      "end": {
                        "column": 15356,
                        "line": 4,
                      },
                      "start": {
                        "column": 15015,
                        "line": 4,
                      },
                    },
                    "text": "Promise<void>",
                  },
                  "text": "function foo(): Promise<void>",
                },
              ],
              "text": "() => Promise<void>",
            },
          },
        ],
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
        "kind": "TypeLiteral",
        "members": [
          {
            "filePath": "test.ts",
            "isOptional": false,
            "isReadonly": true,
            "kind": "PropertySignature",
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
            "text": "{ f: number; }",
            "type": {
              "filePath": "test.ts",
              "kind": "TypeLiteral",
              "members": [
                {
                  "filePath": "test.ts",
                  "isOptional": false,
                  "isReadonly": false,
                  "kind": "PropertySignature",
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
                  "type": {
                    "filePath": "test.ts",
                    "kind": "Number",
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
                },
              ],
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
              "text": "{ f: number; }",
            },
          },
          {
            "filePath": "test.ts",
            "isOptional": false,
            "isReadonly": true,
            "kind": "PropertySignature",
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
            "type": {
              "filePath": "test.ts",
              "kind": "String",
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
          },
          {
            "filePath": "test.ts",
            "isOptional": false,
            "isReadonly": true,
            "kind": "PropertySignature",
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
            "type": {
              "filePath": "test.ts",
              "kind": "Number",
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
          },
          {
            "filePath": "test.ts",
            "isOptional": false,
            "isReadonly": true,
            "kind": "PropertySignature",
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
            "type": {
              "filePath": "test.ts",
              "kind": "String",
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
          },
        ],
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
              "filePath": "test.ts",
              "kind": "String",
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
              "element": {
                "filePath": "test.ts",
                "kind": "TypeReference",
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
                "text": "SelfReferencedType",
              },
              "filePath": "test.ts",
              "kind": "Array",
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
          },
        ],
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
              "filePath": "test.ts",
              "kind": "String",
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
              "element": {
                "filePath": "test.ts",
                "kind": "TypeReference",
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
                "text": "DocNode",
              },
              "filePath": "test.ts",
              "kind": "Array",
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
          },
        ],
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
              "filePath": "test.ts",
              "kind": "String",
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
              "filePath": "test.ts",
              "kind": "TypeReference",
              "name": "DocChildren",
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
          },
        ],
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
          "filePath": "test.ts",
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
                "constructor": undefined,
                "filePath": "test.ts",
                "kind": "Class",
                "name": "Collection",
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
                    "initializer": {
                      "text": "undefined",
                      "value": "undefined",
                    },
                    "isOptional": true,
                    "isReadonly": false,
                    "kind": "ClassProperty",
                    "name": "sources",
                    "scope": undefined,
                    "text": "Array<FileSystemSource<Exports>>",
                    "type": {
                      "element": {
                        "filePath": "test.ts",
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
                              "constructor": undefined,
                              "filePath": "test.ts",
                              "kind": "Class",
                              "name": "Collection",
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
                                  "initializer": {
                                    "text": "undefined",
                                    "value": "undefined",
                                  },
                                  "isOptional": true,
                                  "isReadonly": false,
                                  "kind": "ClassProperty",
                                  "name": "sources",
                                  "scope": undefined,
                                  "text": "Array<FileSystemSource<Exports>>",
                                  "type": {
                                    "filePath": "test.ts",
                                    "kind": "TypeReference",
                                    "name": "Array",
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
                                    "text": "Array<FileSystemSource<Exports>>",
                                  },
                                  "visibility": undefined,
                                },
                              ],
                              "text": "Collection<Exports>",
                            },
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
                      },
                      "filePath": "test.ts",
                      "kind": "Array",
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
                      "text": "Array<FileSystemSource<Exports>>",
                    },
                    "visibility": undefined,
                  },
                ],
                "text": "Collection<Exports>",
              },
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
              "filePath": "test.ts",
              "kind": "TypeReference",
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
          },
        ],
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
              "arguments": [
                {
                  "filePath": "test.ts",
                  "kind": "TypeLiteral",
                  "members": [
                    {
                      "filePath": "test.ts",
                      "isOptional": false,
                      "isReadonly": false,
                      "kind": "PropertySignature",
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
                      "type": {
                        "filePath": "test.ts",
                        "kind": "String",
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
                  "text": "Foo",
                },
              ],
              "filePath": "test.ts",
              "kind": "TypeReference",
              "name": "Promise",
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
            },
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
        "kind": "UnionType",
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
        "text": "UnwrapPromisesInMap<Omit<A, "title">> | UnwrapPromisesInMap<Omit<B, "title">>",
        "types": [
          {
            "filePath": "test.ts",
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
                  "arguments": [
                    {
                      "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
                      "kind": "Number",
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
                  "kind": "TypeReference",
                  "name": "Promise",
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
                  "filePath": "test.ts",
                  "kind": "String",
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
              },
            ],
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
            "text": "UnwrapPromisesInMap<Omit<A, "title">>",
          },
          {
            "filePath": "test.ts",
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
                  "filePath": "test.ts",
                  "kind": "String",
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
                  "filePath": "test.ts",
                  "kind": "Number",
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
              },
            ],
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
            "text": "UnwrapPromisesInMap<Omit<B, "title">>",
          },
        ],
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
              "filePath": "test.ts",
              "kind": "TypeReference",
              "name": "Color",
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
          },
        ],
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
              "filePath": "test.ts",
              "kind": "UnionType",
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
              "types": [
                {
                  "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
                  "kind": "String",
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
                "column": 38,
                "line": 13,
              },
              "start": {
                "column": 1,
                "line": 11,
              },
            },
            "text": "Color",
            "type": {
              "filePath": "node_modules/@types/library/index.d.ts",
              "kind": "TypeReference",
              "name": "Color",
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
          },
        ],
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
              "element": {
                "filePath": "test.ts",
                "kind": "IntersectionType",
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
                "text": "ExportedType",
                "types": [
                  {
                    "arguments": [],
                    "filePath": "node_modules/@types/library/index.d.ts",
                    "kind": "TypeReference",
                    "name": "Metadata",
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
                    "kind": "TypeLiteral",
                    "members": [
                      {
                        "filePath": "test.ts",
                        "isOptional": false,
                        "isReadonly": false,
                        "kind": "PropertySignature",
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
                        "type": {
                          "filePath": "test.ts",
                          "kind": "String",
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
                      },
                    ],
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
                    "text": "{ slug: string; }",
                  },
                ],
              },
              "filePath": "test.ts",
              "kind": "Array",
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
            "filePath": "test.ts",
            "kind": "FunctionSignature",
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
                  "filePath": "test.ts",
                  "kind": "TypeReference",
                  "name": "Color",
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
              },
            ],
            "position": {
              "end": {
                "column": 42,
                "line": 3,
              },
              "start": {
                "column": 20,
                "line": 3,
              },
            },
            "returnType": {
              "filePath": "test.ts",
              "kind": "Unknown",
              "position": {
                "end": {
                  "column": 42,
                  "line": 3,
                },
                "start": {
                  "column": 20,
                  "line": 3,
                },
              },
              "text": "void",
            },
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
                "filePath": "test.ts",
                "kind": "Interface",
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
                      "filePath": "node_modules/@types/library/index.d.ts",
                      "kind": "TypeReference",
                      "name": "Color",
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
                  },
                ],
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
              "filePath": "test.ts",
              "kind": "Unknown",
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
        "kind": "Function",
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
                  "filePath": "test.ts",
                  "kind": "TypeReference",
                  "name": "TextProps",
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
              },
            ],
            "position": {
              "end": {
                "column": 46,
                "line": 8,
              },
              "start": {
                "column": 20,
                "line": 8,
              },
            },
            "returnType": {
              "filePath": "test.ts",
              "kind": "Unknown",
              "position": {
                "end": {
                  "column": 46,
                  "line": 8,
                },
                "start": {
                  "column": 20,
                  "line": 8,
                },
              },
              "text": "void",
            },
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
                "filePath": "test.ts",
                "kind": "TypeReference",
                "name": "TextProps",
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
              "filePath": "test.ts",
              "kind": "Unknown",
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
                "filePath": "test.ts",
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
                      "filePath": "test.ts",
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
                            "filePath": "test.ts",
                            "kind": "Number",
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
                            "filePath": "test.ts",
                            "kind": "Number",
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
                            "filePath": "test.ts",
                            "kind": "String",
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
                        },
                      ],
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
                    },
                  },
                ],
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
              "filePath": "test.ts",
              "kind": "Unknown",
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
              "filePath": "test.ts",
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
                    "arguments": [
                      {
                        "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
                        "kind": "String",
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
                        "kind": "Any",
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
                    "filePath": "test.ts",
                    "kind": "TypeReference",
                    "name": "Record",
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
                  },
                },
              ],
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
              "text": "{ frontMatter: Record<string, any>; }",
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
            "text": "Type",
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
          "filePath": "test.ts",
          "kind": "UnionType",
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
          "types": [
            {
              "filePath": "test.ts",
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
                    "arguments": [
                      {
                        "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
                        "kind": "String",
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
                        "kind": "Any",
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
                    "filePath": "test.ts",
                    "kind": "TypeReference",
                    "name": "Record",
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
                  },
                },
              ],
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
              "text": "{ frontMatter: Record<string, any>; }",
            },
            {
              "filePath": "test.ts",
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
                    "arguments": [
                      {
                        "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
                        "kind": "String",
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
                        "kind": "Any",
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
                    "filePath": "test.ts",
                    "kind": "TypeReference",
                    "name": "Record",
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
                  },
                },
              ],
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
              "text": "{ frontMatter: Record<string, any>; }",
            },
          ],
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
                  "filePath": "test.ts",
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
                        "filePath": "test.ts",
                        "kind": "Number",
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
                        "filePath": "test.ts",
                        "kind": "Number",
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
                    },
                  ],
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
              "filePath": "test.ts",
              "kind": "Unknown",
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
              "filePath": "test.ts",
              "kind": "UnionType",
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
              "types": [
                {
                  "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
                  "kind": "String",
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
                  "kind": "Unknown",
                  "position": {
                    "end": {
                      "column": 28,
                      "line": 2,
                    },
                    "start": {
                      "column": 19,
                      "line": 2,
                    },
                  },
                  "text": "undefined",
                },
              ],
            },
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
          },
        ],
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
                      "filePath": "test.ts",
                      "kind": "String",
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
                  "filePath": "test.ts",
                  "kind": "Unknown",
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
              "kind": "String",
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
              "constructor": undefined,
              "filePath": "test.ts",
              "kind": "Class",
              "name": "TextView",
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
                  "initializer": {
                    "text": "'#666'",
                    "value": "#666",
                  },
                  "isOptional": true,
                  "isReadonly": false,
                  "kind": "ClassProperty",
                  "name": "color",
                  "scope": undefined,
                  "text": "string",
                  "type": {
                    "filePath": "test.ts",
                    "kind": "String",
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
                    "value": undefined,
                  },
                  "visibility": undefined,
                },
              ],
              "text": "TextView",
            },
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
        "kind": "TypeLiteral",
        "members": [
          {
            "filePath": "test.ts",
            "isOptional": false,
            "isReadonly": true,
            "kind": "PropertySignature",
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
            "type": {
              "filePath": "test.ts",
              "kind": "String",
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
          },
          {
            "filePath": "test.ts",
            "isOptional": false,
            "isReadonly": true,
            "kind": "PropertySignature",
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
            "type": {
              "filePath": "test.ts",
              "kind": "String",
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
          },
          {
            "filePath": "test.ts",
            "isOptional": false,
            "isReadonly": true,
            "kind": "PropertySignature",
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
            "type": {
              "filePath": "test.ts",
              "kind": "String",
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
          },
        ],
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
              "filePath": "test.ts",
              "kind": "UnionType",
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
              "types": [
                {
                  "filePath": "test.ts",
                  "kind": "String",
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
            },
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
        "text": "TextProps",
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
              "filePath": "test.ts",
              "kind": "UnionType",
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
              "types": [
                {
                  "filePath": "test.ts",
                  "kind": "String",
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
            },
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
        "text": "TextProps",
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
              "filePath": "test.ts",
              "kind": "TypeReference",
              "name": "Colors",
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
            },
          },
        ],
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
              "arguments": [
                {
                  "filePath": "test.ts",
                  "kind": "TypeLiteral",
                  "members": [
                    {
                      "filePath": "test.ts",
                      "isOptional": false,
                      "isReadonly": false,
                      "kind": "PropertySignature",
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
                      "type": {
                        "filePath": "test.ts",
                        "kind": "String",
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
                    },
                    {
                      "filePath": "test.ts",
                      "isOptional": false,
                      "isReadonly": false,
                      "kind": "PropertySignature",
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
                      "type": {
                        "filePath": "test.ts",
                        "kind": "String",
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
                    },
                  ],
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
                  "text": "{ slug: string; filePath: string; }",
                },
              ],
              "filePath": "test.ts",
              "kind": "TypeReference",
              "name": "Promise",
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
            },
          },
        ],
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
              "description": "Represents all of the things React can render.

      Where {@link ReactElement} only represents JSX, \`ReactNode\` represents everything that can be rendered.",
              "filePath": "node_modules/@types/react/index.d.ts",
              "kind": "UnionType",
              "position": {
                "end": {
                  "column": 37,
                  "line": 439,
                },
                "start": {
                  "column": 5,
                  "line": 426,
                },
              },
              "tags": [
                {
                  "name": "see",
                  "text": "{@link https://react-typescript-cheatsheet.netlify.app/docs/react-types/reactnode/ React TypeScript Cheatsheet}",
                },
                {
                  "name": "example",
                  "text": "\`\`\`tsx
      // Typing children
      type Props = { children: ReactNode }

      const Component = ({ children }: Props) => <div>{children}</div>

      <Component>hello</Component>
      \`\`\`",
                },
                {
                  "name": "example",
                  "text": "\`\`\`tsx
      // Typing a custom element
      type Props = { customElement: ReactNode }

      const Component = ({ customElement }: Props) => <div>{customElement}</div>

      <Component customElement={<div>hello</div>} />
      \`\`\`",
                },
              ],
              "text": "React.ReactNode",
              "types": [
                {
                  "arguments": [],
                  "filePath": "node_modules/@types/react/index.d.ts",
                  "kind": "TypeReference",
                  "name": "ReactElement",
                  "position": {
                    "end": {
                      "column": 6,
                      "line": 322,
                    },
                    "start": {
                      "column": 5,
                      "line": 315,
                    },
                  },
                  "text": "ReactElement<unknown, string | JSXElementConstructor<any>>",
                },
                {
                  "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
                  "kind": "String",
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
                {
                  "arguments": [],
                  "filePath": "node_modules/typescript/lib/lib.es2020.bigint.d.ts",
                  "kind": "TypeReference",
                  "name": "BigInt",
                  "position": {
                    "end": {
                      "column": 817,
                      "line": 3,
                    },
                    "start": {
                      "column": 623,
                      "line": 3,
                    },
                  },
                  "text": "BigInt",
                },
                {
                  "arguments": [
                    {
                      "arguments": [],
                      "filePath": "node_modules/@types/react/index.d.ts",
                      "kind": "TypeReference",
                      "name": "ReactNode",
                      "position": {
                        "end": {
                          "column": 37,
                          "line": 439,
                        },
                        "start": {
                          "column": 5,
                          "line": 426,
                        },
                      },
                      "text": "ReactNode",
                    },
                  ],
                  "filePath": "node_modules/typescript/lib/lib.es2015.iterable.d.ts",
                  "kind": "TypeReference",
                  "name": "Iterable",
                  "position": {
                    "end": {
                      "column": 560,
                      "line": 3,
                    },
                    "start": {
                      "column": 469,
                      "line": 3,
                    },
                  },
                  "text": "Iterable<ReactNode>",
                },
                {
                  "arguments": [],
                  "filePath": "node_modules/@types/react/index.d.ts",
                  "kind": "TypeReference",
                  "name": "ReactPortal",
                  "position": {
                    "end": {
                      "column": 6,
                      "line": 388,
                    },
                    "start": {
                      "column": 5,
                      "line": 386,
                    },
                  },
                  "text": "ReactPortal",
                },
                {
                  "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
                  "kind": "Boolean",
                  "position": {
                    "end": {
                      "column": 4613,
                      "line": 4,
                    },
                    "start": {
                      "column": 4576,
                      "line": 4,
                    },
                  },
                  "text": "boolean",
                },
                {
                  "filePath": "node_modules/@types/react/index.d.ts",
                  "kind": "Unknown",
                  "position": {
                    "end": {
                      "column": 15,
                      "line": 434,
                    },
                    "start": {
                      "column": 11,
                      "line": 434,
                    },
                  },
                  "text": "null",
                },
                {
                  "filePath": "node_modules/@types/react/index.d.ts",
                  "kind": "Unknown",
                  "position": {
                    "end": {
                      "column": 20,
                      "line": 435,
                    },
                    "start": {
                      "column": 11,
                      "line": 435,
                    },
                  },
                  "text": "undefined",
                },
                {
                  "filePath": "node_modules/@types/react/index.d.ts",
                  "kind": "Unknown",
                  "position": {
                    "end": {
                      "column": 10,
                      "line": 438,
                    },
                    "start": {
                      "column": 11,
                      "line": 436,
                    },
                  },
                  "text": "never",
                },
                {
                  "arguments": [
                    {
                      "arguments": [],
                      "filePath": "node_modules/@types/react/index.d.ts",
                      "kind": "TypeReference",
                      "name": "AwaitedReactNode",
                      "position": {
                        "end": {
                          "column": 7,
                          "line": 53,
                        },
                        "start": {
                          "column": 1,
                          "line": 41,
                        },
                      },
                      "text": "AwaitedReactNode",
                    },
                  ],
                  "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
                  "kind": "TypeReference",
                  "name": "Promise",
                  "position": {
                    "end": {
                      "column": 15356,
                      "line": 4,
                    },
                    "start": {
                      "column": 15015,
                      "line": 4,
                    },
                  },
                  "text": "Promise<AwaitedReactNode>",
                },
              ],
            },
            "text": "function Text(): React.ReactNode",
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
                  "filePath": "test.ts",
                  "kind": "Number",
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
              "filePath": "test.ts",
              "kind": "Unknown",
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
                  "filePath": "test.ts",
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
                        "filePath": "test.ts",
                        "kind": "Number",
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
                        "text": "number",
                        "value": undefined,
                      },
                    },
                  ],
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
              "description": "Provides a counter state.",
              "filePath": "test.ts",
              "kind": "Unknown",
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
              "tags": [
                {
                  "name": "deprecated",
                  "text": "use \`Counter\` component",
                },
              ],
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
                  "filePath": "test.ts",
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
                        "filePath": "test.ts",
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
                              "filePath": "test.ts",
                              "kind": "Number",
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
                          },
                        ],
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
                      },
                    },
                  ],
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
              "filePath": "test.ts",
              "kind": "Unknown",
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
                    "column": 45,
                    "line": 1,
                  },
                  "start": {
                    "column": 21,
                    "line": 1,
                  },
                },
                "text": "number",
                "type": {
                  "filePath": "test.ts",
                  "kind": "Number",
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
              },
            ],
            "position": {
              "end": {
                "column": 52,
                "line": 1,
              },
              "start": {
                "column": 20,
                "line": 1,
              },
            },
            "returnType": {
              "filePath": "test.ts",
              "kind": "Unknown",
              "position": {
                "end": {
                  "column": 52,
                  "line": 1,
                },
                "start": {
                  "column": 20,
                  "line": 1,
                },
              },
              "text": "void",
            },
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
                    "column": 54,
                    "line": 1,
                  },
                  "start": {
                    "column": 30,
                    "line": 1,
                  },
                },
                "text": "number",
                "type": {
                  "filePath": "test.ts",
                  "kind": "Number",
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
              },
            ],
            "position": {
              "end": {
                "column": 58,
                "line": 1,
              },
              "start": {
                "column": 20,
                "line": 1,
              },
            },
            "returnType": {
              "filePath": "test.ts",
              "kind": "Unknown",
              "position": {
                "end": {
                  "column": 58,
                  "line": 1,
                },
                "start": {
                  "column": 20,
                  "line": 1,
                },
              },
              "text": "void",
            },
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
                  "filePath": "test.ts",
                  "kind": "TypeReference",
                  "name": "CounterOptions",
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
              "filePath": "test.ts",
              "kind": "Unknown",
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
                  "filePath": "test.ts",
                  "kind": "TypeReference",
                  "name": "ReturnType<typeof useCounter>",
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
              "filePath": "test.ts",
              "kind": "Unknown",
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
                "filePath": "test.ts",
                "kind": "UnionType",
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
                "text": "BaseProps & { source: string; } | BaseProps & { value: string; }",
                "types": [
                  {
                    "filePath": "test.ts",
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
                          "filePath": "test.ts",
                          "kind": "String",
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
                          "filePath": "test.ts",
                          "kind": "String",
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
                      },
                    ],
                    "position": {
                      "end": {
                        "column": 44,
                        "line": 3,
                      },
                      "start": {
                        "column": 14,
                        "line": 3,
                      },
                    },
                    "text": "BaseProps & { source: string; }",
                  },
                  {
                    "filePath": "test.ts",
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
                          "filePath": "test.ts",
                          "kind": "String",
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
                          "filePath": "test.ts",
                          "kind": "String",
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
                      },
                    ],
                    "position": {
                      "end": {
                        "column": 76,
                        "line": 3,
                      },
                      "start": {
                        "column": 47,
                        "line": 3,
                      },
                    },
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
              "filePath": "test.ts",
              "kind": "Unknown",
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
                  "filePath": "test.ts",
                  "kind": "UnionType",
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
                  "text": "{ color: string; } | string",
                  "types": [
                    {
                      "filePath": "test.ts",
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
                            "filePath": "test.ts",
                            "kind": "String",
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
                        },
                      ],
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
                      "text": "{ color: string; }",
                    },
                    {
                      "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
                      "kind": "String",
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
              "filePath": "test.ts",
              "kind": "Unknown",
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
                "filePath": "test.ts",
                "kind": "UnionType",
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
                "text": "BaseProps & { source: string; } | BaseProps & { value: string; }",
                "types": [
                  {
                    "filePath": "test.ts",
                    "kind": "IntersectionType",
                    "position": {
                      "end": {
                        "column": 44,
                        "line": 3,
                      },
                      "start": {
                        "column": 14,
                        "line": 3,
                      },
                    },
                    "text": "BaseProps & { source: string; }",
                    "types": [
                      {
                        "filePath": "types.ts",
                        "kind": "TypeReference",
                        "name": "BaseProps",
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
                        "filePath": "test.ts",
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
                              "filePath": "test.ts",
                              "kind": "String",
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
                          },
                        ],
                        "position": {
                          "end": {
                            "column": 44,
                            "line": 3,
                          },
                          "start": {
                            "column": 26,
                            "line": 3,
                          },
                        },
                        "text": "{ source: string; }",
                      },
                    ],
                  },
                  {
                    "filePath": "test.ts",
                    "kind": "IntersectionType",
                    "position": {
                      "end": {
                        "column": 76,
                        "line": 3,
                      },
                      "start": {
                        "column": 47,
                        "line": 3,
                      },
                    },
                    "text": "BaseProps & { value: string; }",
                    "types": [
                      {
                        "filePath": "types.ts",
                        "kind": "TypeReference",
                        "name": "BaseProps",
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
                        "filePath": "test.ts",
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
                              "filePath": "test.ts",
                              "kind": "String",
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
                          },
                        ],
                        "position": {
                          "end": {
                            "column": 76,
                            "line": 3,
                          },
                          "start": {
                            "column": 59,
                            "line": 3,
                          },
                        },
                        "text": "{ value: string; }",
                      },
                    ],
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
              "filePath": "test.ts",
              "kind": "Unknown",
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
              "filePath": "test.tsx",
              "kind": "UnionType",
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
              "text": "Languages | "mdx"",
              "types": [
                {
                  "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
                  "kind": "String",
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
                  "text": ""jsx"",
                  "value": "jsx",
                },
                {
                  "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
                  "kind": "String",
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
                  "text": ""tsx"",
                  "value": "tsx",
                },
                {
                  "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
                  "kind": "String",
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
                  "text": ""mdx"",
                  "value": "mdx",
                },
              ],
            },
          },
        ],
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
                "filePath": "test.ts",
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
                      "filePath": "test.ts",
                      "kind": "UnionType",
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
                      "types": [
                        {
                          "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
                          "kind": "String",
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
                      ],
                    },
                  },
                ],
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
                "text": "{ variant?: "primary" | "secondary"; }",
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
              "filePath": "test.ts",
              "kind": "Unknown",
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
            "key": "string",
            "kind": "IndexSignature",
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
              "filePath": "test.ts",
              "kind": "Unknown",
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
              "filePath": "test.ts",
              "kind": "String",
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
          },
          {
            "key": "string",
            "kind": "IndexSignature",
            "text": "[key: string]: unknown",
            "type": {
              "filePath": "test.ts",
              "kind": "Unknown",
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
            "filePath": "test.ts",
            "kind": "ComponentSignature",
            "parameter": {
              "description": undefined,
              "filePath": "test.ts",
              "initializer": {
                "text": "",
                "value": {
                  "variant": "body1",
                },
              },
              "isOptional": false,
              "kind": "Parameter",
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
              "type": {
                "filePath": "test.ts",
                "kind": "TypeReference",
                "name": "TextProps",
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
            },
            "position": {
              "end": {
                "column": 2,
                "line": 29,
              },
              "start": {
                "column": 21,
                "line": 21,
              },
            },
            "returnType": {
              "filePath": "test.ts",
              "kind": "Unknown",
              "position": {
                "end": {
                  "column": 2,
                  "line": 29,
                },
                "start": {
                  "column": 21,
                  "line": 21,
                },
              },
              "text": "void",
            },
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
              "filePath": "test.ts",
              "kind": "UnionType",
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
              "types": [
                {
                  "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
                  "kind": "String",
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
                  "text": ""heading1"",
                  "value": "heading1",
                },
                {
                  "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
                  "kind": "String",
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
                  "text": ""heading2"",
                  "value": "heading2",
                },
                {
                  "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
                  "kind": "String",
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
                  "text": ""heading3"",
                  "value": "heading3",
                },
                {
                  "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
                  "kind": "String",
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
                  "text": ""body1"",
                  "value": "body1",
                },
                {
                  "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
                  "kind": "String",
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
              "filePath": "test.ts",
              "kind": "UnionType",
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
              "types": [
                {
                  "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
                  "kind": "String",
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
            },
          },
        ],
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
              "filePath": "test.ts",
              "kind": "UnionType",
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
              "text": ""heading1" | "heading2" | "heading3" | "body1" | "body2"",
              "types": [
                {
                  "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
                  "kind": "String",
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
                  "text": ""heading1"",
                  "value": "heading1",
                },
                {
                  "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
                  "kind": "String",
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
                  "text": ""heading2"",
                  "value": "heading2",
                },
                {
                  "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
                  "kind": "String",
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
                  "text": ""heading3"",
                  "value": "heading3",
                },
                {
                  "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
                  "kind": "String",
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
                  "text": ""body1"",
                  "value": "body1",
                },
                {
                  "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
                  "kind": "String",
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
              "filePath": "test.ts",
              "kind": "UnionType",
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
              "text": "string | number",
              "types": [
                {
                  "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
                  "kind": "String",
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
            },
          },
        ],
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
                "filePath": "test.ts",
                "kind": "Number",
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
              "filePath": "test.ts",
              "kind": "Number",
              "position": {
                "end": {
                  "column": 4,
                  "line": 33,
                },
                "start": {
                  "column": 3,
                  "line": 31,
                },
              },
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
                    "filePath": "test.ts",
                    "kind": "Number",
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
                "filePath": "test.ts",
                "kind": "TypeReference",
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
                  "description": "Increments the count.",
                  "filePath": "test.ts",
                  "kind": "Unknown",
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
                  "tags": undefined,
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
                  "description": "Decrements the count.",
                  "filePath": "test.ts",
                  "kind": "Unknown",
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
                  "tags": undefined,
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
                      "filePath": "test.ts",
                      "kind": "Boolean",
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
                  "filePath": "test.ts",
                  "kind": "Number",
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
                  "filePath": "test.ts",
                  "kind": "Number",
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
              "kind": "Number",
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
              "value": undefined,
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
              "kind": "Number",
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
              "value": undefined,
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
                  "filePath": "test.ts",
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
                        "filePath": "test.ts",
                        "kind": "Number",
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
                    },
                  ],
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
              "filePath": "test.ts",
              "kind": "Unknown",
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
                  "filePath": "test.ts",
                  "kind": "Number",
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
                  "filePath": "test.ts",
                  "kind": "Number",
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
              "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
              "kind": "Number",
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
        "kind": "IntersectionType",
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
        "types": [
          {
            "filePath": "test.ts",
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
                  "filePath": "test.ts",
                  "kind": "String",
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
              },
            ],
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
            "text": "{ color: string; }",
          },
          {
            "filePath": "test.ts",
            "kind": "UnionType",
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
            "types": [
              {
                "filePath": "test.ts",
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
                      "filePath": "test.ts",
                      "kind": "String",
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
                  },
                ],
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
                "text": "{ backgroundColor: string; }",
              },
              {
                "filePath": "test.ts",
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
                      "filePath": "test.ts",
                      "kind": "String",
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
                  },
                ],
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
                "text": "{ borderColor: string; }",
              },
            ],
          },
        ],
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
              "filePath": "test.ts",
              "kind": "String",
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
              "filePath": "test.ts",
              "kind": "UnionType",
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
              "types": [
                {
                  "filePath": "test.ts",
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
                        "filePath": "test.ts",
                        "kind": "String",
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
                        "filePath": "test.ts",
                        "kind": "String",
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
                    },
                  ],
                  "position": {
                    "end": {
                      "column": 4,
                      "line": 6,
                    },
                    "start": {
                      "column": 13,
                      "line": 3,
                    },
                  },
                  "text": "{ apiEndpoint: string; apiKey: string; }",
                },
                {
                  "filePath": "test.ts",
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
                        "filePath": "test.ts",
                        "kind": "String",
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
                        "filePath": "test.ts",
                        "kind": "Number",
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
                        "filePath": "test.ts",
                        "kind": "String",
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
                    },
                  ],
                  "position": {
                    "end": {
                      "column": 4,
                      "line": 10,
                    },
                    "start": {
                      "column": 7,
                      "line": 6,
                    },
                  },
                  "text": "{ dbHost: string; dbPort: number; dbName: string; }",
                },
              ],
            },
          },
        ],
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
                  "filePath": "test.ts",
                  "kind": "UnionType",
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
                  "types": [
                    {
                      "filePath": "test.ts",
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
                            "filePath": "test.ts",
                            "kind": "String",
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
                            "filePath": "test.ts",
                            "kind": "String",
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
                        },
                      ],
                      "position": {
                        "end": {
                          "column": 53,
                          "line": 2,
                        },
                        "start": {
                          "column": 13,
                          "line": 2,
                        },
                      },
                      "text": "{ apiEndpoint: string; apiKey: string; }",
                    },
                    {
                      "filePath": "test.ts",
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
                            "filePath": "test.ts",
                            "kind": "String",
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
                            "filePath": "test.ts",
                            "kind": "Number",
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
                            "filePath": "test.ts",
                            "kind": "String",
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
                        },
                      ],
                      "position": {
                        "end": {
                          "column": 107,
                          "line": 2,
                        },
                        "start": {
                          "column": 56,
                          "line": 2,
                        },
                      },
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
              "filePath": "test.ts",
              "kind": "Unknown",
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
            "filePath": "test.tsx",
            "kind": "ComponentSignature",
            "parameter": {
              "description": undefined,
              "filePath": "test.tsx",
              "initializer": undefined,
              "isOptional": false,
              "kind": "Parameter",
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
              "text": "ButtonProps",
              "type": {
                "filePath": "test.tsx",
                "kind": "TypeLiteral",
                "members": [
                  {
                    "filePath": "test.tsx",
                    "isOptional": true,
                    "isReadonly": false,
                    "kind": "PropertySignature",
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
                    "type": {
                      "filePath": "test.tsx",
                      "kind": "UnionType",
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
                      "text": ""primary" | "secondary" | "danger"",
                      "types": [
                        {
                          "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
                          "kind": "String",
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
                    },
                  },
                  {
                    "filePath": "node_modules/@types/react/index.d.ts",
                    "isOptional": true,
                    "isReadonly": false,
                    "kind": "PropertySignature",
                    "name": "onClick",
                    "position": {
                      "end": {
                        "column": 52,
                        "line": 2276,
                      },
                      "start": {
                        "column": 9,
                        "line": 2276,
                      },
                    },
                    "text": "MouseEventHandler<HTMLButtonElement>",
                    "type": {
                      "filePath": "node_modules/@types/react/index.d.ts",
                      "kind": "Function",
                      "name": "MouseEventHandler",
                      "position": {
                        "end": {
                          "column": 52,
                          "line": 2276,
                        },
                        "start": {
                          "column": 9,
                          "line": 2276,
                        },
                      },
                      "signatures": [
                        {
                          "filePath": "node_modules/@types/react/index.d.ts",
                          "kind": "FunctionSignature",
                          "parameters": [
                            {
                              "description": undefined,
                              "filePath": "node_modules/@types/react/index.d.ts",
                              "initializer": undefined,
                              "isOptional": false,
                              "kind": "Parameter",
                              "name": "event",
                              "position": {
                                "end": {
                                  "column": 81,
                                  "line": 2130,
                                },
                                "start": {
                                  "column": 73,
                                  "line": 2130,
                                },
                              },
                              "text": "MouseEvent<HTMLButtonElement, MouseEvent>",
                              "type": {
                                "arguments": [
                                  {
                                    "arguments": [],
                                    "description": "Provides properties and methods (beyond the regular HTMLElement interface it also has available to it by inheritance) for manipulating <button> elements.

      [MDN Reference](https://developer.mozilla.org/docs/Web/API/HTMLButtonElement)",
                                    "filePath": "node_modules/typescript/lib/lib.dom.d.ts",
                                    "kind": "TypeReference",
                                    "name": "HTMLButtonElement",
                                    "position": {
                                      "end": {
                                        "column": 2,
                                        "line": 3894,
                                      },
                                      "start": {
                                        "column": 1,
                                        "line": 3818,
                                      },
                                    },
                                    "tags": undefined,
                                    "text": "HTMLButtonElement",
                                  },
                                  {
                                    "arguments": [],
                                    "description": "Events that occur due to the user interacting with a pointing device (such as a mouse). Common events using this interface include click, dblclick, mouseup, mousedown.

      [MDN Reference](https://developer.mozilla.org/docs/Web/API/MouseEvent)",
                                    "filePath": "node_modules/typescript/lib/lib.dom.d.ts",
                                    "kind": "TypeReference",
                                    "name": "MouseEvent",
                                    "position": {
                                      "end": {
                                        "column": 2,
                                        "line": 9876,
                                      },
                                      "start": {
                                        "column": 1,
                                        "line": 9825,
                                      },
                                    },
                                    "tags": undefined,
                                    "text": "globalThis.MouseEvent",
                                  },
                                ],
                                "filePath": "node_modules/@types/react/index.d.ts",
                                "kind": "TypeReference",
                                "name": "MouseEvent",
                                "position": {
                                  "end": {
                                    "column": 81,
                                    "line": 2130,
                                  },
                                  "start": {
                                    "column": 73,
                                    "line": 2130,
                                  },
                                },
                                "text": "MouseEvent<HTMLButtonElement, globalThis.MouseEvent>",
                              },
                            },
                          ],
                          "position": {
                            "end": {
                              "column": 88,
                              "line": 2130,
                            },
                            "start": {
                              "column": 58,
                              "line": 2130,
                            },
                          },
                          "returnType": {
                            "filePath": "node_modules/@types/react/index.d.ts",
                            "kind": "Unknown",
                            "position": {
                              "end": {
                                "column": 88,
                                "line": 2130,
                              },
                              "start": {
                                "column": 58,
                                "line": 2130,
                              },
                            },
                            "text": "void",
                          },
                          "text": "(event: MouseEvent<HTMLButtonElement, MouseEvent>) => void",
                        },
                      ],
                      "text": "MouseEventHandler<HTMLButtonElement>",
                    },
                  },
                ],
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
                "text": "ButtonProps",
              },
            },
            "position": {
              "end": {
                "column": 2,
                "line": 11,
              },
              "start": {
                "column": 23,
                "line": 9,
              },
            },
            "returnType": {
              "arguments": [],
              "filePath": "node_modules/@types/react/index.d.ts",
              "kind": "TypeReference",
              "name": "Element",
              "position": {
                "end": {
                  "column": 66,
                  "line": 4003,
                },
                "start": {
                  "column": 9,
                  "line": 4003,
                },
              },
              "text": "React.JSX.Element",
            },
            "text": "(props: ButtonProps) => React.JSX.Element",
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
                "filePath": "test.ts",
                "kind": "UnionType",
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
                "text": "{ source: string; } & BaseExportedTypesProps | { filename: string; value: string; } & BaseExportedTypesProps",
                "types": [
                  {
                    "filePath": "test.ts",
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
                          "filePath": "test.ts",
                          "kind": "String",
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
                          "filePath": "test.ts",
                          "kind": "Function",
                          "name": undefined,
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
                              "filePath": "test.ts",
                              "kind": "FunctionSignature",
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
                                    "element": {
                                      "filePath": "test.ts",
                                      "kind": "TypeLiteral",
                                      "members": [
                                        {
                                          "filePath": "test.ts",
                                          "isOptional": false,
                                          "isReadonly": false,
                                          "kind": "PropertySignature",
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
                                          "type": {
                                            "filePath": "test.ts",
                                            "kind": "String",
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
                                        },
                                        {
                                          "filePath": "test.ts",
                                          "isOptional": false,
                                          "isReadonly": false,
                                          "kind": "PropertySignature",
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
                                          "type": {
                                            "filePath": "test.ts",
                                            "kind": "String",
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
                                        },
                                      ],
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
                                      "text": "{ name: string; description: string; }",
                                    },
                                    "filePath": "test.ts",
                                    "kind": "Array",
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
                                },
                              ],
                              "position": {
                                "end": {
                                  "column": 23,
                                  "line": 19,
                                },
                                "start": {
                                  "column": 14,
                                  "line": 17,
                                },
                              },
                              "returnType": {
                                "description": "Represents all of the things React can render.

      Where {@link ReactElement} only represents JSX, \`ReactNode\` represents everything that can be rendered.",
                                "filePath": "node_modules/@types/react/index.d.ts",
                                "kind": "UnionType",
                                "position": {
                                  "end": {
                                    "column": 37,
                                    "line": 439,
                                  },
                                  "start": {
                                    "column": 5,
                                    "line": 426,
                                  },
                                },
                                "tags": [
                                  {
                                    "name": "see",
                                    "text": "{@link https://react-typescript-cheatsheet.netlify.app/docs/react-types/reactnode/ React TypeScript Cheatsheet}",
                                  },
                                  {
                                    "name": "example",
                                    "text": "\`\`\`tsx
      // Typing children
      type Props = { children: ReactNode }

      const Component = ({ children }: Props) => <div>{children}</div>

      <Component>hello</Component>
      \`\`\`",
                                  },
                                  {
                                    "name": "example",
                                    "text": "\`\`\`tsx
      // Typing a custom element
      type Props = { customElement: ReactNode }

      const Component = ({ customElement }: Props) => <div>{customElement}</div>

      <Component customElement={<div>hello</div>} />
      \`\`\`",
                                  },
                                ],
                                "text": "React.ReactNode",
                                "types": [
                                  {
                                    "arguments": [],
                                    "filePath": "node_modules/@types/react/index.d.ts",
                                    "kind": "TypeReference",
                                    "name": "ReactElement",
                                    "position": {
                                      "end": {
                                        "column": 6,
                                        "line": 322,
                                      },
                                      "start": {
                                        "column": 5,
                                        "line": 315,
                                      },
                                    },
                                    "text": "ReactElement<unknown, string | JSXElementConstructor<any>>",
                                  },
                                  {
                                    "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
                                    "kind": "String",
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
                                  {
                                    "arguments": [],
                                    "filePath": "node_modules/typescript/lib/lib.es2020.bigint.d.ts",
                                    "kind": "TypeReference",
                                    "name": "BigInt",
                                    "position": {
                                      "end": {
                                        "column": 817,
                                        "line": 3,
                                      },
                                      "start": {
                                        "column": 623,
                                        "line": 3,
                                      },
                                    },
                                    "text": "BigInt",
                                  },
                                  {
                                    "arguments": [
                                      {
                                        "arguments": [],
                                        "filePath": "node_modules/@types/react/index.d.ts",
                                        "kind": "TypeReference",
                                        "name": "ReactNode",
                                        "position": {
                                          "end": {
                                            "column": 37,
                                            "line": 439,
                                          },
                                          "start": {
                                            "column": 5,
                                            "line": 426,
                                          },
                                        },
                                        "text": "ReactNode",
                                      },
                                    ],
                                    "filePath": "node_modules/typescript/lib/lib.es2015.iterable.d.ts",
                                    "kind": "TypeReference",
                                    "name": "Iterable",
                                    "position": {
                                      "end": {
                                        "column": 560,
                                        "line": 3,
                                      },
                                      "start": {
                                        "column": 469,
                                        "line": 3,
                                      },
                                    },
                                    "text": "Iterable<ReactNode>",
                                  },
                                  {
                                    "arguments": [],
                                    "filePath": "node_modules/@types/react/index.d.ts",
                                    "kind": "TypeReference",
                                    "name": "ReactPortal",
                                    "position": {
                                      "end": {
                                        "column": 6,
                                        "line": 388,
                                      },
                                      "start": {
                                        "column": 5,
                                        "line": 386,
                                      },
                                    },
                                    "text": "ReactPortal",
                                  },
                                  {
                                    "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
                                    "kind": "Boolean",
                                    "position": {
                                      "end": {
                                        "column": 4613,
                                        "line": 4,
                                      },
                                      "start": {
                                        "column": 4576,
                                        "line": 4,
                                      },
                                    },
                                    "text": "boolean",
                                  },
                                  {
                                    "filePath": "node_modules/@types/react/index.d.ts",
                                    "kind": "Unknown",
                                    "position": {
                                      "end": {
                                        "column": 15,
                                        "line": 434,
                                      },
                                      "start": {
                                        "column": 11,
                                        "line": 434,
                                      },
                                    },
                                    "text": "null",
                                  },
                                  {
                                    "filePath": "node_modules/@types/react/index.d.ts",
                                    "kind": "Unknown",
                                    "position": {
                                      "end": {
                                        "column": 20,
                                        "line": 435,
                                      },
                                      "start": {
                                        "column": 11,
                                        "line": 435,
                                      },
                                    },
                                    "text": "undefined",
                                  },
                                  {
                                    "filePath": "node_modules/@types/react/index.d.ts",
                                    "kind": "Unknown",
                                    "position": {
                                      "end": {
                                        "column": 10,
                                        "line": 438,
                                      },
                                      "start": {
                                        "column": 11,
                                        "line": 436,
                                      },
                                    },
                                    "text": "never",
                                  },
                                  {
                                    "arguments": [
                                      {
                                        "arguments": [],
                                        "filePath": "node_modules/@types/react/index.d.ts",
                                        "kind": "TypeReference",
                                        "name": "AwaitedReactNode",
                                        "position": {
                                          "end": {
                                            "column": 7,
                                            "line": 53,
                                          },
                                          "start": {
                                            "column": 1,
                                            "line": 41,
                                          },
                                        },
                                        "text": "AwaitedReactNode",
                                      },
                                    ],
                                    "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
                                    "kind": "TypeReference",
                                    "name": "Promise",
                                    "position": {
                                      "end": {
                                        "column": 15356,
                                        "line": 4,
                                      },
                                      "start": {
                                        "column": 15015,
                                        "line": 4,
                                      },
                                    },
                                    "text": "Promise<AwaitedReactNode>",
                                  },
                                ],
                              },
                              "text": "(exportedTypes: { name: string; description: string; }[]) => React.ReactNode",
                            },
                          ],
                          "text": "(exportedTypes: ReturnType<typeof getExportedTypes>) => React.ReactNode",
                        },
                      },
                    ],
                    "position": {
                      "end": {
                        "column": 50,
                        "line": 23,
                      },
                      "start": {
                        "column": 5,
                        "line": 23,
                      },
                    },
                    "text": "{ source: string; } & BaseExportedTypesProps",
                  },
                  {
                    "filePath": "test.ts",
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
                          "filePath": "test.ts",
                          "kind": "String",
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
                          "filePath": "test.ts",
                          "kind": "String",
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
                          "filePath": "test.ts",
                          "kind": "Function",
                          "name": undefined,
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
                              "filePath": "test.ts",
                              "kind": "FunctionSignature",
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
                                    "element": {
                                      "filePath": "test.ts",
                                      "kind": "TypeLiteral",
                                      "members": [
                                        {
                                          "filePath": "test.ts",
                                          "isOptional": false,
                                          "isReadonly": false,
                                          "kind": "PropertySignature",
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
                                          "type": {
                                            "filePath": "test.ts",
                                            "kind": "String",
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
                                        },
                                        {
                                          "filePath": "test.ts",
                                          "isOptional": false,
                                          "isReadonly": false,
                                          "kind": "PropertySignature",
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
                                          "type": {
                                            "filePath": "test.ts",
                                            "kind": "String",
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
                                        },
                                      ],
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
                                      "text": "{ name: string; description: string; }",
                                    },
                                    "filePath": "test.ts",
                                    "kind": "Array",
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
                                },
                              ],
                              "position": {
                                "end": {
                                  "column": 23,
                                  "line": 19,
                                },
                                "start": {
                                  "column": 14,
                                  "line": 17,
                                },
                              },
                              "returnType": {
                                "description": "Represents all of the things React can render.

      Where {@link ReactElement} only represents JSX, \`ReactNode\` represents everything that can be rendered.",
                                "filePath": "node_modules/@types/react/index.d.ts",
                                "kind": "UnionType",
                                "position": {
                                  "end": {
                                    "column": 37,
                                    "line": 439,
                                  },
                                  "start": {
                                    "column": 5,
                                    "line": 426,
                                  },
                                },
                                "tags": [
                                  {
                                    "name": "see",
                                    "text": "{@link https://react-typescript-cheatsheet.netlify.app/docs/react-types/reactnode/ React TypeScript Cheatsheet}",
                                  },
                                  {
                                    "name": "example",
                                    "text": "\`\`\`tsx
      // Typing children
      type Props = { children: ReactNode }

      const Component = ({ children }: Props) => <div>{children}</div>

      <Component>hello</Component>
      \`\`\`",
                                  },
                                  {
                                    "name": "example",
                                    "text": "\`\`\`tsx
      // Typing a custom element
      type Props = { customElement: ReactNode }

      const Component = ({ customElement }: Props) => <div>{customElement}</div>

      <Component customElement={<div>hello</div>} />
      \`\`\`",
                                  },
                                ],
                                "text": "React.ReactNode",
                                "types": [
                                  {
                                    "arguments": [],
                                    "filePath": "node_modules/@types/react/index.d.ts",
                                    "kind": "TypeReference",
                                    "name": "ReactElement",
                                    "position": {
                                      "end": {
                                        "column": 6,
                                        "line": 322,
                                      },
                                      "start": {
                                        "column": 5,
                                        "line": 315,
                                      },
                                    },
                                    "text": "ReactElement<unknown, string | JSXElementConstructor<any>>",
                                  },
                                  {
                                    "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
                                    "kind": "String",
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
                                  {
                                    "arguments": [],
                                    "filePath": "node_modules/typescript/lib/lib.es2020.bigint.d.ts",
                                    "kind": "TypeReference",
                                    "name": "BigInt",
                                    "position": {
                                      "end": {
                                        "column": 817,
                                        "line": 3,
                                      },
                                      "start": {
                                        "column": 623,
                                        "line": 3,
                                      },
                                    },
                                    "text": "BigInt",
                                  },
                                  {
                                    "arguments": [
                                      {
                                        "arguments": [],
                                        "filePath": "node_modules/@types/react/index.d.ts",
                                        "kind": "TypeReference",
                                        "name": "ReactNode",
                                        "position": {
                                          "end": {
                                            "column": 37,
                                            "line": 439,
                                          },
                                          "start": {
                                            "column": 5,
                                            "line": 426,
                                          },
                                        },
                                        "text": "ReactNode",
                                      },
                                    ],
                                    "filePath": "node_modules/typescript/lib/lib.es2015.iterable.d.ts",
                                    "kind": "TypeReference",
                                    "name": "Iterable",
                                    "position": {
                                      "end": {
                                        "column": 560,
                                        "line": 3,
                                      },
                                      "start": {
                                        "column": 469,
                                        "line": 3,
                                      },
                                    },
                                    "text": "Iterable<ReactNode>",
                                  },
                                  {
                                    "arguments": [],
                                    "filePath": "node_modules/@types/react/index.d.ts",
                                    "kind": "TypeReference",
                                    "name": "ReactPortal",
                                    "position": {
                                      "end": {
                                        "column": 6,
                                        "line": 388,
                                      },
                                      "start": {
                                        "column": 5,
                                        "line": 386,
                                      },
                                    },
                                    "text": "ReactPortal",
                                  },
                                  {
                                    "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
                                    "kind": "Boolean",
                                    "position": {
                                      "end": {
                                        "column": 4613,
                                        "line": 4,
                                      },
                                      "start": {
                                        "column": 4576,
                                        "line": 4,
                                      },
                                    },
                                    "text": "boolean",
                                  },
                                  {
                                    "filePath": "node_modules/@types/react/index.d.ts",
                                    "kind": "Unknown",
                                    "position": {
                                      "end": {
                                        "column": 15,
                                        "line": 434,
                                      },
                                      "start": {
                                        "column": 11,
                                        "line": 434,
                                      },
                                    },
                                    "text": "null",
                                  },
                                  {
                                    "filePath": "node_modules/@types/react/index.d.ts",
                                    "kind": "Unknown",
                                    "position": {
                                      "end": {
                                        "column": 20,
                                        "line": 435,
                                      },
                                      "start": {
                                        "column": 11,
                                        "line": 435,
                                      },
                                    },
                                    "text": "undefined",
                                  },
                                  {
                                    "filePath": "node_modules/@types/react/index.d.ts",
                                    "kind": "Unknown",
                                    "position": {
                                      "end": {
                                        "column": 10,
                                        "line": 438,
                                      },
                                      "start": {
                                        "column": 11,
                                        "line": 436,
                                      },
                                    },
                                    "text": "never",
                                  },
                                  {
                                    "arguments": [
                                      {
                                        "arguments": [],
                                        "filePath": "node_modules/@types/react/index.d.ts",
                                        "kind": "TypeReference",
                                        "name": "AwaitedReactNode",
                                        "position": {
                                          "end": {
                                            "column": 7,
                                            "line": 53,
                                          },
                                          "start": {
                                            "column": 1,
                                            "line": 41,
                                          },
                                        },
                                        "text": "AwaitedReactNode",
                                      },
                                    ],
                                    "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
                                    "kind": "TypeReference",
                                    "name": "Promise",
                                    "position": {
                                      "end": {
                                        "column": 15356,
                                        "line": 4,
                                      },
                                      "start": {
                                        "column": 15015,
                                        "line": 4,
                                      },
                                    },
                                    "text": "Promise<AwaitedReactNode>",
                                  },
                                ],
                              },
                              "text": "(exportedTypes: { name: string; description: string; }[]) => React.ReactNode",
                            },
                          ],
                          "text": "(exportedTypes: ReturnType<typeof getExportedTypes>) => React.ReactNode",
                        },
                      },
                    ],
                    "position": {
                      "end": {
                        "column": 67,
                        "line": 24,
                      },
                      "start": {
                        "column": 5,
                        "line": 24,
                      },
                    },
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
              "filePath": "test.ts",
              "kind": "Unknown",
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
        "kind": "UnionType",
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
        "text": "InterfaceMetadata | TypeAliasMetadata",
        "types": [
          {
            "arguments": [],
            "filePath": "node_modules/library/index.d.ts",
            "kind": "TypeReference",
            "name": "InterfaceMetadata",
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
                  "filePath": "test.ts",
                  "kind": "String",
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
                  "filePath": "test.ts",
                  "kind": "String",
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
              },
            ],
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
            "text": "TypeAliasMetadata",
          },
        ],
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
        "kind": "Number",
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
        "kind": "TypeLiteral",
        "members": [
          {
            "filePath": "test.ts",
            "isOptional": false,
            "isReadonly": true,
            "kind": "PropertySignature",
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
            "type": {
              "filePath": "test.ts",
              "kind": "String",
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
          },
          {
            "filePath": "test.ts",
            "isOptional": false,
            "isReadonly": true,
            "kind": "PropertySignature",
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
            "type": {
              "filePath": "test.ts",
              "kind": "String",
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
          },
          {
            "filePath": "test.ts",
            "isOptional": false,
            "isReadonly": true,
            "kind": "PropertySignature",
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
            "type": {
              "filePath": "test.ts",
              "kind": "String",
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
          },
        ],
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
          "kind": "Number",
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
          "constructor": undefined,
          "filePath": "test.ts",
          "kind": "Class",
          "methods": [
            {
              "kind": "ClassMethod",
              "name": "increment",
              "scope": undefined,
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
                      "line": 5,
                    },
                    "start": {
                      "column": 3,
                      "line": 3,
                    },
                  },
                  "returnType": {
                    "filePath": "test.ts",
                    "kind": "Unknown",
                    "position": {
                      "end": {
                        "column": 4,
                        "line": 5,
                      },
                      "start": {
                        "column": 3,
                        "line": 3,
                      },
                    },
                    "text": "void",
                  },
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
              "initializer": undefined,
              "isOptional": true,
              "isReadonly": false,
              "kind": "ClassProperty",
              "name": "count",
              "scope": undefined,
              "text": "number",
              "type": {
                "filePath": "test.ts",
                "kind": "Number",
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
                "text": "number",
                "value": undefined,
              },
              "visibility": undefined,
            },
          ],
          "text": "Counter",
        },
        "promiseTypes": {
          "arguments": [
            {
              "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
              "kind": "Number",
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
          "kind": "TypeReference",
          "name": "Promise",
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
        "kind": "IntersectionType",
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
        "types": [
          {
            "arguments": [],
            "filePath": "test.ts",
            "kind": "TypeReference",
            "name": "AllTypes",
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
                  "filePath": "test.ts",
                  "kind": "UnionType",
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
                  "types": [
                    {
                      "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
                      "kind": "String",
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
                      "kind": "Boolean",
                      "position": {
                        "end": {
                          "column": 4613,
                          "line": 4,
                        },
                        "start": {
                          "column": 4576,
                          "line": 4,
                        },
                      },
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
                  "filePath": "test.ts",
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
                      "filePath": "test.ts",
                      "kind": "FunctionSignature",
                      "parameters": [],
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
                      "returnType": {
                        "filePath": "test.ts",
                        "kind": "UnionType",
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
                        "text": "string | boolean",
                        "types": [
                          {
                            "filePath": "test.ts",
                            "kind": "String",
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
                            "text": "string",
                            "value": undefined,
                          },
                          {
                            "filePath": "test.ts",
                            "kind": "Boolean",
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
                            "text": "boolean",
                          },
                        ],
                      },
                      "text": "() => string | boolean",
                    },
                  ],
                  "text": "() => string | boolean",
                },
              },
            ],
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
            "text": "{ value: string | boolean; getValue(): string | boolean; }",
          },
        ],
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
                  "constraint": {
                    "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
                    "kind": "TypeReference",
                    "name": "Array",
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
                    "text": "Array<string>",
                  },
                  "defaultType": undefined,
                  "filePath": "test.ts",
                  "kind": "TypeParameter",
                  "name": "Args",
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
              "filePath": "test.ts",
              "kind": "Unknown",
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
              "text": "void",
            },
            "text": "function loggedMethod<Args extends Array<string>>(args: Args): void",
            "typeParameters": [
              {
                "constraint": {
                  "element": {
                    "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
                    "kind": "String",
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
                  "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
                  "kind": "Array",
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
                  "text": "Array<string>",
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
                      "filePath": "test.ts",
                      "kind": "String",
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
                  "filePath": "test.ts",
                  "kind": "String",
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
                  "filePath": "test.ts",
                  "kind": "Function",
                  "name": "Loader",
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
                            "filePath": "test.ts",
                            "kind": "String",
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
                            "value": undefined,
                          },
                        },
                      ],
                      "position": {
                        "end": {
                          "column": 54,
                          "line": 1,
                        },
                        "start": {
                          "column": 22,
                          "line": 1,
                        },
                      },
                      "returnType": {
                        "arguments": [
                          {
                            "constraint": undefined,
                            "defaultType": undefined,
                            "filePath": "test.ts",
                            "kind": "TypeParameter",
                            "name": "Types",
                            "position": {
                              "end": {
                                "column": 26,
                                "line": 8,
                              },
                              "start": {
                                "column": 21,
                                "line": 8,
                              },
                            },
                            "text": "Types",
                          },
                        ],
                        "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
                        "kind": "TypeReference",
                        "name": "Promise",
                        "position": {
                          "end": {
                            "column": 15356,
                            "line": 4,
                          },
                          "start": {
                            "column": 15015,
                            "line": 4,
                          },
                        },
                        "text": "Promise<Types>",
                      },
                      "text": "(path: string) => Promise<Types>",
                    },
                  ],
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
              "filePath": "test.ts",
              "kind": "Function",
              "name": "Loader",
              "position": {
                "end": {
                  "column": 55,
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
                  "kind": "FunctionSignature",
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
                        "filePath": "test.ts",
                        "kind": "String",
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
                        "value": undefined,
                      },
                    },
                  ],
                  "position": {
                    "end": {
                      "column": 54,
                      "line": 1,
                    },
                    "start": {
                      "column": 22,
                      "line": 1,
                    },
                  },
                  "returnType": {
                    "arguments": [
                      {
                        "constraint": undefined,
                        "defaultType": undefined,
                        "filePath": "test.ts",
                        "kind": "TypeParameter",
                        "name": "Types",
                        "position": {
                          "end": {
                            "column": 26,
                            "line": 8,
                          },
                          "start": {
                            "column": 21,
                            "line": 8,
                          },
                        },
                        "text": "Types",
                      },
                    ],
                    "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
                    "kind": "TypeReference",
                    "name": "Promise",
                    "position": {
                      "end": {
                        "column": 15356,
                        "line": 4,
                      },
                      "start": {
                        "column": 15015,
                        "line": 4,
                      },
                    },
                    "text": "Promise<Types>",
                  },
                  "text": "(path: string) => Promise<Types>",
                },
              ],
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
                "name": "schema",
                "position": {
                  "end": {
                    "column": 24,
                    "line": 12,
                  },
                  "start": {
                    "column": 3,
                    "line": 12,
                  },
                },
                "text": "Schema<Types>",
                "type": {
                  "filePath": "test.ts",
                  "isOptional": false,
                  "isReadonly": false,
                  "kind": "MappedType",
                  "parameter": {
                    "constraint": {
                      "filePath": "test.ts",
                      "kind": "UnionType",
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
                      "text": "string | number | symbol",
                      "types": [
                        {
                          "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
                          "kind": "String",
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
                        {
                          "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
                          "kind": "Symbol",
                          "position": {
                            "end": {
                              "column": 691,
                              "line": 4,
                            },
                            "start": {
                              "column": 638,
                              "line": 4,
                            },
                          },
                          "text": "Symbol",
                        },
                      ],
                    },
                    "kind": "TypeParameter",
                    "name": "Key",
                    "text": "Key in string | number | symbol",
                  },
                  "position": {
                    "end": {
                      "column": 24,
                      "line": 12,
                    },
                    "start": {
                      "column": 3,
                      "line": 12,
                    },
                  },
                  "text": "Schema<Types>",
                  "type": {
                    "filePath": "test.ts",
                    "kind": "Function",
                    "name": undefined,
                    "position": {
                      "end": {
                        "column": 62,
                        "line": 4,
                      },
                      "start": {
                        "column": 25,
                        "line": 4,
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
                            "name": "value",
                            "position": {
                              "end": {
                                "column": 43,
                                "line": 4,
                              },
                              "start": {
                                "column": 26,
                                "line": 4,
                              },
                            },
                            "text": "Types[Key]",
                            "type": {
                              "filePath": "test.ts",
                              "kind": "Any",
                              "position": {
                                "end": {
                                  "column": 43,
                                  "line": 4,
                                },
                                "start": {
                                  "column": 26,
                                  "line": 4,
                                },
                              },
                              "text": "any",
                            },
                          },
                        ],
                        "position": {
                          "end": {
                            "column": 62,
                            "line": 4,
                          },
                          "start": {
                            "column": 25,
                            "line": 4,
                          },
                        },
                        "returnType": {
                          "filePath": "test.ts",
                          "kind": "UnionType",
                          "position": {
                            "end": {
                              "column": 62,
                              "line": 4,
                            },
                            "start": {
                              "column": 25,
                              "line": 4,
                            },
                          },
                          "text": "boolean | void",
                          "types": [
                            {
                              "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
                              "kind": "Boolean",
                              "position": {
                                "end": {
                                  "column": 4613,
                                  "line": 4,
                                },
                                "start": {
                                  "column": 4576,
                                  "line": 4,
                                },
                              },
                              "text": "boolean",
                            },
                            {
                              "filePath": "test.ts",
                              "kind": "Unknown",
                              "position": {
                                "end": {
                                  "column": 62,
                                  "line": 4,
                                },
                                "start": {
                                  "column": 25,
                                  "line": 4,
                                },
                              },
                              "text": "void",
                            },
                          ],
                        },
                        "text": "(value: Types[Key]) => boolean | void",
                      },
                    ],
                    "text": "(value: Types[Key]) => boolean | void",
                  },
                },
              },
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
                  "filePath": "test.ts",
                  "kind": "Function",
                  "name": "Loader",
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
                            "filePath": "test.ts",
                            "kind": "String",
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
                            "value": undefined,
                          },
                        },
                      ],
                      "position": {
                        "end": {
                          "column": 54,
                          "line": 1,
                        },
                        "start": {
                          "column": 22,
                          "line": 1,
                        },
                      },
                      "returnType": {
                        "arguments": [
                          {
                            "arguments": [],
                            "filePath": "test.ts",
                            "kind": "TypeReference",
                            "name": "Key",
                            "position": {
                              "end": {
                                "column": 54,
                                "line": 13,
                              },
                              "start": {
                                "column": 18,
                                "line": 13,
                              },
                            },
                            "text": "{ [Key in keyof Types]: Types[Key]; }",
                          },
                        ],
                        "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
                        "kind": "TypeReference",
                        "name": "Promise",
                        "position": {
                          "end": {
                            "column": 15356,
                            "line": 4,
                          },
                          "start": {
                            "column": 15015,
                            "line": 4,
                          },
                        },
                        "text": "Promise<{ [Key in keyof Types]: Types[Key]; }>",
                      },
                      "text": "(path: string) => Promise<{ [Key in keyof Types]: Types[Key]; }>",
                    },
                  ],
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
              "filePath": "test.ts",
              "kind": "Function",
              "name": "Loader",
              "position": {
                "end": {
                  "column": 55,
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
                  "kind": "FunctionSignature",
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
                        "filePath": "test.ts",
                        "kind": "String",
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
                        "value": undefined,
                      },
                    },
                  ],
                  "position": {
                    "end": {
                      "column": 54,
                      "line": 1,
                    },
                    "start": {
                      "column": 22,
                      "line": 1,
                    },
                  },
                  "returnType": {
                    "arguments": [
                      {
                        "arguments": [],
                        "filePath": "test.ts",
                        "kind": "TypeReference",
                        "name": "Key",
                        "position": {
                          "end": {
                            "column": 47,
                            "line": 14,
                          },
                          "start": {
                            "column": 11,
                            "line": 14,
                          },
                        },
                        "text": "{ [Key in keyof Types]: Types[Key]; }",
                      },
                    ],
                    "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
                    "kind": "TypeReference",
                    "name": "Promise",
                    "position": {
                      "end": {
                        "column": 15356,
                        "line": 4,
                      },
                      "start": {
                        "column": 15015,
                        "line": 4,
                      },
                    },
                    "text": "Promise<{ [Key in keyof Types]: Types[Key]; }>",
                  },
                  "text": "(path: string) => Promise<{ [Key in keyof Types]: Types[Key]; }>",
                },
              ],
              "text": "Loader<{ [Key in keyof Types]: Types[Key]; }>",
            },
            "tags": undefined,
            "text": "function withSchema<Types extends Record<string, any>>(schema: Schema<Types>, loader: Loader<{ [Key in keyof Types]: Types[Key]; }>): Loader<{ [Key in keyof Types]: Types[Key]; }>",
            "typeParameters": [
              {
                "constraint": {
                  "arguments": [],
                  "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
                  "kind": "TypeReference",
                  "name": "Record",
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
                      "name": "ButtonProps",
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
                    "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
                    "kind": "Boolean",
                    "position": {
                      "end": {
                        "column": 4613,
                        "line": 4,
                      },
                      "start": {
                        "column": 4576,
                        "line": 4,
                      },
                    },
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
              "kind": "UnionType",
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
              "text": ""primary" | "secondary" | "danger"",
              "types": [
                {
                  "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
                  "kind": "String",
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
                    "filePath": "test.ts",
                    "kind": "UnionType",
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
                    "text": "ButtonVariant | undefined",
                    "types": [
                      {
                        "filePath": "test.ts",
                        "kind": "Unknown",
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
                        "text": "undefined",
                      },
                      {
                        "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
                        "kind": "String",
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
                  },
                },
              ],
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
        "kind": "IntersectionType",
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
        "types": [
          {
            "filePath": "test.ts",
            "isOptional": false,
            "isReadonly": false,
            "kind": "MappedType",
            "parameter": {
              "constraint": {
                "arguments": [],
                "filePath": "test.ts",
                "kind": "TypeReference",
                "name": "SemanticTags",
                "position": {
                  "end": {
                    "column": 11,
                    "line": 18,
                  },
                  "start": {
                    "column": 1,
                    "line": 1,
                  },
                },
                "text": "SemanticTags",
              },
              "kind": "TypeParameter",
              "name": "Tag",
              "text": "Tag in SemanticTags",
            },
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
            "text": "{ section: "section" | React.ComponentType<React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>>; h2: "h2" | React.ComponentType<React.DetailedHTMLProps<React.HTMLAttributes<HTMLHeadingElement>, HTMLHeadingElement>>; h3: "h3" | React.ComponentType<React.DetailedHTMLProps<React.HTMLAttributes<HTMLHeadingElement>, HTMLHeadingElement>>; h4: "h4" | React.ComponentType<React.DetailedHTMLProps<React.HTMLAttributes<HTMLHeadingElement>, HTMLHeadingElement>>; p: "p" | React.ComponentType<React.DetailedHTMLProps<React.HTMLAttributes<HTMLParagraphElement>, HTMLParagraphElement>>; dl: "dl" | React.ComponentType<React.DetailedHTMLProps<React.HTMLAttributes<HTMLDListElement>, HTMLDListElement>>; dt: "dt" | React.ComponentType<React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>>; dd: "dd" | React.ComponentType<React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>>; table: "table" | React.ComponentType<React.DetailedHTMLProps<React.TableHTMLAttributes<HTMLTableElement>, HTMLTableElement>>; thead: "thead" | React.ComponentType<React.DetailedHTMLProps<React.HTMLAttributes<HTMLTableSectionElement>, HTMLTableSectionElement>>; tbody: "tbody" | React.ComponentType<React.DetailedHTMLProps<React.HTMLAttributes<HTMLTableSectionElement>, HTMLTableSectionElement>>; tr: "tr" | React.ComponentType<React.DetailedHTMLProps<React.HTMLAttributes<HTMLTableRowElement>, HTMLTableRowElement>>; th: "th" | React.ComponentType<React.DetailedHTMLProps<React.ThHTMLAttributes<HTMLTableHeaderCellElement>, HTMLTableHeaderCellElement>>; td: "td" | React.ComponentType<React.DetailedHTMLProps<React.TdHTMLAttributes<HTMLTableDataCellElement>, HTMLTableDataCellElement>>; details: "details" | React.ComponentType<React.DetailedHTMLProps<React.DetailsHTMLAttributes<HTMLDetailsElement>, HTMLDetailsElement>>; summary: "summary" | React.ComponentType<React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>>; code: "code" | React.ComponentType<React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>>; }",
            "type": {
              "filePath": "test.ts",
              "kind": "UnionType",
              "position": {
                "end": {
                  "column": 78,
                  "line": 25,
                },
                "start": {
                  "column": 26,
                  "line": 25,
                },
              },
              "text": "Tag | React.ComponentType<React.ComponentProps<Tag>>",
              "types": [
                {
                  "arguments": [],
                  "filePath": "test.ts",
                  "kind": "TypeReference",
                  "name": "Tag",
                  "position": {
                    "end": {
                      "column": 23,
                      "line": 25,
                    },
                    "start": {
                      "column": 4,
                      "line": 25,
                    },
                  },
                  "text": "Tag",
                },
                {
                  "arguments": [
                    {
                      "arguments": [
                        {
                          "filePath": "test.ts",
                          "kind": "TypeReference",
                          "name": "Tag",
                          "position": {
                            "end": {
                              "column": 23,
                              "line": 25,
                            },
                            "start": {
                              "column": 4,
                              "line": 25,
                            },
                          },
                          "text": "Tag",
                        },
                      ],
                      "filePath": "node_modules/@types/react/index.d.ts",
                      "kind": "TypeReference",
                      "name": "ComponentProps",
                      "position": {
                        "end": {
                          "column": 14,
                          "line": 1430,
                        },
                        "start": {
                          "column": 5,
                          "line": 1427,
                        },
                      },
                      "text": "React.ComponentProps<Tag>",
                    },
                  ],
                  "filePath": "node_modules/@types/react/index.d.ts",
                  "kind": "TypeReference",
                  "name": "ComponentType",
                  "position": {
                    "end": {
                      "column": 75,
                      "line": 122,
                    },
                    "start": {
                      "column": 5,
                      "line": 122,
                    },
                  },
                  "text": "React.ComponentType<React.ComponentProps<Tag>>",
                },
              ],
            },
          },
          {
            "filePath": "test.ts",
            "kind": "TypeLiteral",
            "members": [
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
                  "arguments": [
                    {
                      "filePath": "test.ts",
                      "kind": "Interface",
                      "members": [
                        {
                          "filePath": "test.ts",
                          "isOptional": false,
                          "isReadonly": false,
                          "kind": "PropertySignature",
                          "name": "children",
                          "position": {
                            "end": {
                              "column": 28,
                              "line": 21,
                            },
                            "start": {
                              "column": 3,
                              "line": 21,
                            },
                          },
                          "text": "ReactNode",
                          "type": {
                            "description": "Represents all of the things React can render.

      Where {@link ReactElement} only represents JSX, \`ReactNode\` represents everything that can be rendered.",
                            "filePath": "node_modules/@types/react/index.d.ts",
                            "kind": "UnionType",
                            "position": {
                              "end": {
                                "column": 37,
                                "line": 439,
                              },
                              "start": {
                                "column": 5,
                                "line": 426,
                              },
                            },
                            "tags": [
                              {
                                "name": "see",
                                "text": "{@link https://react-typescript-cheatsheet.netlify.app/docs/react-types/reactnode/ React TypeScript Cheatsheet}",
                              },
                              {
                                "name": "example",
                                "text": "\`\`\`tsx
      // Typing children
      type Props = { children: ReactNode }

      const Component = ({ children }: Props) => <div>{children}</div>

      <Component>hello</Component>
      \`\`\`",
                              },
                              {
                                "name": "example",
                                "text": "\`\`\`tsx
      // Typing a custom element
      type Props = { customElement: ReactNode }

      const Component = ({ customElement }: Props) => <div>{customElement}</div>

      <Component customElement={<div>hello</div>} />
      \`\`\`",
                              },
                            ],
                            "text": "React.ReactNode",
                            "types": [
                              {
                                "arguments": [],
                                "filePath": "node_modules/@types/react/index.d.ts",
                                "kind": "TypeReference",
                                "name": "ReactElement",
                                "position": {
                                  "end": {
                                    "column": 6,
                                    "line": 322,
                                  },
                                  "start": {
                                    "column": 5,
                                    "line": 315,
                                  },
                                },
                                "text": "ReactElement<unknown, string | JSXElementConstructor<any>>",
                              },
                              {
                                "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
                                "kind": "String",
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
                              {
                                "arguments": [],
                                "filePath": "node_modules/typescript/lib/lib.es2020.bigint.d.ts",
                                "kind": "TypeReference",
                                "name": "BigInt",
                                "position": {
                                  "end": {
                                    "column": 817,
                                    "line": 3,
                                  },
                                  "start": {
                                    "column": 623,
                                    "line": 3,
                                  },
                                },
                                "text": "BigInt",
                              },
                              {
                                "arguments": [
                                  {
                                    "arguments": [],
                                    "filePath": "node_modules/@types/react/index.d.ts",
                                    "kind": "TypeReference",
                                    "name": "ReactNode",
                                    "position": {
                                      "end": {
                                        "column": 37,
                                        "line": 439,
                                      },
                                      "start": {
                                        "column": 5,
                                        "line": 426,
                                      },
                                    },
                                    "text": "ReactNode",
                                  },
                                ],
                                "filePath": "node_modules/typescript/lib/lib.es2015.iterable.d.ts",
                                "kind": "TypeReference",
                                "name": "Iterable",
                                "position": {
                                  "end": {
                                    "column": 560,
                                    "line": 3,
                                  },
                                  "start": {
                                    "column": 469,
                                    "line": 3,
                                  },
                                },
                                "text": "Iterable<ReactNode>",
                              },
                              {
                                "arguments": [],
                                "filePath": "node_modules/@types/react/index.d.ts",
                                "kind": "TypeReference",
                                "name": "ReactPortal",
                                "position": {
                                  "end": {
                                    "column": 6,
                                    "line": 388,
                                  },
                                  "start": {
                                    "column": 5,
                                    "line": 386,
                                  },
                                },
                                "text": "ReactPortal",
                              },
                              {
                                "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
                                "kind": "Boolean",
                                "position": {
                                  "end": {
                                    "column": 4613,
                                    "line": 4,
                                  },
                                  "start": {
                                    "column": 4576,
                                    "line": 4,
                                  },
                                },
                                "text": "boolean",
                              },
                              {
                                "filePath": "node_modules/@types/react/index.d.ts",
                                "kind": "Unknown",
                                "position": {
                                  "end": {
                                    "column": 15,
                                    "line": 434,
                                  },
                                  "start": {
                                    "column": 11,
                                    "line": 434,
                                  },
                                },
                                "text": "null",
                              },
                              {
                                "filePath": "node_modules/@types/react/index.d.ts",
                                "kind": "Unknown",
                                "position": {
                                  "end": {
                                    "column": 20,
                                    "line": 435,
                                  },
                                  "start": {
                                    "column": 11,
                                    "line": 435,
                                  },
                                },
                                "text": "undefined",
                              },
                              {
                                "filePath": "node_modules/@types/react/index.d.ts",
                                "kind": "Unknown",
                                "position": {
                                  "end": {
                                    "column": 10,
                                    "line": 438,
                                  },
                                  "start": {
                                    "column": 11,
                                    "line": 436,
                                  },
                                },
                                "text": "never",
                              },
                              {
                                "arguments": [
                                  {
                                    "arguments": [],
                                    "filePath": "node_modules/@types/react/index.d.ts",
                                    "kind": "TypeReference",
                                    "name": "AwaitedReactNode",
                                    "position": {
                                      "end": {
                                        "column": 7,
                                        "line": 53,
                                      },
                                      "start": {
                                        "column": 1,
                                        "line": 41,
                                      },
                                    },
                                    "text": "AwaitedReactNode",
                                  },
                                ],
                                "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
                                "kind": "TypeReference",
                                "name": "Promise",
                                "position": {
                                  "end": {
                                    "column": 15356,
                                    "line": 4,
                                  },
                                  "start": {
                                    "column": 15015,
                                    "line": 4,
                                  },
                                },
                                "text": "Promise<AwaitedReactNode>",
                              },
                            ],
                          },
                        },
                      ],
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
                      "text": "MarkdownProps",
                    },
                  ],
                  "filePath": "test.ts",
                  "kind": "TypeReference",
                  "name": "ComponentType",
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
                  "text": "React.ComponentType<MarkdownProps>",
                },
              },
            ],
            "position": {
              "end": {
                "column": 2,
                "line": 28,
              },
              "start": {
                "column": 5,
                "line": 26,
              },
            },
            "text": "{ Markdown: React.ComponentType<MarkdownProps>; }",
          },
        ],
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
              "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
              "kind": "String",
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
              "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
              "kind": "String",
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
              "filePath": "test.ts",
              "kind": "String",
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
              "text": "string",
              "value": undefined,
            },
            "text": "() => string",
          },
        ],
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
                "filePath": "test.ts",
                "kind": "TypeLiteral",
                "members": [
                  {
                    "filePath": "test.ts",
                    "isOptional": true,
                    "isReadonly": false,
                    "kind": "PropertySignature",
                    "name": "required",
                    "position": {
                      "end": {
                        "column": 40,
                        "line": 3,
                      },
                      "start": {
                        "column": 24,
                        "line": 3,
                      },
                    },
                    "text": "string",
                    "type": {
                      "filePath": "test.ts",
                      "kind": "String",
                      "position": {
                        "end": {
                          "column": 40,
                          "line": 3,
                        },
                        "start": {
                          "column": 24,
                          "line": 3,
                        },
                      },
                      "text": "string",
                      "value": undefined,
                    },
                  },
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
                      "filePath": "test.ts",
                      "kind": "String",
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
                      "value": undefined,
                    },
                  },
                ],
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
              "filePath": "test.ts",
              "kind": "Unknown",
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
              "text": "void",
            },
            "text": "function Component(props: Props): void",
          },
        ],
        "text": "(props: Props) => void",
      }
    `)
  })
})
