import { stdin, stdout } from 'node:process'
import { createInterface } from 'node:readline/promises'
import chalk from 'chalk'

export class Log {
  static base = 'renoun: '

  static offset = Log.base.replace(/./g, ' ')

  static info(message: string) {
    const finalMessage = chalk.rgb(205, 237, 255).bold(Log.base) + message
    console.log(finalMessage.replace(/\n/g, `\n${Log.offset}`))
  }

  static error(message: string) {
    const finalMessage =
      chalk.rgb(237, 35, 0).bold(Log.base) + chalk.rgb(225, 205, 205)(message)
    console.error(finalMessage.replace(/\n/g, `\n${Log.offset}`))
  }

  static success(message: string) {
    const finalMessage = chalk.rgb(0, 204, 102).bold(Log.base) + message
    console.log(finalMessage.replace(/\n/g, `\n${Log.offset}`))
  }

  static warning(message: string) {
    console.warn(
      chalk.rgb(255, 153, 51).bold(Log.base) + chalk.rgb(225, 200, 190)(message)
    )
  }
}

export async function askQuestion(question: string) {
  const readline = createInterface({
    input: stdin,
    output: stdout,
    terminal: true,
  })
  const answer = await readline.question(
    `${chalk.rgb(205, 237, 255).bold(Log.base)}${question}`
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
