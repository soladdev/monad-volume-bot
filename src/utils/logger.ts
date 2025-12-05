import chalk from 'chalk';
import boxen from 'boxen';

export class Logger {
  static success(message: string): void {
    console.log(chalk.green('✔ ' + message));
  }

  static error(message: string): void {
    console.log(chalk.red('✖ ' + message));
  }

  static info(message: string): void {
    console.log(chalk.cyan('ℹ ' + message));
  }

  static warning(message: string): void {
    console.log(chalk.yellow('⚠ ' + message));
  }

  static header(message: string): void {
    console.log(
      boxen(chalk.bold.magenta(message), {
        padding: 1,
        margin: 1,
        borderStyle: 'double',
        borderColor: 'magenta',
      })
    );
  }

  static section(message: string): void {
    console.log('\n' + chalk.bold.cyan('═══ ' + message + ' ═══') + '\n');
  }

  static address(label: string, address: string): void {
    console.log(chalk.gray(label + ': ') + chalk.yellow(address));
  }

  static balance(label: string, balance: string): void {
    console.log(chalk.gray(label + ': ') + chalk.green(balance + ' MONAD'));
  }

  static divider(): void {
    console.log(chalk.gray('─'.repeat(60)));
  }
}
