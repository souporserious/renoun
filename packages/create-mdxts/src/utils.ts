import { stdin, stdout } from 'node:process'
import { createInterface } from 'node:readline/promises'
import chalk from 'chalk'

export class Log {
  static info(message: string) {
    console.log(chalk.rgb(205, 237, 255).bold('mdxts: ') + message)
  }

  static error(message: string) {
    console.error(
      chalk.rgb(237, 35, 0).bold('mdxts: ') + chalk.rgb(225, 205, 205)(message)
    )
  }

  static success(message: string) {
    console.log(chalk.rgb(0, 204, 102).bold('mdxts: ') + message)
  }

  static warning(message: string) {
    console.warn(
      chalk.rgb(255, 153, 51).bold('mdxts: ') +
        chalk.rgb(225, 200, 190)(message)
    )
  }
}

export async function askQuestion(question: string) {
  const readline = createInterface({ input: stdin, output: stdout })
  const answer = await readline.question(
    `${chalk.rgb(205, 237, 255).bold('mdxts: ')}${question}`
  )
  readline.close()
  return answer
}

export async function askYesNo(
  question: string,
  {
    defaultYes = true,
    description,
  }: {
    defaultYes?: boolean
    description?: string
  } = {}
) {
  const answer = await askQuestion(
    `${question} [${defaultYes ? 'Y/n' : 'y/N'}] ${
      description ? chalk.dim(description) : ''
    }`
  )
  return answer === '' ? defaultYes : answer.toLowerCase().startsWith('y')
}
