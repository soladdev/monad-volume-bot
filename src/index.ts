import inquirer from 'inquirer';
import chalk from 'chalk';
import boxen from 'boxen';
import { config, validateConfig } from './config';
import { WalletService } from './services/wallet.service';
import { Logger } from './utils/logger';


class MonadVolumeBot {
  private walletService: WalletService;

  constructor() {
    this.walletService = new WalletService();
  }

  async displayWelcome(): Promise<void> {
    console.clear();
    console.log(
      boxen(
        chalk.cyan.bold(' MONAD VOLUME BOT \n\n') +
        chalk.gray('Made by ') + chalk.magenta.bold('Vladmeer\n'),
        {
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'cyan',
          textAlignment: 'center',
        }
      )
    );
    
    // Get and display master wallet balance
    const masterBalance = await this.walletService.getMasterBalance();
    console.log(chalk.green(`Master Wallet: ${masterBalance.address}`));
    console.log(chalk.yellow(`Balance: ${masterBalance.balance} MONAD\n`));
  }

  async showMainMenu(): Promise<void> {
    const choices = [
      {
        name: chalk.cyan('Generate Accounts'),
        value: 'generate',
      },
      {
        name: chalk.cyan('View Balances'),
        value: 'balances',
      },
      {
        name: chalk.cyan('Fund Accounts'),
        value: 'fund',
      },
      {
        name: chalk.cyan('Run Volume Bot'),
        value: 'run_volume_bot',
      },
      {
        name: chalk.cyan('Refund to Master'),
        value: 'refund',
      },
      new inquirer.Separator(),
      {
        name: chalk.cyan('Exit Application'),
        value: 'exit',
      },
    ];

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: chalk.bold('Select an action:'),
        choices,
        pageSize: 15,
      },
    ]);

    await this.handleAction(action);
  }

  async handleAction(action: string): Promise<void> {
    console.log('\n');

    switch (action) {
      case 'generate':
        await this.walletService.generateAccounts();
        break;
      case 'balances':
        await this.walletService.viewBalances();
        break;
      case 'fund':
        await this.walletService.fundAccounts();
        break;
      case 'run_volume_bot':
        await this.walletService.runVolumeBot();
        break;
      case 'refund':
        await this.walletService.refundToMaster();
        break;
      case 'exit':
        console.log(
          boxen(chalk.cyan.bold('👋 Thank you for using Monad Volume Bot!'), {
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'cyan',
          } as any)
        );
        process.exit(0);
        return;
    }

    // Return to main menu
    console.log('\n');
    await inquirer.prompt([
      {
        type: 'input',
        name: 'continue',
        message: chalk.gray('Press Enter to continue...'),
      },
    ]);

    await this.start();
  }

  async start(): Promise<void> {
    await this.displayWelcome();
    await this.showMainMenu();
  }
}

async function main() {
  try {
    // Validate configuration
    if (!validateConfig()) {
      console.log(
        boxen(
          chalk.red.bold('⚠️  Configuration Error!\n\n') +
            chalk.yellow(
              'Please set your MASTER_PRIVATE_KEY in src/config.ts'
            ),
          {
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'red',
          } as any
        )
      );
      process.exit(1);
    }

    const volumeBot = new MonadVolumeBot();
    await volumeBot.start();
  } catch (error: any) {
    console.error(chalk.red('\n❌ Fatal Error:'), error.message);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log(
    chalk.cyan('\n\n👋 Shutting down gracefully... Goodbye!')
  );
  process.exit(0);
});

main();

