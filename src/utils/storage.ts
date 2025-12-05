import fs from 'fs';
import path from 'path';
import { WalletsData } from '../types';
import { config } from '../config';

export class StorageManager {
  static saveWallets(data: WalletsData): void {
    // Backup existing file if it exists
    if (fs.existsSync(config.walletsFilePath)) {
      this.backupWallets();
    }

    data.lastModified = new Date().toISOString();
    fs.writeFileSync(
      config.walletsFilePath,
      JSON.stringify(data, null, 2),
      'utf-8'
    );
  }

  static loadWallets(): WalletsData | null {
    if (!fs.existsSync(config.walletsFilePath)) {
      return null;
    }

    try {
      const data = fs.readFileSync(config.walletsFilePath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error loading wallets:', error);
      return null;
    }
  }

  static backupWallets(): void {
    if (!fs.existsSync(config.walletsFilePath)) {
      return;
    }

    // Create backups directory if it doesn't exist
    if (!fs.existsSync(config.backupFolderPath)) {
      fs.mkdirSync(config.backupFolderPath, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(
      config.backupFolderPath,
      `wallets_backup_${timestamp}.json`
    );

    fs.copyFileSync(config.walletsFilePath, backupPath);
  }

  static walletExists(): boolean {
    return fs.existsSync(config.walletsFilePath);
  }
}
