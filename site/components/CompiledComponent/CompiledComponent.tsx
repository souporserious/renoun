import * as React from 'react'
import { getComponent } from './utils'

/**
 * Execute a string of code and return the default export.
 * Supports TypeScript and JSX syntax.
 *
 * @example
 *
 * import { CompiledComponent } from 'components'
 *
 * export default function Example() {
 *   const codeString = `exports.default = () => require('react').createElement('div', null, 'Hello World')`
 *   return <CompiledComponent codeString={codeString} />
 * }
 */
export class CompiledComponent extends React.Component<{ codeString: string }> {
  state = {
    component: this.props.codeString
      ? getComponent(this.props.codeString)
      : null,
  }

  componentDidUpdate(prevProps) {
    const { codeString } = this.props
    if (prevProps.codeString !== codeString) {
      this.setState({
        component: codeString ? getComponent(codeString) : null,
      })
    }
  }

  render() {
    return this.state.component
      ? React.createElement(this.state.component)
      : null
  }
}
