export interface WalletInfo {
  address: string;
  privateKey: string;
}

export interface WalletsData {
  masterWallet: {
    address: string;
    privateKey: string;
  };
  generatedWallets: WalletInfo[];
  createdAt: string;
  lastModified: string;
}

export interface BalanceInfo {
  address: string;
  balance: string;
  balanceFormatted: string;
}
