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

  private async getTokensInWallet(walletAddress: string): Promise<string[]> {
    // ERC20 Transfer event signature
    const transferEventSignature = 'Transfer(address,address,uint256)';
    const transferTopic = ethers.id(transferEventSignature);
    
    // Get current block number
    const currentBlock = await this.provider.getBlockNumber();
    // Look back 10000 blocks (adjust as needed)
    const fromBlock = Math.max(0, currentBlock - 10000);
    
    try {
      // Query Transfer events where tokens were sent TO this wallet
      const filter = {
        topics: [
          transferTopic,
          null, // from address (any)
          ethers.zeroPadValue(walletAddress, 32), // to address (this wallet)
        ],
        fromBlock,
        toBlock: currentBlock,
      };

      const logs = await this.provider.getLogs(filter);
      
      // Extract unique token addresses from the logs
      const tokenAddresses = new Set<string>();
      logs.forEach(log => {
        tokenAddresses.add(log.address);
      });

      // Check which tokens actually have balance > 0
      const tokensWithBalance: string[] = [];
      for (const tokenAddress of tokenAddresses) {
        try {
          const tokenContract = new ethers.Contract(
            tokenAddress,
            ['function balanceOf(address) view returns (uint256)'],
            this.provider
          );
          const balance = await tokenContract.balanceOf(walletAddress);
          if (balance > 0n) {
            tokensWithBalance.push(tokenAddress);
          }
        } catch (error) {
          // Skip invalid token contracts
          continue;
        }
      }

      return tokensWithBalance;
    } catch (error) {
      Logger.warning(`Error detecting tokens for wallet ${walletAddress}: ${error}`);
      return [];
    }
  }

  private async sellTokenFromWallet(
    wallet: ethers.Wallet,
    tokenAddress: string,
    LENS: string
  ): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      // Get token balance
      const tokenContract = new ethers.Contract(
        tokenAddress,
        ['function balanceOf(address) view returns (uint256)'],
        this.provider
      );
      const balance = await tokenContract.balanceOf(wallet.address);

      if (balance === 0n) {
        return { success: false, error: 'No balance' };
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
      return { success: true, txHash: tx.hash };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async refundToMaster(): Promise<void> {
    Logger.section('Refund to Master Wallet');

    const walletsData = StorageManager.loadWallets();
    if (!walletsData || walletsData.generatedWallets.length === 0) {
      Logger.warning('No wallets found.');
      return;
    }

    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: `Sell all tokens and refund all MONAD from ${walletsData.generatedWallets.length} wallets to master?`,
        default: true,
      },
    ]);

    if (!confirm) {
      Logger.warning('Operation cancelled.');
      return;
    }

    const LENS = '0x7e78A8DE94f21804F7a17F4E8BF9EC2c872187ea';

    // STEP 1: Detect and sell all tokens
    Logger.info('\n📉 STEP 1: Detecting and selling all tokens...');
    const detectSpinner = ora('Detecting tokens in wallets...').start();

    let totalSellSuccess = 0;
    let totalSellFail = 0;

    try {
      for (let i = 0; i < walletsData.generatedWallets.length; i++) {
        const walletInfo = walletsData.generatedWallets[i];
        const wallet = new ethers.Wallet(walletInfo.privateKey, this.provider);

        detectSpinner.text = `Detecting tokens in wallet ${i + 1}/${walletsData.generatedWallets.length}...`;
        
        const tokenAddresses = await this.getTokensInWallet(wallet.address);

        if (tokenAddresses.length === 0) {
          Logger.info(`Wallet ${i + 1}: No tokens found`);
          continue;
        }

        Logger.info(`Wallet ${i + 1}: Found ${tokenAddresses.length} token(s)`);

        // Sell each token
        for (const tokenAddress of tokenAddresses) {
          detectSpinner.text = `Selling tokens from wallet ${i + 1}/${walletsData.generatedWallets.length}...`;
          
          const result = await this.sellTokenFromWallet(wallet, tokenAddress, LENS);
          
          if (result.success) {
            totalSellSuccess++;
            const txLink = `${config.explorerUrl}/${result.txHash}`;
            Logger.success(`✓ Wallet ${i + 1} sold token ${tokenAddress.substring(0, 10)}...`);
            Logger.info(`  TX: ${txLink}`);
          } else {
            if (result.error !== 'No balance') {
              totalSellFail++;
              Logger.error(`✗ Wallet ${i + 1} failed to sell token ${tokenAddress.substring(0, 10)}...: ${result.error}`);
            }
          }
        }
      }

      detectSpinner.succeed('Token detection and selling completed!');
      Logger.info(`Sell Results: Success: ${totalSellSuccess} | Failed: ${totalSellFail}`);
    } catch (error: any) {
      detectSpinner.fail('Failed to detect or sell tokens');
      Logger.error(error.message);
    }

    // STEP 2: Return all MONAD to master
    Logger.info('\n💰 STEP 2: Returning MONAD to master wallet...');
    const returnSpinner = ora('Returning funds to master wallet...').start();
    let totalReturned = 0;

    try {
      for (let i = 0; i < walletsData.generatedWallets.length; i++) {
        const walletInfo = walletsData.generatedWallets[i];
        const wallet = new ethers.Wallet(walletInfo.privateKey, this.provider);

        returnSpinner.text = `Processing wallet ${i + 1}/${walletsData.generatedWallets.length}...`;

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

        const txLink = `${config.explorerUrl}/${tx.hash}`;
        Logger.success(
          `✓ Returned ${parseFloat(returned).toFixed(6)} MONAD from wallet ${i + 1}`
        );
        Logger.info(`  TX: ${txLink}`);
      }

      returnSpinner.succeed('All funds returned to master wallet!');
      Logger.success(`Total returned: ${totalReturned.toFixed(6)} MONAD`);
    } catch (error: any) {
      returnSpinner.fail('Failed to return funds');
      Logger.error(error.message);
    }
  }

  async approveTokens(): Promise<void> {
    Logger.section('Approve Tokens');
    Logger.warning('This feature will be implemented based on your instructions.');
    Logger.info('Please provide the implementation details for token approval.');
  }

  async runVolumeBot(): Promise<void> {
    Logger.section('Run Volume Bot');

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
        message: 'Enter token address to trade:',
        validate: (input) => {
          if (!input.startsWith('0x') || input.length !== 42) {
            return 'Please enter a valid token address';
          }
          return true;
        },
      },
    ]);

    const LENS = '0x7e78A8DE94f21804F7a17F4E8BF9EC2c872187ea';
    const buyAmount = parseFloat(config.buyAmount);

    if (buyAmount <= 0) {
      Logger.error('Buy amount must be greater than 0. Please check your config.');
      return;
    }

    Logger.info(`Token Address: ${tokenAddress}`);
    Logger.info(`Buy Amount: ${buyAmount} MONAD per wallet`);
    Logger.info(`Cycles: Infinite`);
    Logger.info(`Wallets: ${walletsData.generatedWallets.length}`);

    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Start volume bot?',
        default: true,
      },
    ]);

    if (!confirm) {
      Logger.warning('Volume bot cancelled.');
      return;
    }

    let cycleCount = 0;

    try {
      while (true) {
        cycleCount++;
        Logger.divider();
        Logger.info(`\n🔄 Cycle ${cycleCount}`);

        // BUY PHASE
        Logger.info('\n📈 BUY PHASE');
        const buySpinner = ora('Executing buys...').start();

        const buyResults = await this.executeBuys(walletsData, tokenAddress, buyAmount, LENS);
        buySpinner.stop();

        let buySuccessCount = 0;
        let buyFailCount = 0;
        buyResults.forEach(result => {
          if (result.success) {
            buySuccessCount++;
            const txLink = `${config.explorerUrl}/${result.txHash}`;
            Logger.success(`✓ Wallet ${result.wallet} bought successfully`);
            Logger.info(`  TX: ${txLink}`);
          } else if (!result.skipped) {
            buyFailCount++;
            Logger.error(`✗ Wallet ${result.wallet} buy failed: ${result.error}`);
          }
        });
        Logger.info(`Buy Results: Success: ${buySuccessCount} | Failed: ${buyFailCount}`);

        // DELAY
        if (config.delaySeconds > 0) {
          Logger.info(`\n⏳ Waiting ${config.delaySeconds} seconds before sell...`);
          await this.delay(config.delaySeconds * 1000);
        }

        // SELL PHASE
        Logger.info('\n📉 SELL PHASE');
        const sellSpinner = ora('Executing sells...').start();

        const sellResults = await this.executeSells(walletsData, tokenAddress, LENS);
        sellSpinner.stop();

        let sellSuccessCount = 0;
        let sellFailCount = 0;
        sellResults.forEach(result => {
          if (result.success) {
            sellSuccessCount++;
            const txLink = `${config.explorerUrl}/${result.txHash}`;
            Logger.success(`✓ Wallet ${result.wallet} sold successfully`);
            Logger.info(`  TX: ${txLink}`);
          } else if (!result.skipped) {
            sellFailCount++;
            Logger.error(`✗ Wallet ${result.wallet} sell failed: ${result.error}`);
          }
        });
        Logger.info(`Sell Results: Success: ${sellSuccessCount} | Failed: ${sellFailCount}`);

        // Small delay before next cycle
        Logger.info('\n⏳ Preparing for next cycle...');
        await this.delay(2000);
      }
    } catch (error: any) {
      Logger.error(`Volume bot error: ${error.message}`);
    }
  }

  private async executeBuys(
    walletsData: WalletsData,
    tokenAddress: string,
    buyAmount: number,
    LENS: string
  ): Promise<Array<{ success: boolean; wallet: number; txHash?: string; error?: string; skipped?: boolean }>> {
    const buyPromises = walletsData.generatedWallets.map(async (walletInfo: WalletInfo, i: number) => {
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
          to: routerAddress,
          data: data,
          value: amountIn,
          gasLimit: 1500000n,
          maxFeePerGas: ethers.parseUnits('166', 'gwei'),
          maxPriorityFeePerGas: ethers.parseUnits('166', 'gwei'),
        });

        await tx.wait();
        return { success: true, wallet: i + 1, txHash: tx.hash };
      } catch (error: any) {
        return { success: false, wallet: i + 1, error: error.message };
      }
    });

    return Promise.all(buyPromises);
  }

  private async executeSells(
    walletsData: WalletsData,
    tokenAddress: string,
    LENS: string
  ): Promise<Array<{ success: boolean; wallet: number; txHash?: string; error?: string; skipped?: boolean }>> {
    const sellPromises = walletsData.generatedWallets.map(async (walletInfo: WalletInfo, i: number) => {
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
        return { success: true, wallet: i + 1, txHash: tx.hash };
      } catch (error: any) {
        return { success: false, wallet: i + 1, error: error.message };
      }
    });

    return Promise.all(sellPromises);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Import chalk for the viewBalances method
import chalk from 'chalk';

