import { describe, test, expect } from 'vitest'
import {
  Project,
  SyntaxKind,
  type ClassDeclaration,
  type FunctionDeclaration,
} from 'ts-morph'
import dedent from 'dedent'

import { resolveType } from './resolve-type.js'

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
              "kind": "MethodSignature",
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
                  "isAsync": true,
                  "kind": "CallSignature",
                  "parameters": [
                    {
                      "description": undefined,
                      "filePath": "test.ts",
                      "initializer": undefined,
                      "isOptional": false,
                      "isRest": false,
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
                      "text": "parameterValue: { objectValue: number }",
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
                            "text": "objectValue: number",
                            "type": {
                              "filePath": "test.ts",
                              "kind": "Number",
                              "position": {
                                "end": {
                                  "column": 51,
                                  "line": 8,
                                },
                                "start": {
                                  "column": 45,
                                  "line": 8,
                                },
                              },
                              "text": "number",
                              "value": undefined,
                            },
                          },
                        ],
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
                    "filePath": "test.ts",
                    "kind": "TypeReference",
                    "moduleSpecifier": undefined,
                    "name": "Promise",
                    "position": {
                      "end": {
                        "column": 71,
                        "line": 8,
                      },
                      "start": {
                        "column": 56,
                        "line": 8,
                      },
                    },
                    "text": "Promise<number>",
                    "typeArguments": [
                      {
                        "filePath": "test.ts",
                        "kind": "Number",
                        "position": {
                          "end": {
                            "column": 70,
                            "line": 8,
                          },
                          "start": {
                            "column": 64,
                            "line": 8,
                          },
                        },
                        "text": "number",
                        "value": undefined,
                      },
                    ],
                  },
                  "text": "(parameterValue: { objectValue: number }) => Promise<number>",
                  "thisType": undefined,
                },
              ],
              "text": "method(parameterValue: { objectValue: number }): Promise<number>;",
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
              "text": "exportedTypes: Array<ExportedType>;",
              "type": {
                "filePath": "test.ts",
                "kind": "TypeReference",
                "name": "Array",
                "position": {
                  "end": {
                    "column": 41,
                    "line": 9,
                  },
                  "start": {
                    "column": 22,
                    "line": 9,
                  },
                },
                "text": "Array<ExportedType>",
                "typeArguments": [
                  {
                    "filePath": "test.ts",
                    "kind": "TypeReference",
                    "moduleSpecifier": undefined,
                    "name": "Array",
                    "position": {
                      "end": {
                        "column": 41,
                        "line": 9,
                      },
                      "start": {
                        "column": 22,
                        "line": 9,
                      },
                    },
                    "text": "ExportedType",
                    "typeArguments": [
                      {
                        "filePath": "test.ts",
                        "kind": "TypeReference",
                        "moduleSpecifier": undefined,
                        "name": "ExportedType",
                        "position": {
                          "end": {
                            "column": 40,
                            "line": 9,
                          },
                          "start": {
                            "column": 28,
                            "line": 9,
                          },
                        },
                        "text": "ExportedType",
                        "typeArguments": [],
                      },
                    ],
                  },
                ],
              },
            },
          ],
          "text": "ModuleData",
        },
        "typeParameters": [],
      }
    `)
  })

  test('complex properties', () => {
    const typeAlias = sourceFile.getTypeAliasOrThrow('ComplexType')
    const type = typeAlias.getType()
    const types = resolveType(type, typeAlias)

    expect(types).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "TypeAlias",
        "name": "ComplexType",
        "position": {
          "end": {
            "column": 7,
            "line": 31,
          },
          "start": {
            "column": 5,
            "line": 21,
          },
        },
        "text": "ComplexType",
        "type": {
          "kind": "TypeLiteral",
          "members": [
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
              "text": "promiseObject?: Promise<ExportedType>;",
              "type": {
                "filePath": "test.ts",
                "kind": "TypeReference",
                "moduleSpecifier": undefined,
                "name": "Promise",
                "position": {
                  "end": {
                    "column": 44,
                    "line": 22,
                  },
                  "start": {
                    "column": 23,
                    "line": 22,
                  },
                },
                "text": "Promise<ExportedType>",
                "typeArguments": [
                  {
                    "filePath": "test.ts",
                    "kind": "TypeReference",
                    "moduleSpecifier": undefined,
                    "name": "ExportedType",
                    "position": {
                      "end": {
                        "column": 43,
                        "line": 22,
                      },
                      "start": {
                        "column": 31,
                        "line": 22,
                      },
                    },
                    "text": "ExportedType",
                    "typeArguments": [],
                  },
                ],
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
              "text": "promiseFunction: Promise<(a: number, b: string) => void>;",
              "type": {
                "filePath": "test.ts",
                "kind": "TypeReference",
                "moduleSpecifier": undefined,
                "name": "Promise",
                "position": {
                  "end": {
                    "column": 63,
                    "line": 23,
                  },
                  "start": {
                    "column": 24,
                    "line": 23,
                  },
                },
                "text": "Promise<(a: number, b: string) => void>",
                "typeArguments": [
                  {
                    "filePath": "test.ts",
                    "isAsync": false,
                    "kind": "FunctionType",
                    "parameters": [
                      {
                        "description": undefined,
                        "filePath": "test.ts",
                        "initializer": undefined,
                        "isOptional": false,
                        "isRest": false,
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
                        "text": "a: number",
                        "type": {
                          "filePath": "test.ts",
                          "kind": "Number",
                          "position": {
                            "end": {
                              "column": 42,
                              "line": 23,
                            },
                            "start": {
                              "column": 36,
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
                        "isRest": false,
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
                        "text": "b: string",
                        "type": {
                          "filePath": "test.ts",
                          "kind": "String",
                          "position": {
                            "end": {
                              "column": 53,
                              "line": 23,
                            },
                            "start": {
                              "column": 47,
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
                      "kind": "Void",
                      "position": {
                        "end": {
                          "column": 62,
                          "line": 23,
                        },
                        "start": {
                          "column": 58,
                          "line": 23,
                        },
                      },
                      "text": "void",
                    },
                    "text": "(a: number, b: string) => void",
                  },
                ],
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
              "text": "promiseVariable: ReturnType<typeof foo>;",
              "type": {
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
                "text": "Promise<{ slug: string; filePath: string; }>",
                "typeArguments": [
                  {
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
                    "text": "{ slug: string; filePath: string; }",
                  },
                ],
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
              "text": "union: string | number;",
              "type": {
                "kind": "UnionType",
                "text": "string | number",
                "types": [
                  {
                    "filePath": "test.ts",
                    "kind": "String",
                    "position": {
                      "end": {
                        "column": 20,
                        "line": 25,
                      },
                      "start": {
                        "column": 14,
                        "line": 25,
                      },
                    },
                    "text": "string",
                    "value": undefined,
                  },
                  {
                    "filePath": "test.ts",
                    "kind": "Number",
                    "position": {
                      "end": {
                        "column": 29,
                        "line": 25,
                      },
                      "start": {
                        "column": 23,
                        "line": 25,
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
              "text": "complexUnion: ((a: string) => string | number) | { a: string } | { b: number, c: (string | number)[] } | string;",
              "type": {
                "kind": "UnionType",
                "text": "(a: string) => string | number | { a: string; } | { b: number; c: Array<string | number>; } | string",
                "types": [
                  {
                    "filePath": "test.ts",
                    "isAsync": false,
                    "kind": "FunctionType",
                    "parameters": [
                      {
                        "description": undefined,
                        "filePath": "test.ts",
                        "initializer": undefined,
                        "isOptional": false,
                        "isRest": false,
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
                        "text": "a: string",
                        "type": {
                          "filePath": "test.ts",
                          "kind": "String",
                          "position": {
                            "end": {
                              "column": 32,
                              "line": 26,
                            },
                            "start": {
                              "column": 26,
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
                      "kind": "UnionType",
                      "text": "string | number",
                      "types": [
                        {
                          "filePath": "test.ts",
                          "kind": "String",
                          "position": {
                            "end": {
                              "column": 43,
                              "line": 26,
                            },
                            "start": {
                              "column": 37,
                              "line": 26,
                            },
                          },
                          "text": "string",
                          "value": undefined,
                        },
                        {
                          "filePath": "test.ts",
                          "kind": "Number",
                          "position": {
                            "end": {
                              "column": 52,
                              "line": 26,
                            },
                            "start": {
                              "column": 46,
                              "line": 26,
                            },
                          },
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
                        "text": "a: string",
                        "type": {
                          "filePath": "test.ts",
                          "kind": "String",
                          "position": {
                            "end": {
                              "column": 67,
                              "line": 26,
                            },
                            "start": {
                              "column": 61,
                              "line": 26,
                            },
                          },
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
                        "text": "b: number,",
                        "type": {
                          "filePath": "test.ts",
                          "kind": "Number",
                          "position": {
                            "end": {
                              "column": 83,
                              "line": 26,
                            },
                            "start": {
                              "column": 77,
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
                        "text": "c: (string | number)[]",
                        "type": {
                          "filePath": "test.ts",
                          "kind": "TypeReference",
                          "name": "Array",
                          "position": {
                            "end": {
                              "column": 107,
                              "line": 26,
                            },
                            "start": {
                              "column": 88,
                              "line": 26,
                            },
                          },
                          "text": "Array<string | number>",
                          "typeArguments": [
                            {
                              "kind": "UnionType",
                              "text": "string | number",
                              "types": [
                                {
                                  "filePath": "test.ts",
                                  "kind": "String",
                                  "position": {
                                    "end": {
                                      "column": 95,
                                      "line": 26,
                                    },
                                    "start": {
                                      "column": 89,
                                      "line": 26,
                                    },
                                  },
                                  "text": "string",
                                  "value": undefined,
                                },
                                {
                                  "filePath": "test.ts",
                                  "kind": "Number",
                                  "position": {
                                    "end": {
                                      "column": 104,
                                      "line": 26,
                                    },
                                    "start": {
                                      "column": 98,
                                      "line": 26,
                                    },
                                  },
                                  "text": "number",
                                  "value": undefined,
                                },
                              ],
                            },
                          ],
                        },
                      },
                    ],
                    "text": "{ b: number; c: Array<string | number>; }",
                  },
                  {
                    "filePath": "test.ts",
                    "kind": "String",
                    "position": {
                      "end": {
                        "column": 118,
                        "line": 26,
                      },
                      "start": {
                        "column": 112,
                        "line": 26,
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
              "text": "intersection: { a: string } & { b: number };",
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
                    "text": "a: string",
                    "type": {
                      "filePath": "test.ts",
                      "kind": "String",
                      "position": {
                        "end": {
                          "column": 32,
                          "line": 27,
                        },
                        "start": {
                          "column": 26,
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
                    "text": "b: number",
                    "type": {
                      "filePath": "test.ts",
                      "kind": "Number",
                      "position": {
                        "end": {
                          "column": 48,
                          "line": 27,
                        },
                        "start": {
                          "column": 42,
                          "line": 27,
                        },
                      },
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
              "text": "complexIntersection: ReturnType<FunctionType> & { a: string } & { b(): void };",
              "type": {
                "kind": "IntersectionType",
                "text": "Promise<ExportedType> & { a: string; } & { b(): void; }",
                "types": [
                  {
                    "filePath": "test.ts",
                    "kind": "TypeReference",
                    "moduleSpecifier": undefined,
                    "name": "ReturnType",
                    "position": {
                      "end": {
                        "column": 52,
                        "line": 28,
                      },
                      "start": {
                        "column": 28,
                        "line": 28,
                      },
                    },
                    "text": "Promise<ExportedType>",
                    "typeArguments": [
                      {
                        "filePath": "test.ts",
                        "kind": "TypeReference",
                        "moduleSpecifier": undefined,
                        "name": "FunctionType",
                        "position": {
                          "end": {
                            "column": 51,
                            "line": 28,
                          },
                          "start": {
                            "column": 39,
                            "line": 28,
                          },
                        },
                        "text": "FunctionType",
                        "typeArguments": [],
                      },
                    ],
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
                        "text": "a: string",
                        "type": {
                          "filePath": "test.ts",
                          "kind": "String",
                          "position": {
                            "end": {
                              "column": 66,
                              "line": 28,
                            },
                            "start": {
                              "column": 60,
                              "line": 28,
                            },
                          },
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
                        "kind": "MethodSignature",
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
                            "kind": "CallSignature",
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
                              "kind": "Void",
                              "position": {
                                "end": {
                                  "column": 82,
                                  "line": 28,
                                },
                                "start": {
                                  "column": 78,
                                  "line": 28,
                                },
                              },
                              "text": "void",
                            },
                            "text": "() => void",
                            "thisType": undefined,
                          },
                        ],
                        "text": "b(): void",
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
              "text": "tuple: [a: string, b: number, string];",
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
              "text": "function: FunctionType;",
              "type": {
                "filePath": "test.ts",
                "kind": "TypeReference",
                "moduleSpecifier": undefined,
                "name": "FunctionType",
                "position": {
                  "end": {
                    "column": 29,
                    "line": 30,
                  },
                  "start": {
                    "column": 17,
                    "line": 30,
                  },
                },
                "text": "FunctionType",
                "typeArguments": [],
              },
            },
          ],
          "text": "ComplexType",
        },
        "typeParameters": [],
      }
    `)
  })

  test('string type', () => {
    const sourceFile = project.createSourceFile(
      'index.ts',
      dedent`
      type Foo = 'foo'
      `,
      { overwrite: true }
    )
    const declaration = sourceFile.getTypeAliasOrThrow('Foo')
    const types = resolveType(declaration.getType())

    expect(types).toMatchInlineSnapshot(`
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
        "text": ""foo"",
        "value": "foo",
      }
    `)
  })

  test('external class reference type arguments', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
      type Foo = Promise<string>
      `,
      { overwrite: true }
    )
    const typeAlias = sourceFile.getTypeAliasOrThrow('Foo')
    const type = resolveType(typeAlias.getType(), typeAlias)

    expect(type).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "TypeAlias",
        "name": "Foo",
        "position": {
          "end": {
            "column": 27,
            "line": 1,
          },
          "start": {
            "column": 1,
            "line": 1,
          },
        },
        "text": "Foo",
        "type": {
          "filePath": "test.ts",
          "kind": "TypeReference",
          "moduleSpecifier": undefined,
          "name": "Promise",
          "position": {
            "end": {
              "column": 27,
              "line": 1,
            },
            "start": {
              "column": 12,
              "line": 1,
            },
          },
          "text": "Foo",
          "typeArguments": [
            {
              "filePath": "test.ts",
              "kind": "String",
              "position": {
                "end": {
                  "column": 26,
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
          ],
        },
        "typeParameters": [],
      }
    `)
  })

  test('external type alias with alias type arguments', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
      type Foo = Record<string, any>
      `,
      { overwrite: true }
    )
    const typeAlias = sourceFile.getTypeAliasOrThrow('Foo')
    const type = resolveType(typeAlias.getType(), typeAlias)

    expect(type).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "TypeAlias",
        "name": "Foo",
        "position": {
          "end": {
            "column": 31,
            "line": 1,
          },
          "start": {
            "column": 1,
            "line": 1,
          },
        },
        "text": "Foo",
        "type": {
          "filePath": "test.ts",
          "kind": "TypeReference",
          "moduleSpecifier": undefined,
          "name": "Record",
          "position": {
            "end": {
              "column": 31,
              "line": 1,
            },
            "start": {
              "column": 12,
              "line": 1,
            },
          },
          "text": "Foo",
          "typeArguments": [
            {
              "filePath": "test.ts",
              "kind": "String",
              "position": {
                "end": {
                  "column": 25,
                  "line": 1,
                },
                "start": {
                  "column": 19,
                  "line": 1,
                },
              },
              "text": "string",
              "value": undefined,
            },
            {
              "filePath": "test.ts",
              "kind": "Any",
              "position": {
                "end": {
                  "column": 30,
                  "line": 1,
                },
                "start": {
                  "column": 27,
                  "line": 1,
                },
              },
              "text": "any",
            },
          ],
        },
        "typeParameters": [],
      }
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
              "kind": "IntersectionType",
              "text": "FillVariant",
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
                      "text": "backgroundColor: string;",
                      "type": {
                        "filePath": "test.ts",
                        "kind": "String",
                        "position": {
                          "end": {
                            "column": 34,
                            "line": 7,
                          },
                          "start": {
                            "column": 28,
                            "line": 7,
                          },
                        },
                        "text": "string",
                        "value": undefined,
                      },
                    },
                  ],
                  "text": "{ backgroundColor: string; }",
                },
                {
                  "filePath": "test.ts",
                  "kind": "TypeReference",
                  "moduleSpecifier": undefined,
                  "name": "BaseVariant",
                  "position": {
                    "end": {
                      "column": 24,
                      "line": 8,
                    },
                    "start": {
                      "column": 13,
                      "line": 8,
                    },
                  },
                  "text": "BaseVariant",
                  "typeArguments": [],
                },
              ],
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
                      "text": "borderColor: string;",
                      "type": {
                        "filePath": "test.ts",
                        "kind": "String",
                        "position": {
                          "end": {
                            "column": 30,
                            "line": 11,
                          },
                          "start": {
                            "column": 24,
                            "line": 11,
                          },
                        },
                        "text": "string",
                        "value": undefined,
                      },
                    },
                  ],
                  "text": "{ borderColor: string; }",
                },
                {
                  "filePath": "test.ts",
                  "kind": "TypeReference",
                  "moduleSpecifier": undefined,
                  "name": "BaseVariant",
                  "position": {
                    "end": {
                      "column": 24,
                      "line": 12,
                    },
                    "start": {
                      "column": 13,
                      "line": 12,
                    },
                  },
                  "text": "BaseVariant",
                  "typeArguments": [],
                },
              ],
            },
            {
              "filePath": "test.ts",
              "kind": "String",
              "position": {
                "end": {
                  "column": 64,
                  "line": 14,
                },
                "start": {
                  "column": 58,
                  "line": 14,
                },
              },
              "text": "string",
              "value": undefined,
            },
          ],
        },
        "typeParameters": [
          {
            "constraintType": undefined,
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
              "text": "str: string;",
              "type": {
                "filePath": "test.ts",
                "kind": "String",
                "position": {
                  "end": {
                    "column": 22,
                    "line": 4,
                  },
                  "start": {
                    "column": 16,
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
              "text": "num: number;",
              "type": {
                "filePath": "test.ts",
                "kind": "Number",
                "position": {
                  "end": {
                    "column": 22,
                    "line": 10,
                  },
                  "start": {
                    "column": 16,
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
              "text": "bool: boolean;",
              "type": {
                "filePath": "test.ts",
                "kind": "Boolean",
                "position": {
                  "end": {
                    "column": 24,
                    "line": 12,
                  },
                  "start": {
                    "column": 17,
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
              "text": "arr: string[];",
              "type": {
                "filePath": "test.ts",
                "kind": "TypeReference",
                "name": "Array",
                "position": {
                  "end": {
                    "column": 24,
                    "line": 14,
                  },
                  "start": {
                    "column": 16,
                    "line": 14,
                  },
                },
                "text": "Array<string>",
                "typeArguments": [
                  {
                    "filePath": "test.ts",
                    "kind": "String",
                    "position": {
                      "end": {
                        "column": 22,
                        "line": 14,
                      },
                      "start": {
                        "column": 16,
                        "line": 14,
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
              "text": "obj: Record<string, { value: number }>;",
              "type": {
                "kind": "TypeLiteral",
                "members": [
                  {
                    "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
                    "isReadonly": false,
                    "kind": "IndexSignature",
                    "parameter": {
                      "kind": "IndexSignatureParameter",
                      "name": "key",
                      "text": "key: string",
                      "type": {
                        "kind": "String",
                        "text": "string",
                      },
                    },
                    "position": {
                      "end": {
                        "column": 314,
                        "line": 6,
                      },
                      "start": {
                        "column": 301,
                        "line": 6,
                      },
                    },
                    "text": "[key: string]: { value: number; }",
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
                              "column": 46,
                              "line": 17,
                            },
                            "start": {
                              "column": 33,
                              "line": 17,
                            },
                          },
                          "text": "value: number",
                          "type": {
                            "filePath": "test.ts",
                            "kind": "Number",
                            "position": {
                              "end": {
                                "column": 46,
                                "line": 17,
                              },
                              "start": {
                                "column": 40,
                                "line": 17,
                              },
                            },
                            "text": "number",
                            "value": undefined,
                          },
                        },
                      ],
                      "text": "{ value: number; }",
                    },
                  },
                ],
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
              "text": "func: (
                  /** a string parameter */
                  a: string,
                ) => void;",
              "type": {
                "filePath": "test.ts",
                "isAsync": false,
                "kind": "FunctionType",
                "parameters": [
                  {
                    "description": "a string parameter",
                    "filePath": "test.ts",
                    "initializer": undefined,
                    "isOptional": false,
                    "isRest": false,
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
                    "text": "a: string",
                    "type": {
                      "filePath": "test.ts",
                      "kind": "String",
                      "position": {
                        "end": {
                          "column": 22,
                          "line": 22,
                        },
                        "start": {
                          "column": 16,
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
                  "kind": "Void",
                  "position": {
                    "end": {
                      "column": 20,
                      "line": 23,
                    },
                    "start": {
                      "column": 16,
                      "line": 23,
                    },
                  },
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
              "text": "asyncFunc: typeof foo;",
              "type": {
                "filePath": "test.ts",
                "kind": "TypeQuery",
                "name": "foo",
                "position": {
                  "end": {
                    "column": 32,
                    "line": 25,
                  },
                  "start": {
                    "column": 22,
                    "line": 25,
                  },
                },
                "text": "() => Promise<void>",
                "typeArguments": [],
              },
            },
          ],
          "text": "Primitives",
        },
        "typeParameters": [],
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
        "kind": "Variable",
        "name": "a",
        "position": {
          "end": {
            "column": 10,
            "line": 6,
          },
          "start": {
            "column": 19,
            "line": 2,
          },
        },
        "text": "{ readonly e: { f: number; }; readonly g: string; readonly b: 1; readonly c: "string"; }",
        "type": {
          "kind": "TypeLiteral",
          "members": [
            {
              "filePath": "test.ts",
              "isOptional": false,
              "isReadonly": false,
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
                "text": "{ f: number; }",
              },
            },
            {
              "filePath": "test.ts",
              "isOptional": false,
              "isReadonly": false,
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
              "isReadonly": false,
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
              "isReadonly": false,
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
          "text": "{ readonly e: { f: number; }; readonly g: string; readonly b: 1; readonly c: "string"; }",
        },
      }
    `)
  })

  test('self referenced types', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      `
        type SelfReferencedType = {
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
        "text": "SelfReferencedType",
        "type": {
          "kind": "TypeLiteral",
          "members": [
            {
              "filePath": "test.ts",
              "isOptional": false,
              "isReadonly": false,
              "kind": "PropertySignature",
              "name": "children",
              "position": {
                "end": {
                  "column": 42,
                  "line": 3,
                },
                "start": {
                  "column": 11,
                  "line": 3,
                },
              },
              "text": "children: SelfReferencedType[];",
              "type": {
                "filePath": "test.ts",
                "kind": "TypeReference",
                "name": "Array",
                "position": {
                  "end": {
                    "column": 41,
                    "line": 3,
                  },
                  "start": {
                    "column": 21,
                    "line": 3,
                  },
                },
                "text": "Array<SelfReferencedType>",
                "typeArguments": [
                  {
                    "filePath": "test.ts",
                    "kind": "TypeReference",
                    "moduleSpecifier": undefined,
                    "name": "SelfReferencedType",
                    "position": {
                      "end": {
                        "column": 39,
                        "line": 3,
                      },
                      "start": {
                        "column": 21,
                        "line": 3,
                      },
                    },
                    "text": "SelfReferencedType",
                    "typeArguments": [],
                  },
                ],
              },
            },
          ],
          "text": "SelfReferencedType",
        },
        "typeParameters": [],
      }
    `)
  })

  test('mutually referenced types', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
      export type DocNode = {
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
        "text": "DocNode",
        "type": {
          "kind": "TypeLiteral",
          "members": [
            {
              "filePath": "test.ts",
              "isOptional": true,
              "isReadonly": false,
              "kind": "PropertySignature",
              "name": "children",
              "position": {
                "end": {
                  "column": 26,
                  "line": 2,
                },
                "start": {
                  "column": 3,
                  "line": 2,
                },
              },
              "text": "children?: DocChildren;",
              "type": {
                "filePath": "test.ts",
                "kind": "TypeReference",
                "name": "Array",
                "position": {
                  "end": {
                    "column": 25,
                    "line": 2,
                  },
                  "start": {
                    "column": 14,
                    "line": 2,
                  },
                },
                "text": "Array<DocNode>",
                "typeArguments": [
                  {
                    "filePath": "test.ts",
                    "kind": "TypeReference",
                    "moduleSpecifier": undefined,
                    "name": "DocChildren",
                    "position": {
                      "end": {
                        "column": 25,
                        "line": 2,
                      },
                      "start": {
                        "column": 14,
                        "line": 2,
                      },
                    },
                    "text": "DocNode",
                    "typeArguments": [],
                  },
                ],
              },
            },
          ],
          "text": "DocNode",
        },
        "typeParameters": [],
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
              "text": "title: string;",
              "type": {
                "filePath": "test.ts",
                "kind": "String",
                "position": {
                  "end": {
                    "column": 16,
                    "line": 2,
                  },
                  "start": {
                    "column": 10,
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
              "text": "children?: DocChildren;",
              "type": {
                "filePath": "test.ts",
                "kind": "TypeReference",
                "name": "Array",
                "position": {
                  "end": {
                    "column": 25,
                    "line": 3,
                  },
                  "start": {
                    "column": 14,
                    "line": 3,
                  },
                },
                "text": "Array<DocNode>",
                "typeArguments": [
                  {
                    "filePath": "test.ts",
                    "kind": "TypeReference",
                    "moduleSpecifier": undefined,
                    "name": "DocChildren",
                    "position": {
                      "end": {
                        "column": 25,
                        "line": 3,
                      },
                      "start": {
                        "column": 14,
                        "line": 3,
                      },
                    },
                    "text": "DocNode",
                    "typeArguments": [],
                  },
                ],
              },
            },
          ],
          "text": "DocNode",
        },
        "typeParameters": [],
      }
    `)
  })

  test('recursive types with classes', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
      type FileSystemSource<SourceExports> = {
        collection?: Collection<SourceExports>
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
        "text": "FileSystemSource<SourceExports>",
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
                  "column": 41,
                  "line": 2,
                },
                "start": {
                  "column": 3,
                  "line": 2,
                },
              },
              "text": "collection?: Collection<SourceExports>",
              "type": {
                "filePath": "test.ts",
                "kind": "TypeReference",
                "moduleSpecifier": undefined,
                "name": "Collection",
                "position": {
                  "end": {
                    "column": 41,
                    "line": 2,
                  },
                  "start": {
                    "column": 16,
                    "line": 2,
                  },
                },
                "text": "Collection<SourceExports>",
                "typeArguments": [
                  {
                    "filePath": "test.ts",
                    "kind": "TypeReference",
                    "moduleSpecifier": undefined,
                    "name": "SourceExports",
                    "position": {
                      "end": {
                        "column": 40,
                        "line": 2,
                      },
                      "start": {
                        "column": 27,
                        "line": 2,
                      },
                    },
                    "text": "SourceExports",
                    "typeArguments": [],
                  },
                ],
              },
            },
          ],
          "text": "FileSystemSource<SourceExports>",
        },
        "typeParameters": [
          {
            "constraintType": undefined,
            "defaultType": undefined,
            "filePath": "test.ts",
            "kind": "TypeParameter",
            "name": "SourceExports",
            "position": {
              "end": {
                "column": 36,
                "line": 1,
              },
              "start": {
                "column": 23,
                "line": 1,
              },
            },
            "text": "SourceExports",
          },
        ],
      }
    `)
  })

  test('references type query located in node_modules', () => {
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
              "text": "readFile: typeof readFile",
              "type": {
                "filePath": "test.ts",
                "kind": "TypeQuery",
                "name": "readFile",
                "position": {
                  "end": {
                    "column": 54,
                    "line": 4,
                  },
                  "start": {
                    "column": 39,
                    "line": 4,
                  },
                },
                "text": "(path: string, callback: (err: Error, data: Buffer<ArrayBufferLike>) => void) => void",
                "typeArguments": [],
              },
            },
          ],
          "text": "FileSystem",
        },
        "typeParameters": [],
      }
    `)
  })

  test('method signature overloads in interface', () => {
    const sourceFile = project.createSourceFile(
      'overload.ts',
      dedent`
      interface Foo {
        /** First overload */
        method(value: string): string
        
        /** Second overload */
        method(value: number): number
      }
      `,
      { overwrite: true }
    )
    const interfaceDeclaration = sourceFile.getInterfaceOrThrow('Foo')
    const resolved = resolveType(
      interfaceDeclaration.getType(),
      interfaceDeclaration
    )

    expect(resolved).toMatchInlineSnapshot(`
      {
        "filePath": "overload.ts",
        "kind": "Interface",
        "members": [
          {
            "description": "First overload",
            "filePath": "overload.ts",
            "kind": "MethodSignature",
            "name": "method",
            "position": {
              "end": {
                "column": 32,
                "line": 3,
              },
              "start": {
                "column": 3,
                "line": 3,
              },
            },
            "signatures": [
              {
                "description": "First overload",
                "filePath": "overload.ts",
                "kind": "CallSignature",
                "parameters": [
                  {
                    "description": undefined,
                    "filePath": "overload.ts",
                    "initializer": undefined,
                    "isOptional": false,
                    "isRest": false,
                    "kind": "Parameter",
                    "name": "value",
                    "position": {
                      "end": {
                        "column": 23,
                        "line": 3,
                      },
                      "start": {
                        "column": 10,
                        "line": 3,
                      },
                    },
                    "text": "value: string",
                    "type": {
                      "filePath": "overload.ts",
                      "kind": "String",
                      "position": {
                        "end": {
                          "column": 23,
                          "line": 3,
                        },
                        "start": {
                          "column": 17,
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
                    "column": 32,
                    "line": 3,
                  },
                  "start": {
                    "column": 3,
                    "line": 3,
                  },
                },
                "returnType": {
                  "filePath": "overload.ts",
                  "kind": "String",
                  "position": {
                    "end": {
                      "column": 32,
                      "line": 3,
                    },
                    "start": {
                      "column": 26,
                      "line": 3,
                    },
                  },
                  "text": "string",
                  "value": undefined,
                },
                "tags": undefined,
                "text": "(value: string) => string",
                "thisType": undefined,
              },
              {
                "description": "Second overload",
                "filePath": "overload.ts",
                "kind": "CallSignature",
                "parameters": [
                  {
                    "description": undefined,
                    "filePath": "overload.ts",
                    "initializer": undefined,
                    "isOptional": false,
                    "isRest": false,
                    "kind": "Parameter",
                    "name": "value",
                    "position": {
                      "end": {
                        "column": 23,
                        "line": 6,
                      },
                      "start": {
                        "column": 10,
                        "line": 6,
                      },
                    },
                    "text": "value: number",
                    "type": {
                      "filePath": "overload.ts",
                      "kind": "Number",
                      "position": {
                        "end": {
                          "column": 23,
                          "line": 6,
                        },
                        "start": {
                          "column": 17,
                          "line": 6,
                        },
                      },
                      "text": "number",
                      "value": undefined,
                    },
                  },
                ],
                "position": {
                  "end": {
                    "column": 32,
                    "line": 6,
                  },
                  "start": {
                    "column": 3,
                    "line": 6,
                  },
                },
                "returnType": {
                  "filePath": "overload.ts",
                  "kind": "Number",
                  "position": {
                    "end": {
                      "column": 32,
                      "line": 6,
                    },
                    "start": {
                      "column": 26,
                      "line": 6,
                    },
                  },
                  "text": "number",
                  "value": undefined,
                },
                "tags": undefined,
                "text": "(value: number) => number",
                "thisType": undefined,
              },
            ],
            "tags": undefined,
            "text": "method(value: string): string
      method(value: number): number",
          },
        ],
        "name": "Foo",
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
        "text": "Foo",
        "typeParameters": [],
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
              "text": "value: Promise<Foo>",
              "type": {
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
                "text": "Promise<Foo>",
                "typeArguments": [
                  {
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
                        "text": "bar: 'baz'",
                        "type": {
                          "filePath": "test.ts",
                          "kind": "String",
                          "position": {
                            "end": {
                              "column": 13,
                              "line": 2,
                            },
                            "start": {
                              "column": 8,
                              "line": 2,
                            },
                          },
                          "text": ""baz"",
                          "value": "baz",
                        },
                      },
                    ],
                    "text": "Foo",
                  },
                ],
              },
            },
          ],
          "text": "AsyncString",
        },
        "typeParameters": [],
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
          "filePath": "test.ts",
          "kind": "TypeReference",
          "moduleSpecifier": undefined,
          "name": "UnwrapPromisesInMap",
          "position": {
            "end": {
              "column": 78,
              "line": 24,
            },
            "start": {
              "column": 21,
              "line": 24,
            },
          },
          "text": "ExportedType",
          "typeArguments": [
            {
              "filePath": "test.ts",
              "kind": "TypeReference",
              "moduleSpecifier": undefined,
              "name": "DistributiveOmit",
              "position": {
                "end": {
                  "column": 77,
                  "line": 24,
                },
                "start": {
                  "column": 41,
                  "line": 24,
                },
              },
              "text": "Omit<A, "title"> | Omit<B, "title">",
              "typeArguments": [
                {
                  "kind": "UnionType",
                  "text": "A | B",
                  "types": [
                    {
                      "filePath": "test.ts",
                      "kind": "TypeReference",
                      "name": "A",
                      "position": {
                        "end": {
                          "column": 13,
                          "line": 12,
                        },
                        "start": {
                          "column": 1,
                          "line": 10,
                        },
                      },
                      "text": "A",
                      "typeArguments": [],
                    },
                    {
                      "filePath": "test.ts",
                      "kind": "TypeReference",
                      "name": "B",
                      "position": {
                        "end": {
                          "column": 13,
                          "line": 16,
                        },
                        "start": {
                          "column": 1,
                          "line": 14,
                        },
                      },
                      "text": "B",
                      "typeArguments": [],
                    },
                  ],
                },
                {
                  "filePath": "test.ts",
                  "kind": "String",
                  "position": {
                    "end": {
                      "column": 76,
                      "line": 24,
                    },
                    "start": {
                      "column": 69,
                      "line": 24,
                    },
                  },
                  "text": ""title"",
                  "value": "title",
                },
              ],
            },
          ],
        },
        "typeParameters": [],
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
              "text": "color: Color",
              "type": {
                "filePath": "test.ts",
                "kind": "TypeReference",
                "moduleSpecifier": "./library",
                "name": "Color",
                "position": {
                  "end": {
                    "column": 15,
                    "line": 4,
                  },
                  "start": {
                    "column": 10,
                    "line": 4,
                  },
                },
                "text": "Color",
                "typeArguments": [],
              },
            },
          ],
          "text": "TextProps",
        },
        "typeParameters": [],
      }
    `)
  })

  test('creates reference for synthetic types pointing to node modules', () => {
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
              "text": "fontWeight?: string | number",
              "type": {
                "kind": "UnionType",
                "text": "string | number",
                "types": [
                  {
                    "filePath": "test.ts",
                    "kind": "String",
                    "position": {
                      "end": {
                        "column": 22,
                        "line": 12,
                      },
                      "start": {
                        "column": 16,
                        "line": 12,
                      },
                    },
                    "text": "string",
                    "value": undefined,
                  },
                  {
                    "filePath": "test.ts",
                    "kind": "Number",
                    "position": {
                      "end": {
                        "column": 31,
                        "line": 12,
                      },
                      "start": {
                        "column": 25,
                        "line": 12,
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
        "typeParameters": [],
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
              "text": "exportedTypes: Array<ExportedType>",
              "type": {
                "filePath": "test.ts",
                "kind": "TypeReference",
                "name": "Array",
                "position": {
                  "end": {
                    "column": 37,
                    "line": 6,
                  },
                  "start": {
                    "column": 18,
                    "line": 6,
                  },
                },
                "text": "Array<FunctionMetadata & { slug: string; } | TypeMetadata & { slug: string; }>",
                "typeArguments": [
                  {
                    "kind": "UnionType",
                    "text": "FunctionMetadata & { slug: string; } | TypeMetadata & { slug: string; }",
                    "types": [
                      {
                        "kind": "IntersectionType",
                        "text": "FunctionMetadata & { slug: string; }",
                        "types": [
                          {
                            "kind": "TypeReference",
                            "name": "FunctionMetadata",
                            "text": "FunctionMetadata",
                            "typeArguments": [],
                          },
                          {
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
                                "text": "slug: string",
                                "type": {
                                  "filePath": "test.ts",
                                  "kind": "String",
                                  "position": {
                                    "end": {
                                      "column": 46,
                                      "line": 3,
                                    },
                                    "start": {
                                      "column": 40,
                                      "line": 3,
                                    },
                                  },
                                  "text": "string",
                                  "value": undefined,
                                },
                              },
                            ],
                            "text": "{ slug: string; }",
                          },
                        ],
                      },
                      {
                        "kind": "IntersectionType",
                        "text": "TypeMetadata & { slug: string; }",
                        "types": [
                          {
                            "kind": "TypeReference",
                            "name": "TypeMetadata",
                            "text": "TypeMetadata",
                            "typeArguments": [],
                          },
                          {
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
                                "text": "slug: string",
                                "type": {
                                  "filePath": "test.ts",
                                  "kind": "String",
                                  "position": {
                                    "end": {
                                      "column": 46,
                                      "line": 3,
                                    },
                                    "start": {
                                      "column": 40,
                                      "line": 3,
                                    },
                                  },
                                  "text": "string",
                                  "value": undefined,
                                },
                              },
                            ],
                            "text": "{ slug: string; }",
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            },
          ],
          "text": "ModuleData<Type>",
        },
        "typeParameters": [
          {
            "constraintType": {
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
                      "line": 5,
                    },
                    "start": {
                      "column": 32,
                      "line": 5,
                    },
                  },
                  "text": "frontMatter: Record<string, any>",
                  "type": {
                    "filePath": "test.ts",
                    "kind": "TypeReference",
                    "moduleSpecifier": undefined,
                    "name": "Record",
                    "position": {
                      "end": {
                        "column": 64,
                        "line": 5,
                      },
                      "start": {
                        "column": 45,
                        "line": 5,
                      },
                    },
                    "text": "Record<string, any>",
                    "typeArguments": [
                      {
                        "filePath": "test.ts",
                        "kind": "String",
                        "position": {
                          "end": {
                            "column": 58,
                            "line": 5,
                          },
                          "start": {
                            "column": 52,
                            "line": 5,
                          },
                        },
                        "text": "string",
                        "value": undefined,
                      },
                      {
                        "filePath": "test.ts",
                        "kind": "Any",
                        "position": {
                          "end": {
                            "column": 63,
                            "line": 5,
                          },
                          "start": {
                            "column": 60,
                            "line": 5,
                          },
                        },
                        "text": "any",
                      },
                    ],
                  },
                },
              ],
              "text": "{ frontMatter: Record<string, any>; }",
            },
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
    const processedProperties = resolveType(typeAlias.getType(), typeAlias)

    expect(processedProperties).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "TypeAlias",
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
        "text": "Text",
        "type": {
          "filePath": "test.ts",
          "isAsync": false,
          "kind": "FunctionType",
          "parameters": [
            {
              "description": undefined,
              "filePath": "test.ts",
              "initializer": undefined,
              "isOptional": false,
              "isRest": false,
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
              "text": "color: Color",
              "type": {
                "filePath": "test.ts",
                "kind": "TypeReference",
                "moduleSpecifier": "library",
                "name": "Color",
                "position": {
                  "end": {
                    "column": 33,
                    "line": 3,
                  },
                  "start": {
                    "column": 28,
                    "line": 3,
                  },
                },
                "text": "Color",
                "typeArguments": [],
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
            "kind": "Void",
            "position": {
              "end": {
                "column": 42,
                "line": 3,
              },
              "start": {
                "column": 38,
                "line": 3,
              },
            },
            "text": "void",
          },
          "text": "Text",
        },
        "typeParameters": [],
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
              "isRest": false,
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
              "text": "props?: TextProps",
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
                    "text": "color: Color;",
                    "type": {
                      "filePath": "test.ts",
                      "kind": "TypeReference",
                      "moduleSpecifier": "library",
                      "name": "Color",
                      "position": {
                        "end": {
                          "column": 15,
                          "line": 4,
                        },
                        "start": {
                          "column": 10,
                          "line": 4,
                        },
                      },
                      "text": "Color",
                      "typeArguments": [],
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
              "filePath": "test.ts",
              "kind": "Void",
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
            "thisType": undefined,
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
    const processedProperties = resolveType(typeAlias.getType(), typeAlias)

    expect(processedProperties).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "TypeAlias",
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
        "text": "Text",
        "type": {
          "filePath": "test.ts",
          "isAsync": false,
          "kind": "FunctionType",
          "parameters": [
            {
              "description": undefined,
              "filePath": "test.ts",
              "initializer": undefined,
              "isOptional": false,
              "isRest": false,
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
              "text": "props: TextProps",
              "type": {
                "filePath": "test.ts",
                "kind": "TypeReference",
                "moduleSpecifier": undefined,
                "name": "TextProps",
                "position": {
                  "end": {
                    "column": 37,
                    "line": 8,
                  },
                  "start": {
                    "column": 28,
                    "line": 8,
                  },
                },
                "text": "TextProps",
                "typeArguments": [],
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
            "kind": "Void",
            "position": {
              "end": {
                "column": 46,
                "line": 8,
              },
              "start": {
                "column": 42,
                "line": 8,
              },
            },
            "text": "void",
          },
          "text": "Text",
        },
        "typeParameters": [],
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
                "color": "red",
              },
              "isOptional": false,
              "isRest": false,
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
              "text": "props: TextProps = { color: 'red' }",
              "type": {
                "filePath": "test.ts",
                "kind": "TypeReference",
                "moduleSpecifier": undefined,
                "name": "TextProps",
                "position": {
                  "end": {
                    "column": 38,
                    "line": 6,
                  },
                  "start": {
                    "column": 29,
                    "line": 6,
                  },
                },
                "text": "TextProps",
                "typeArguments": [],
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
              "kind": "Void",
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
            "text": "function Text(props: TextProps = { color: 'red' }): void",
            "thisType": undefined,
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
                "style": {
                  "color": "blue",
                  "fontWeight": 400,
                },
              },
              "isOptional": false,
              "isRest": false,
              "kind": "Parameter",
              "name": "{ style: { fontSize, color } }",
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
              "text": "{ style: { fontSize, color } }: TextProps = { style: { fontWeight: 400, color: 'blue' } }",
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
                    "text": "style: {
          fontSize: number;
          fontWeight: number;
          color?: string;
        };",
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
                          "text": "fontSize: number;",
                          "type": {
                            "filePath": "test.ts",
                            "kind": "Number",
                            "position": {
                              "end": {
                                "column": 21,
                                "line": 3,
                              },
                              "start": {
                                "column": 15,
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
                          "text": "fontWeight: number;",
                          "type": {
                            "filePath": "test.ts",
                            "kind": "Number",
                            "position": {
                              "end": {
                                "column": 23,
                                "line": 4,
                              },
                              "start": {
                                "column": 17,
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
                          "text": "color?: string;",
                          "type": {
                            "filePath": "test.ts",
                            "kind": "String",
                            "position": {
                              "end": {
                                "column": 19,
                                "line": 5,
                              },
                              "start": {
                                "column": 13,
                                "line": 5,
                              },
                            },
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
              "filePath": "test.ts",
              "kind": "Void",
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
            "text": "function Text({ style: { fontSize, color } }: TextProps = { style: { fontWeight: 400, color: 'blue' } }): void",
            "thisType": undefined,
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
            "filePath": "test.ts",
            "kind": "String",
            "position": {
              "end": {
                "column": 83,
                "line": 1,
              },
              "start": {
                "column": 70,
                "line": 1,
              },
            },
            "text": ""frontMatter"",
            "value": "frontMatter",
          },
          "extendsType": {
            "kind": "TypeOperator",
            "operator": "keyof",
            "text": "keyof Type",
            "type": {
              "filePath": "test.ts",
              "kind": "TypeReference",
              "moduleSpecifier": undefined,
              "name": "Type",
              "position": {
                "end": {
                  "column": 102,
                  "line": 1,
                },
                "start": {
                  "column": 98,
                  "line": 1,
                },
              },
              "text": "Type",
              "typeArguments": [],
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
                "text": "frontMatter: Record<string, any>",
                "type": {
                  "filePath": "test.ts",
                  "kind": "TypeReference",
                  "moduleSpecifier": undefined,
                  "name": "Record",
                  "position": {
                    "end": {
                      "column": 41,
                      "line": 3,
                    },
                    "start": {
                      "column": 22,
                      "line": 3,
                    },
                  },
                  "text": "Record<string, any>",
                  "typeArguments": [
                    {
                      "filePath": "test.ts",
                      "kind": "String",
                      "position": {
                        "end": {
                          "column": 35,
                          "line": 3,
                        },
                        "start": {
                          "column": 29,
                          "line": 3,
                        },
                      },
                      "text": "string",
                      "value": undefined,
                    },
                    {
                      "filePath": "test.ts",
                      "kind": "Any",
                      "position": {
                        "end": {
                          "column": 40,
                          "line": 3,
                        },
                        "start": {
                          "column": 37,
                          "line": 3,
                        },
                      },
                      "text": "any",
                    },
                  ],
                },
              },
            ],
            "text": "{ frontMatter: Record<string, any>; }",
          },
          "isDistributive": false,
          "kind": "ConditionalType",
          "text": "ModuleData<Type>",
          "trueType": {
            "filePath": "test.ts",
            "kind": "TypeReference",
            "moduleSpecifier": undefined,
            "name": "Type",
            "position": {
              "end": {
                "column": 11,
                "line": 2,
              },
              "start": {
                "column": 7,
                "line": 2,
              },
            },
            "text": "Type",
            "typeArguments": [],
          },
        },
        "typeParameters": [
          {
            "constraintType": {
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
                  "text": "frontMatter: Record<string, any>",
                  "type": {
                    "filePath": "test.ts",
                    "kind": "TypeReference",
                    "moduleSpecifier": undefined,
                    "name": "Record",
                    "position": {
                      "end": {
                        "column": 64,
                        "line": 1,
                      },
                      "start": {
                        "column": 45,
                        "line": 1,
                      },
                    },
                    "text": "Record<string, any>",
                    "typeArguments": [
                      {
                        "filePath": "test.ts",
                        "kind": "String",
                        "position": {
                          "end": {
                            "column": 58,
                            "line": 1,
                          },
                          "start": {
                            "column": 52,
                            "line": 1,
                          },
                        },
                        "text": "string",
                        "value": undefined,
                      },
                      {
                        "filePath": "test.ts",
                        "kind": "Any",
                        "position": {
                          "end": {
                            "column": 63,
                            "line": 1,
                          },
                          "start": {
                            "column": 60,
                            "line": 1,
                          },
                        },
                        "text": "any",
                      },
                    ],
                  },
                },
              ],
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
            "text": "Type extends { frontMatter: Record<string, any> }",
          },
        ],
      }
    `)
  })

  test.skip('generic function parameters', () => {
    const sourceFile = project.createSourceFile(
      'test.tsx',
      dedent`
        const createComponent = (
          <Props extends Record<string, any>>(tagName: string) => (props: Props) => {
            return <div>{props.children}</div>
          }
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
        "filePath": "test.tsx",
        "kind": "Function",
        "name": undefined,
        "position": {
          "end": {
            "column": 4,
            "line": 4,
          },
          "start": {
            "column": 59,
            "line": 2,
          },
        },
        "signatures": [
          {
            "filePath": "test.tsx",
            "kind": "FunctionSignature",
            "parameters": [
              {
                "description": undefined,
                "filePath": "test.tsx",
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
                "text": "props: Props",
                "type": {
                  "kind": "TypeLiteral",
                  "members": [
                    {
                      "filePath": "test.tsx",
                      "isOptional": false,
                      "isReadonly": false,
                      "kind": "PropertySignature",
                      "name": "columns",
                      "position": {
                        "end": {
                          "column": 36,
                          "line": 7,
                        },
                        "start": {
                          "column": 20,
                          "line": 7,
                        },
                      },
                      "text": "columns: number,",
                      "type": {
                        "kind": "Number",
                        "text": "number",
                        "value": undefined,
                      },
                    },
                    {
                      "filePath": "test.tsx",
                      "isOptional": false,
                      "isReadonly": false,
                      "kind": "PropertySignature",
                      "name": "rows",
                      "position": {
                        "end": {
                          "column": 49,
                          "line": 7,
                        },
                        "start": {
                          "column": 37,
                          "line": 7,
                        },
                      },
                      "text": "rows: number",
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
                "column": 4,
                "line": 4,
              },
              "start": {
                "column": 59,
                "line": 2,
              },
            },
            "returnType": {
              "filePath": "test.tsx",
              "kind": "TypeReference",
              "position": {
                "end": {
                  "column": 4,
                  "line": 4,
                },
                "start": {
                  "column": 59,
                  "line": 2,
                },
              },
              "text": "Element",
            },
            "text": "(props: Props) => Element",
          },
        ],
        "text": "(props: GridProps) => Element",
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
              "text": "color: string | undefined;",
              "type": {
                "kind": "UnionType",
                "text": "string | undefined",
                "types": [
                  {
                    "filePath": "test.ts",
                    "kind": "String",
                    "position": {
                      "end": {
                        "column": 16,
                        "line": 2,
                      },
                      "start": {
                        "column": 10,
                        "line": 2,
                      },
                    },
                    "text": "string",
                    "value": undefined,
                  },
                  {
                    "filePath": "test.ts",
                    "kind": "Undefined",
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
          "text": "TextProps",
        },
        "typeParameters": [],
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
      variableDeclaration
    )

    expect(processedType).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "Component",
        "name": "Text",
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
        "signatures": [
          {
            "filePath": "node_modules/@types/react/index.d.ts",
            "kind": "ComponentSignature",
            "parameter": {
              "description": undefined,
              "filePath": "node_modules/@types/react/index.d.ts",
              "initializer": undefined,
              "isOptional": false,
              "isRest": false,
              "kind": "Parameter",
              "name": "props",
              "position": {
                "end": {
                  "column": 18,
                  "line": 562,
                },
                "start": {
                  "column": 10,
                  "line": 562,
                },
              },
              "text": "props: P",
              "type": {
                "kind": "IntersectionType",
                "text": "Substitute<DetailedHTMLProps<HTMLAttributes<HTMLSpanElement>, HTMLSpanElement>, { fontSize: number; fontWeight?: number; }>",
                "types": [
                  {
                    "filePath": "node_modules/styled-components/dist/types.d.ts",
                    "kind": "TypeReference",
                    "moduleSpecifier": undefined,
                    "name": "FastOmit",
                    "position": {
                      "end": {
                        "column": 82,
                        "line": 203,
                      },
                      "start": {
                        "column": 62,
                        "line": 203,
                      },
                    },
                    "text": "FastOmit<DetailedHTMLProps<HTMLAttributes<HTMLSpanElement>, HTMLSpanElement>, "fontSize" | "fontWeight">",
                    "typeArguments": [
                      {
                        "filePath": "node_modules/styled-components/dist/types.d.ts",
                        "kind": "TypeReference",
                        "moduleSpecifier": undefined,
                        "name": "A",
                        "position": {
                          "end": {
                            "column": 72,
                            "line": 203,
                          },
                          "start": {
                            "column": 71,
                            "line": 203,
                          },
                        },
                        "text": "A",
                        "typeArguments": [],
                      },
                      {
                        "kind": "TypeOperator",
                        "operator": "keyof",
                        "text": "keyof B",
                        "type": {
                          "filePath": "node_modules/styled-components/dist/types.d.ts",
                          "kind": "TypeReference",
                          "moduleSpecifier": undefined,
                          "name": "B",
                          "position": {
                            "end": {
                              "column": 81,
                              "line": 203,
                            },
                            "start": {
                              "column": 80,
                              "line": 203,
                            },
                          },
                          "text": "B",
                          "typeArguments": [],
                        },
                      },
                    ],
                  },
                  {
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
                            "column": 52,
                            "line": 2,
                          },
                          "start": {
                            "column": 35,
                            "line": 2,
                          },
                        },
                        "text": "fontSize: number;",
                        "type": {
                          "filePath": "test.ts",
                          "kind": "Number",
                          "position": {
                            "end": {
                              "column": 51,
                              "line": 2,
                            },
                            "start": {
                              "column": 45,
                              "line": 2,
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
                            "column": 72,
                            "line": 2,
                          },
                          "start": {
                            "column": 53,
                            "line": 2,
                          },
                        },
                        "text": "fontWeight?: number",
                        "type": {
                          "filePath": "test.ts",
                          "kind": "Number",
                          "position": {
                            "end": {
                              "column": 72,
                              "line": 2,
                            },
                            "start": {
                              "column": 66,
                              "line": 2,
                            },
                          },
                          "text": "number",
                          "value": undefined,
                        },
                      },
                    ],
                    "text": "{ fontSize: number; fontWeight?: number; }",
                  },
                ],
              },
            },
            "position": {
              "end": {
                "column": 31,
                "line": 562,
              },
              "start": {
                "column": 9,
                "line": 562,
              },
            },
            "returnType": {
              "filePath": "node_modules/@types/react/index.d.ts",
              "kind": "TypeReference",
              "moduleSpecifier": undefined,
              "name": "ReactNode",
              "position": {
                "end": {
                  "column": 30,
                  "line": 562,
                },
                "start": {
                  "column": 21,
                  "line": 562,
                },
              },
              "text": "ReactNode",
              "typeArguments": [],
            },
            "text": "(props: P) => ReactNode",
            "thisType": undefined,
          },
        ],
        "text": "IStyledComponentBase<"web", Substitute<DetailedHTMLProps<HTMLAttributes<HTMLSpanElement>, HTMLSpanElement>, { fontSize: number; fontWeight?: number; }>> & string",
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
              "text": "color: Color;",
              "type": {
                "kind": "UnionType",
                "text": "Color.Red | Color.Blue | Color.Green",
                "types": [
                  {
                    "filePath": "test.ts",
                    "kind": "String",
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
                    "text": "Color.Red",
                    "value": "red",
                  },
                  {
                    "filePath": "test.ts",
                    "kind": "String",
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
                    "text": "Color.Blue",
                    "value": "blue",
                  },
                  {
                    "filePath": "test.ts",
                    "kind": "String",
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
                    "text": "Color.Green",
                    "value": "green",
                  },
                ],
              },
            },
          ],
          "text": "TextProps",
        },
        "typeParameters": [],
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
                "kind": "CallSignature",
                "parameters": [
                  {
                    "description": undefined,
                    "filePath": "test.ts",
                    "initializer": undefined,
                    "isOptional": false,
                    "isRest": false,
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
                    "text": "value: string",
                    "type": {
                      "filePath": "test.ts",
                      "kind": "String",
                      "position": {
                        "end": {
                          "column": 25,
                          "line": 4,
                        },
                        "start": {
                          "column": 19,
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
                  "kind": "Void",
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
                "thisType": undefined,
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

  test('class method with implicit typed initializer', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
        class FileSystem {
          isFilePath(filePath: string, isDirectory = false) {
            return false
          }
        }
      `,
      { overwrite: true }
    )
    const declaration = sourceFile.getClassOrThrow('FileSystem')
    const types = resolveType(declaration.getType(), declaration)

    expect(types).toMatchInlineSnapshot(`
      {
        "constructor": undefined,
        "filePath": "test.ts",
        "kind": "Class",
        "methods": [
          {
            "kind": "ClassMethod",
            "name": "isFilePath",
            "scope": undefined,
            "signatures": [
              {
                "filePath": "test.ts",
                "isAsync": false,
                "isGenerator": false,
                "kind": "CallSignature",
                "parameters": [
                  {
                    "description": undefined,
                    "filePath": "test.ts",
                    "initializer": undefined,
                    "isOptional": false,
                    "isRest": false,
                    "kind": "Parameter",
                    "name": "filePath",
                    "position": {
                      "end": {
                        "column": 30,
                        "line": 2,
                      },
                      "start": {
                        "column": 14,
                        "line": 2,
                      },
                    },
                    "text": "filePath: string",
                    "type": {
                      "filePath": "test.ts",
                      "kind": "String",
                      "position": {
                        "end": {
                          "column": 30,
                          "line": 2,
                        },
                        "start": {
                          "column": 24,
                          "line": 2,
                        },
                      },
                      "text": "string",
                      "value": undefined,
                    },
                  },
                  {
                    "description": undefined,
                    "filePath": "test.ts",
                    "initializer": false,
                    "isOptional": false,
                    "isRest": false,
                    "kind": "Parameter",
                    "name": "isDirectory",
                    "position": {
                      "end": {
                        "column": 51,
                        "line": 2,
                      },
                      "start": {
                        "column": 32,
                        "line": 2,
                      },
                    },
                    "text": "isDirectory = false",
                    "type": {
                      "filePath": "test.ts",
                      "kind": "Boolean",
                      "position": {
                        "end": {
                          "column": 4,
                          "line": 4,
                        },
                        "start": {
                          "column": 3,
                          "line": 2,
                        },
                      },
                      "text": "boolean",
                    },
                  },
                ],
                "position": {
                  "end": {
                    "column": 4,
                    "line": 4,
                  },
                  "start": {
                    "column": 3,
                    "line": 2,
                  },
                },
                "returnType": {
                  "filePath": "test.ts",
                  "kind": "Boolean",
                  "position": {
                    "end": {
                      "column": 4,
                      "line": 4,
                    },
                    "start": {
                      "column": 3,
                      "line": 2,
                    },
                  },
                  "text": "boolean",
                },
                "text": "(filePath: string, isDirectory = false) => boolean",
                "thisType": undefined,
              },
            ],
            "text": "(filePath: string, isDirectory?: boolean) => boolean",
            "visibility": undefined,
          },
        ],
        "name": "FileSystem",
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
        "text": "FileSystem",
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
              "text": "text: TextView;",
              "type": {
                "filePath": "test.ts",
                "kind": "TypeReference",
                "name": "TextView",
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
                "text": "TextView",
                "typeArguments": [],
              },
            },
          ],
          "text": "CardViewProps",
        },
        "typeParameters": [],
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
        "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
        "kind": "Variable",
        "name": "color",
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
        "text": ""blue"",
        "type": {
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
        },
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
        "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
        "kind": "Variable",
        "name": "color",
        "position": {
          "end": {
            "column": 218,
            "line": 6,
          },
          "start": {
            "column": 170,
            "line": 6,
          },
        },
        "text": "Readonly<{ red: "red"; blue: "blue"; green: "green"; }>",
        "type": {
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
          "text": "Readonly<{ red: "red"; blue: "blue"; green: "green"; }>",
        },
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
              "text": "color: ReturnType<typeof getColor>;",
              "type": {
                "filePath": "test.ts",
                "kind": "TypeReference",
                "moduleSpecifier": undefined,
                "name": "ReturnType",
                "position": {
                  "end": {
                    "column": 37,
                    "line": 6,
                  },
                  "start": {
                    "column": 10,
                    "line": 6,
                  },
                },
                "text": ""red" | "blue" | "green"",
                "typeArguments": [
                  {
                    "filePath": "test.ts",
                    "kind": "TypeQuery",
                    "name": "getColor",
                    "position": {
                      "end": {
                        "column": 36,
                        "line": 6,
                      },
                      "start": {
                        "column": 21,
                        "line": 6,
                      },
                    },
                    "text": "(key: "red" | "blue" | "green") => "red" | "blue" | "green"",
                    "typeArguments": [],
                  },
                ],
              },
            },
          ],
          "text": "TextProps",
        },
        "typeParameters": [],
      }
    `)
  })

  // TODO: fix this, it should be treated as a reference because the type argument "typeof getColor" is exported
  test('computes exported generic arguments', () => {
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
              "text": "color: ReturnType<typeof getColor>;",
              "type": {
                "filePath": "test.ts",
                "kind": "TypeReference",
                "moduleSpecifier": undefined,
                "name": "ReturnType",
                "position": {
                  "end": {
                    "column": 37,
                    "line": 6,
                  },
                  "start": {
                    "column": 10,
                    "line": 6,
                  },
                },
                "text": ""red" | "blue" | "green"",
                "typeArguments": [
                  {
                    "filePath": "test.ts",
                    "kind": "TypeQuery",
                    "name": "getColor",
                    "position": {
                      "end": {
                        "column": 36,
                        "line": 6,
                      },
                      "start": {
                        "column": 21,
                        "line": 6,
                      },
                    },
                    "text": "(key: "red" | "blue" | "green") => "red" | "blue" | "green"",
                    "typeArguments": [],
                  },
                ],
              },
            },
          ],
          "text": "TextProps",
        },
        "typeParameters": [],
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
              "text": "color: Colors;",
              "type": {
                "filePath": "test.ts",
                "kind": "TypeReference",
                "moduleSpecifier": "colors",
                "name": "Colors",
                "position": {
                  "end": {
                    "column": 16,
                    "line": 4,
                  },
                  "start": {
                    "column": 10,
                    "line": 4,
                  },
                },
                "text": "{ readonly red: "red"; readonly blue: "blue"; readonly green: "green"; }",
                "typeArguments": [],
              },
            },
          ],
          "text": "TextProps",
        },
        "typeParameters": [],
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
              "text": "functionReturn: ReturnType<typeof foo>;",
              "type": {
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
                "text": "Promise<{ slug: string; filePath: string; }>",
                "typeArguments": [
                  {
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
                    "text": "{ slug: string; filePath: string; }",
                  },
                ],
              },
            },
          ],
          "text": "ComplexType",
        },
        "typeParameters": [],
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
              "filePath": "test.ts",
              "kind": "TypeReference",
              "moduleSpecifier": "react",
              "name": "React.ReactNode",
              "position": {
                "end": {
                  "column": 40,
                  "line": 2,
                },
                "start": {
                  "column": 25,
                  "line": 2,
                },
              },
              "text": "ReactNode",
              "typeArguments": [],
            },
            "text": "function Text(): ReactNode",
            "thisType": undefined,
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
            "kind": "CallSignature",
            "parameters": [
              {
                "description": "Provides the initial count.",
                "filePath": "test.ts",
                "initializer": 0,
                "isOptional": false,
                "isRest": false,
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
                "text": "initialCount: number = 0",
                "type": {
                  "filePath": "test.ts",
                  "kind": "Number",
                  "position": {
                    "end": {
                      "column": 56,
                      "line": 2,
                    },
                    "start": {
                      "column": 50,
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
              "kind": "Void",
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
            "text": "function useCounter(initialCount: number = 0): void",
            "thisType": undefined,
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
            "kind": "CallSignature",
            "parameters": [
              {
                "description": undefined,
                "filePath": "test.ts",
                "initializer": {
                  "initialCount": 0,
                },
                "isOptional": false,
                "isRest": false,
                "kind": "Parameter",
                "name": "{ initialCount = 0 }",
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
                "text": "{ initialCount = 0 }: {
      /** Provides the initial count. */ initialCount?: number }",
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
                      "text": "initialCount?: number",
                      "type": {
                        "filePath": "test.ts",
                        "kind": "Number",
                        "position": {
                          "end": {
                            "column": 57,
                            "line": 5,
                          },
                          "start": {
                            "column": 51,
                            "line": 5,
                          },
                        },
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
              "filePath": "test.ts",
              "kind": "Void",
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
              "text": "void",
            },
            "tags": [
              {
                "name": "deprecated",
                "text": "use \`Counter\` component",
              },
            ],
            "text": "function useCounter({ initialCount = 0 }: {
      /** Provides the initial count. */ initialCount?: number }): void",
            "thisType": undefined,
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
            "kind": "CallSignature",
            "parameters": [
              {
                "description": undefined,
                "filePath": "test.ts",
                "initializer": {
                  "initial": {
                    "count": 0,
                  },
                },
                "isOptional": true,
                "isRest": false,
                "kind": "Parameter",
                "name": "{ initial = { count: 0 } }",
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
                "text": "{ initial = { count: 0 } }?: { initial?: { count: number } } = {}",
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
                      "text": "initial?: { count: number }",
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
                            "text": "count: number",
                            "type": {
                              "filePath": "test.ts",
                              "kind": "Number",
                              "position": {
                                "end": {
                                  "column": 77,
                                  "line": 1,
                                },
                                "start": {
                                  "column": 71,
                                  "line": 1,
                                },
                              },
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
              "filePath": "test.ts",
              "kind": "Void",
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
            "text": "function useCounter({ initial = { count: 0 } }?: { initial?: { count: number } } = {}): void",
            "thisType": undefined,
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
            "column": 20,
            "line": 1,
          },
        },
        "signatures": [
          {
            "filePath": "test.ts",
            "kind": "CallSignature",
            "parameters": [
              {
                "description": undefined,
                "filePath": "test.ts",
                "initializer": 0,
                "isOptional": false,
                "isRest": false,
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
                "text": "initialCount: number = 0",
                "type": {
                  "filePath": "test.ts",
                  "kind": "Number",
                  "position": {
                    "end": {
                      "column": 41,
                      "line": 1,
                    },
                    "start": {
                      "column": 35,
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
              "kind": "Void",
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
            "text": "(initialCount: number = 0) => void",
            "thisType": undefined,
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
            "column": 20,
            "line": 1,
          },
        },
        "signatures": [
          {
            "filePath": "test.ts",
            "kind": "CallSignature",
            "parameters": [
              {
                "description": undefined,
                "filePath": "test.ts",
                "initializer": 0,
                "isOptional": false,
                "isRest": false,
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
                "text": "initialCount: number = 0",
                "type": {
                  "filePath": "test.ts",
                  "kind": "Number",
                  "position": {
                    "end": {
                      "column": 50,
                      "line": 1,
                    },
                    "start": {
                      "column": 44,
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
              "kind": "Void",
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
            "text": "(initialCount: number = 0) => void",
            "thisType": undefined,
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
            "kind": "CallSignature",
            "parameters": [
              {
                "description": undefined,
                "filePath": "test.ts",
                "initializer": {
                  "initialCount": 0,
                },
                "isOptional": false,
                "isRest": false,
                "kind": "Parameter",
                "name": "{ initialCount = 0 }",
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
                "text": "{ initialCount = 0 }: CounterOptions",
                "type": {
                  "filePath": "test.ts",
                  "kind": "TypeReference",
                  "moduleSpecifier": "./types",
                  "name": "CounterOptions",
                  "position": {
                    "end": {
                      "column": 98,
                      "line": 1,
                    },
                    "start": {
                      "column": 84,
                      "line": 1,
                    },
                  },
                  "text": "CounterOptions",
                  "typeArguments": [],
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
              "kind": "Void",
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
            "text": "function useCounter({ initialCount = 0 }: CounterOptions): void",
            "thisType": undefined,
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
            "kind": "CallSignature",
            "parameters": [
              {
                "description": undefined,
                "filePath": "test.ts",
                "initializer": {
                  "initialCount": 0,
                },
                "isOptional": false,
                "isRest": false,
                "kind": "Parameter",
                "name": "{ initialCount = 0 }",
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
                "text": "{ initialCount = 0 }: ReturnType<typeof useCounter>",
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
                        "filePath": "types.ts",
                        "kind": "Number",
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
              "filePath": "test.ts",
              "kind": "Void",
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
            "text": "function useCounterOverride({ initialCount = 0 }: ReturnType<typeof useCounter>): void",
            "thisType": undefined,
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
              "isRest": false,
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
              "text": "props: Props",
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
                        "text": "color: string",
                        "type": {
                          "filePath": "test.ts",
                          "kind": "String",
                          "position": {
                            "end": {
                              "column": 33,
                              "line": 1,
                            },
                            "start": {
                              "column": 27,
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
                        "text": "source: string",
                        "type": {
                          "filePath": "test.ts",
                          "kind": "String",
                          "position": {
                            "end": {
                              "column": 42,
                              "line": 3,
                            },
                            "start": {
                              "column": 36,
                              "line": 3,
                            },
                          },
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
                        "text": "color: string",
                        "type": {
                          "filePath": "test.ts",
                          "kind": "String",
                          "position": {
                            "end": {
                              "column": 33,
                              "line": 1,
                            },
                            "start": {
                              "column": 27,
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
                        "text": "value: string",
                        "type": {
                          "filePath": "test.ts",
                          "kind": "String",
                          "position": {
                            "end": {
                              "column": 74,
                              "line": 3,
                            },
                            "start": {
                              "column": 68,
                              "line": 3,
                            },
                          },
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
              "filePath": "test.ts",
              "kind": "Void",
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
            "thisType": undefined,
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
            "kind": "CallSignature",
            "parameters": [
              {
                "description": undefined,
                "filePath": "test.ts",
                "initializer": undefined,
                "isOptional": false,
                "isRest": false,
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
                "text": "props: Props",
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
                          "text": "color: string",
                          "type": {
                            "filePath": "test.ts",
                            "kind": "String",
                            "position": {
                              "end": {
                                "column": 29,
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
              "filePath": "test.ts",
              "kind": "Void",
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
            "thisType": undefined,
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
              "isRest": false,
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
              "text": "props: Props",
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
                        "text": "color: string",
                        "type": {
                          "filePath": "types.ts",
                          "kind": "String",
                          "position": {
                            "end": {
                              "column": 40,
                              "line": 1,
                            },
                            "start": {
                              "column": 34,
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
                        "text": "source: string",
                        "type": {
                          "filePath": "test.ts",
                          "kind": "String",
                          "position": {
                            "end": {
                              "column": 42,
                              "line": 3,
                            },
                            "start": {
                              "column": 36,
                              "line": 3,
                            },
                          },
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
                        "text": "color: string",
                        "type": {
                          "filePath": "types.ts",
                          "kind": "String",
                          "position": {
                            "end": {
                              "column": 40,
                              "line": 1,
                            },
                            "start": {
                              "column": 34,
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
                        "text": "value: string",
                        "type": {
                          "filePath": "test.ts",
                          "kind": "String",
                          "position": {
                            "end": {
                              "column": 74,
                              "line": 3,
                            },
                            "start": {
                              "column": 68,
                              "line": 3,
                            },
                          },
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
              "filePath": "test.ts",
              "kind": "Void",
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
            "thisType": undefined,
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
            "text": "language?: Languages | 'mdx'",
            "type": {
              "kind": "UnionType",
              "text": "Languages | "mdx"",
              "types": [
                {
                  "filePath": "test.tsx",
                  "kind": "TypeReference",
                  "moduleSpecifier": "./types",
                  "name": "Languages",
                  "position": {
                    "end": {
                      "column": 23,
                      "line": 4,
                    },
                    "start": {
                      "column": 14,
                      "line": 4,
                    },
                  },
                  "text": "Languages",
                  "typeArguments": [],
                },
                {
                  "filePath": "test.tsx",
                  "kind": "String",
                  "position": {
                    "end": {
                      "column": 31,
                      "line": 4,
                    },
                    "start": {
                      "column": 26,
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
        "typeParameters": [],
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
              "isRest": false,
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
              "text": "props: { variant?: 'primary' | 'secondary' }",
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
                    "text": "variant?: 'primary' | 'secondary'",
                    "type": {
                      "kind": "UnionType",
                      "text": ""primary" | "secondary"",
                      "types": [
                        {
                          "filePath": "test.ts",
                          "kind": "String",
                          "position": {
                            "end": {
                              "column": 45,
                              "line": 1,
                            },
                            "start": {
                              "column": 36,
                              "line": 1,
                            },
                          },
                          "text": ""primary"",
                          "value": "primary",
                        },
                        {
                          "filePath": "test.ts",
                          "kind": "String",
                          "position": {
                            "end": {
                              "column": 59,
                              "line": 1,
                            },
                            "start": {
                              "column": 48,
                              "line": 1,
                            },
                          },
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
              "filePath": "test.ts",
              "kind": "Void",
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
            "text": "function Button(props: { variant?: 'primary' | 'secondary' }): void",
            "thisType": undefined,
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
              "filePath": "test.ts",
              "kind": "Unknown",
              "position": {
                "end": {
                  "column": 25,
                  "line": 2,
                },
                "start": {
                  "column": 18,
                  "line": 2,
                },
              },
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
        "typeParameters": [],
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
              "kind": "IndexSignature",
              "parameter": {
                "kind": "IndexSignatureParameter",
                "name": "key",
                "text": "key: string",
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
                "filePath": "test.ts",
                "kind": "Unknown",
                "position": {
                  "end": {
                    "column": 25,
                    "line": 2,
                  },
                  "start": {
                    "column": 18,
                    "line": 2,
                  },
                },
                "text": "unknown",
              },
            },
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
              "text": "foo: string",
              "type": {
                "filePath": "test.ts",
                "kind": "String",
                "position": {
                  "end": {
                    "column": 14,
                    "line": 3,
                  },
                  "start": {
                    "column": 8,
                    "line": 3,
                  },
                },
                "text": "string",
                "value": undefined,
              },
            },
          ],
          "text": "FileExports",
        },
        "typeParameters": [],
      }
    `)
  })

  test('index signature that references type parameter', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
      type ModuleExports<Value = any> = {
        [exportName: string]: Value
      }
      `,
      { overwrite: true }
    )
    const typeAlias = sourceFile.getTypeAliasOrThrow('ModuleExports')
    const types = resolveType(typeAlias.getType(), typeAlias)

    expect(types).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "TypeAlias",
        "name": "ModuleExports",
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
        "text": "ModuleExports<Value>",
        "type": {
          "kind": "TypeLiteral",
          "members": [
            {
              "filePath": "test.ts",
              "kind": "IndexSignature",
              "parameter": {
                "kind": "IndexSignatureParameter",
                "name": "exportName",
                "text": "exportName: string",
                "type": {
                  "filePath": "test.ts",
                  "kind": "String",
                  "position": {
                    "end": {
                      "column": 30,
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
              "position": {
                "end": {
                  "column": 30,
                  "line": 2,
                },
                "start": {
                  "column": 3,
                  "line": 2,
                },
              },
              "text": "[exportName: string]: Value",
              "type": {
                "filePath": "test.ts",
                "kind": "TypeReference",
                "moduleSpecifier": undefined,
                "name": "Value",
                "position": {
                  "end": {
                    "column": 30,
                    "line": 2,
                  },
                  "start": {
                    "column": 25,
                    "line": 2,
                  },
                },
                "text": "Value",
                "typeArguments": [],
              },
            },
          ],
          "text": "ModuleExports<Value>",
        },
        "typeParameters": [
          {
            "constraintType": undefined,
            "defaultType": {
              "filePath": "test.ts",
              "kind": "Any",
              "position": {
                "end": {
                  "column": 31,
                  "line": 1,
                },
                "start": {
                  "column": 28,
                  "line": 1,
                },
              },
              "text": "any",
            },
            "filePath": "test.ts",
            "kind": "TypeParameter",
            "name": "Value",
            "position": {
              "end": {
                "column": 31,
                "line": 1,
              },
              "start": {
                "column": 20,
                "line": 1,
              },
            },
            "text": "Value = any",
          },
        ],
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
            "column": 21,
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
                "variant": "body1",
              },
              "isOptional": false,
              "isRest": false,
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
              "text": "props: TextProps",
              "type": {
                "filePath": "test.ts",
                "kind": "TypeReference",
                "moduleSpecifier": undefined,
                "name": "TextProps",
                "position": {
                  "end": {
                    "column": 38,
                    "line": 21,
                  },
                  "start": {
                    "column": 29,
                    "line": 21,
                  },
                },
                "text": "TextProps",
                "typeArguments": [],
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
              "kind": "Void",
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
            "thisType": undefined,
          },
        ],
        "text": "(props: TextProps) => void",
      }
    `)
  })

  test('interface property that references type parameter', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
      type FileSystemEntry<Types> = any

      export interface EntryGroupOptions<Entries extends FileSystemEntry<any>[]> {
        entries: Entries
      }
      `,
      { overwrite: true }
    )
    const declaration = sourceFile.getInterfaceOrThrow('EntryGroupOptions')
    const types = resolveType(declaration.getType(), declaration)

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
            "name": "entries",
            "position": {
              "end": {
                "column": 19,
                "line": 4,
              },
              "start": {
                "column": 3,
                "line": 4,
              },
            },
            "text": "entries: Entries",
            "type": {
              "filePath": "test.ts",
              "kind": "TypeReference",
              "moduleSpecifier": undefined,
              "name": "Entries",
              "position": {
                "end": {
                  "column": 19,
                  "line": 4,
                },
                "start": {
                  "column": 12,
                  "line": 4,
                },
              },
              "text": "Entries",
              "typeArguments": [],
            },
          },
        ],
        "name": "EntryGroupOptions",
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
        "text": "EntryGroupOptions<Entries>",
        "typeParameters": [
          {
            "constraintType": {
              "filePath": "test.ts",
              "kind": "TypeReference",
              "name": "Array",
              "position": {
                "end": {
                  "column": 74,
                  "line": 3,
                },
                "start": {
                  "column": 52,
                  "line": 3,
                },
              },
              "text": "Array<any>",
              "typeArguments": [
                {
                  "filePath": "test.ts",
                  "kind": "Any",
                  "position": {
                    "end": {
                      "column": 72,
                      "line": 3,
                    },
                    "start": {
                      "column": 52,
                      "line": 3,
                    },
                  },
                  "text": "any",
                },
              ],
            },
            "defaultType": undefined,
            "filePath": "test.ts",
            "kind": "TypeParameter",
            "name": "Entries",
            "position": {
              "end": {
                "column": 74,
                "line": 3,
              },
              "start": {
                "column": 36,
                "line": 3,
              },
            },
            "text": "Entries extends FileSystemEntry<any>[]",
          },
        ],
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
        "kind": "Component",
        "name": "Grid",
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
        "signatures": [
          {
            "filePath": "node_modules/@types/react/index.d.ts",
            "kind": "ComponentSignature",
            "parameter": {
              "description": undefined,
              "filePath": "node_modules/@types/react/index.d.ts",
              "initializer": undefined,
              "isOptional": false,
              "isRest": false,
              "kind": "Parameter",
              "name": "props",
              "position": {
                "end": {
                  "column": 18,
                  "line": 562,
                },
                "start": {
                  "column": 10,
                  "line": 562,
                },
              },
              "text": "props: P",
              "type": {
                "kind": "IntersectionType",
                "text": "Substitute<DetailedHTMLProps<HTMLAttributes<HTMLDivElement>, HTMLDivElement>, GridProps>",
                "types": [
                  {
                    "filePath": "node_modules/styled-components/dist/types.d.ts",
                    "kind": "TypeReference",
                    "moduleSpecifier": undefined,
                    "name": "FastOmit",
                    "position": {
                      "end": {
                        "column": 82,
                        "line": 203,
                      },
                      "start": {
                        "column": 62,
                        "line": 203,
                      },
                    },
                    "text": "FastOmit<DetailedHTMLProps<HTMLAttributes<HTMLDivElement>, HTMLDivElement>, keyof GridProps>",
                    "typeArguments": [
                      {
                        "filePath": "node_modules/styled-components/dist/types.d.ts",
                        "kind": "TypeReference",
                        "moduleSpecifier": undefined,
                        "name": "A",
                        "position": {
                          "end": {
                            "column": 72,
                            "line": 203,
                          },
                          "start": {
                            "column": 71,
                            "line": 203,
                          },
                        },
                        "text": "A",
                        "typeArguments": [],
                      },
                      {
                        "kind": "TypeOperator",
                        "operator": "keyof",
                        "text": "keyof B",
                        "type": {
                          "filePath": "node_modules/styled-components/dist/types.d.ts",
                          "kind": "TypeReference",
                          "moduleSpecifier": undefined,
                          "name": "B",
                          "position": {
                            "end": {
                              "column": 81,
                              "line": 203,
                            },
                            "start": {
                              "column": 80,
                              "line": 203,
                            },
                          },
                          "text": "B",
                          "typeArguments": [],
                        },
                      },
                    ],
                  },
                  {
                    "kind": "TypeLiteral",
                    "members": [
                      {
                        "filePath": "test.ts",
                        "isOptional": false,
                        "isReadonly": false,
                        "kind": "PropertySignature",
                        "name": "gridTemplateColumns",
                        "position": {
                          "end": {
                            "column": 30,
                            "line": 4,
                          },
                          "start": {
                            "column": 3,
                            "line": 4,
                          },
                        },
                        "text": "gridTemplateColumns: string",
                        "type": {
                          "filePath": "test.ts",
                          "kind": "String",
                          "position": {
                            "end": {
                              "column": 30,
                              "line": 4,
                            },
                            "start": {
                              "column": 24,
                              "line": 4,
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
                        "name": "gridTemplateRows",
                        "position": {
                          "end": {
                            "column": 28,
                            "line": 5,
                          },
                          "start": {
                            "column": 3,
                            "line": 5,
                          },
                        },
                        "text": "gridTemplateRows?: string",
                        "type": {
                          "filePath": "test.ts",
                          "kind": "String",
                          "position": {
                            "end": {
                              "column": 28,
                              "line": 5,
                            },
                            "start": {
                              "column": 22,
                              "line": 5,
                            },
                          },
                          "text": "string",
                          "value": undefined,
                        },
                      },
                    ],
                    "text": "GridProps",
                  },
                ],
              },
            },
            "position": {
              "end": {
                "column": 31,
                "line": 562,
              },
              "start": {
                "column": 9,
                "line": 562,
              },
            },
            "returnType": {
              "filePath": "node_modules/@types/react/index.d.ts",
              "kind": "TypeReference",
              "moduleSpecifier": undefined,
              "name": "ReactNode",
              "position": {
                "end": {
                  "column": 30,
                  "line": 562,
                },
                "start": {
                  "column": 21,
                  "line": 562,
                },
              },
              "text": "ReactNode",
              "typeArguments": [],
            },
            "text": "(props: P) => ReactNode",
            "thisType": undefined,
          },
        ],
        "text": "IStyledComponentBase<"web", Substitute<DetailedHTMLProps<HTMLAttributes<HTMLDivElement>, HTMLDivElement>, GridProps>> & string",
      }
    `)
  })

  test('library call expression generic types with props reference', () => {
    const project = new Project({
      compilerOptions: { strictNullChecks: false },
      tsConfigFilePath: 'tsconfig.json',
    })
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
        import styled from 'styled-components'
  
        export type GridProps = {
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
        "kind": "Component",
        "name": "Grid",
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
        "signatures": [
          {
            "filePath": "node_modules/@types/react/index.d.ts",
            "kind": "ComponentSignature",
            "parameter": {
              "description": undefined,
              "filePath": "node_modules/@types/react/index.d.ts",
              "initializer": undefined,
              "isOptional": false,
              "isRest": false,
              "kind": "Parameter",
              "name": "props",
              "position": {
                "end": {
                  "column": 18,
                  "line": 562,
                },
                "start": {
                  "column": 10,
                  "line": 562,
                },
              },
              "text": "props: P",
              "type": {
                "kind": "IntersectionType",
                "text": "Substitute<DetailedHTMLProps<HTMLAttributes<HTMLDivElement>, HTMLDivElement>, GridProps>",
                "types": [
                  {
                    "filePath": "node_modules/styled-components/dist/types.d.ts",
                    "kind": "TypeReference",
                    "moduleSpecifier": undefined,
                    "name": "FastOmit",
                    "position": {
                      "end": {
                        "column": 82,
                        "line": 203,
                      },
                      "start": {
                        "column": 62,
                        "line": 203,
                      },
                    },
                    "text": "FastOmit<DetailedHTMLProps<HTMLAttributes<HTMLDivElement>, HTMLDivElement>, keyof GridProps>",
                    "typeArguments": [
                      {
                        "filePath": "node_modules/styled-components/dist/types.d.ts",
                        "kind": "TypeReference",
                        "moduleSpecifier": undefined,
                        "name": "A",
                        "position": {
                          "end": {
                            "column": 72,
                            "line": 203,
                          },
                          "start": {
                            "column": 71,
                            "line": 203,
                          },
                        },
                        "text": "A",
                        "typeArguments": [],
                      },
                      {
                        "kind": "TypeOperator",
                        "operator": "keyof",
                        "text": "keyof B",
                        "type": {
                          "filePath": "node_modules/styled-components/dist/types.d.ts",
                          "kind": "TypeReference",
                          "moduleSpecifier": undefined,
                          "name": "B",
                          "position": {
                            "end": {
                              "column": 81,
                              "line": 203,
                            },
                            "start": {
                              "column": 80,
                              "line": 203,
                            },
                          },
                          "text": "B",
                          "typeArguments": [],
                        },
                      },
                    ],
                  },
                  {
                    "filePath": "test.ts",
                    "kind": "TypeReference",
                    "moduleSpecifier": undefined,
                    "name": "GridProps",
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
                    "text": "GridProps",
                    "typeArguments": [],
                  },
                ],
              },
            },
            "position": {
              "end": {
                "column": 31,
                "line": 562,
              },
              "start": {
                "column": 9,
                "line": 562,
              },
            },
            "returnType": {
              "filePath": "node_modules/@types/react/index.d.ts",
              "kind": "TypeReference",
              "moduleSpecifier": undefined,
              "name": "ReactNode",
              "position": {
                "end": {
                  "column": 30,
                  "line": 562,
                },
                "start": {
                  "column": 21,
                  "line": 562,
                },
              },
              "text": "ReactNode",
              "typeArguments": [],
            },
            "text": "(props: P) => ReactNode",
            "thisType": undefined,
          },
        ],
        "text": "IStyledComponentBase<"web", Substitute<DetailedHTMLProps<HTMLAttributes<HTMLDivElement>, HTMLDivElement>, GridProps>> & string",
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
        "kind": "Component",
        "name": "Grid",
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
        "signatures": [
          {
            "filePath": "node_modules/@types/react/index.d.ts",
            "kind": "ComponentSignature",
            "parameter": {
              "description": undefined,
              "filePath": "node_modules/@types/react/index.d.ts",
              "initializer": undefined,
              "isOptional": false,
              "isRest": false,
              "kind": "Parameter",
              "name": "props",
              "position": {
                "end": {
                  "column": 18,
                  "line": 562,
                },
                "start": {
                  "column": 10,
                  "line": 562,
                },
              },
              "text": "props: P",
              "type": {
                "kind": "IntersectionType",
                "text": "Substitute<DetailedHTMLProps<HTMLAttributes<HTMLDivElement>, HTMLDivElement>, { $gridTemplateColumns: string; $gridTemplateRows: string; }>",
                "types": [
                  {
                    "filePath": "node_modules/styled-components/dist/types.d.ts",
                    "kind": "TypeReference",
                    "moduleSpecifier": undefined,
                    "name": "FastOmit",
                    "position": {
                      "end": {
                        "column": 82,
                        "line": 203,
                      },
                      "start": {
                        "column": 62,
                        "line": 203,
                      },
                    },
                    "text": "FastOmit<DetailedHTMLProps<HTMLAttributes<HTMLDivElement>, HTMLDivElement>, "$gridTemplateColumns" | "$gridTemplateRows">",
                    "typeArguments": [
                      {
                        "filePath": "node_modules/styled-components/dist/types.d.ts",
                        "kind": "TypeReference",
                        "moduleSpecifier": undefined,
                        "name": "A",
                        "position": {
                          "end": {
                            "column": 72,
                            "line": 203,
                          },
                          "start": {
                            "column": 71,
                            "line": 203,
                          },
                        },
                        "text": "A",
                        "typeArguments": [],
                      },
                      {
                        "kind": "TypeOperator",
                        "operator": "keyof",
                        "text": "keyof B",
                        "type": {
                          "filePath": "node_modules/styled-components/dist/types.d.ts",
                          "kind": "TypeReference",
                          "moduleSpecifier": undefined,
                          "name": "B",
                          "position": {
                            "end": {
                              "column": 81,
                              "line": 203,
                            },
                            "start": {
                              "column": 80,
                              "line": 203,
                            },
                          },
                          "text": "B",
                          "typeArguments": [],
                        },
                      },
                    ],
                  },
                  {
                    "kind": "TypeLiteral",
                    "members": [
                      {
                        "filePath": "test.ts",
                        "isOptional": false,
                        "isReadonly": false,
                        "kind": "PropertySignature",
                        "name": "$gridTemplateColumns",
                        "position": {
                          "end": {
                            "column": 31,
                            "line": 5,
                          },
                          "start": {
                            "column": 3,
                            "line": 5,
                          },
                        },
                        "text": "$gridTemplateColumns: string",
                        "type": {
                          "filePath": "test.ts",
                          "kind": "String",
                          "position": {
                            "end": {
                              "column": 31,
                              "line": 5,
                            },
                            "start": {
                              "column": 25,
                              "line": 5,
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
                        "name": "$gridTemplateRows",
                        "position": {
                          "end": {
                            "column": 28,
                            "line": 6,
                          },
                          "start": {
                            "column": 3,
                            "line": 6,
                          },
                        },
                        "text": "$gridTemplateRows: string",
                        "type": {
                          "filePath": "test.ts",
                          "kind": "String",
                          "position": {
                            "end": {
                              "column": 28,
                              "line": 6,
                            },
                            "start": {
                              "column": 22,
                              "line": 6,
                            },
                          },
                          "text": "string",
                          "value": undefined,
                        },
                      },
                    ],
                    "text": "{ $gridTemplateColumns: string; $gridTemplateRows: string; }",
                  },
                ],
              },
            },
            "position": {
              "end": {
                "column": 31,
                "line": 562,
              },
              "start": {
                "column": 9,
                "line": 562,
              },
            },
            "returnType": {
              "filePath": "node_modules/@types/react/index.d.ts",
              "kind": "TypeReference",
              "moduleSpecifier": undefined,
              "name": "ReactNode",
              "position": {
                "end": {
                  "column": 30,
                  "line": 562,
                },
                "start": {
                  "column": 21,
                  "line": 562,
                },
              },
              "text": "ReactNode",
              "typeArguments": [],
            },
            "text": "(props: P) => ReactNode",
            "thisType": undefined,
          },
        ],
        "text": "IStyledComponentBase<"web", Substitute<React.DetailedHTMLProps<React.HTMLAttributes<HTMLDivElement>, HTMLDivElement>, { $gridTemplateColumns: string; $gridTemplateRows: string; }>> & string",
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
              "text": "variant: 'heading1' | 'heading2' | 'heading3' | 'body1' | 'body2'",
              "type": {
                "kind": "UnionType",
                "text": ""heading1" | "heading2" | "heading3" | "body1" | "body2"",
                "types": [
                  {
                    "filePath": "test.ts",
                    "kind": "String",
                    "position": {
                      "end": {
                        "column": 22,
                        "line": 2,
                      },
                      "start": {
                        "column": 12,
                        "line": 2,
                      },
                    },
                    "text": ""heading1"",
                    "value": "heading1",
                  },
                  {
                    "filePath": "test.ts",
                    "kind": "String",
                    "position": {
                      "end": {
                        "column": 35,
                        "line": 2,
                      },
                      "start": {
                        "column": 25,
                        "line": 2,
                      },
                    },
                    "text": ""heading2"",
                    "value": "heading2",
                  },
                  {
                    "filePath": "test.ts",
                    "kind": "String",
                    "position": {
                      "end": {
                        "column": 48,
                        "line": 2,
                      },
                      "start": {
                        "column": 38,
                        "line": 2,
                      },
                    },
                    "text": ""heading3"",
                    "value": "heading3",
                  },
                  {
                    "filePath": "test.ts",
                    "kind": "String",
                    "position": {
                      "end": {
                        "column": 58,
                        "line": 2,
                      },
                      "start": {
                        "column": 51,
                        "line": 2,
                      },
                    },
                    "text": ""body1"",
                    "value": "body1",
                  },
                  {
                    "filePath": "test.ts",
                    "kind": "String",
                    "position": {
                      "end": {
                        "column": 68,
                        "line": 2,
                      },
                      "start": {
                        "column": 61,
                        "line": 2,
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
              "text": "width?: string | number",
              "type": {
                "kind": "UnionType",
                "text": "string | number",
                "types": [
                  {
                    "filePath": "test.ts",
                    "kind": "String",
                    "position": {
                      "end": {
                        "column": 17,
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
                    "filePath": "test.ts",
                    "kind": "Number",
                    "position": {
                      "end": {
                        "column": 26,
                        "line": 3,
                      },
                      "start": {
                        "column": 20,
                        "line": 3,
                      },
                    },
                    "text": "number",
                    "value": undefined,
                  },
                ],
              },
            },
          ],
          "text": "Props",
        },
        "typeParameters": [],
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
            "text": "variant: 'heading1' | 'heading2' | 'heading3' | 'body1' | 'body2'",
            "type": {
              "kind": "UnionType",
              "text": ""heading1" | "heading2" | "heading3" | "body1" | "body2"",
              "types": [
                {
                  "filePath": "test.ts",
                  "kind": "String",
                  "position": {
                    "end": {
                      "column": 22,
                      "line": 5,
                    },
                    "start": {
                      "column": 12,
                      "line": 5,
                    },
                  },
                  "text": ""heading1"",
                  "value": "heading1",
                },
                {
                  "filePath": "test.ts",
                  "kind": "String",
                  "position": {
                    "end": {
                      "column": 35,
                      "line": 5,
                    },
                    "start": {
                      "column": 25,
                      "line": 5,
                    },
                  },
                  "text": ""heading2"",
                  "value": "heading2",
                },
                {
                  "filePath": "test.ts",
                  "kind": "String",
                  "position": {
                    "end": {
                      "column": 48,
                      "line": 5,
                    },
                    "start": {
                      "column": 38,
                      "line": 5,
                    },
                  },
                  "text": ""heading3"",
                  "value": "heading3",
                },
                {
                  "filePath": "test.ts",
                  "kind": "String",
                  "position": {
                    "end": {
                      "column": 58,
                      "line": 5,
                    },
                    "start": {
                      "column": 51,
                      "line": 5,
                    },
                  },
                  "text": ""body1"",
                  "value": "body1",
                },
                {
                  "filePath": "test.ts",
                  "kind": "String",
                  "position": {
                    "end": {
                      "column": 68,
                      "line": 5,
                    },
                    "start": {
                      "column": 61,
                      "line": 5,
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
            "text": "width?: string | number",
            "type": {
              "kind": "UnionType",
              "text": "string | number",
              "types": [
                {
                  "filePath": "test.ts",
                  "kind": "String",
                  "position": {
                    "end": {
                      "column": 17,
                      "line": 6,
                    },
                    "start": {
                      "column": 11,
                      "line": 6,
                    },
                  },
                  "text": "string",
                  "value": undefined,
                },
                {
                  "filePath": "test.ts",
                  "kind": "Number",
                  "position": {
                    "end": {
                      "column": 26,
                      "line": 6,
                    },
                    "start": {
                      "column": 20,
                      "line": 6,
                    },
                  },
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
        "typeParameters": [],
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
              "isRest": false,
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
              "text": "value: number",
              "type": {
                "filePath": "test.ts",
                "kind": "Number",
                "position": {
                  "end": {
                    "column": 34,
                    "line": 26,
                  },
                  "start": {
                    "column": 28,
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
                  "column": 30,
                  "line": 31,
                },
                "start": {
                  "column": 24,
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
              "kind": "CallSignature",
              "parameters": [
                {
                  "description": undefined,
                  "filePath": "test.ts",
                  "initializer": 0,
                  "isOptional": false,
                  "isRest": false,
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
                  "text": "initialCount: number = 0",
                  "type": {
                    "filePath": "test.ts",
                    "kind": "Number",
                    "position": {
                      "end": {
                        "column": 35,
                        "line": 9,
                      },
                      "start": {
                        "column": 29,
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
                    "column": 4,
                    "line": 13,
                  },
                  "start": {
                    "column": 3,
                    "line": 9,
                  },
                },
                "text": "Counter",
                "typeArguments": [],
              },
              "tags": undefined,
              "text": "(initialCount: number = 0) => Counter",
              "thisType": undefined,
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
                "kind": "CallSignature",
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
                  "filePath": "test.ts",
                  "kind": "Void",
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
                  "text": "void",
                },
                "tags": undefined,
                "text": "() => void",
                "thisType": undefined,
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
                "kind": "CallSignature",
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
                  "filePath": "test.ts",
                  "kind": "Void",
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
                  "text": "void",
                },
                "tags": undefined,
                "text": "() => void",
                "thisType": undefined,
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
                "kind": "CallSignature",
                "parameters": [
                  {
                    "description": undefined,
                    "filePath": "test.ts",
                    "initializer": true,
                    "isOptional": true,
                    "isRest": false,
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
                    "text": "isFloored?: boolean = true",
                    "type": {
                      "filePath": "test.ts",
                      "kind": "Boolean",
                      "position": {
                        "end": {
                          "column": 38,
                          "line": 36,
                        },
                        "start": {
                          "column": 31,
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
                      "column": 54,
                      "line": 36,
                    },
                    "start": {
                      "column": 48,
                      "line": 36,
                    },
                  },
                  "text": "number",
                  "value": undefined,
                },
                "tags": undefined,
                "text": "(isFloored?: boolean = true) => number",
                "thisType": undefined,
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
                "kind": "CallSignature",
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
                      "column": 34,
                      "line": 40,
                    },
                    "start": {
                      "column": 28,
                      "line": 40,
                    },
                  },
                  "text": "number",
                  "value": undefined,
                },
                "text": "() => number",
                "thisType": undefined,
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
            "initializer": 0,
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
            "initializer": 0,
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
            "kind": "CallSignature",
            "parameters": [
              {
                "description": undefined,
                "filePath": "test.ts",
                "initializer": {
                  "initialCount": 0,
                },
                "isOptional": false,
                "isRest": false,
                "kind": "Parameter",
                "name": "{ initialCount: renamedInitialCount = 0 }",
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
                "text": "{ initialCount: renamedInitialCount = 0 }: { initialCount: number } = {}",
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
                      "text": "initialCount: number",
                      "type": {
                        "filePath": "test.ts",
                        "kind": "Number",
                        "position": {
                          "end": {
                            "column": 86,
                            "line": 1,
                          },
                          "start": {
                            "column": 80,
                            "line": 1,
                          },
                        },
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
              "filePath": "test.ts",
              "kind": "Void",
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
            "text": "function useCounter({ initialCount: renamedInitialCount = 0 }: { initialCount: number } = {}): void",
            "thisType": undefined,
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
            "kind": "CallSignature",
            "parameters": [
              {
                "description": undefined,
                "filePath": "test.ts",
                "initializer": undefined,
                "isOptional": false,
                "isRest": false,
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
                "text": "a: number",
                "type": {
                  "filePath": "test.ts",
                  "kind": "Number",
                  "position": {
                    "end": {
                      "column": 23,
                      "line": 1,
                    },
                    "start": {
                      "column": 17,
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
                "initializer": 0,
                "isOptional": false,
                "isRest": false,
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
                "text": "b: number = 0",
                "type": {
                  "filePath": "test.ts",
                  "kind": "Number",
                  "position": {
                    "end": {
                      "column": 34,
                      "line": 1,
                    },
                    "start": {
                      "column": 28,
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
              "filePath": "test.ts",
              "kind": "Number",
              "position": {
                "end": {
                  "column": 47,
                  "line": 1,
                },
                "start": {
                  "column": 41,
                  "line": 1,
                },
              },
              "text": "number",
              "value": undefined,
            },
            "text": "function add(a: number, b: number = 0): number",
            "thisType": undefined,
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
          "kind": "IntersectionType",
          "text": "ButtonVariants",
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
                  "text": "color:string",
                  "type": {
                    "filePath": "test.ts",
                    "kind": "String",
                    "position": {
                      "end": {
                        "column": 37,
                        "line": 1,
                      },
                      "start": {
                        "column": 31,
                        "line": 1,
                      },
                    },
                    "text": "string",
                    "value": undefined,
                  },
                },
              ],
              "text": "{ color: string; }",
            },
            {
              "kind": "UnionType",
              "text": "{ backgroundColor: string; } | { borderColor: string; }",
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
                          "column": 68,
                          "line": 1,
                        },
                        "start": {
                          "column": 45,
                          "line": 1,
                        },
                      },
                      "text": "backgroundColor: string",
                      "type": {
                        "filePath": "test.ts",
                        "kind": "String",
                        "position": {
                          "end": {
                            "column": 68,
                            "line": 1,
                          },
                          "start": {
                            "column": 62,
                            "line": 1,
                          },
                        },
                        "text": "string",
                        "value": undefined,
                      },
                    },
                  ],
                  "text": "{ backgroundColor: string; }",
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
                      "text": "borderColor: string",
                      "type": {
                        "filePath": "test.ts",
                        "kind": "String",
                        "position": {
                          "end": {
                            "column": 94,
                            "line": 1,
                          },
                          "start": {
                            "column": 88,
                            "line": 1,
                          },
                        },
                        "text": "string",
                        "value": undefined,
                      },
                    },
                  ],
                  "text": "{ borderColor: string; }",
                },
              ],
            },
          ],
        },
        "typeParameters": [],
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
              "text": "siteName: string",
              "type": {
                "filePath": "test.ts",
                "kind": "String",
                "position": {
                  "end": {
                    "column": 19,
                    "line": 2,
                  },
                  "start": {
                    "column": 13,
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
              "text": "settings: {
          apiEndpoint: string;
          apiKey: string;
        } | {
          dbHost: string;
          dbPort: number;
          dbName: string;
        };",
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
                        "text": "apiEndpoint: string;",
                        "type": {
                          "filePath": "test.ts",
                          "kind": "String",
                          "position": {
                            "end": {
                              "column": 24,
                              "line": 4,
                            },
                            "start": {
                              "column": 18,
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
                        "text": "apiKey: string;",
                        "type": {
                          "filePath": "test.ts",
                          "kind": "String",
                          "position": {
                            "end": {
                              "column": 19,
                              "line": 5,
                            },
                            "start": {
                              "column": 13,
                              "line": 5,
                            },
                          },
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
                            "column": 20,
                            "line": 7,
                          },
                          "start": {
                            "column": 5,
                            "line": 7,
                          },
                        },
                        "text": "dbHost: string;",
                        "type": {
                          "filePath": "test.ts",
                          "kind": "String",
                          "position": {
                            "end": {
                              "column": 19,
                              "line": 7,
                            },
                            "start": {
                              "column": 13,
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
                        "text": "dbPort: number;",
                        "type": {
                          "filePath": "test.ts",
                          "kind": "Number",
                          "position": {
                            "end": {
                              "column": 19,
                              "line": 8,
                            },
                            "start": {
                              "column": 13,
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
                        "text": "dbName: string;",
                        "type": {
                          "filePath": "test.ts",
                          "kind": "String",
                          "position": {
                            "end": {
                              "column": 19,
                              "line": 9,
                            },
                            "start": {
                              "column": 13,
                              "line": 9,
                            },
                          },
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
          "text": "Config",
        },
        "typeParameters": [],
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
            "kind": "CallSignature",
            "parameters": [
              {
                "description": undefined,
                "filePath": "test.ts",
                "initializer": undefined,
                "isOptional": false,
                "isRest": false,
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
                "text": "settings: { apiEndpoint: string; apiKey: string; } | { dbHost: string; dbPort: number; dbName: string; }",
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
                          "text": "apiEndpoint: string;",
                          "type": {
                            "filePath": "test.ts",
                            "kind": "String",
                            "position": {
                              "end": {
                                "column": 34,
                                "line": 2,
                              },
                              "start": {
                                "column": 28,
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
                          "text": "apiKey: string;",
                          "type": {
                            "filePath": "test.ts",
                            "kind": "String",
                            "position": {
                              "end": {
                                "column": 50,
                                "line": 2,
                              },
                              "start": {
                                "column": 44,
                                "line": 2,
                              },
                            },
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
                          "text": "dbHost: string;",
                          "type": {
                            "filePath": "test.ts",
                            "kind": "String",
                            "position": {
                              "end": {
                                "column": 72,
                                "line": 2,
                              },
                              "start": {
                                "column": 66,
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
                          "text": "dbPort: number;",
                          "type": {
                            "filePath": "test.ts",
                            "kind": "Number",
                            "position": {
                              "end": {
                                "column": 88,
                                "line": 2,
                              },
                              "start": {
                                "column": 82,
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
                          "text": "dbName: string;",
                          "type": {
                            "filePath": "test.ts",
                            "kind": "String",
                            "position": {
                              "end": {
                                "column": 104,
                                "line": 2,
                              },
                              "start": {
                                "column": 98,
                                "line": 2,
                              },
                            },
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
              "filePath": "test.ts",
              "kind": "Void",
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
            "thisType": undefined,
          },
        ],
        "text": "(settings: { apiEndpoint: string; apiKey: string; } | { dbHost: string; dbPort: number; dbName: string; }) => void",
      }
    `)
  })

  test('includes specific node module types', () => {
    const sourceFile = project.createSourceFile(
      'test.tsx',
      dedent`
        import * as React from 'react';
  
        type ButtonProps = {
          isDisabled?: boolean;
        } & React.ButtonHTMLAttributes<HTMLButtonElement>
        `,
      { overwrite: true }
    )
    const declaration = sourceFile.getTypeAliasOrThrow('ButtonProps')
    const types = resolveType(declaration.getType(), declaration, [
      {
        moduleSpecifier: 'react',
        types: [{ name: 'ButtonHTMLAttributes', properties: ['onClick'] }],
      },
    ])

    expect(types).toMatchInlineSnapshot(`
      {
        "filePath": "test.tsx",
        "kind": "TypeAlias",
        "name": "ButtonProps",
        "position": {
          "end": {
            "column": 50,
            "line": 5,
          },
          "start": {
            "column": 1,
            "line": 3,
          },
        },
        "text": "ButtonProps",
        "type": {
          "kind": "TypeLiteral",
          "members": [
            {
              "filePath": "test.tsx",
              "isOptional": true,
              "isReadonly": false,
              "kind": "PropertySignature",
              "name": "isDisabled",
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
              "text": "isDisabled?: boolean;",
              "type": {
                "filePath": "test.tsx",
                "kind": "Boolean",
                "position": {
                  "end": {
                    "column": 23,
                    "line": 4,
                  },
                  "start": {
                    "column": 16,
                    "line": 4,
                  },
                },
                "text": "boolean",
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
                  "line": 2281,
                },
                "start": {
                  "column": 9,
                  "line": 2281,
                },
              },
              "text": "MouseEventHandler<HTMLButtonElement>",
              "type": {
                "isAsync": false,
                "kind": "FunctionType",
                "parameters": [
                  {
                    "description": undefined,
                    "filePath": "node_modules/@types/react/index.d.ts",
                    "initializer": undefined,
                    "isOptional": false,
                    "isRest": false,
                    "kind": "Parameter",
                    "name": "event",
                    "position": {
                      "end": {
                        "column": 81,
                        "line": 2136,
                      },
                      "start": {
                        "column": 73,
                        "line": 2136,
                      },
                    },
                    "text": "event: E",
                    "type": {
                      "filePath": "node_modules/@types/react/index.d.ts",
                      "kind": "TypeReference",
                      "name": "MouseEvent",
                      "position": {
                        "end": {
                          "column": 52,
                          "line": 2281,
                        },
                        "start": {
                          "column": 9,
                          "line": 2281,
                        },
                      },
                      "text": "MouseEvent<HTMLButtonElement, MouseEvent>",
                      "typeArguments": [
                        {
                          "filePath": "node_modules/@types/react/index.d.ts",
                          "kind": "TypeReference",
                          "name": "HTMLButtonElement",
                          "position": {
                            "end": {
                              "column": 52,
                              "line": 2281,
                            },
                            "start": {
                              "column": 9,
                              "line": 2281,
                            },
                          },
                          "text": "HTMLButtonElement",
                          "typeArguments": [],
                        },
                        {
                          "filePath": "node_modules/@types/react/index.d.ts",
                          "kind": "TypeReference",
                          "name": "MouseEvent",
                          "position": {
                            "end": {
                              "column": 52,
                              "line": 2281,
                            },
                            "start": {
                              "column": 9,
                              "line": 2281,
                            },
                          },
                          "text": "MouseEvent",
                          "typeArguments": [],
                        },
                      ],
                    },
                  },
                ],
                "returnType": {
                  "filePath": "node_modules/@types/react/index.d.ts",
                  "kind": "Void",
                  "position": {
                    "end": {
                      "column": 88,
                      "line": 2136,
                    },
                    "start": {
                      "column": 84,
                      "line": 2136,
                    },
                  },
                  "text": "void",
                },
                "text": "MouseEventHandler<HTMLButtonElement>",
                "thisType": undefined,
              },
            },
          ],
          "text": "ButtonProps",
        },
        "typeParameters": [],
      }
    `)
  })

  test('includes node module types from function parameter types', () => {
    const sourceFile = project.createSourceFile(
      'test.tsx',
      dedent`
        import * as React from 'react';
  
        type ButtonProps = {
          isDisabled?: boolean;
        } & React.ButtonHTMLAttributes<HTMLButtonElement>
  
        export const Button = (props: ButtonProps) => {
          return <button {...props} />
        };
        `,
      { overwrite: true }
    )
    const declaration = sourceFile.getVariableDeclarationOrThrow('Button')
    const types = resolveType(declaration.getType(), declaration, [
      {
        moduleSpecifier: 'react',
        types: [{ name: 'ButtonHTMLAttributes', properties: ['onClick'] }],
      },
    ])

    expect(types).toMatchInlineSnapshot(`
      {
        "filePath": "test.tsx",
        "kind": "Component",
        "name": "Button",
        "position": {
          "end": {
            "column": 2,
            "line": 9,
          },
          "start": {
            "column": 23,
            "line": 7,
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
              "isRest": false,
              "kind": "Parameter",
              "name": "props",
              "position": {
                "end": {
                  "column": 42,
                  "line": 7,
                },
                "start": {
                  "column": 24,
                  "line": 7,
                },
              },
              "text": "props: ButtonProps",
              "type": {
                "kind": "IntersectionType",
                "text": "{ isDisabled?: boolean; } & ButtonHTMLAttributes<HTMLButtonElement>",
                "types": [
                  {
                    "kind": "TypeLiteral",
                    "members": [
                      {
                        "filePath": "test.tsx",
                        "isOptional": true,
                        "isReadonly": false,
                        "kind": "PropertySignature",
                        "name": "isDisabled",
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
                        "text": "isDisabled?: boolean;",
                        "type": {
                          "filePath": "test.tsx",
                          "kind": "Boolean",
                          "position": {
                            "end": {
                              "column": 23,
                              "line": 4,
                            },
                            "start": {
                              "column": 16,
                              "line": 4,
                            },
                          },
                          "text": "boolean",
                        },
                      },
                    ],
                    "text": "{ isDisabled?: boolean; }",
                  },
                  {
                    "filePath": "node_modules/@types/react/index.d.ts",
                    "kind": "TypeReference",
                    "name": "ButtonHTMLAttributes",
                    "position": {
                      "end": {
                        "column": 6,
                        "line": 2975,
                      },
                      "start": {
                        "column": 5,
                        "line": 2958,
                      },
                    },
                    "text": "ButtonHTMLAttributes<HTMLButtonElement>",
                    "typeArguments": [
                      {
                        "filePath": "node_modules/@types/react/index.d.ts",
                        "kind": "TypeReference",
                        "name": "HTMLButtonElement",
                        "position": {
                          "end": {
                            "column": 6,
                            "line": 2975,
                          },
                          "start": {
                            "column": 5,
                            "line": 2958,
                          },
                        },
                        "text": "HTMLButtonElement",
                        "typeArguments": [],
                      },
                      {
                        "kind": "TypeLiteral",
                        "members": [
                          {
                            "filePath": "test.tsx",
                            "isOptional": true,
                            "isReadonly": false,
                            "kind": "PropertySignature",
                            "name": "isDisabled",
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
                            "text": "isDisabled?: boolean;",
                            "type": {
                              "filePath": "test.tsx",
                              "kind": "Boolean",
                              "position": {
                                "end": {
                                  "column": 23,
                                  "line": 4,
                                },
                                "start": {
                                  "column": 16,
                                  "line": 4,
                                },
                              },
                              "text": "boolean",
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
                                "line": 2281,
                              },
                              "start": {
                                "column": 9,
                                "line": 2281,
                              },
                            },
                            "text": "MouseEventHandler<HTMLButtonElement>",
                            "type": {
                              "isAsync": false,
                              "kind": "FunctionType",
                              "parameters": [
                                {
                                  "description": undefined,
                                  "filePath": "node_modules/@types/react/index.d.ts",
                                  "initializer": undefined,
                                  "isOptional": false,
                                  "isRest": false,
                                  "kind": "Parameter",
                                  "name": "event",
                                  "position": {
                                    "end": {
                                      "column": 81,
                                      "line": 2136,
                                    },
                                    "start": {
                                      "column": 73,
                                      "line": 2136,
                                    },
                                  },
                                  "text": "event: E",
                                  "type": {
                                    "filePath": "node_modules/@types/react/index.d.ts",
                                    "kind": "TypeReference",
                                    "name": "MouseEvent",
                                    "position": {
                                      "end": {
                                        "column": 52,
                                        "line": 2281,
                                      },
                                      "start": {
                                        "column": 9,
                                        "line": 2281,
                                      },
                                    },
                                    "text": "MouseEvent<HTMLButtonElement, MouseEvent>",
                                    "typeArguments": [
                                      {
                                        "filePath": "node_modules/@types/react/index.d.ts",
                                        "kind": "TypeReference",
                                        "name": "HTMLButtonElement",
                                        "position": {
                                          "end": {
                                            "column": 52,
                                            "line": 2281,
                                          },
                                          "start": {
                                            "column": 9,
                                            "line": 2281,
                                          },
                                        },
                                        "text": "HTMLButtonElement",
                                        "typeArguments": [],
                                      },
                                      {
                                        "filePath": "node_modules/@types/react/index.d.ts",
                                        "kind": "TypeReference",
                                        "name": "MouseEvent",
                                        "position": {
                                          "end": {
                                            "column": 52,
                                            "line": 2281,
                                          },
                                          "start": {
                                            "column": 9,
                                            "line": 2281,
                                          },
                                        },
                                        "text": "MouseEvent",
                                        "typeArguments": [],
                                      },
                                    ],
                                  },
                                },
                              ],
                              "returnType": {
                                "filePath": "node_modules/@types/react/index.d.ts",
                                "kind": "Void",
                                "position": {
                                  "end": {
                                    "column": 88,
                                    "line": 2136,
                                  },
                                  "start": {
                                    "column": 84,
                                    "line": 2136,
                                  },
                                },
                                "text": "void",
                              },
                              "text": "MouseEventHandler<HTMLButtonElement>",
                              "thisType": undefined,
                            },
                          },
                        ],
                        "text": "ButtonProps",
                      },
                    ],
                  },
                ],
              },
            },
            "position": {
              "end": {
                "column": 2,
                "line": 9,
              },
              "start": {
                "column": 23,
                "line": 7,
              },
            },
            "returnType": {
              "filePath": "test.tsx",
              "kind": "TypeReference",
              "name": "Element",
              "position": {
                "end": {
                  "column": 2,
                  "line": 9,
                },
                "start": {
                  "column": 23,
                  "line": 7,
                },
              },
              "text": "Element",
              "typeArguments": [],
            },
            "text": "(props: ButtonProps) => Element",
            "thisType": undefined,
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
              "isRest": false,
              "kind": "Parameter",
              "name": "{ children }",
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
              "text": "{ children }: ExportedTypesProps",
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
                        "text": "source: string",
                        "type": {
                          "filePath": "test.ts",
                          "kind": "String",
                          "position": {
                            "end": {
                              "column": 22,
                              "line": 23,
                            },
                            "start": {
                              "column": 16,
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
                        "text": "children?: (
          exportedTypes: ReturnType<typeof getExportedTypes>
        ) => React.ReactNode",
                        "type": {
                          "filePath": "test.ts",
                          "isAsync": false,
                          "kind": "FunctionType",
                          "parameters": [
                            {
                              "description": undefined,
                              "filePath": "test.ts",
                              "initializer": undefined,
                              "isOptional": false,
                              "isRest": false,
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
                              "text": "exportedTypes: ReturnType<typeof getExportedTypes>",
                              "type": {
                                "filePath": "test.ts",
                                "kind": "TypeReference",
                                "name": "Array",
                                "position": {
                                  "end": {
                                    "column": 55,
                                    "line": 18,
                                  },
                                  "start": {
                                    "column": 20,
                                    "line": 18,
                                  },
                                },
                                "text": "Array<{ name: string; description: string; }>",
                                "typeArguments": [
                                  {
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
                                    "text": "{ name: string; description: string; }",
                                  },
                                ],
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
                            "filePath": "test.ts",
                            "kind": "TypeReference",
                            "moduleSpecifier": "react",
                            "name": "React.ReactNode",
                            "position": {
                              "end": {
                                "column": 23,
                                "line": 19,
                              },
                              "start": {
                                "column": 8,
                                "line": 19,
                              },
                            },
                            "text": "ReactNode",
                            "typeArguments": [],
                          },
                          "text": "(exportedTypes: Array<{ name: string; description: string; }>) => ReactNode",
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
                        "text": "filename: string;",
                        "type": {
                          "filePath": "test.ts",
                          "kind": "String",
                          "position": {
                            "end": {
                              "column": 24,
                              "line": 24,
                            },
                            "start": {
                              "column": 18,
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
                        "text": "value: string",
                        "type": {
                          "filePath": "test.ts",
                          "kind": "String",
                          "position": {
                            "end": {
                              "column": 39,
                              "line": 24,
                            },
                            "start": {
                              "column": 33,
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
                        "text": "children?: (
          exportedTypes: ReturnType<typeof getExportedTypes>
        ) => React.ReactNode",
                        "type": {
                          "filePath": "test.ts",
                          "isAsync": false,
                          "kind": "FunctionType",
                          "parameters": [
                            {
                              "description": undefined,
                              "filePath": "test.ts",
                              "initializer": undefined,
                              "isOptional": false,
                              "isRest": false,
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
                              "text": "exportedTypes: ReturnType<typeof getExportedTypes>",
                              "type": {
                                "filePath": "test.ts",
                                "kind": "TypeReference",
                                "name": "Array",
                                "position": {
                                  "end": {
                                    "column": 55,
                                    "line": 18,
                                  },
                                  "start": {
                                    "column": 20,
                                    "line": 18,
                                  },
                                },
                                "text": "Array<{ name: string; description: string; }>",
                                "typeArguments": [
                                  {
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
                                    "text": "{ name: string; description: string; }",
                                  },
                                ],
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
                            "filePath": "test.ts",
                            "kind": "TypeReference",
                            "moduleSpecifier": "react",
                            "name": "React.ReactNode",
                            "position": {
                              "end": {
                                "column": 23,
                                "line": 19,
                              },
                              "start": {
                                "column": 8,
                                "line": 19,
                              },
                            },
                            "text": "ReactNode",
                            "typeArguments": [],
                          },
                          "text": "(exportedTypes: Array<{ name: string; description: string; }>) => ReactNode",
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
              "filePath": "test.ts",
              "kind": "Void",
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
            "text": "function ExportedTypes({ children }: ExportedTypesProps): void",
            "thisType": undefined,
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
              "filePath": "test.ts",
              "kind": "TypeReference",
              "moduleSpecifier": "library",
              "name": "InterfaceMetadata",
              "position": {
                "end": {
                  "column": 37,
                  "line": 8,
                },
                "start": {
                  "column": 20,
                  "line": 8,
                },
              },
              "text": "InterfaceMetadata",
              "typeArguments": [],
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
                  "text": "kind: 'TypeAlias'",
                  "type": {
                    "filePath": "test.ts",
                    "kind": "String",
                    "position": {
                      "end": {
                        "column": 20,
                        "line": 4,
                      },
                      "start": {
                        "column": 9,
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
                  "text": "name: string",
                  "type": {
                    "filePath": "test.ts",
                    "kind": "String",
                    "position": {
                      "end": {
                        "column": 15,
                        "line": 5,
                      },
                      "start": {
                        "column": 9,
                        "line": 5,
                      },
                    },
                    "text": "string",
                    "value": undefined,
                  },
                },
              ],
              "text": "TypeAliasMetadata",
            },
          ],
        },
        "typeParameters": [],
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
        "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
        "kind": "Variable",
        "name": "initialCount",
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
        "tags": [
          {
            "name": "internal",
            "text": "only for internal use",
          },
        ],
        "text": "0",
        "type": {
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
          "text": "0",
          "value": 0,
        },
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
        "kind": "Variable",
        "name": "colors",
        "position": {
          "end": {
            "column": 2,
            "line": 5,
          },
          "start": {
            "column": 23,
            "line": 1,
          },
        },
        "text": "{ readonly primary: "#ff0000"; readonly secondary: "#00ff00"; readonly tertiary: "#0000ff"; }",
        "type": {
          "kind": "TypeLiteral",
          "members": [
            {
              "filePath": "test.ts",
              "isOptional": false,
              "isReadonly": false,
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
              "isReadonly": false,
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
              "isReadonly": false,
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
          "text": "{ readonly primary: "#ff0000"; readonly secondary: "#00ff00"; readonly tertiary: "#0000ff"; }",
        },
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
          "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
          "kind": "Variable",
          "name": "awaited",
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
          "type": {
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
        },
        "counterTypes": {
          "filePath": "test.ts",
          "kind": "Variable",
          "name": "counter",
          "position": {
            "end": {
              "column": 2,
              "line": 6,
            },
            "start": {
              "column": 1,
              "line": 1,
            },
          },
          "text": "Counter",
          "type": {
            "filePath": "test.ts",
            "kind": "TypeReference",
            "name": "Counter",
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
            "typeArguments": [],
          },
        },
        "promiseTypes": {
          "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
          "kind": "Variable",
          "name": "promise",
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
          "text": "Promise<number>",
          "type": {
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
            "typeArguments": [
              {
                "filePath": "test.ts",
                "kind": "Number",
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
                "text": "number",
                "value": undefined,
              },
            ],
          },
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
          "kind": "IntersectionType",
          "text": "Foo",
          "types": [
            {
              "filePath": "test.ts",
              "kind": "TypeReference",
              "moduleSpecifier": undefined,
              "name": "AllTypes",
              "position": {
                "end": {
                  "column": 20,
                  "line": 11,
                },
                "start": {
                  "column": 12,
                  "line": 11,
                },
              },
              "text": "AllTypes",
              "typeArguments": [],
            },
            {
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
                  "text": "value: string | boolean,",
                  "type": {
                    "kind": "UnionType",
                    "text": "string | boolean",
                    "types": [
                      {
                        "filePath": "test.ts",
                        "kind": "String",
                        "position": {
                          "end": {
                            "column": 38,
                            "line": 11,
                          },
                          "start": {
                            "column": 32,
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
                            "column": 48,
                            "line": 11,
                          },
                          "start": {
                            "column": 41,
                            "line": 11,
                          },
                        },
                        "text": "boolean",
                      },
                    ],
                  },
                },
                {
                  "filePath": "test.ts",
                  "kind": "MethodSignature",
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
                      "kind": "CallSignature",
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
                        "kind": "UnionType",
                        "text": "string | boolean",
                        "types": [
                          {
                            "filePath": "test.ts",
                            "kind": "String",
                            "position": {
                              "end": {
                                "column": 68,
                                "line": 11,
                              },
                              "start": {
                                "column": 62,
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
                                "column": 71,
                                "line": 11,
                              },
                            },
                            "text": "boolean",
                          },
                        ],
                      },
                      "text": "() => string | boolean",
                      "thisType": undefined,
                    },
                  ],
                  "text": "getValue(): string | boolean",
                },
              ],
              "text": "{ value: string | boolean; getValue(): string | boolean; }",
            },
          ],
        },
        "typeParameters": [],
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
            "kind": "CallSignature",
            "parameters": [
              {
                "description": undefined,
                "filePath": "test.ts",
                "initializer": undefined,
                "isOptional": false,
                "isRest": true,
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
                "text": "...args: Args",
                "type": {
                  "filePath": "test.ts",
                  "kind": "TypeReference",
                  "moduleSpecifier": undefined,
                  "name": "Args",
                  "position": {
                    "end": {
                      "column": 67,
                      "line": 1,
                    },
                    "start": {
                      "column": 63,
                      "line": 1,
                    },
                  },
                  "text": "Args",
                  "typeArguments": [],
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
              "kind": "Void",
              "position": {
                "end": {
                  "column": 74,
                  "line": 1,
                },
                "start": {
                  "column": 70,
                  "line": 1,
                },
              },
              "text": "void",
            },
            "text": "function loggedMethod<Args extends Array<string>>(...args: Args): void",
            "thisType": undefined,
            "typeParameters": [
              {
                "constraintType": {
                  "filePath": "test.ts",
                  "kind": "TypeReference",
                  "name": "Array",
                  "position": {
                    "end": {
                      "column": 52,
                      "line": 1,
                    },
                    "start": {
                      "column": 44,
                      "line": 1,
                    },
                  },
                  "text": "Array<string>",
                  "typeArguments": [
                    {
                      "filePath": "test.ts",
                      "kind": "String",
                      "position": {
                        "end": {
                          "column": 50,
                          "line": 1,
                        },
                        "start": {
                          "column": 44,
                          "line": 1,
                        },
                      },
                      "text": "string",
                      "value": undefined,
                    },
                  ],
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
                "kind": "CallSignature",
                "parameters": [
                  {
                    "description": undefined,
                    "filePath": "test.ts",
                    "initializer": undefined,
                    "isOptional": false,
                    "isRest": false,
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
                    "text": "name: string",
                    "type": {
                      "filePath": "test.ts",
                      "kind": "String",
                      "position": {
                        "end": {
                          "column": 21,
                          "line": 15,
                        },
                        "start": {
                          "column": 15,
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
                "thisType": undefined,
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
            "kind": "CallSignature",
            "parameters": [
              {
                "description": undefined,
                "filePath": "test.ts",
                "initializer": undefined,
                "isOptional": false,
                "isRest": false,
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
                "text": "loader: Loader<Types>",
                "type": {
                  "filePath": "test.ts",
                  "kind": "TypeReference",
                  "moduleSpecifier": undefined,
                  "name": "Loader",
                  "position": {
                    "end": {
                      "column": 49,
                      "line": 8,
                    },
                    "start": {
                      "column": 36,
                      "line": 8,
                    },
                  },
                  "text": "Loader<Types>",
                  "typeArguments": [
                    {
                      "filePath": "test.ts",
                      "kind": "TypeReference",
                      "moduleSpecifier": undefined,
                      "name": "Types",
                      "position": {
                        "end": {
                          "column": 48,
                          "line": 8,
                        },
                        "start": {
                          "column": 43,
                          "line": 8,
                        },
                      },
                      "text": "Types",
                      "typeArguments": [],
                    },
                  ],
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
              "kind": "TypeReference",
              "moduleSpecifier": undefined,
              "name": "Loader",
              "position": {
                "end": {
                  "column": 65,
                  "line": 8,
                },
                "start": {
                  "column": 52,
                  "line": 8,
                },
              },
              "text": "Loader<Types>",
              "typeArguments": [
                {
                  "filePath": "test.ts",
                  "kind": "TypeReference",
                  "moduleSpecifier": undefined,
                  "name": "Types",
                  "position": {
                    "end": {
                      "column": 64,
                      "line": 8,
                    },
                    "start": {
                      "column": 59,
                      "line": 8,
                    },
                  },
                  "text": "Types",
                  "typeArguments": [],
                },
              ],
            },
            "tags": undefined,
            "text": "function withSchema<Types>(loader: Loader<Types>): Loader<Types>",
            "thisType": undefined,
            "typeParameters": [
              {
                "constraintType": undefined,
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
            "kind": "CallSignature",
            "parameters": [
              {
                "description": undefined,
                "filePath": "test.ts",
                "initializer": undefined,
                "isOptional": false,
                "isRest": false,
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
                "text": "schema: Schema<Types>",
                "type": {
                  "filePath": "test.ts",
                  "kind": "TypeReference",
                  "moduleSpecifier": undefined,
                  "name": "Schema",
                  "position": {
                    "end": {
                      "column": 24,
                      "line": 12,
                    },
                    "start": {
                      "column": 11,
                      "line": 12,
                    },
                  },
                  "text": "Schema<Types>",
                  "typeArguments": [
                    {
                      "filePath": "test.ts",
                      "kind": "TypeReference",
                      "moduleSpecifier": undefined,
                      "name": "Types",
                      "position": {
                        "end": {
                          "column": 23,
                          "line": 12,
                        },
                        "start": {
                          "column": 18,
                          "line": 12,
                        },
                      },
                      "text": "Types",
                      "typeArguments": [],
                    },
                  ],
                },
              },
              {
                "description": undefined,
                "filePath": "test.ts",
                "initializer": undefined,
                "isOptional": false,
                "isRest": false,
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
                "text": "loader: Loader<{ [Key in keyof Types]: Types[Key] }>",
                "type": {
                  "isAsync": true,
                  "kind": "FunctionType",
                  "parameters": [
                    {
                      "description": undefined,
                      "filePath": "test.ts",
                      "initializer": undefined,
                      "isOptional": false,
                      "isRest": false,
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
                      "text": "path: string",
                      "type": {
                        "filePath": "test.ts",
                        "kind": "String",
                        "position": {
                          "end": {
                            "column": 35,
                            "line": 1,
                          },
                          "start": {
                            "column": 29,
                            "line": 1,
                          },
                        },
                        "text": "string",
                        "value": undefined,
                      },
                    },
                  ],
                  "returnType": {
                    "filePath": "test.ts",
                    "kind": "TypeReference",
                    "moduleSpecifier": undefined,
                    "name": "Promise",
                    "position": {
                      "end": {
                        "column": 54,
                        "line": 1,
                      },
                      "start": {
                        "column": 40,
                        "line": 1,
                      },
                    },
                    "text": "Promise<Types>",
                    "typeArguments": [
                      {
                        "filePath": "test.ts",
                        "kind": "TypeReference",
                        "moduleSpecifier": undefined,
                        "name": "Types",
                        "position": {
                          "end": {
                            "column": 53,
                            "line": 1,
                          },
                          "start": {
                            "column": 48,
                            "line": 1,
                          },
                        },
                        "text": "Types",
                        "typeArguments": [],
                      },
                    ],
                  },
                  "text": "Loader<{ [Key in keyof Types]: Types[Key]; }>",
                  "thisType": undefined,
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
                  "isRest": false,
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
                  "text": "path: string",
                  "type": {
                    "filePath": "test.ts",
                    "kind": "String",
                    "position": {
                      "end": {
                        "column": 35,
                        "line": 1,
                      },
                      "start": {
                        "column": 29,
                        "line": 1,
                      },
                    },
                    "text": "string",
                    "value": undefined,
                  },
                },
              ],
              "returnType": {
                "filePath": "test.ts",
                "kind": "TypeReference",
                "moduleSpecifier": undefined,
                "name": "Promise",
                "position": {
                  "end": {
                    "column": 54,
                    "line": 1,
                  },
                  "start": {
                    "column": 40,
                    "line": 1,
                  },
                },
                "text": "Promise<Types>",
                "typeArguments": [
                  {
                    "filePath": "test.ts",
                    "kind": "TypeReference",
                    "moduleSpecifier": undefined,
                    "name": "Types",
                    "position": {
                      "end": {
                        "column": 53,
                        "line": 1,
                      },
                      "start": {
                        "column": 48,
                        "line": 1,
                      },
                    },
                    "text": "Types",
                    "typeArguments": [],
                  },
                ],
              },
              "text": "Loader<{ [Key in keyof Types]: Types[Key]; }>",
              "thisType": undefined,
            },
            "tags": undefined,
            "text": "function withSchema<Types extends Record<string, any>>(schema: Schema<Types>, loader: Loader<{ [Key in keyof Types]: Types[Key] }>): Loader<{ [Key in keyof Types]: Types[Key]; }>",
            "thisType": undefined,
            "typeParameters": [
              {
                "constraintType": {
                  "filePath": "test.ts",
                  "kind": "TypeReference",
                  "moduleSpecifier": undefined,
                  "name": "Record",
                  "position": {
                    "end": {
                      "column": 54,
                      "line": 11,
                    },
                    "start": {
                      "column": 35,
                      "line": 11,
                    },
                  },
                  "text": "Record<string, any>",
                  "typeArguments": [
                    {
                      "filePath": "test.ts",
                      "kind": "String",
                      "position": {
                        "end": {
                          "column": 48,
                          "line": 11,
                        },
                        "start": {
                          "column": 42,
                          "line": 11,
                        },
                      },
                      "text": "string",
                      "value": undefined,
                    },
                    {
                      "filePath": "test.ts",
                      "kind": "Any",
                      "position": {
                        "end": {
                          "column": 53,
                          "line": 11,
                        },
                        "start": {
                          "column": 50,
                          "line": 11,
                        },
                      },
                      "text": "any",
                    },
                  ],
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
                      "className": "",
                      "variant": "primary",
                    },
                    "isOptional": false,
                    "isRest": false,
                    "kind": "Parameter",
                    "name": "{
        variant = 'primary',
        className = '',
        children,
        ...props
      }",
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
                    "text": "{
        variant = 'primary',
        className = '',
        children,
        ...props
      }: ButtonProps",
                    "type": {
                      "filePath": "test.ts",
                      "kind": "TypeReference",
                      "moduleSpecifier": undefined,
                      "name": "ButtonProps",
                      "position": {
                        "end": {
                          "column": 15,
                          "line": 18,
                        },
                        "start": {
                          "column": 4,
                          "line": 18,
                        },
                      },
                      "text": "ButtonProps",
                      "typeArguments": [],
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
                    "filePath": "test.ts",
                    "kind": "Boolean",
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
                    "text": "boolean",
                  },
                  "tags": undefined,
                  "text": "function Button({
        variant = 'primary',
        className = '',
        children,
        ...props
      }: ButtonProps): boolean",
                  "thisType": undefined,
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
                    "filePath": "test.ts",
                    "kind": "String",
                    "position": {
                      "end": {
                        "column": 38,
                        "line": 4,
                      },
                      "start": {
                        "column": 29,
                        "line": 4,
                      },
                    },
                    "text": ""primary"",
                    "value": "primary",
                  },
                  {
                    "filePath": "test.ts",
                    "kind": "String",
                    "position": {
                      "end": {
                        "column": 52,
                        "line": 4,
                      },
                      "start": {
                        "column": 41,
                        "line": 4,
                      },
                    },
                    "text": ""secondary"",
                    "value": "secondary",
                  },
                  {
                    "filePath": "test.ts",
                    "kind": "String",
                    "position": {
                      "end": {
                        "column": 63,
                        "line": 4,
                      },
                      "start": {
                        "column": 55,
                        "line": 4,
                      },
                    },
                    "text": ""danger"",
                    "value": "danger",
                  },
                ],
              },
              "typeParameters": [],
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
                  "text": "variant?: ButtonVariant",
                  "type": {
                    "filePath": "test.ts",
                    "kind": "TypeReference",
                    "moduleSpecifier": undefined,
                    "name": "ButtonVariant",
                    "position": {
                      "end": {
                        "column": 26,
                        "line": 9,
                      },
                      "start": {
                        "column": 13,
                        "line": 9,
                      },
                    },
                    "text": "ButtonVariant",
                    "typeArguments": [],
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
              "typeParameters": [],
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
      export type SemanticTags = 'h1' | 'h2' | 'p'

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
        "position": {
          "end": {
            "column": 2,
            "line": 11,
          },
          "start": {
            "column": 1,
            "line": 7,
          },
        },
        "text": "TypeReferenceComponents",
        "type": {
          "kind": "IntersectionType",
          "text": "TypeReferenceComponents",
          "types": [
            {
              "isOptional": false,
              "isReadonly": false,
              "kind": "MappedType",
              "text": "{ h1: "h1" | ComponentType<DetailedHTMLProps<HTMLAttributes<HTMLHeadingElement>, HTMLHeadingElement>>; h2: "h2" | ComponentType<DetailedHTMLProps<HTMLAttributes<HTMLHeadingElement>, HTMLHeadingElement>>; p: "p" | ComponentType<DetailedHTMLProps<HTMLAttributes<HTMLParagraphElement>, HTMLParagraphElement>>; }",
              "type": {
                "kind": "UnionType",
                "text": "Tag | ComponentType<ComponentProps<Tag>>",
                "types": [
                  {
                    "filePath": "test.ts",
                    "kind": "TypeReference",
                    "moduleSpecifier": undefined,
                    "name": "Tag",
                    "position": {
                      "end": {
                        "column": 29,
                        "line": 8,
                      },
                      "start": {
                        "column": 26,
                        "line": 8,
                      },
                    },
                    "text": "Tag",
                    "typeArguments": [],
                  },
                  {
                    "filePath": "test.ts",
                    "kind": "TypeReference",
                    "moduleSpecifier": undefined,
                    "name": "React.ComponentType",
                    "position": {
                      "end": {
                        "column": 78,
                        "line": 8,
                      },
                      "start": {
                        "column": 32,
                        "line": 8,
                      },
                    },
                    "text": "ComponentType<ComponentProps<Tag>>",
                    "typeArguments": [
                      {
                        "filePath": "test.ts",
                        "kind": "TypeReference",
                        "moduleSpecifier": undefined,
                        "name": "React.ComponentProps",
                        "position": {
                          "end": {
                            "column": 77,
                            "line": 8,
                          },
                          "start": {
                            "column": 52,
                            "line": 8,
                          },
                        },
                        "text": "ComponentProps<Tag>",
                        "typeArguments": [
                          {
                            "filePath": "test.ts",
                            "kind": "TypeReference",
                            "moduleSpecifier": undefined,
                            "name": "Tag",
                            "position": {
                              "end": {
                                "column": 76,
                                "line": 8,
                              },
                              "start": {
                                "column": 73,
                                "line": 8,
                              },
                            },
                            "text": "Tag",
                            "typeArguments": [],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
              "typeParameter": {
                "constraintType": {
                  "filePath": "test.ts",
                  "kind": "TypeReference",
                  "moduleSpecifier": undefined,
                  "name": "SemanticTags",
                  "position": {
                    "end": {
                      "column": 23,
                      "line": 8,
                    },
                    "start": {
                      "column": 11,
                      "line": 8,
                    },
                  },
                  "text": "SemanticTags",
                  "typeArguments": [],
                },
                "defaultType": undefined,
                "kind": "TypeParameter",
                "name": "Tag",
                "text": "Tag in SemanticTags",
              },
            },
            {
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
                      "line": 10,
                    },
                    "start": {
                      "column": 3,
                      "line": 10,
                    },
                  },
                  "text": "Markdown: React.ComponentType<MarkdownProps>",
                  "type": {
                    "kind": "UnionType",
                    "text": "ComponentClass<MarkdownProps, any> | FunctionComponent<MarkdownProps>",
                    "types": [
                      {
                        "filePath": "node_modules/@types/react/index.d.ts",
                        "kind": "TypeReference",
                        "name": "ComponentClass",
                        "position": {
                          "end": {
                            "column": 6,
                            "line": 1152,
                          },
                          "start": {
                            "column": 5,
                            "line": 1127,
                          },
                        },
                        "text": "ComponentClass<MarkdownProps, any>",
                        "typeArguments": [
                          {
                            "kind": "TypeLiteral",
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
                                    "line": 4,
                                  },
                                  "start": {
                                    "column": 3,
                                    "line": 4,
                                  },
                                },
                                "text": "children: React.ReactNode",
                                "type": {
                                  "filePath": "test.ts",
                                  "kind": "TypeReference",
                                  "moduleSpecifier": undefined,
                                  "name": "React.ReactNode",
                                  "position": {
                                    "end": {
                                      "column": 28,
                                      "line": 4,
                                    },
                                    "start": {
                                      "column": 13,
                                      "line": 4,
                                    },
                                  },
                                  "text": "ReactNode",
                                  "typeArguments": [],
                                },
                              },
                            ],
                            "text": "MarkdownProps",
                          },
                          {
                            "filePath": "node_modules/@types/react/index.d.ts",
                            "kind": "Any",
                            "position": {
                              "end": {
                                "column": 6,
                                "line": 1152,
                              },
                              "start": {
                                "column": 5,
                                "line": 1127,
                              },
                            },
                            "text": "any",
                          },
                        ],
                      },
                      {
                        "filePath": "node_modules/@types/react/index.d.ts",
                        "kind": "TypeReference",
                        "name": "FunctionComponent",
                        "position": {
                          "end": {
                            "column": 6,
                            "line": 1077,
                          },
                          "start": {
                            "column": 5,
                            "line": 1051,
                          },
                        },
                        "text": "FunctionComponent<MarkdownProps>",
                        "typeArguments": [
                          {
                            "kind": "TypeLiteral",
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
                                    "line": 4,
                                  },
                                  "start": {
                                    "column": 3,
                                    "line": 4,
                                  },
                                },
                                "text": "children: React.ReactNode",
                                "type": {
                                  "filePath": "test.ts",
                                  "kind": "TypeReference",
                                  "moduleSpecifier": undefined,
                                  "name": "React.ReactNode",
                                  "position": {
                                    "end": {
                                      "column": 28,
                                      "line": 4,
                                    },
                                    "start": {
                                      "column": 13,
                                      "line": 4,
                                    },
                                  },
                                  "text": "ReactNode",
                                  "typeArguments": [],
                                },
                              },
                            ],
                            "text": "MarkdownProps",
                          },
                        ],
                      },
                    ],
                  },
                },
              ],
              "text": "{ Markdown: ComponentType<MarkdownProps>; }",
            },
          ],
        },
        "typeParameters": [],
      }
    `)
  })

  test('complex mapped type', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
      import * as React from 'react'

      type MarkdownComponents = {
        [Key in keyof React.JSX.IntrinsicElements]?:
          | React.ComponentType<React.JSX.IntrinsicElements[Key]>
          | keyof React.JSX.IntrinsicElements
      }
      `,
      { overwrite: true }
    )
    const typeAlias = sourceFile.getTypeAliasOrThrow('MarkdownComponents')
    const types = resolveType(typeAlias.getType(), typeAlias)

    expect(types).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "TypeAlias",
        "name": "MarkdownComponents",
        "position": {
          "end": {
            "column": 2,
            "line": 7,
          },
          "start": {
            "column": 1,
            "line": 3,
          },
        },
        "text": "MarkdownComponents",
        "type": {
          "isOptional": true,
          "isReadonly": false,
          "kind": "MappedType",
          "text": "MarkdownComponents",
          "type": {
            "kind": "UnionType",
            "text": "ComponentType<IntrinsicElements[Key]> | keyof IntrinsicElements",
            "types": [
              {
                "filePath": "test.ts",
                "kind": "TypeReference",
                "moduleSpecifier": "react",
                "name": "React.ComponentType",
                "position": {
                  "end": {
                    "column": 60,
                    "line": 5,
                  },
                  "start": {
                    "column": 7,
                    "line": 5,
                  },
                },
                "text": "ComponentType<IntrinsicElements[Key]>",
                "typeArguments": [
                  {
                    "indexType": {
                      "filePath": "test.ts",
                      "kind": "TypeReference",
                      "moduleSpecifier": undefined,
                      "name": "Key",
                      "position": {
                        "end": {
                          "column": 58,
                          "line": 5,
                        },
                        "start": {
                          "column": 55,
                          "line": 5,
                        },
                      },
                      "text": "Key",
                      "typeArguments": [],
                    },
                    "kind": "IndexedAccessType",
                    "objectType": {
                      "filePath": "test.ts",
                      "kind": "TypeReference",
                      "moduleSpecifier": "react",
                      "name": "React.JSX.IntrinsicElements",
                      "position": {
                        "end": {
                          "column": 54,
                          "line": 5,
                        },
                        "start": {
                          "column": 27,
                          "line": 5,
                        },
                      },
                      "text": "IntrinsicElements",
                      "typeArguments": [],
                    },
                    "text": "IntrinsicElements[Key]",
                  },
                ],
              },
              {
                "kind": "TypeOperator",
                "operator": "keyof",
                "text": "keyof IntrinsicElements",
                "type": {
                  "filePath": "test.ts",
                  "kind": "TypeReference",
                  "moduleSpecifier": "react",
                  "name": "React.JSX.IntrinsicElements",
                  "position": {
                    "end": {
                      "column": 40,
                      "line": 6,
                    },
                    "start": {
                      "column": 13,
                      "line": 6,
                    },
                  },
                  "text": "IntrinsicElements",
                  "typeArguments": [],
                },
              },
            ],
          },
          "typeParameter": {
            "constraintType": {
              "kind": "TypeOperator",
              "operator": "keyof",
              "text": "keyof IntrinsicElements",
              "type": {
                "filePath": "test.ts",
                "kind": "TypeReference",
                "moduleSpecifier": "react",
                "name": "React.JSX.IntrinsicElements",
                "position": {
                  "end": {
                    "column": 44,
                    "line": 4,
                  },
                  "start": {
                    "column": 17,
                    "line": 4,
                  },
                },
                "text": "IntrinsicElements",
                "typeArguments": [],
              },
            },
            "defaultType": undefined,
            "kind": "TypeParameter",
            "name": "Key",
            "text": "Key in keyof React.JSX.IntrinsicElements",
          },
        },
        "typeParameters": [],
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
            "text": "firstName: string",
            "type": {
              "filePath": "test.ts",
              "kind": "String",
              "position": {
                "end": {
                  "column": 20,
                  "line": 2,
                },
                "start": {
                  "column": 14,
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
            "text": "lastName: string",
            "type": {
              "filePath": "test.ts",
              "kind": "String",
              "position": {
                "end": {
                  "column": 19,
                  "line": 3,
                },
                "start": {
                  "column": 13,
                  "line": 3,
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
            "signatures": [
              {
                "filePath": "test.ts",
                "kind": "CallSignature",
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
                      "column": 18,
                      "line": 4,
                    },
                  },
                  "text": "string",
                  "value": undefined,
                },
                "text": "() => string",
                "thisType": undefined,
              },
            ],
            "text": "getFullName(): string",
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
        "typeParameters": [],
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
              "isRest": false,
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
              "text": "props: Props",
              "type": {
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
                    "text": "required: string",
                    "type": {
                      "filePath": "test.ts",
                      "kind": "String",
                      "position": {
                        "end": {
                          "column": 40,
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
                    "text": "additional: string",
                    "type": {
                      "filePath": "test.ts",
                      "kind": "String",
                      "position": {
                        "end": {
                          "column": 59,
                          "line": 5,
                        },
                        "start": {
                          "column": 53,
                          "line": 5,
                        },
                      },
                      "text": "string",
                      "value": undefined,
                    },
                  },
                ],
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
              "kind": "Void",
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
            "thisType": undefined,
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
            "kind": "CallSignature",
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
                "filePath": "test.ts",
                "kind": "Boolean",
                "position": {
                  "end": {
                    "column": 21,
                    "line": 2,
                  },
                  "start": {
                    "column": 10,
                    "line": 2,
                  },
                },
                "text": "boolean",
              },
              "text": "() => boolean",
              "thisType": undefined,
            },
            "text": "function returnsFn(): () => boolean",
            "thisType": undefined,
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
            "kind": "CallSignature",
            "parameters": [
              {
                "description": undefined,
                "filePath": "test.ts",
                "initializer": undefined,
                "isOptional": true,
                "isRest": false,
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
                "text": "extension?: ExtensionType | ExtensionType[]",
                "type": {
                  "kind": "UnionType",
                  "text": "ExtensionType | Array<ExtensionType>",
                  "types": [
                    {
                      "filePath": "test.ts",
                      "kind": "TypeReference",
                      "moduleSpecifier": undefined,
                      "name": "ExtensionType",
                      "position": {
                        "end": {
                          "column": 28,
                          "line": 7,
                        },
                        "start": {
                          "column": 15,
                          "line": 7,
                        },
                      },
                      "text": "ExtensionType",
                      "typeArguments": [],
                    },
                    {
                      "filePath": "test.ts",
                      "kind": "TypeReference",
                      "name": "Array",
                      "position": {
                        "end": {
                          "column": 46,
                          "line": 7,
                        },
                        "start": {
                          "column": 31,
                          "line": 7,
                        },
                      },
                      "text": "Array<ExtensionType>",
                      "typeArguments": [
                        {
                          "filePath": "test.ts",
                          "kind": "TypeReference",
                          "moduleSpecifier": undefined,
                          "name": "ExtensionType",
                          "position": {
                            "end": {
                              "column": 44,
                              "line": 7,
                            },
                            "start": {
                              "column": 31,
                              "line": 7,
                            },
                          },
                          "text": "ExtensionType",
                          "typeArguments": [],
                        },
                      ],
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
              "filePath": "test.ts",
              "kind": "Void",
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
              "text": "void",
            },
            "text": "function getFile<ExtensionType extends "mdx" | string>(extension?: ExtensionType | ExtensionType[]): void",
            "thisType": undefined,
            "typeParameters": [
              {
                "constraintType": {
                  "kind": "UnionType",
                  "text": ""mdx" | string",
                  "types": [
                    {
                      "kind": "TypeOperator",
                      "operator": "keyof",
                      "text": ""mdx"",
                      "type": {
                        "kind": "TypeLiteral",
                        "members": [
                          {
                            "filePath": "test.ts",
                            "isOptional": false,
                            "isReadonly": false,
                            "kind": "PropertySignature",
                            "name": "mdx",
                            "position": {
                              "end": {
                                "column": 24,
                                "line": 2,
                              },
                              "start": {
                                "column": 3,
                                "line": 2,
                              },
                            },
                            "text": "mdx: { default: any }",
                            "type": {
                              "kind": "TypeLiteral",
                              "members": [
                                {
                                  "filePath": "test.ts",
                                  "isOptional": false,
                                  "isReadonly": false,
                                  "kind": "PropertySignature",
                                  "name": "default",
                                  "position": {
                                    "end": {
                                      "column": 22,
                                      "line": 2,
                                    },
                                    "start": {
                                      "column": 10,
                                      "line": 2,
                                    },
                                  },
                                  "text": "default: any",
                                  "type": {
                                    "filePath": "test.ts",
                                    "kind": "Any",
                                    "position": {
                                      "end": {
                                        "column": 22,
                                        "line": 2,
                                      },
                                      "start": {
                                        "column": 19,
                                        "line": 2,
                                      },
                                    },
                                    "text": "any",
                                  },
                                },
                              ],
                              "text": "{ default: any; }",
                            },
                          },
                        ],
                        "text": "LoaderTypes",
                      },
                    },
                    {
                      "filePath": "test.ts",
                      "kind": "String",
                      "position": {
                        "end": {
                          "column": 52,
                          "line": 6,
                        },
                        "start": {
                          "column": 46,
                          "line": 6,
                        },
                      },
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
        "kind": "TypeAlias",
        "name": "Keys",
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
        "type": {
          "filePath": "test.ts",
          "kind": "String",
          "position": {
            "end": {
              "column": 19,
              "line": 1,
            },
            "start": {
              "column": 13,
              "line": 1,
            },
          },
          "text": "string",
          "value": undefined,
        },
        "typeParameters": [],
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
    const type = resolveType(typeAlias.getType(), typeAlias)

    expect(type).toMatchInlineSnapshot(`
      {
        "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
        "kind": "TypeAlias",
        "name": "Foo",
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
        "type": {
          "kind": "String",
          "text": "string",
          "value": undefined,
        },
        "typeParameters": [],
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
    const type = resolveType(typeAlias.getType(), typeAlias)

    expect(type).toMatchInlineSnapshot(`
      {
        "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
        "kind": "TypeAlias",
        "name": "Foo",
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
        "type": {
          "indexType": {
            "filePath": "test.ts",
            "kind": "String",
            "position": {
              "end": {
                "column": 28,
                "line": 6,
              },
              "start": {
                "column": 23,
                "line": 6,
              },
            },
            "text": ""foo"",
            "value": "foo",
          },
          "kind": "IndexedAccessType",
          "objectType": {
            "filePath": "test.ts",
            "kind": "TypeReference",
            "moduleSpecifier": undefined,
            "name": "Baz",
            "position": {
              "end": {
                "column": 22,
                "line": 6,
              },
              "start": {
                "column": 19,
                "line": 6,
              },
            },
            "text": "Baz",
            "typeArguments": [],
          },
          "text": "string",
        },
        "typeParameters": [],
      }
    `)
  })

  test('nested indexed access type', () => {
    const sourceFile = project.createSourceFile(
      'index.ts',
      dedent`
      type A = {
        foo: {
          bar: string
        }
      }

      type B = A['foo']['bar']
      `,
      { overwrite: true }
    )
    const typeAlias = sourceFile.getTypeAliasOrThrow('B')
    const type = resolveType(typeAlias.getType(), typeAlias)

    expect(type).toMatchInlineSnapshot(`
      {
        "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
        "kind": "TypeAlias",
        "name": "B",
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
        "type": {
          "kind": "String",
          "text": "string",
          "value": undefined,
        },
        "typeParameters": [],
      }
    `)
  })

  test('nested indexed access type with exported reference', () => {
    const sourceFile = project.createSourceFile(
      'index.ts',
      dedent`
      export type A = {
        foo: {
          bar: string
        }
      }

      type B = A['foo']['bar']
      `,
      { overwrite: true }
    )
    const typeAlias = sourceFile.getTypeAliasOrThrow('B')
    const type = resolveType(typeAlias.getType(), typeAlias)

    expect(type).toMatchInlineSnapshot(`
      {
        "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
        "kind": "TypeAlias",
        "name": "B",
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
        "type": {
          "indexType": {
            "filePath": "index.ts",
            "kind": "String",
            "position": {
              "end": {
                "column": 24,
                "line": 7,
              },
              "start": {
                "column": 19,
                "line": 7,
              },
            },
            "text": ""bar"",
            "value": "bar",
          },
          "kind": "IndexedAccessType",
          "objectType": {
            "indexType": {
              "filePath": "index.ts",
              "kind": "String",
              "position": {
                "end": {
                  "column": 17,
                  "line": 7,
                },
                "start": {
                  "column": 12,
                  "line": 7,
                },
              },
              "text": ""foo"",
              "value": "foo",
            },
            "kind": "IndexedAccessType",
            "objectType": {
              "filePath": "index.ts",
              "kind": "TypeReference",
              "moduleSpecifier": undefined,
              "name": "A",
              "position": {
                "end": {
                  "column": 11,
                  "line": 7,
                },
                "start": {
                  "column": 10,
                  "line": 7,
                },
              },
              "text": "A",
              "typeArguments": [],
            },
            "text": "{ bar: string; }",
          },
          "text": "string",
        },
        "typeParameters": [],
      }
    `)
  })

  test('resolves complex conditional and indexed access type', () => {
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
    const typeAlias = sourceFile.getTypeAliasOrThrow('LoaderExportValue')
    const type = resolveType(typeAlias.getType(), typeAlias)

    expect(type).toMatchInlineSnapshot(`
      {
        "filePath": "index.ts",
        "kind": "TypeAlias",
        "name": "LoaderExportValue",
        "position": {
          "end": {
            "column": 35,
            "line": 10,
          },
          "start": {
            "column": 1,
            "line": 6,
          },
        },
        "text": "LoaderExportValue<Loaders, Name>",
        "type": {
          "indexType": {
            "filePath": "index.ts",
            "kind": "TypeReference",
            "moduleSpecifier": undefined,
            "name": "LoadersWithRuntimeKeys",
            "position": {
              "end": {
                "column": 34,
                "line": 10,
              },
              "start": {
                "column": 3,
                "line": 10,
              },
            },
            "text": "Extract<keyof Loaders, "js" | "jsx" | "ts" | "tsx" | "mdx">",
            "typeArguments": [
              {
                "filePath": "index.ts",
                "kind": "TypeReference",
                "moduleSpecifier": undefined,
                "name": "Loaders",
                "position": {
                  "end": {
                    "column": 33,
                    "line": 10,
                  },
                  "start": {
                    "column": 26,
                    "line": 10,
                  },
                },
                "text": "Loaders",
                "typeArguments": [],
              },
            ],
          },
          "kind": "IndexedAccessType",
          "objectType": {
            "isOptional": false,
            "isReadonly": false,
            "kind": "MappedType",
            "text": "{ [Extension in Extract<keyof Loaders, "js" | "jsx" | "ts" | "tsx" | "mdx">]: Name extends keyof Loaders[Extension] ? Loaders[Extension][Name] : never; }",
            "type": {
              "checkType": {
                "filePath": "index.ts",
                "kind": "TypeReference",
                "moduleSpecifier": undefined,
                "name": "Name",
                "position": {
                  "end": {
                    "column": 55,
                    "line": 7,
                  },
                  "start": {
                    "column": 51,
                    "line": 7,
                  },
                },
                "text": "Name",
                "typeArguments": [],
              },
              "extendsType": {
                "kind": "TypeOperator",
                "operator": "keyof",
                "text": "keyof Loaders[Extension]",
                "type": {
                  "indexType": {
                    "filePath": "index.ts",
                    "kind": "TypeReference",
                    "moduleSpecifier": undefined,
                    "name": "Extension",
                    "position": {
                      "end": {
                        "column": 87,
                        "line": 7,
                      },
                      "start": {
                        "column": 78,
                        "line": 7,
                      },
                    },
                    "text": "Extension",
                    "typeArguments": [],
                  },
                  "kind": "IndexedAccessType",
                  "objectType": {
                    "filePath": "index.ts",
                    "kind": "TypeReference",
                    "moduleSpecifier": undefined,
                    "name": "Loaders",
                    "position": {
                      "end": {
                        "column": 77,
                        "line": 7,
                      },
                      "start": {
                        "column": 70,
                        "line": 7,
                      },
                    },
                    "text": "Loaders",
                    "typeArguments": [],
                  },
                  "text": "Loaders[Extension]",
                },
              },
              "falseType": {
                "filePath": "index.ts",
                "kind": "Never",
                "position": {
                  "end": {
                    "column": 12,
                    "line": 9,
                  },
                  "start": {
                    "column": 7,
                    "line": 9,
                  },
                },
                "text": "never",
              },
              "isDistributive": true,
              "kind": "ConditionalType",
              "text": "Name extends keyof Loaders[Extension] ? Loaders[Extension][Name] : never",
              "trueType": {
                "indexType": {
                  "filePath": "index.ts",
                  "kind": "TypeReference",
                  "moduleSpecifier": undefined,
                  "name": "Name",
                  "position": {
                    "end": {
                      "column": 30,
                      "line": 8,
                    },
                    "start": {
                      "column": 26,
                      "line": 8,
                    },
                  },
                  "text": "Name",
                  "typeArguments": [],
                },
                "kind": "IndexedAccessType",
                "objectType": {
                  "indexType": {
                    "filePath": "index.ts",
                    "kind": "TypeReference",
                    "moduleSpecifier": undefined,
                    "name": "Extension",
                    "position": {
                      "end": {
                        "column": 24,
                        "line": 8,
                      },
                      "start": {
                        "column": 15,
                        "line": 8,
                      },
                    },
                    "text": "Extension",
                    "typeArguments": [],
                  },
                  "kind": "IndexedAccessType",
                  "objectType": {
                    "filePath": "index.ts",
                    "kind": "TypeReference",
                    "moduleSpecifier": undefined,
                    "name": "Loaders",
                    "position": {
                      "end": {
                        "column": 14,
                        "line": 8,
                      },
                      "start": {
                        "column": 7,
                        "line": 8,
                      },
                    },
                    "text": "Loaders",
                    "typeArguments": [],
                  },
                  "text": "Loaders[Extension]",
                },
                "text": "Loaders[Extension][Name]",
              },
            },
            "typeParameter": {
              "constraintType": {
                "filePath": "index.ts",
                "kind": "TypeReference",
                "moduleSpecifier": undefined,
                "name": "LoadersWithRuntimeKeys",
                "position": {
                  "end": {
                    "column": 48,
                    "line": 7,
                  },
                  "start": {
                    "column": 17,
                    "line": 7,
                  },
                },
                "text": "Extract<keyof Loaders, "js" | "jsx" | "ts" | "tsx" | "mdx">",
                "typeArguments": [
                  {
                    "filePath": "index.ts",
                    "kind": "TypeReference",
                    "moduleSpecifier": undefined,
                    "name": "Loaders",
                    "position": {
                      "end": {
                        "column": 47,
                        "line": 7,
                      },
                      "start": {
                        "column": 40,
                        "line": 7,
                      },
                    },
                    "text": "Loaders",
                    "typeArguments": [],
                  },
                ],
              },
              "defaultType": undefined,
              "kind": "TypeParameter",
              "name": "Extension",
              "text": "Extension in LoadersWithRuntimeKeys<Loaders>",
            },
          },
          "text": "LoaderExportValue<Loaders, Name>",
        },
        "typeParameters": [
          {
            "constraintType": undefined,
            "defaultType": undefined,
            "filePath": "index.ts",
            "kind": "TypeParameter",
            "name": "Loaders",
            "position": {
              "end": {
                "column": 38,
                "line": 6,
              },
              "start": {
                "column": 31,
                "line": 6,
              },
            },
            "text": "Loaders",
          },
          {
            "constraintType": {
              "filePath": "index.ts",
              "kind": "String",
              "position": {
                "end": {
                  "column": 59,
                  "line": 6,
                },
                "start": {
                  "column": 53,
                  "line": 6,
                },
              },
              "text": "string",
              "value": undefined,
            },
            "defaultType": undefined,
            "filePath": "index.ts",
            "kind": "TypeParameter",
            "name": "Name",
            "position": {
              "end": {
                "column": 59,
                "line": 6,
              },
              "start": {
                "column": 40,
                "line": 6,
              },
            },
            "text": "Name extends string",
          },
        ],
      }
    `)
  })

  test('resolves indexed access type with intersection', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
      export interface DefaultModuleTypes {
        mdx: { default: any }
      }

      export type InferDefaultModuleTypes<Extension extends string> =
        Extension extends keyof DefaultModuleTypes
          ? DefaultModuleTypes[Extension] & { metadata: Record<string, any> }
          : any
      `,
      { overwrite: true }
    )
    const typeAlias = sourceFile.getTypeAliasOrThrow('InferDefaultModuleTypes')
    const type = resolveType(typeAlias.getType(), typeAlias)

    expect(type).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "TypeAlias",
        "name": "InferDefaultModuleTypes",
        "position": {
          "end": {
            "column": 10,
            "line": 8,
          },
          "start": {
            "column": 1,
            "line": 5,
          },
        },
        "text": "InferDefaultModuleTypes<Extension>",
        "type": {
          "checkType": {
            "filePath": "test.ts",
            "kind": "TypeReference",
            "moduleSpecifier": undefined,
            "name": "Extension",
            "position": {
              "end": {
                "column": 12,
                "line": 6,
              },
              "start": {
                "column": 3,
                "line": 6,
              },
            },
            "text": "Extension",
            "typeArguments": [],
          },
          "extendsType": {
            "kind": "TypeOperator",
            "operator": "keyof",
            "text": ""mdx"",
            "type": {
              "filePath": "test.ts",
              "kind": "TypeReference",
              "moduleSpecifier": undefined,
              "name": "DefaultModuleTypes",
              "position": {
                "end": {
                  "column": 45,
                  "line": 6,
                },
                "start": {
                  "column": 27,
                  "line": 6,
                },
              },
              "text": "DefaultModuleTypes",
              "typeArguments": [],
            },
          },
          "falseType": {
            "filePath": "test.ts",
            "kind": "Any",
            "position": {
              "end": {
                "column": 10,
                "line": 8,
              },
              "start": {
                "column": 7,
                "line": 8,
              },
            },
            "text": "any",
          },
          "isDistributive": true,
          "kind": "ConditionalType",
          "text": "InferDefaultModuleTypes<Extension>",
          "trueType": {
            "kind": "IntersectionType",
            "text": "DefaultModuleTypes[Extension] & { metadata: Record<string, any>; }",
            "types": [
              {
                "indexType": {
                  "filePath": "test.ts",
                  "kind": "TypeReference",
                  "moduleSpecifier": undefined,
                  "name": "Extension",
                  "position": {
                    "end": {
                      "column": 35,
                      "line": 7,
                    },
                    "start": {
                      "column": 26,
                      "line": 7,
                    },
                  },
                  "text": "Extension",
                  "typeArguments": [],
                },
                "kind": "IndexedAccessType",
                "objectType": {
                  "filePath": "test.ts",
                  "kind": "TypeReference",
                  "moduleSpecifier": undefined,
                  "name": "DefaultModuleTypes",
                  "position": {
                    "end": {
                      "column": 25,
                      "line": 7,
                    },
                    "start": {
                      "column": 7,
                      "line": 7,
                    },
                  },
                  "text": "DefaultModuleTypes",
                  "typeArguments": [],
                },
                "text": "DefaultModuleTypes[Extension]",
              },
              {
                "kind": "TypeLiteral",
                "members": [
                  {
                    "filePath": "test.ts",
                    "isOptional": false,
                    "isReadonly": false,
                    "kind": "PropertySignature",
                    "name": "metadata",
                    "position": {
                      "end": {
                        "column": 70,
                        "line": 7,
                      },
                      "start": {
                        "column": 41,
                        "line": 7,
                      },
                    },
                    "text": "metadata: Record<string, any>",
                    "type": {
                      "filePath": "test.ts",
                      "kind": "TypeReference",
                      "moduleSpecifier": undefined,
                      "name": "Record",
                      "position": {
                        "end": {
                          "column": 70,
                          "line": 7,
                        },
                        "start": {
                          "column": 51,
                          "line": 7,
                        },
                      },
                      "text": "Record<string, any>",
                      "typeArguments": [
                        {
                          "filePath": "test.ts",
                          "kind": "String",
                          "position": {
                            "end": {
                              "column": 64,
                              "line": 7,
                            },
                            "start": {
                              "column": 58,
                              "line": 7,
                            },
                          },
                          "text": "string",
                          "value": undefined,
                        },
                        {
                          "filePath": "test.ts",
                          "kind": "Any",
                          "position": {
                            "end": {
                              "column": 69,
                              "line": 7,
                            },
                            "start": {
                              "column": 66,
                              "line": 7,
                            },
                          },
                          "text": "any",
                        },
                      ],
                    },
                  },
                ],
                "text": "{ metadata: Record<string, any>; }",
              },
            ],
          },
        },
        "typeParameters": [
          {
            "constraintType": {
              "filePath": "test.ts",
              "kind": "String",
              "position": {
                "end": {
                  "column": 61,
                  "line": 5,
                },
                "start": {
                  "column": 55,
                  "line": 5,
                },
              },
              "text": "string",
              "value": undefined,
            },
            "defaultType": undefined,
            "filePath": "test.ts",
            "kind": "TypeParameter",
            "name": "Extension",
            "position": {
              "end": {
                "column": 61,
                "line": 5,
              },
              "start": {
                "column": 37,
                "line": 5,
              },
            },
            "text": "Extension extends string",
          },
        ],
      }
    `)
  })

  test('resolves type-parameter constraint', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
        export interface Types {
          foo: string
          bar: number
        }

        export type Constrained<Key extends keyof Types> = Key
      `,
      { overwrite: true }
    )
    const declaration = sourceFile.getTypeAliasOrThrow('Constrained')
    const type = resolveType(declaration.getType(), declaration)

    expect(type).toMatchInlineSnapshot(`
      {
        "constraintType": {
          "kind": "TypeOperator",
          "operator": "keyof",
          "text": "keyof Types",
          "type": {
            "filePath": "test.ts",
            "kind": "TypeReference",
            "moduleSpecifier": undefined,
            "name": "Types",
            "position": {
              "end": {
                "column": 48,
                "line": 6,
              },
              "start": {
                "column": 43,
                "line": 6,
              },
            },
            "text": "Types",
            "typeArguments": [],
          },
        },
        "defaultType": undefined,
        "filePath": "test.ts",
        "kind": "TypeParameter",
        "name": "Key",
        "position": {
          "end": {
            "column": 48,
            "line": 6,
          },
          "start": {
            "column": 25,
            "line": 6,
          },
        },
        "text": "Key extends keyof Types",
      }
    `)
  })

  test('resolves function declaration type-parameter with intersection', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
      export async function resolveFileFromEntry<
        Types extends Record<string, any>,
        const Extension extends keyof Types & string = string,
      >(
        extension?: Extension | readonly Extension[]
      ): Promise<void> {
        return
      }
      `,
      { overwrite: true }
    )
    const declaration = sourceFile.getFunctionOrThrow('resolveFileFromEntry')
    const type = resolveType(declaration.getType(), declaration)

    expect(type).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "Function",
        "name": "resolveFileFromEntry",
        "position": {
          "end": {
            "column": 2,
            "line": 8,
          },
          "start": {
            "column": 1,
            "line": 1,
          },
        },
        "signatures": [
          {
            "filePath": "test.ts",
            "isAsync": true,
            "isGenerator": false,
            "kind": "CallSignature",
            "parameters": [
              {
                "description": undefined,
                "filePath": "test.ts",
                "initializer": undefined,
                "isOptional": true,
                "isRest": false,
                "kind": "Parameter",
                "name": "extension",
                "position": {
                  "end": {
                    "column": 47,
                    "line": 5,
                  },
                  "start": {
                    "column": 3,
                    "line": 5,
                  },
                },
                "text": "extension?: Extension | readonly Extension[]",
                "type": {
                  "kind": "UnionType",
                  "text": "Extension | ReadonlyArray<Extension>",
                  "types": [
                    {
                      "filePath": "test.ts",
                      "kind": "TypeReference",
                      "moduleSpecifier": undefined,
                      "name": "Extension",
                      "position": {
                        "end": {
                          "column": 24,
                          "line": 5,
                        },
                        "start": {
                          "column": 15,
                          "line": 5,
                        },
                      },
                      "text": "Extension",
                      "typeArguments": [],
                    },
                    {
                      "kind": "TypeOperator",
                      "operator": "readonly",
                      "text": "ReadonlyArray<Extension>",
                      "type": {
                        "filePath": "test.ts",
                        "kind": "TypeReference",
                        "name": "Array",
                        "position": {
                          "end": {
                            "column": 47,
                            "line": 5,
                          },
                          "start": {
                            "column": 36,
                            "line": 5,
                          },
                        },
                        "text": "Array<Extension>",
                        "typeArguments": [
                          {
                            "filePath": "test.ts",
                            "kind": "TypeReference",
                            "moduleSpecifier": undefined,
                            "name": "Extension",
                            "position": {
                              "end": {
                                "column": 45,
                                "line": 5,
                              },
                              "start": {
                                "column": 36,
                                "line": 5,
                              },
                            },
                            "text": "Extension",
                            "typeArguments": [],
                          },
                        ],
                      },
                    },
                  ],
                },
              },
            ],
            "position": {
              "end": {
                "column": 2,
                "line": 8,
              },
              "start": {
                "column": 1,
                "line": 1,
              },
            },
            "returnType": {
              "filePath": "test.ts",
              "kind": "TypeReference",
              "moduleSpecifier": undefined,
              "name": "Promise",
              "position": {
                "end": {
                  "column": 17,
                  "line": 6,
                },
                "start": {
                  "column": 4,
                  "line": 6,
                },
              },
              "text": "Promise<void>",
              "typeArguments": [
                {
                  "filePath": "test.ts",
                  "kind": "Void",
                  "position": {
                    "end": {
                      "column": 16,
                      "line": 6,
                    },
                    "start": {
                      "column": 12,
                      "line": 6,
                    },
                  },
                  "text": "void",
                },
              ],
            },
            "text": "function resolveFileFromEntry<Types extends Record<string, any>, Extension extends keyof Types & string>(extension?: Extension | readonly Extension[]): Promise<void>",
            "thisType": undefined,
            "typeParameters": [
              {
                "constraintType": {
                  "filePath": "test.ts",
                  "kind": "TypeReference",
                  "moduleSpecifier": undefined,
                  "name": "Record",
                  "position": {
                    "end": {
                      "column": 36,
                      "line": 2,
                    },
                    "start": {
                      "column": 17,
                      "line": 2,
                    },
                  },
                  "text": "Record<string, any>",
                  "typeArguments": [
                    {
                      "filePath": "test.ts",
                      "kind": "String",
                      "position": {
                        "end": {
                          "column": 30,
                          "line": 2,
                        },
                        "start": {
                          "column": 24,
                          "line": 2,
                        },
                      },
                      "text": "string",
                      "value": undefined,
                    },
                    {
                      "filePath": "test.ts",
                      "kind": "Any",
                      "position": {
                        "end": {
                          "column": 35,
                          "line": 2,
                        },
                        "start": {
                          "column": 32,
                          "line": 2,
                        },
                      },
                      "text": "any",
                    },
                  ],
                },
                "defaultType": undefined,
                "kind": "TypeParameter",
                "name": "Types",
                "text": "Types extends Record<string, any>",
              },
              {
                "constraintType": {
                  "kind": "IntersectionType",
                  "text": "keyof Types & string",
                  "types": [
                    {
                      "kind": "TypeOperator",
                      "operator": "keyof",
                      "text": "keyof Types",
                      "type": {
                        "filePath": "test.ts",
                        "kind": "TypeReference",
                        "moduleSpecifier": undefined,
                        "name": "Types",
                        "position": {
                          "end": {
                            "column": 38,
                            "line": 3,
                          },
                          "start": {
                            "column": 33,
                            "line": 3,
                          },
                        },
                        "text": "Types",
                        "typeArguments": [],
                      },
                    },
                    {
                      "filePath": "test.ts",
                      "kind": "String",
                      "position": {
                        "end": {
                          "column": 47,
                          "line": 3,
                        },
                        "start": {
                          "column": 41,
                          "line": 3,
                        },
                      },
                      "text": "string",
                      "value": undefined,
                    },
                  ],
                },
                "defaultType": {
                  "filePath": "test.ts",
                  "kind": "String",
                  "position": {
                    "end": {
                      "column": 56,
                      "line": 3,
                    },
                    "start": {
                      "column": 50,
                      "line": 3,
                    },
                  },
                  "text": "string",
                  "value": undefined,
                },
                "kind": "TypeParameter",
                "name": "Extension",
                "text": "const Extension extends keyof Types & string = string",
              },
            ],
          },
        ],
        "text": "<Types extends Record<string, any>, const Extension extends keyof Types & string = string>(extension?: Extension | readonly Extension[]) => Promise<void>",
      }
    `)
  })

  test('template literal', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
      export type Foo = \`foo\${string}\`
      `,
      { overwrite: true }
    )
    const typeAlias = sourceFile.getTypeAliasOrThrow('Foo')
    const types = resolveType(typeAlias.getType(), typeAlias)

    expect(types).toMatchInlineSnapshot(`
      {
        "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
        "kind": "TypeAlias",
        "name": "Foo",
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
        "text": "\`foo\${string}\`",
        "type": {
          "filePath": "test.ts",
          "kind": "String",
          "position": {
            "end": {
              "column": 33,
              "line": 1,
            },
            "start": {
              "column": 19,
              "line": 1,
            },
          },
          "text": "\`foo\${string}\`",
          "value": undefined,
        },
        "typeParameters": [],
      }
    `)
  })

  test('inferred type parameter', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
      type UnionToIntersection<Union> = (
        Union extends any ? (distributedUnion: Union) => void : never
      ) extends (mergedIntersection: infer Intersection) => void
        ? Intersection & Union
        : never
      `,
      { overwrite: true }
    )
    const declaration = sourceFile.getTypeAliasOrThrow('UnionToIntersection')
    const types = resolveType(declaration.getType(), declaration)

    expect(types).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "TypeAlias",
        "name": "UnionToIntersection",
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
        "text": "UnionToIntersection<Union>",
        "type": {
          "checkType": {
            "checkType": {
              "filePath": "test.ts",
              "kind": "TypeReference",
              "moduleSpecifier": undefined,
              "name": "Union",
              "position": {
                "end": {
                  "column": 8,
                  "line": 2,
                },
                "start": {
                  "column": 3,
                  "line": 2,
                },
              },
              "text": "Union",
              "typeArguments": [],
            },
            "extendsType": {
              "filePath": "test.ts",
              "kind": "Any",
              "position": {
                "end": {
                  "column": 20,
                  "line": 2,
                },
                "start": {
                  "column": 17,
                  "line": 2,
                },
              },
              "text": "any",
            },
            "falseType": {
              "filePath": "test.ts",
              "kind": "Never",
              "position": {
                "end": {
                  "column": 64,
                  "line": 2,
                },
                "start": {
                  "column": 59,
                  "line": 2,
                },
              },
              "text": "never",
            },
            "isDistributive": true,
            "kind": "ConditionalType",
            "text": "Union extends any ? (distributedUnion: Union) => void : never",
            "trueType": {
              "filePath": "test.ts",
              "isAsync": false,
              "kind": "FunctionType",
              "parameters": [
                {
                  "description": undefined,
                  "filePath": "test.ts",
                  "initializer": undefined,
                  "isOptional": false,
                  "isRest": false,
                  "kind": "Parameter",
                  "name": "distributedUnion",
                  "position": {
                    "end": {
                      "column": 47,
                      "line": 2,
                    },
                    "start": {
                      "column": 24,
                      "line": 2,
                    },
                  },
                  "text": "distributedUnion: Union",
                  "type": {
                    "filePath": "test.ts",
                    "kind": "TypeReference",
                    "moduleSpecifier": undefined,
                    "name": "Union",
                    "position": {
                      "end": {
                        "column": 47,
                        "line": 2,
                      },
                      "start": {
                        "column": 42,
                        "line": 2,
                      },
                    },
                    "text": "Union",
                    "typeArguments": [],
                  },
                },
              ],
              "position": {
                "end": {
                  "column": 56,
                  "line": 2,
                },
                "start": {
                  "column": 23,
                  "line": 2,
                },
              },
              "returnType": {
                "filePath": "test.ts",
                "kind": "Void",
                "position": {
                  "end": {
                    "column": 56,
                    "line": 2,
                  },
                  "start": {
                    "column": 52,
                    "line": 2,
                  },
                },
                "text": "void",
              },
              "text": "(distributedUnion: Union) => void",
            },
          },
          "extendsType": {
            "filePath": "test.ts",
            "isAsync": false,
            "kind": "FunctionType",
            "parameters": [
              {
                "description": undefined,
                "filePath": "test.ts",
                "initializer": undefined,
                "isOptional": false,
                "isRest": false,
                "kind": "Parameter",
                "name": "mergedIntersection",
                "position": {
                  "end": {
                    "column": 50,
                    "line": 3,
                  },
                  "start": {
                    "column": 12,
                    "line": 3,
                  },
                },
                "text": "mergedIntersection: infer Intersection",
                "type": {
                  "kind": "InferType",
                  "text": "Intersection",
                  "typeParameter": {
                    "constraintType": undefined,
                    "defaultType": undefined,
                    "kind": "TypeParameter",
                    "name": "Intersection",
                    "text": "Intersection",
                  },
                },
              },
            ],
            "position": {
              "end": {
                "column": 59,
                "line": 3,
              },
              "start": {
                "column": 11,
                "line": 3,
              },
            },
            "returnType": {
              "filePath": "test.ts",
              "kind": "Void",
              "position": {
                "end": {
                  "column": 59,
                  "line": 3,
                },
                "start": {
                  "column": 55,
                  "line": 3,
                },
              },
              "text": "void",
            },
            "text": "(mergedIntersection: Intersection) => void",
          },
          "falseType": {
            "filePath": "test.ts",
            "kind": "Never",
            "position": {
              "end": {
                "column": 10,
                "line": 5,
              },
              "start": {
                "column": 5,
                "line": 5,
              },
            },
            "text": "never",
          },
          "isDistributive": false,
          "kind": "ConditionalType",
          "text": "UnionToIntersection<Union>",
          "trueType": {
            "kind": "IntersectionType",
            "text": "Intersection & Union",
            "types": [
              {
                "filePath": "test.ts",
                "kind": "TypeReference",
                "moduleSpecifier": undefined,
                "name": "Intersection",
                "position": {
                  "end": {
                    "column": 17,
                    "line": 4,
                  },
                  "start": {
                    "column": 5,
                    "line": 4,
                  },
                },
                "text": "Intersection",
                "typeArguments": [],
              },
              {
                "filePath": "test.ts",
                "kind": "TypeReference",
                "moduleSpecifier": undefined,
                "name": "Union",
                "position": {
                  "end": {
                    "column": 25,
                    "line": 4,
                  },
                  "start": {
                    "column": 20,
                    "line": 4,
                  },
                },
                "text": "Union",
                "typeArguments": [],
              },
            ],
          },
        },
        "typeParameters": [
          {
            "constraintType": undefined,
            "defaultType": undefined,
            "filePath": "test.ts",
            "kind": "TypeParameter",
            "name": "Union",
            "position": {
              "end": {
                "column": 31,
                "line": 1,
              },
              "start": {
                "column": 26,
                "line": 1,
              },
            },
            "text": "Union",
          },
        ],
      }
    `)
  })

  test('type parameter with complex constraint', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
      type StringUnion<Type> = Extract<Type, string> | (string & {})

      function isFile<
        Types extends Record<string, any>,
        const Extension extends StringUnion<keyof Types>,
      >() {}
      `,
      { overwrite: true }
    )
    const declaration = sourceFile.getFunctionOrThrow('isFile')
    const types = resolveType(declaration.getType(), declaration)

    expect(types).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "Function",
        "name": "isFile",
        "position": {
          "end": {
            "column": 7,
            "line": 6,
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
            "kind": "CallSignature",
            "parameters": [],
            "position": {
              "end": {
                "column": 7,
                "line": 6,
              },
              "start": {
                "column": 1,
                "line": 3,
              },
            },
            "returnType": {
              "filePath": "test.ts",
              "kind": "Void",
              "position": {
                "end": {
                  "column": 7,
                  "line": 6,
                },
                "start": {
                  "column": 1,
                  "line": 3,
                },
              },
              "text": "void",
            },
            "text": "function isFile<Types extends Record<string, any>, Extension extends string | Extract<keyof Types, string>>(): void",
            "thisType": undefined,
            "typeParameters": [
              {
                "constraintType": {
                  "filePath": "test.ts",
                  "kind": "TypeReference",
                  "moduleSpecifier": undefined,
                  "name": "Record",
                  "position": {
                    "end": {
                      "column": 36,
                      "line": 4,
                    },
                    "start": {
                      "column": 17,
                      "line": 4,
                    },
                  },
                  "text": "Record<string, any>",
                  "typeArguments": [
                    {
                      "filePath": "test.ts",
                      "kind": "String",
                      "position": {
                        "end": {
                          "column": 30,
                          "line": 4,
                        },
                        "start": {
                          "column": 24,
                          "line": 4,
                        },
                      },
                      "text": "string",
                      "value": undefined,
                    },
                    {
                      "filePath": "test.ts",
                      "kind": "Any",
                      "position": {
                        "end": {
                          "column": 35,
                          "line": 4,
                        },
                        "start": {
                          "column": 32,
                          "line": 4,
                        },
                      },
                      "text": "any",
                    },
                  ],
                },
                "defaultType": undefined,
                "kind": "TypeParameter",
                "name": "Types",
                "text": "Types extends Record<string, any>",
              },
              {
                "constraintType": {
                  "kind": "UnionType",
                  "text": "string | Extract<keyof Types, string>",
                  "types": [
                    {
                      "kind": "String",
                      "text": "string",
                      "value": undefined,
                    },
                    {
                      "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
                      "kind": "TypeReference",
                      "name": "Extract",
                      "position": {
                        "end": {
                          "column": 391,
                          "line": 6,
                        },
                        "start": {
                          "column": 353,
                          "line": 6,
                        },
                      },
                      "text": "Extract<keyof Types, string>",
                      "typeArguments": [
                        {
                          "kind": "TypeOperator",
                          "operator": "keyof",
                          "text": "keyof Types",
                          "type": {
                            "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
                            "kind": "TypeReference",
                            "name": "Types",
                            "position": {
                              "end": {
                                "column": 390,
                                "line": 6,
                              },
                              "start": {
                                "column": 371,
                                "line": 6,
                              },
                            },
                            "text": "Types",
                            "typeArguments": [],
                          },
                        },
                        {
                          "filePath": "node_modules/typescript/lib/lib.es5.d.ts",
                          "kind": "String",
                          "position": {
                            "end": {
                              "column": 390,
                              "line": 6,
                            },
                            "start": {
                              "column": 371,
                              "line": 6,
                            },
                          },
                          "text": "string",
                          "value": undefined,
                        },
                      ],
                    },
                  ],
                },
                "defaultType": undefined,
                "kind": "TypeParameter",
                "name": "Extension",
                "text": "const Extension extends StringUnion<keyof Types>",
              },
            ],
          },
        ],
        "text": "<Types extends Record<string, any>, const Extension extends StringUnion<keyof Types>>() => void",
      }
    `)
  })

  test('this parameter type', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
      function foo(this: string) {}
      `,
      { overwrite: true }
    )
    const declaration = sourceFile.getFunctionOrThrow('foo')
    const types = resolveType(declaration.getType(), declaration)

    expect(types).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "Function",
        "name": "foo",
        "position": {
          "end": {
            "column": 30,
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
            "kind": "CallSignature",
            "parameters": [],
            "position": {
              "end": {
                "column": 30,
                "line": 1,
              },
              "start": {
                "column": 1,
                "line": 1,
              },
            },
            "returnType": {
              "filePath": "test.ts",
              "kind": "Void",
              "position": {
                "end": {
                  "column": 30,
                  "line": 1,
                },
                "start": {
                  "column": 1,
                  "line": 1,
                },
              },
              "text": "void",
            },
            "text": "function foo(): void",
            "thisType": {
              "filePath": "test.ts",
              "kind": "String",
              "position": {
                "end": {
                  "column": 26,
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
        ],
        "text": "(this: string) => void",
      }
    `)
  })

  test('this parameter with complex type', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
      function getDefaultExport<Types>(
        this: Types extends { default: infer DefaultType }
          ? DefaultType
          : never
      ) {}
      `,
      { overwrite: true }
    )
    const declaration = sourceFile.getFunctionOrThrow('getDefaultExport')
    const types = resolveType(declaration.getType(), declaration)

    expect(types).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "Function",
        "name": "getDefaultExport",
        "position": {
          "end": {
            "column": 5,
            "line": 5,
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
            "kind": "CallSignature",
            "parameters": [],
            "position": {
              "end": {
                "column": 5,
                "line": 5,
              },
              "start": {
                "column": 1,
                "line": 1,
              },
            },
            "returnType": {
              "filePath": "test.ts",
              "kind": "Void",
              "position": {
                "end": {
                  "column": 5,
                  "line": 5,
                },
                "start": {
                  "column": 1,
                  "line": 1,
                },
              },
              "text": "void",
            },
            "text": "function getDefaultExport<Types>(): void",
            "thisType": {
              "checkType": {
                "filePath": "test.ts",
                "kind": "TypeReference",
                "moduleSpecifier": undefined,
                "name": "Types",
                "position": {
                  "end": {
                    "column": 14,
                    "line": 2,
                  },
                  "start": {
                    "column": 9,
                    "line": 2,
                  },
                },
                "text": "Types",
                "typeArguments": [],
              },
              "extendsType": {
                "kind": "TypeLiteral",
                "members": [
                  {
                    "filePath": "test.ts",
                    "isOptional": false,
                    "isReadonly": false,
                    "kind": "PropertySignature",
                    "name": "default",
                    "position": {
                      "end": {
                        "column": 51,
                        "line": 2,
                      },
                      "start": {
                        "column": 25,
                        "line": 2,
                      },
                    },
                    "text": "default: infer DefaultType",
                    "type": {
                      "kind": "InferType",
                      "text": "DefaultType",
                      "typeParameter": {
                        "constraintType": undefined,
                        "defaultType": undefined,
                        "kind": "TypeParameter",
                        "name": "DefaultType",
                        "text": "DefaultType",
                      },
                    },
                  },
                ],
                "text": "{ default: DefaultType; }",
              },
              "falseType": {
                "filePath": "test.ts",
                "kind": "Never",
                "position": {
                  "end": {
                    "column": 12,
                    "line": 4,
                  },
                  "start": {
                    "column": 7,
                    "line": 4,
                  },
                },
                "text": "never",
              },
              "isDistributive": true,
              "kind": "ConditionalType",
              "text": "Types extends { default: infer DefaultType; } ? DefaultType : never",
              "trueType": {
                "filePath": "test.ts",
                "kind": "TypeReference",
                "moduleSpecifier": undefined,
                "name": "DefaultType",
                "position": {
                  "end": {
                    "column": 18,
                    "line": 3,
                  },
                  "start": {
                    "column": 7,
                    "line": 3,
                  },
                },
                "text": "DefaultType",
                "typeArguments": [],
              },
            },
            "typeParameters": [
              {
                "constraintType": undefined,
                "defaultType": undefined,
                "kind": "TypeParameter",
                "name": "Types",
                "text": "Types",
              },
            ],
          },
        ],
        "text": "<Types>(this: Types extends { default: infer DefaultType; } ? DefaultType : never) => void",
      }
    `)
  })

  test.skip('includes moduleSpecifier for imported type references', () => {
    project.createSourceFile('foo.ts', `export type Foo = string;`)
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
      import type { Foo } from './foo';
      export type Ref = Foo;
      `,
      { overwrite: true }
    )
    const typeAlias = sourceFile.getTypeAliasOrThrow('Ref')
    const types = resolveType(typeAlias.getType(), typeAlias)

    console.log(types)

    // expect(resolved?.kind).toBe('TypeAlias')
    // const referencedType = resolved?.type

    // expect(referencedType).toMatchObject({
    //   kind: 'TypeReference',
    //   moduleSpecifier: './foo',
    // })
  })

  test('resolves variable component with generic parameters', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
      import * as React from "react";

      type Component<Props> = {
        (props: Props): React.ReactNode;
      };

      const Text: Component<{
        fontSize: number;
        fontWeight?: number;
      }> = function (props: any) {
        return <span />;
      }
      `,
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
            "column": 3,
            "line": 5,
          },
          "start": {
            "column": 1,
            "line": 3,
          },
        },
        "signatures": [
          {
            "filePath": "test.ts",
            "kind": "ComponentSignature",
            "parameter": {
              "description": undefined,
              "filePath": "test.ts",
              "initializer": undefined,
              "isOptional": false,
              "isRest": false,
              "kind": "Parameter",
              "name": "props",
              "position": {
                "end": {
                  "column": 16,
                  "line": 4,
                },
                "start": {
                  "column": 4,
                  "line": 4,
                },
              },
              "text": "props: Props",
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
                        "column": 20,
                        "line": 8,
                      },
                      "start": {
                        "column": 3,
                        "line": 8,
                      },
                    },
                    "text": "fontSize: number;",
                    "type": {
                      "filePath": "test.ts",
                      "kind": "Number",
                      "position": {
                        "end": {
                          "column": 19,
                          "line": 8,
                        },
                        "start": {
                          "column": 13,
                          "line": 8,
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
                        "column": 23,
                        "line": 9,
                      },
                      "start": {
                        "column": 3,
                        "line": 9,
                      },
                    },
                    "text": "fontWeight?: number;",
                    "type": {
                      "filePath": "test.ts",
                      "kind": "Number",
                      "position": {
                        "end": {
                          "column": 22,
                          "line": 9,
                        },
                        "start": {
                          "column": 16,
                          "line": 9,
                        },
                      },
                      "text": "number",
                      "value": undefined,
                    },
                  },
                ],
                "text": "{ fontSize: number; fontWeight?: number; }",
              },
            },
            "position": {
              "end": {
                "column": 35,
                "line": 4,
              },
              "start": {
                "column": 3,
                "line": 4,
              },
            },
            "returnType": {
              "filePath": "test.ts",
              "kind": "TypeReference",
              "moduleSpecifier": "react",
              "name": "React.ReactNode",
              "position": {
                "end": {
                  "column": 34,
                  "line": 4,
                },
                "start": {
                  "column": 19,
                  "line": 4,
                },
              },
              "text": "ReactNode",
              "typeArguments": [],
            },
            "text": "(props: Props) => ReactNode",
            "thisType": undefined,
          },
        ],
        "text": "Component<{ fontSize: number; fontWeight?: number; }>",
      }
    `)
  })

  test('resolves variable component with multiple signatures and generic parameters', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
      type PolyComponent<Props> = {
        <As = void, ForwardedAs = void>(
          props: Props & { as?: As; forwardedAs?: ForwardedAs }
        ): number;

        (props: Props): string;
      };

      const Text: PolyComponent<{
        fontSize: number;
        fontWeight?: number;
      }> = function (props: any) {
        return
      };
      `,
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
            "column": 3,
            "line": 7,
          },
          "start": {
            "column": 1,
            "line": 1,
          },
        },
        "signatures": [
          {
            "filePath": "test.ts",
            "kind": "ComponentSignature",
            "parameter": {
              "description": undefined,
              "filePath": "test.ts",
              "initializer": undefined,
              "isOptional": false,
              "isRest": false,
              "kind": "Parameter",
              "name": "props",
              "position": {
                "end": {
                  "column": 58,
                  "line": 3,
                },
                "start": {
                  "column": 5,
                  "line": 3,
                },
              },
              "text": "props: Props & { as?: As; forwardedAs?: ForwardedAs }",
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
                        "column": 20,
                        "line": 10,
                      },
                      "start": {
                        "column": 3,
                        "line": 10,
                      },
                    },
                    "text": "fontSize: number;",
                    "type": {
                      "filePath": "test.ts",
                      "kind": "Number",
                      "position": {
                        "end": {
                          "column": 19,
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
                  {
                    "filePath": "test.ts",
                    "isOptional": true,
                    "isReadonly": false,
                    "kind": "PropertySignature",
                    "name": "fontWeight",
                    "position": {
                      "end": {
                        "column": 23,
                        "line": 11,
                      },
                      "start": {
                        "column": 3,
                        "line": 11,
                      },
                    },
                    "text": "fontWeight?: number;",
                    "type": {
                      "filePath": "test.ts",
                      "kind": "Number",
                      "position": {
                        "end": {
                          "column": 22,
                          "line": 11,
                        },
                        "start": {
                          "column": 16,
                          "line": 11,
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
                    "name": "as",
                    "position": {
                      "end": {
                        "column": 30,
                        "line": 3,
                      },
                      "start": {
                        "column": 22,
                        "line": 3,
                      },
                    },
                    "text": "as?: As;",
                    "type": {
                      "filePath": "test.ts",
                      "kind": "TypeReference",
                      "moduleSpecifier": undefined,
                      "name": "As",
                      "position": {
                        "end": {
                          "column": 29,
                          "line": 3,
                        },
                        "start": {
                          "column": 27,
                          "line": 3,
                        },
                      },
                      "text": "As",
                      "typeArguments": [],
                    },
                  },
                  {
                    "filePath": "test.ts",
                    "isOptional": true,
                    "isReadonly": false,
                    "kind": "PropertySignature",
                    "name": "forwardedAs",
                    "position": {
                      "end": {
                        "column": 56,
                        "line": 3,
                      },
                      "start": {
                        "column": 31,
                        "line": 3,
                      },
                    },
                    "text": "forwardedAs?: ForwardedAs",
                    "type": {
                      "filePath": "test.ts",
                      "kind": "TypeReference",
                      "moduleSpecifier": undefined,
                      "name": "ForwardedAs",
                      "position": {
                        "end": {
                          "column": 56,
                          "line": 3,
                        },
                        "start": {
                          "column": 45,
                          "line": 3,
                        },
                      },
                      "text": "ForwardedAs",
                      "typeArguments": [],
                    },
                  },
                ],
                "text": "{ fontSize: number; fontWeight?: number; } & { as?: As; forwardedAs?: ForwardedAs; }",
              },
            },
            "position": {
              "end": {
                "column": 13,
                "line": 4,
              },
              "start": {
                "column": 3,
                "line": 2,
              },
            },
            "returnType": {
              "filePath": "test.ts",
              "kind": "Number",
              "position": {
                "end": {
                  "column": 12,
                  "line": 4,
                },
                "start": {
                  "column": 6,
                  "line": 4,
                },
              },
              "text": "number",
              "value": undefined,
            },
            "text": "<As, ForwardedAs>(props: Props & { as?: As; forwardedAs?: ForwardedAs }) => number",
            "thisType": undefined,
            "typeParameters": [
              {
                "constraintType": undefined,
                "defaultType": {
                  "filePath": "test.ts",
                  "kind": "Void",
                  "position": {
                    "end": {
                      "column": 13,
                      "line": 2,
                    },
                    "start": {
                      "column": 9,
                      "line": 2,
                    },
                  },
                  "text": "void",
                },
                "kind": "TypeParameter",
                "name": "As",
                "text": "As = void",
              },
              {
                "constraintType": undefined,
                "defaultType": {
                  "filePath": "test.ts",
                  "kind": "Void",
                  "position": {
                    "end": {
                      "column": 33,
                      "line": 2,
                    },
                    "start": {
                      "column": 29,
                      "line": 2,
                    },
                  },
                  "text": "void",
                },
                "kind": "TypeParameter",
                "name": "ForwardedAs",
                "text": "ForwardedAs = void",
              },
            ],
          },
          {
            "filePath": "test.ts",
            "kind": "ComponentSignature",
            "parameter": {
              "description": undefined,
              "filePath": "test.ts",
              "initializer": undefined,
              "isOptional": false,
              "isRest": false,
              "kind": "Parameter",
              "name": "props",
              "position": {
                "end": {
                  "column": 16,
                  "line": 6,
                },
                "start": {
                  "column": 4,
                  "line": 6,
                },
              },
              "text": "props: Props",
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
                        "column": 20,
                        "line": 10,
                      },
                      "start": {
                        "column": 3,
                        "line": 10,
                      },
                    },
                    "text": "fontSize: number;",
                    "type": {
                      "filePath": "test.ts",
                      "kind": "Number",
                      "position": {
                        "end": {
                          "column": 19,
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
                  {
                    "filePath": "test.ts",
                    "isOptional": true,
                    "isReadonly": false,
                    "kind": "PropertySignature",
                    "name": "fontWeight",
                    "position": {
                      "end": {
                        "column": 23,
                        "line": 11,
                      },
                      "start": {
                        "column": 3,
                        "line": 11,
                      },
                    },
                    "text": "fontWeight?: number;",
                    "type": {
                      "filePath": "test.ts",
                      "kind": "Number",
                      "position": {
                        "end": {
                          "column": 22,
                          "line": 11,
                        },
                        "start": {
                          "column": 16,
                          "line": 11,
                        },
                      },
                      "text": "number",
                      "value": undefined,
                    },
                  },
                ],
                "text": "{ fontSize: number; fontWeight?: number; }",
              },
            },
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
            "returnType": {
              "filePath": "test.ts",
              "kind": "String",
              "position": {
                "end": {
                  "column": 25,
                  "line": 6,
                },
                "start": {
                  "column": 19,
                  "line": 6,
                },
              },
              "text": "string",
              "value": undefined,
            },
            "text": "(props: Props) => string",
            "thisType": undefined,
          },
        ],
        "text": "PolyComponent<{ fontSize: number; fontWeight?: number; }>",
      }
    `)
  })

  test('namespace', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
      namespace Kind {
        export interface Shared {
          text: string
        }
      }
      `,
      { overwrite: true }
    )
    const moduleDeclaration = sourceFile.getModuleOrThrow('Kind')
    const type = resolveType(moduleDeclaration.getType(), moduleDeclaration)

    expect(type).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "Namespace",
        "name": "Kind",
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
        "text": "any",
        "types": [
          {
            "filePath": "test.ts",
            "kind": "Interface",
            "members": [
              {
                "filePath": "test.ts",
                "isOptional": false,
                "isReadonly": false,
                "kind": "PropertySignature",
                "name": "text",
                "position": {
                  "end": {
                    "column": 17,
                    "line": 3,
                  },
                  "start": {
                    "column": 5,
                    "line": 3,
                  },
                },
                "text": "text: string",
                "type": {
                  "filePath": "test.ts",
                  "kind": "String",
                  "position": {
                    "end": {
                      "column": 17,
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
            ],
            "name": "Shared",
            "position": {
              "end": {
                "column": 4,
                "line": 4,
              },
              "start": {
                "column": 3,
                "line": 2,
              },
            },
            "text": "Shared",
            "typeParameters": [],
          },
        ],
      }
    `)
  })

  test('namespace alias', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
      export namespace Kind {
        export interface Shared {
          text: string
        }
      }

      type SharedKind = Kind.Shared
      `,
      { overwrite: true }
    )
    const typeAlias = sourceFile.getTypeAliasOrThrow('SharedKind')
    const type = resolveType(typeAlias.getType(), typeAlias)

    expect(type).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "TypeAlias",
        "name": "SharedKind",
        "position": {
          "end": {
            "column": 4,
            "line": 4,
          },
          "start": {
            "column": 3,
            "line": 2,
          },
        },
        "text": "Kind.Shared",
        "type": {
          "filePath": "test.ts",
          "kind": "TypeReference",
          "moduleSpecifier": undefined,
          "name": "Kind.Shared",
          "position": {
            "end": {
              "column": 30,
              "line": 7,
            },
            "start": {
              "column": 19,
              "line": 7,
            },
          },
          "text": "Shared",
          "typeArguments": [],
        },
        "typeParameters": [],
      }
    `)
  })

  test('class constructor with type parameters', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
      class Foo<Type extends string> {
        constructor() {}
      }
      `,
      { overwrite: true }
    )
    const declaration = sourceFile.getClassOrThrow('Foo')
    const type = resolveType(declaration.getType(), declaration)

    expect(type).toMatchInlineSnapshot(`
      {
        "constructor": {
          "filePath": "test.ts",
          "kind": "ClassConstructor",
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
          "signatures": [
            {
              "filePath": "test.ts",
              "kind": "CallSignature",
              "parameters": [],
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
              "returnType": {
                "filePath": "test.ts",
                "kind": "TypeReference",
                "name": "Foo",
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
                "text": "Foo<Type>",
                "typeArguments": [
                  {
                    "filePath": "test.ts",
                    "kind": "TypeReference",
                    "name": "Type",
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
                    "text": "Type",
                    "typeArguments": [],
                  },
                ],
              },
              "text": "<Type extends string>() => Foo<Type>",
              "thisType": undefined,
              "typeParameters": [
                {
                  "constraintType": {
                    "filePath": "test.ts",
                    "kind": "String",
                    "position": {
                      "end": {
                        "column": 30,
                        "line": 1,
                      },
                      "start": {
                        "column": 24,
                        "line": 1,
                      },
                    },
                    "text": "string",
                    "value": undefined,
                  },
                  "defaultType": undefined,
                  "kind": "TypeParameter",
                  "name": "Type",
                  "text": "Type extends string",
                },
              ],
            },
          ],
          "text": "constructor() {}",
        },
        "filePath": "test.ts",
        "kind": "Class",
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
        "text": "Foo<Type>",
      }
    `)
  })

  test('synthetic indexed access type', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
      class FileSystem<Types extends Record<string, any>> {
        getExport<Name extends Extract<keyof Types, string>>(
          name: Name
        ): Types[Name] {
          return undefined as any
        }

        getExports() {
          return this.getExport('' as Extract<keyof Types, string>)
        }
      }
      `,
      { overwrite: true }
    )
    const declaration = sourceFile
      .getClassOrThrow('FileSystem')
      .getInstanceMethodOrThrow('getExports')
    const type = resolveType(declaration.getType(), declaration)

    expect(type).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "Function",
        "name": "getExports",
        "position": {
          "end": {
            "column": 4,
            "line": 10,
          },
          "start": {
            "column": 3,
            "line": 8,
          },
        },
        "signatures": [
          {
            "filePath": "test.ts",
            "isAsync": false,
            "isGenerator": false,
            "kind": "CallSignature",
            "parameters": [],
            "position": {
              "end": {
                "column": 4,
                "line": 10,
              },
              "start": {
                "column": 3,
                "line": 8,
              },
            },
            "returnType": {
              "indexType": {
                "checkType": {
                  "kind": "TypeOperator",
                  "operator": "keyof",
                  "text": "keyof Types",
                  "type": {
                    "filePath": "test.ts",
                    "kind": "TypeReference",
                    "name": "Types",
                    "position": {
                      "end": {
                        "column": 4,
                        "line": 10,
                      },
                      "start": {
                        "column": 3,
                        "line": 8,
                      },
                    },
                    "text": "Types",
                    "typeArguments": [],
                  },
                },
                "extendsType": {
                  "filePath": "test.ts",
                  "kind": "String",
                  "position": {
                    "end": {
                      "column": 4,
                      "line": 10,
                    },
                    "start": {
                      "column": 3,
                      "line": 8,
                    },
                  },
                  "text": "string",
                  "value": undefined,
                },
                "falseType": {
                  "filePath": "test.ts",
                  "kind": "Never",
                  "position": {
                    "end": {
                      "column": 4,
                      "line": 10,
                    },
                    "start": {
                      "column": 3,
                      "line": 8,
                    },
                  },
                  "text": "never",
                },
                "isDistributive": false,
                "kind": "ConditionalType",
                "text": "Extract<keyof Types, string>",
                "trueType": {
                  "kind": "IntersectionType",
                  "text": "string & keyof Types",
                  "types": [
                    {
                      "kind": "String",
                      "text": "string",
                      "value": undefined,
                    },
                    {
                      "kind": "TypeOperator",
                      "operator": "keyof",
                      "text": "keyof Types",
                      "type": {
                        "kind": "TypeReference",
                        "name": "Types",
                        "text": "Types",
                        "typeArguments": [],
                      },
                    },
                  ],
                },
              },
              "kind": "IndexedAccessType",
              "objectType": {
                "filePath": "test.ts",
                "kind": "TypeReference",
                "name": "Types",
                "position": {
                  "end": {
                    "column": 4,
                    "line": 10,
                  },
                  "start": {
                    "column": 3,
                    "line": 8,
                  },
                },
                "text": "Types",
                "typeArguments": [],
              },
              "text": "Types[Extract<keyof Types, string>]",
            },
            "text": "() => Types[Extract<keyof Types, string>]",
            "thisType": undefined,
          },
        ],
        "text": "() => Types[Extract<keyof Types, string>]",
      }
    `)
  })

  test('synthetic recursive return type', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
      interface UnionType<Types> {
        types: Types
      }

      type TypeExpression = UnionType<TypeExpression>

      function resolveTypeAtLocation() {
        return undefined as unknown as UnionType<TypeExpression>
      }
      `,
      { overwrite: true }
    )
    const declaration = sourceFile.getFunctionOrThrow('resolveTypeAtLocation')
    const types = resolveType(declaration.getType(), declaration)

    expect(types).toMatchInlineSnapshot(`
      {
        "filePath": "test.ts",
        "kind": "Function",
        "name": "resolveTypeAtLocation",
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
        "signatures": [
          {
            "filePath": "test.ts",
            "isAsync": false,
            "isGenerator": false,
            "kind": "CallSignature",
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
            "returnType": {
              "filePath": "test.ts",
              "kind": "TypeReference",
              "name": "UnionType",
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
              "text": "UnionType<TypeExpression>",
              "typeArguments": [
                {
                  "filePath": "test.ts",
                  "kind": "TypeReference",
                  "name": "TypeExpression",
                  "position": {
                    "end": {
                      "column": 48,
                      "line": 5,
                    },
                    "start": {
                      "column": 1,
                      "line": 5,
                    },
                  },
                  "text": "TypeExpression",
                  "typeArguments": [],
                },
              ],
            },
            "text": "function resolveTypeAtLocation(): UnionType<TypeExpression>",
            "thisType": undefined,
          },
        ],
        "text": "() => UnionType<TypeExpression>",
      }
    `)
  })

  test('synthetic return type union types', () => {
    const project = new Project({
      compilerOptions: { strict: true },
      useInMemoryFileSystem: true,
    })
    const sourceFile = project.createSourceFile(
      'index.ts',
      `
      type Base  = 'a' | 'b';
      type Union = Base | 'c';

      function foo() {
        return 'd' as Union | 'd';
      }
    `,
      { overwrite: true }
    )
    const foo = sourceFile.getFunctionOrThrow('foo')
    const types = resolveType(foo.getType(), foo)

    expect(types).toMatchInlineSnapshot(`
      {
        "filePath": "index.ts",
        "kind": "Function",
        "name": "foo",
        "position": {
          "end": {
            "column": 8,
            "line": 7,
          },
          "start": {
            "column": 7,
            "line": 5,
          },
        },
        "signatures": [
          {
            "filePath": "index.ts",
            "isAsync": false,
            "isGenerator": false,
            "kind": "CallSignature",
            "parameters": [],
            "position": {
              "end": {
                "column": 8,
                "line": 7,
              },
              "start": {
                "column": 7,
                "line": 5,
              },
            },
            "returnType": {
              "kind": "UnionType",
              "text": ""d" | Union",
              "types": [
                {
                  "kind": "String",
                  "text": ""d"",
                  "value": "d",
                },
                {
                  "filePath": "index.ts",
                  "kind": "TypeReference",
                  "name": "Union",
                  "position": {
                    "end": {
                      "column": 31,
                      "line": 3,
                    },
                    "start": {
                      "column": 7,
                      "line": 3,
                    },
                  },
                  "text": "Union",
                  "typeArguments": [],
                },
              ],
            },
            "text": "function foo(): "d" | Union",
            "thisType": undefined,
          },
        ],
        "text": "() => Union | "d"",
      }
    `)
  })

  test('skips private class properties', () => {
    const sourceFile = project.createSourceFile(
      'index.ts',
      dedent`
      class Foo {
        #private = ''
      }
      `,
      { overwrite: true }
    )
    const declaration = sourceFile.getClassOrThrow('Foo')
    const types = resolveType(declaration.getType(), declaration)

    expect(types).toMatchInlineSnapshot(`
      {
        "constructor": undefined,
        "filePath": "index.ts",
        "kind": "Class",
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
        "text": "Foo",
      }
    `)
  })

  test('does not continue resolving mapped type with references', () => {
    const sourceFile = project.createSourceFile(
      'index.ts',
      dedent`
      export type ReferenceComponent<
        Tag extends keyof React.JSX.IntrinsicElements,
        Props = {},
      > = React.ComponentType<React.JSX.IntrinsicElements[Tag] & Props>

      export interface ReferenceComponents {
        Section: ReferenceComponent<'section'>
      }
      `,
      { overwrite: true }
    )
    const typeAlias = sourceFile.getInterfaceOrThrow('ReferenceComponents')
    const type = resolveType(typeAlias.getType(), typeAlias)

    expect(type).toMatchInlineSnapshot(`
      {
        "filePath": "index.ts",
        "kind": "Interface",
        "members": [
          {
            "filePath": "index.ts",
            "isOptional": false,
            "isReadonly": false,
            "kind": "PropertySignature",
            "name": "Section",
            "position": {
              "end": {
                "column": 41,
                "line": 7,
              },
              "start": {
                "column": 3,
                "line": 7,
              },
            },
            "text": "Section: ReferenceComponent<'section'>",
            "type": {
              "filePath": "index.ts",
              "kind": "TypeReference",
              "moduleSpecifier": undefined,
              "name": "ReferenceComponent",
              "position": {
                "end": {
                  "column": 41,
                  "line": 7,
                },
                "start": {
                  "column": 12,
                  "line": 7,
                },
              },
              "text": "ReferenceComponent<"section", {}>",
              "typeArguments": [
                {
                  "filePath": "index.ts",
                  "kind": "String",
                  "position": {
                    "end": {
                      "column": 40,
                      "line": 7,
                    },
                    "start": {
                      "column": 31,
                      "line": 7,
                    },
                  },
                  "text": ""section"",
                  "value": "section",
                },
              ],
            },
          },
        ],
        "name": "ReferenceComponents",
        "position": {
          "end": {
            "column": 2,
            "line": 8,
          },
          "start": {
            "column": 1,
            "line": 6,
          },
        },
        "text": "ReferenceComponents",
        "typeParameters": [],
      }
    `)
  })

  test('type literal call signatures', () => {
    const sourceFile = project.createSourceFile(
      'index.ts',
      dedent`
      type WithSchema = {
        (runtime: any): any
        (schema: any, runtime: any): any
      }
      `,
      { overwrite: true }
    )
    const typeAlias = sourceFile.getTypeAliasOrThrow('WithSchema')
    const type = resolveType(typeAlias.getType(), typeAlias)

    expect(type).toMatchInlineSnapshot(`
      {
        "filePath": "index.ts",
        "kind": "TypeAlias",
        "name": "WithSchema",
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
        "text": "WithSchema",
        "type": {
          "kind": "TypeLiteral",
          "members": [
            {
              "filePath": "index.ts",
              "kind": "CallSignature",
              "parameters": [
                {
                  "description": undefined,
                  "filePath": "index.ts",
                  "initializer": undefined,
                  "isOptional": false,
                  "isRest": false,
                  "kind": "Parameter",
                  "name": "runtime",
                  "position": {
                    "end": {
                      "column": 16,
                      "line": 2,
                    },
                    "start": {
                      "column": 4,
                      "line": 2,
                    },
                  },
                  "text": "runtime: any",
                  "type": {
                    "filePath": "index.ts",
                    "kind": "Any",
                    "position": {
                      "end": {
                        "column": 16,
                        "line": 2,
                      },
                      "start": {
                        "column": 13,
                        "line": 2,
                      },
                    },
                    "text": "any",
                  },
                },
              ],
              "position": {
                "end": {
                  "column": 22,
                  "line": 2,
                },
                "start": {
                  "column": 3,
                  "line": 2,
                },
              },
              "returnType": {
                "filePath": "index.ts",
                "kind": "Any",
                "position": {
                  "end": {
                    "column": 22,
                    "line": 2,
                  },
                  "start": {
                    "column": 3,
                    "line": 2,
                  },
                },
                "text": "any",
              },
              "text": "(runtime: any): any",
              "thisType": undefined,
            },
            {
              "filePath": "index.ts",
              "kind": "CallSignature",
              "parameters": [
                {
                  "description": undefined,
                  "filePath": "index.ts",
                  "initializer": undefined,
                  "isOptional": false,
                  "isRest": false,
                  "kind": "Parameter",
                  "name": "schema",
                  "position": {
                    "end": {
                      "column": 15,
                      "line": 3,
                    },
                    "start": {
                      "column": 4,
                      "line": 3,
                    },
                  },
                  "text": "schema: any",
                  "type": {
                    "filePath": "index.ts",
                    "kind": "Any",
                    "position": {
                      "end": {
                        "column": 15,
                        "line": 3,
                      },
                      "start": {
                        "column": 12,
                        "line": 3,
                      },
                    },
                    "text": "any",
                  },
                },
                {
                  "description": undefined,
                  "filePath": "index.ts",
                  "initializer": undefined,
                  "isOptional": false,
                  "isRest": false,
                  "kind": "Parameter",
                  "name": "runtime",
                  "position": {
                    "end": {
                      "column": 29,
                      "line": 3,
                    },
                    "start": {
                      "column": 17,
                      "line": 3,
                    },
                  },
                  "text": "runtime: any",
                  "type": {
                    "filePath": "index.ts",
                    "kind": "Any",
                    "position": {
                      "end": {
                        "column": 29,
                        "line": 3,
                      },
                      "start": {
                        "column": 26,
                        "line": 3,
                      },
                    },
                    "text": "any",
                  },
                },
              ],
              "position": {
                "end": {
                  "column": 35,
                  "line": 3,
                },
                "start": {
                  "column": 3,
                  "line": 3,
                },
              },
              "returnType": {
                "filePath": "index.ts",
                "kind": "Any",
                "position": {
                  "end": {
                    "column": 35,
                    "line": 3,
                  },
                  "start": {
                    "column": 3,
                    "line": 3,
                  },
                },
                "text": "any",
              },
              "text": "(schema: any, runtime: any): any",
              "thisType": undefined,
            },
          ],
          "text": "WithSchema",
        },
        "typeParameters": [],
      }
    `)
  })

  test('does not continue resolving node_module types in union', () => {
    const sourceFile = project.createSourceFile(
      'index.ts',
      dedent`
      class Foo {
        getToday(): Date | undefined {
          return undefined
        }
      }
      `,
      { overwrite: true }
    )
    const classDeclaration = sourceFile.getClassOrThrow('Foo')
    const type = resolveType(classDeclaration.getType(), classDeclaration)

    expect(type).toMatchInlineSnapshot(`
      {
        "constructor": undefined,
        "filePath": "index.ts",
        "kind": "Class",
        "methods": [
          {
            "kind": "ClassMethod",
            "name": "getToday",
            "scope": undefined,
            "signatures": [
              {
                "filePath": "index.ts",
                "isAsync": false,
                "isGenerator": false,
                "kind": "CallSignature",
                "parameters": [],
                "position": {
                  "end": {
                    "column": 4,
                    "line": 4,
                  },
                  "start": {
                    "column": 3,
                    "line": 2,
                  },
                },
                "returnType": {
                  "filePath": "index.ts",
                  "kind": "TypeReference",
                  "name": "Date",
                  "position": {
                    "end": {
                      "column": 31,
                      "line": 2,
                    },
                    "start": {
                      "column": 15,
                      "line": 2,
                    },
                  },
                  "text": "Date",
                  "typeArguments": [],
                },
                "text": "() => Date",
                "thisType": undefined,
              },
            ],
            "text": "() => Date | undefined",
            "visibility": undefined,
          },
        ],
        "name": "Foo",
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
        "text": "Foo",
      }
    `)
  })

  test('does not continue resolving synthetic node_module types', () => {
    const sourceFile = project.createSourceFile(
      'index.ts',
      dedent`
      function getToday() {
        return undefined as Date
      }
      `,
      { overwrite: true }
    )
    const declaration = sourceFile.getFunctionOrThrow('getToday')
    const type = resolveType(declaration.getType(), declaration)

    expect(type).toMatchInlineSnapshot(`
      {
        "filePath": "index.ts",
        "kind": "Function",
        "name": "getToday",
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
            "filePath": "index.ts",
            "isAsync": false,
            "isGenerator": false,
            "kind": "CallSignature",
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
              "filePath": "index.ts",
              "kind": "TypeReference",
              "name": "Date",
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
              "text": "Date",
              "typeArguments": [],
            },
            "text": "function getToday(): Date",
            "thisType": undefined,
          },
        ],
        "text": "() => Date",
      }
    `)
  })
})
