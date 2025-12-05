import { ethers } from 'ethers';
import inquirer from 'inquirer';
import { WalletsData, WalletInfo } from '../types';
import { StorageManager } from '../utils/storage';
import { Logger } from '../utils/logger';
import { config } from '../config';
import ora from 'ora';

export class WalletService {
  private provider: ethers.JsonRpcProvider;
  private masterWallet: ethers.Wallet;

  constructor() {
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    this.masterWallet = new ethers.Wallet(config.masterPrivateKey, this.provider);
  }

  async getMasterBalance(): Promise<{ address: string; balance: string }> {
    const balance = await this.provider.getBalance(this.masterWallet.address);
    return {
      address: this.masterWallet.address,
      balance: parseFloat(ethers.formatEther(balance)).toFixed(6),
    };
  }

  async generateAccounts(): Promise<void> {
    Logger.section('Generate Accounts');

    const answers = await inquirer.prompt([
      {
        type: 'number',
        name: 'count',
        message: 'How many accounts do you want to generate?',
        default: 5,
        validate: (input) => {
          if (input < 1) return 'Please enter at least 1 account';
          if (input > 100) return 'Maximum 100 accounts allowed';
          return true;
        },
      },
    ]);

    const spinner = ora('Generating accounts...').start();

    try {
      const newWallets: WalletInfo[] = [];

      for (let i = 0; i < answers.count; i++) {
        const wallet = ethers.Wallet.createRandom();

        newWallets.push({
          address: wallet.address,
          privateKey: wallet.privateKey,
        });
      }

      const walletsData: WalletsData = {
        masterWallet: {
          address: this.masterWallet.address,
          privateKey: config.masterPrivateKey,
        },
        generatedWallets: newWallets,
        createdAt: new Date().toISOString(),
        lastModified: new Date().toISOString(),
      };

      StorageManager.saveWallets(walletsData);
      spinner.succeed(`Successfully generated ${answers.count} accounts!`);

      Logger.divider();
      Logger.info(`Master Wallet: ${this.masterWallet.address}`);
      Logger.divider();
      
      newWallets.forEach((wallet, index) => {
        Logger.success(`Wallet ${index + 1}:`);
        Logger.address('  Address', wallet.address);
      });
      
      Logger.divider();
      Logger.success(`Total wallets: ${walletsData.generatedWallets.length}`);
      Logger.warning('⚠️  Old wallets backed up automatically!');
    } catch (error: any) {
      spinner.fail('Failed to generate accounts');
      Logger.error(error.message);
    }
  }

  async viewBalances(): Promise<void> {
    Logger.section('View Balances');

    const walletsData = StorageManager.loadWallets();
    if (!walletsData || walletsData.generatedWallets.length === 0) {
      Logger.warning('No wallets found. Please generate accounts first.');
      return;
    }

    const spinner = ora('Fetching balances...').start();

    try {
      // Get master wallet balance
      const masterBalance = await this.provider.getBalance(walletsData.masterWallet.address);
      const masterBalanceFormatted = ethers.formatEther(masterBalance);

      spinner.succeed('Balances fetched successfully!');
      Logger.divider();
      Logger.info('MASTER WALLET:');
      Logger.address('Address', walletsData.masterWallet.address);
      Logger.balance('Balance', masterBalanceFormatted);
      Logger.divider();

      // Get balances for all generated wallets
      Logger.info('GENERATED WALLETS:');
      let totalBalance = parseFloat(masterBalanceFormatted);

      for (let i = 0; i < walletsData.generatedWallets.length; i++) {
        const wallet = walletsData.generatedWallets[i];
        const balance = await this.provider.getBalance(wallet.address);
        const balanceFormatted = ethers.formatEther(balance);
        totalBalance += parseFloat(balanceFormatted);

        console.log(chalk.cyan(`\nWallet ${i + 1}:`));
        Logger.address('  Address', wallet.address);
        Logger.balance('  Balance', balanceFormatted);
      }

      Logger.divider();
      Logger.success(`Total Balance Across All Wallets: ${totalBalance.toFixed(6)} MONAD`);
    } catch (error: any) {
      spinner.fail('Failed to fetch balances');
      Logger.error(error.message);
    }
  }

