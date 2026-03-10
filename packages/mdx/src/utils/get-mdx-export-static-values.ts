import type { Node } from 'estree'
import { createProcessor } from '@mdx-js/mdx'
import { visit } from 'unist-util-visit'

import { safeAssign } from './safe-assign.js'

let processor: ReturnType<typeof createProcessor>

/** Parse MDX source text and return a map of export names to their static literal values. */
export function getMDXExportStaticValues(source: string): Map<string, unknown> {
  if (!processor) {
    processor = createProcessor()
  }

  const tree = processor.parse(source)
  const scope = new Map<string, any>()
  const result = new Map<string, unknown>()

  visit(tree, 'mdxjsEsm', (node) => {
    const program = node.data?.estree
    if (!program) {
      return
    }

    for (const statement of program.body) {
      if (statement.type === 'VariableDeclaration') {
        for (const declarator of statement.declarations) {
          if (declarator.id.type === 'Identifier' && declarator.init) {
            const value = evaluate(declarator.init, scope)
            scope.set(declarator.id.name, value)
          }
        }
      } else if (statement.type === 'ExportNamedDeclaration') {
        if (
          statement.declaration &&
          statement.declaration.type === 'VariableDeclaration'
        ) {
          for (const declarator of statement.declaration.declarations) {
            if (declarator.id.type === 'Identifier' && declarator.init) {
              const value = evaluate(declarator.init, scope)
              scope.set(declarator.id.name, value)
              result.set(declarator.id.name, value)
            }
          }
        } else if (statement.specifiers) {
          for (const specifier of statement.specifiers) {
            if (
              specifier.exported.type === 'Identifier' &&
              specifier.local.type === 'Identifier'
            ) {
              const exported = specifier.exported.name
              result.set(exported, scope.get(specifier.local.name))
            } else if (
              specifier.exported.type === 'Literal' &&
              specifier.local.type === 'Identifier'
            ) {
              result.set(
                String(specifier.exported.value),
                scope.get(specifier.local.name)
              )
            }
          }
        }
      }
    }
  })

  return result
}

/** Evaluate an MDX expression node in the given scope. */
function evaluate(node: Node, scope: Map<string, any>): any {
  if (!node) {
    return undefined
  }

  switch (node.type) {
    case 'Literal':
      return node.value
    case 'Identifier':
      return scope.get(node.name)
    case 'ArrayExpression':
      const result: unknown[] = []
      for (const element of node.elements) {
        if (element === null) {
          continue
        }
        if (element.type === 'SpreadElement') {
          const spread = evaluate(element.argument, scope)
          if (Array.isArray(spread)) {
            const startIndex = result.length
            const spreadLength = spread.length
            result.length = startIndex + spreadLength
            for (
              let spreadIndex = 0;
              spreadIndex < spreadLength;
              ++spreadIndex
            ) {
              result[startIndex + spreadIndex] = spread[spreadIndex]
            }
          } else {
            result.push(spread)
          }
        } else {
          result.push(evaluate(element, scope))
        }
      }
      return result
    case 'ObjectExpression':
      const object: Record<string, any> = {}
      for (const prop of node.properties) {
        if (prop.type === 'Property') {
          if (prop.key.type === 'Identifier') {
            object[prop.key.name] = evaluate(prop.value, scope)
          } else if (prop.key.type === 'Literal') {
            const key = String(prop.key.value)
            object[key] = evaluate(prop.value, scope)
          }
        } else if (prop.type === 'SpreadElement') {
          safeAssign(object, evaluate(prop.argument, scope))
        }
      }
      return object
    case 'UnaryExpression':
      const argument = evaluate(node.argument, scope)
      switch (node.operator) {
        case '+':
          return +argument
        case '-':
          return -argument
        case '!':
          return !argument
        case '~':
          return ~argument
        case 'void':
          return void argument
        case 'typeof':
          return typeof argument
        default:
          return undefined
      }
    case 'BinaryExpression': {
      const left = evaluate(node.left, scope)
      const right = evaluate(node.right, scope)

      switch (node.operator) {
        case '+':
          return left + right
        case '-':
          return left - right
        case '*':
          return left * right
        case '/':
          return left / right
        case '%':
          return left % right
        case '**':
          return left ** right
        case '==':
          return left == right
        case '!=':
          return left != right
        case '===':
          return left === right
        case '!==':
          return left !== right
        case '<':
          return left < right
        case '>':
          return left > right
        case '<=':
          return left <= right
        case '>=':
          return left >= right
        case '<<':
          return left << right
        case '>>':
          return left >> right
        case '>>>':
          return left >>> right
        case '&':
          return left & right
        case '|':
          return left | right
        case '^':
          return left ^ right
        case 'in':
          return left in right
        case 'instanceof':
          return left instanceof right
        default:
          return undefined
      }
    }
    case 'TemplateLiteral':
      let string = ''
      for (let index = 0; index < node.quasis.length; index++) {
        string += node.quasis[index].value.cooked ?? ''
        if (index < node.expressions.length) {
          const value = evaluate(node.expressions[index], scope)
          string += value === undefined ? '' : String(value)
        }
      }
      return string
    case 'LogicalExpression': {
      const left = evaluate(node.left, scope)
      const right = evaluate(node.right, scope)
      switch (node.operator) {
        case '&&':
          return left && right
        case '||':
          return left || right
        default:
          return undefined
      }
    }
    case 'ConditionalExpression': {
      const test = evaluate(node.test, scope)
      const consequent = evaluate(node.consequent, scope)
      const alternate = evaluate(node.alternate, scope)
      return test ? consequent : alternate
    }
    case 'NewExpression':
      if (node.callee.type === 'Identifier' && node.callee.name === 'Date') {
        const args = (node.arguments ?? []).map((argument): unknown => {
          if (!argument) {
            return undefined
          }

          if (argument.type === 'SpreadElement') {
            return evaluate(argument.argument as Node, scope)
          }

          return evaluate(argument as Node, scope)
        })

        // Guard against non-primitive args to avoid evaluating arbitrary objects.
        if (
          args.some((arg: unknown) => {
            return (
              arg !== null && typeof arg === 'object' && !(arg instanceof Date)
            )
          })
        )
          return undefined

        try {
          // Support new Date(), new Date(ms), new Date(string), new Date(y, m, d, ...)
          return new (Date as any)(...args)
        } catch {
          return undefined
        }
      }
      return undefined
    default:
      return undefined
  }
}
