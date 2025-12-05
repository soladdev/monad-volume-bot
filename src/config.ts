import path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export const config = {
  rpcUrl: 'https://rpc3.monad.xyz',
  masterPrivateKey: process.env.MASTER_PRIVATE_KEY || '',
  buyAmount: process.env.BUY_AMOUNT || '1',
  gasFee: 0.01, // Gas fee buffer per wallet (in MONAD)
  delaySeconds: 3, // Delay between buy and sell (in seconds)
  chainId: 143,
  explorerUrl: 'https://monad.socialscan.io/tx', // Blockchain explorer URL for transactions
  walletsFilePath: path.join(process.cwd(), 'src', 'wallets', 'wallets.json'),
  backupFolderPath: path.join(process.cwd(), 'src', 'wallets', 'backups'),
};

export function validateConfig(): boolean {
  if (!config.masterPrivateKey || config.masterPrivateKey === 'YOUR_PRIVATE_KEY_HERE' || config.masterPrivateKey === '') {
    return false;
  }
  return true;
}