  async fundAccounts(): Promise<void> {
    Logger.section('Fund Accounts');

    const walletsData = StorageManager.loadWallets();
    if (!walletsData || walletsData.generatedWallets.length === 0) {
      Logger.warning('No wallets found. Please generate accounts first.');
      return;
    }

    // Ask for fund amount
    const { fundAmount } = await inquirer.prompt([
      {
        type: 'input',
        name: 'fundAmount',
        message: `Enter amount (in MONAD) to fund each wallet:`,
        default: config.buyAmount,
        validate: (input) => {
          const amount = parseFloat(input);
          if (isNaN(amount) || amount <= 0) {
            return 'Please enter a valid positive number';
          }
          return true;
        },
      },
    ]);

    const amountPerWallet = parseFloat(fundAmount);
    const bufferPerWallet = config.gasFee;
    const amountWithBuffer = amountPerWallet + bufferPerWallet;
    const totalWithBuffer = amountWithBuffer * walletsData.generatedWallets.length;

    Logger.info(`Amount per wallet: ${amountPerWallet.toFixed(6)} MONAD`);
    Logger.info(`Gas fee per wallet: ${bufferPerWallet.toFixed(6)} MONAD`);
    Logger.info(`Total per wallet: ${amountWithBuffer.toFixed(6)} MONAD`);
    Logger.info(`Total for all wallets: ${totalWithBuffer.toFixed(6)} MONAD`);

    // Check master wallet balance
    const masterBalance = await this.provider.getBalance(walletsData.masterWallet.address);
    const masterBalanceFormatted = parseFloat(ethers.formatEther(masterBalance));

    if (masterBalanceFormatted < totalWithBuffer) {
      Logger.error(
        `Insufficient balance! Master wallet has ${masterBalanceFormatted.toFixed(6)} MONAD but needs ${totalWithBuffer.toFixed(6)} MONAD`
      );
      return;
    }

    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: `Proceed with funding ${walletsData.generatedWallets.length} wallets?`,
        default: true,
      },
    ]);

    if (!confirm) {
      Logger.warning('Funding cancelled.');
      return;
    }

    const spinner = ora('Funding accounts...').start();

    try {
      for (let i = 0; i < walletsData.generatedWallets.length; i++) {
        const wallet = walletsData.generatedWallets[i];
        const amountToSend = amountPerWallet + bufferPerWallet;

        spinner.text = `Funding wallet ${i + 1}/${walletsData.generatedWallets.length}...`;

        const tx = await this.masterWallet.sendTransaction({
          to: wallet.address,
          value: ethers.parseEther(amountToSend.toString()),
          gasLimit: 21000n,
          maxFeePerGas: ethers.parseUnits('166', 'gwei'),
          maxPriorityFeePerGas: ethers.parseUnits('166', 'gwei'),
        });

        await tx.wait();

        Logger.success(
          `✓ Funded wallet ${i + 1}: ${wallet.address.substring(0, 10)}... with ${amountToSend.toFixed(6)} MONAD`
        );
      }

      spinner.succeed('All accounts funded successfully!');
      Logger.success(`Funded ${walletsData.generatedWallets.length} wallets!`);
    } catch (error: any) {
      spinner.fail('Failed to fund accounts');
      Logger.error(error.message);
    }
  }

  async returnToMaster(): Promise<void> {
    Logger.section('Return MONAD to Master Wallet');

    const walletsData = StorageManager.loadWallets();
    if (!walletsData || walletsData.generatedWallets.length === 0) {
      Logger.warning('No wallets found.');
      return;
    }

    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: `Return all MONAD from ${walletsData.generatedWallets.length} wallets to master?`,
        default: true,
      },
    ]);

    if (!confirm) {
      Logger.warning('Operation cancelled.');
      return;
    }

    const spinner = ora('Returning funds to master wallet...').start();
    let totalReturned = 0;

    try {
      for (let i = 0; i < walletsData.generatedWallets.length; i++) {
        const walletInfo = walletsData.generatedWallets[i];
        const wallet = new ethers.Wallet(walletInfo.privateKey, this.provider);

        spinner.text = `Processing wallet ${i + 1}/${walletsData.generatedWallets.length}...`;

        const balance = await this.provider.getBalance(wallet.address);

        if (balance === 0n) {
          Logger.info(`Wallet ${i + 1} has no balance, skipping...`);
          continue;
        }

        // Calculate gas cost
        const gasLimit = 21000n;
        const maxFeePerGas = ethers.parseUnits('166', 'gwei');
        const gasCost = gasLimit * maxFeePerGas;

        if (balance <= gasCost) {
          Logger.warning(
            `Wallet ${i + 1} balance too low to cover gas fees, skipping...`
          );
          continue;
        }

        const amountToSend = balance - gasCost;

        const tx = await wallet.sendTransaction({
          to: walletsData.masterWallet.address,
          value: amountToSend,
          gasLimit: gasLimit,
          maxFeePerGas: maxFeePerGas,
          maxPriorityFeePerGas: ethers.parseUnits('166', 'gwei'),
        });

        await tx.wait();

        const returned = ethers.formatEther(amountToSend);
        totalReturned += parseFloat(returned);

        Logger.success(
          `✓ Returned ${parseFloat(returned).toFixed(6)} MONAD from wallet ${i + 1}`
        );
      }

      spinner.succeed('All funds returned to master wallet!');
      Logger.success(`Total returned: ${totalReturned.toFixed(6)} MONAD`);
    } catch (error: any) {
      spinner.fail('Failed to return funds');
      Logger.error(error.message);
    }
  }

  async bundleBuy(): Promise<void> {
    Logger.section('Bundle Buy');

    const walletsData = StorageManager.loadWallets();
    if (!walletsData || walletsData.generatedWallets.length === 0) {
      Logger.warning('No wallets found. Please generate accounts first.');
      return;
    }

    // Ask for token address
    const { tokenAddress } = await inquirer.prompt([
      {
        type: 'input',
        name: 'tokenAddress',
        message: 'Enter token address to buy:',
        validate: (input) => {
          if (!input.startsWith('0x') || input.length !== 42) {
            return 'Please enter a valid token address';
          }
          return true;
        },
      },
    ]);

    // Nad.fun contracts: https://nad-fun.gitbook.io/nad.fun/for-developers/contracts-and-abi
    const LENS = '0x7e78A8DE94f21804F7a17F4E8BF9EC2c872187ea';
    const BONDING_CURVE_ROUTER = '0x6F6B8F1a20703309951a5127c45B49b1CD981A22';
    const DEX_ROUTER = '0x0B79d71AE99528D1dB24A4148b5f4F865cc2b137';

    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: `Execute bundle buy for ${walletsData.generatedWallets.length} wallets?`,
        default: true,
      },
    ]);

    if (!confirm) {
      Logger.warning('Bundle buy cancelled.');
      return;
    }

    const spinner = ora('Executing bundle buy...').start();

    try {
      const buyPromises = walletsData.generatedWallets.map(async (walletInfo, i) => {
        const buyAmount = parseFloat(config.buyAmount);

        if (buyAmount <= 0) {
          return { success: false, wallet: i + 1, skipped: true };
        }

        try {
          const wallet = new ethers.Wallet(walletInfo.privateKey, this.provider);
          const amountIn = ethers.parseEther(buyAmount.toString());
          const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes

          // Step 1: Query Lens to get the correct router and expected output
          const lensInterface = new ethers.Interface([
            'function getAmountOut(address token, uint256 amountIn, bool isBuy) view returns (address router, uint256 amountOut)',
          ]);
          
          const lensContract = new ethers.Contract(LENS, lensInterface, this.provider);
          const [routerAddress, expectedOut] = await lensContract.getAmountOut(
            tokenAddress,
            amountIn,
            true // isBuy
          );

          // Calculate min output with 1% slippage
          const minOut = (expectedOut * 99n) / 100n;

          // Step 2: Use the router returned by Lens
          const buyInterface = new ethers.Interface([
            'function buy(tuple(uint256 amountOutMin, address token, address to, uint256 deadline)) payable',
          ]);

          const buyParams = {
            amountOutMin: minOut,
            token: tokenAddress,
            to: wallet.address,
            deadline: deadline,
          };

          const data = buyInterface.encodeFunctionData('buy', [buyParams]);

          const tx = await wallet.sendTransaction({
            to: routerAddress, // Use router from Lens
            data: data,
            value: amountIn,
            gasLimit: 1500000n,
            maxFeePerGas: ethers.parseUnits('166', 'gwei'),
            maxPriorityFeePerGas: ethers.parseUnits('166', 'gwei'),
          });

          await tx.wait();
          return { success: true, wallet: i + 1, buyAmount };
        } catch (error: any) {
          return { success: false, wallet: i + 1, error: error.message };
        }
      });

      const results = await Promise.all(buyPromises);

      spinner.succeed('Bundle buy completed!');

      let successCount = 0;
      let failCount = 0;

      results.forEach(result => {
        if (result.skipped) {
          // Skip logging
        } else if (result.success) {
          successCount++;
          Logger.success(`✓ Wallet ${result.wallet} bought successfully (${result.buyAmount} MONAD)`);
        } else {
          failCount++;
          Logger.error(`✗ Wallet ${result.wallet} failed: ${result.error}`);
        }
      });

      Logger.success(`Success: ${successCount} | Failed: ${failCount}`);
    } catch (error: any) {
      spinner.fail('Bundle buy failed');
      Logger.error(error.message);
    }
  }

  async approveTokens(): Promise<void> {
    Logger.section('Approve Tokens');
    Logger.warning('This feature will be implemented based on your instructions.');
    Logger.info('Please provide the implementation details for token approval.');
  }

  async bundleSell(): Promise<void> {
    Logger.section('Bundle Sell');

    const walletsData = StorageManager.loadWallets();
    if (!walletsData || walletsData.generatedWallets.length === 0) {
      Logger.warning('No wallets found. Please generate accounts first.');
      return;
    }

    // Ask for token address
    const { tokenAddress } = await inquirer.prompt([
      {
        type: 'input',
        name: 'tokenAddress',
        message: 'Enter token address to sell:',
        validate: (input) => {
          if (!input.startsWith('0x') || input.length !== 42) {
            return 'Please enter a valid token address';
          }
          return true;
        },
      },
    ]);

    const LENS = '0x7e78A8DE94f21804F7a17F4E8BF9EC2c872187ea';
    const BONDING_CURVE_ROUTER = '0x6F6B8F1a20703309951a5127c45B49b1CD981A22';
    const DEX_ROUTER = '0x0B79d71AE99528D1dB24A4148b5f4F865cc2b137';

    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: `Execute bundle sell for ${walletsData.generatedWallets.length} wallets?`,
        default: true,
      },
    ]);

    if (!confirm) {
      Logger.warning('Bundle sell cancelled.');
      return;
    }

    const spinner = ora('Executing bundle sell...').start();

    try {
      const sellPromises = walletsData.generatedWallets.map(async (walletInfo, i) => {
        try {
          const wallet = new ethers.Wallet(walletInfo.privateKey, this.provider);

          // Get token balance
          const tokenContract = new ethers.Contract(
            tokenAddress,
            ['function balanceOf(address) view returns (uint256)'],
            this.provider
          );
          const balance = await tokenContract.balanceOf(wallet.address);

          if (balance === 0n) {
            return { success: false, wallet: i + 1, skipped: true };
          }

          const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes

          // Step 1: Query Lens to get the correct router and expected MON output
          const lensInterface = new ethers.Interface([
            'function getAmountOut(address token, uint256 amountIn, bool isBuy) view returns (address router, uint256 amountOut)',
          ]);
          
          const lensContract = new ethers.Contract(LENS, lensInterface, this.provider);
          const [routerAddress, expectedMon] = await lensContract.getAmountOut(
            tokenAddress,
            balance,
            false // isSell
          );

          // Calculate min output with 1% slippage
          const minMon = (expectedMon * 99n) / 100n;

          // Step 2: Approve tokens to the router
          const approveInterface = new ethers.Interface([
            'function approve(address spender, uint256 amount) returns (bool)',
          ]);
          const approveContract = new ethers.Contract(tokenAddress, approveInterface, wallet);
          const approveTx = await approveContract.approve(routerAddress, balance, {
            gasLimit: 100000n,
            maxFeePerGas: ethers.parseUnits('166', 'gwei'),
            maxPriorityFeePerGas: ethers.parseUnits('166', 'gwei'),
          });
          await approveTx.wait();

          // Step 3: Execute sell
          const sellInterface = new ethers.Interface([
            'function sell(tuple(uint256 amountIn, uint256 amountOutMin, address token, address to, uint256 deadline))',
          ]);

          const sellParams = {
            amountIn: balance,
            amountOutMin: minMon,
            token: tokenAddress,
            to: wallet.address,
            deadline: deadline,
          };

          const data = sellInterface.encodeFunctionData('sell', [sellParams]);

          const tx = await wallet.sendTransaction({
            to: routerAddress,
            data: data,
            gasLimit: 1500000n,
            maxFeePerGas: ethers.parseUnits('166', 'gwei'),
            maxPriorityFeePerGas: ethers.parseUnits('166', 'gwei'),
          });

          await tx.wait();
          return { success: true, wallet: i + 1 };
        } catch (error: any) {
          return { success: false, wallet: i + 1, error: error.message };
        }
      });

      const results = await Promise.all(sellPromises);

      spinner.succeed('Bundle sell completed!');

      let successCount = 0;
      let failCount = 0;

      results.forEach(result => {
        if (result.skipped) {
          // Skip logging
        } else if (result.success) {
          successCount++;
          Logger.success(`✓ Wallet ${result.wallet} sold successfully`);
        } else {
          failCount++;
          Logger.error(`✗ Wallet ${result.wallet} failed: ${result.error}`);
        }
      });

      Logger.success(`Success: ${successCount} | Failed: ${failCount}`);
    } catch (error: any) {
      spinner.fail('Bundle sell failed');
      Logger.error(error.message);
    }
  }

  async runVolumeBot(): Promise<void> {
    Logger.section('Run Volume Bot');
    Logger.warning('This feature will be implemented based on your instructions.');
    Logger.info('Please provide the implementation details for volume bot.');
  }
}

// Import chalk for the viewBalances method
import chalk from 'chalk';

