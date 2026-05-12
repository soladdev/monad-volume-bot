# Monad Volume Bot

A professional CLI application for managing multiple wallets and generating trading volume on the Monad blockchain (EVM L2). This bot automates wallet generation, funding, token trading operations, and fund management with an intuitive interactive menu system.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)
![Node.js](https://img.shields.io/badge/Node.js-20+-green)

## 📋 Table of Contents

- [Features](#-features)
- [Prerequisites](#-prerequisites)
- [Installation](#-installation)
- [Configuration](#-configuration)
- [Usage](#-usage)
- [Project Structure](#-project-structure)
- [Features Breakdown](#-features-breakdown)
- [Security](#-security)
- [Troubleshooting](#-troubleshooting)
- [License](#-license)
- [Author](#-author)

## ✨ Features

- **🔐 Wallet Management**
  - Generate multiple wallet accounts with secure random key generation
  - Automatic wallet backup system with timestamped backups
  - Master wallet balance monitoring

- **💰 Fund Management**
  - Distribute funds from master wallet to generated accounts
  - Automatic gas fee calculation and buffer management
  - Refund all balances back to master wallet

- **📊 Balance Tracking**
  - View balances for all wallets in a formatted table
  - Real-time balance updates from the Monad blockchain
  - Master wallet balance display

- **🤖 Volume Bot**
  - Automated token buying and selling operations
  - Token detection and balance checking
  - Configurable buy amounts and delays
  - Automatic fund return to master wallet after operations

- **🎨 User Interface**
  - Beautiful CLI interface with colors and formatting
  - Interactive menu system with inquirer prompts
  - Progress indicators and loading spinners
  - Transaction explorer links

## 🔧 Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v20 or higher)
- **npm** or **yarn** package manager
- A Monad wallet with sufficient balance for operations
- Private key of your master wallet

## 📦 Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd monad-volume-bot
   ```

2. **Install dependencies**
   ```bash
   npm install
   # or
   yarn install
   ```

3. **Set up environment variables**
   
   Create a `.env` file in the root directory:
   ```env
   MASTER_PRIVATE_KEY=your_private_key_here
   BUY_AMOUNT=1
   ```

   Alternatively, you can configure the master private key directly in `src/config.ts`.

## ⚙️ Configuration

The application can be configured in two ways:

### Option 1: Environment Variables (Recommended)

Create a `.env` file:
```env
MASTER_PRIVATE_KEY=0x...
BUY_AMOUNT=1
```

### Option 2: Direct Configuration

Edit `src/config.ts`:
```typescript
export const config = {
  rpcUrl: 'https://rpc3.monad.xyz',
  masterPrivateKey: 'your_private_key_here',
  buyAmount: '1',
  gasFee: 0.01,
  delaySeconds: 3,
  chainId: 143,
  // ... other settings
};
```

### Configuration Options

| Option | Description | Default |
|--------|-------------|---------|
| `rpcUrl` | Monad RPC endpoint | `https://rpc3.monad.xyz` |
| `masterPrivateKey` | Private key of master wallet | Required |
| `buyAmount` | Amount to buy per transaction (MONAD) | `1` |
| `gasFee` | Gas fee buffer per wallet (MONAD) | `0.01` |
| `delaySeconds` | Delay between buy and sell (seconds) | `3` |
| `chainId` | Monad chain ID | `143` |

## 🚀 Usage

### Development Mode

Run the application in development mode with TypeScript:
```bash
npm run dev
```

### Production Mode

Build and run the application:
```bash
npm run build
npm start
```

### Main Menu Options

Once the application starts, you'll see an interactive menu with the following options:

1. **Generate Accounts** - Create new wallet accounts (up to 100 at a time)
2. **View Balances** - Display balances for all wallets in a formatted table
3. **Fund Accounts** - Distribute MONAD from master wallet to generated accounts
4. **Run Volume Bot** - Execute automated trading operations
5. **Refund to Master** - Return all balances from generated wallets to master wallet
6. **Exit Application** - Gracefully exit the application

### Example Workflow

```bash
# 1. Start the application
npm run dev

# 2. Generate 10 wallet accounts
# Select: "Generate Accounts" → Enter: 10

# 3. Fund the accounts
# Select: "Fund Accounts" → Enter amount per wallet

# 4. Run volume bot
# Select: "Run Volume Bot" → Bot will automatically:
#   - Buy tokens with each wallet
#   - Wait for configured delay
#   - Sell tokens back
#   - Return remaining MONAD to master wallet

# 5. View balances
# Select: "View Balances" → See all wallet balances
```

## 📁 Project Structure

```
monad-volume-bot/
├── src/
│   ├── config.ts              # Configuration settings
│   ├── index.ts               # Main application entry point
│   ├── types.ts               # TypeScript type definitions
│   ├── services/
│   │   └── wallet.service.ts  # Wallet management and trading logic
│   ├── utils/
│   │   ├── logger.ts          # Logging utilities
│   │   └── storage.ts         # Wallet storage management
│   └── wallets/
│       ├── wallets.json       # Generated wallets storage
│       └── backups/           # Automatic wallet backups
├── dist/                      # Compiled JavaScript (generated)
├── package.json
├── tsconfig.json
└── README.md
```

## 🔍 Features Breakdown

### Wallet Generation
- Generates cryptographically secure random wallets
- Automatically backs up existing wallets before overwriting
- Stores wallet data in JSON format with timestamps
- Supports generation of 1-100 wallets per batch

### Fund Distribution
- Calculates optimal gas fees for transactions
- Includes gas buffer to prevent failed transactions
- Processes funding sequentially with progress tracking
- Displays transaction hashes and explorer links

### Volume Bot Operations
- **Buy Phase**: Purchases tokens using configured amount
- **Sell Phase**: Detects and sells all tokens in wallets
- **Return Phase**: Sends remaining MONAD back to master wallet
- Automatic error handling and retry logic
- Transaction tracking with explorer links

### Balance Management
- Real-time balance fetching from blockchain
- Formatted table display with address and balance
- Master wallet balance always displayed
- Supports viewing balances for all generated wallets

## 🔒 Security

### Important Security Notes

⚠️ **CRITICAL**: Never share your private keys or commit them to version control.

- **Private Key Storage**: Store your `MASTER_PRIVATE_KEY` in environment variables or `.env` file
- **Backup Safety**: Wallet backups are stored locally - ensure proper file system permissions
- **Network Security**: All transactions are sent over HTTPS to the Monad RPC endpoint
- **Key Management**: Generated wallet private keys are stored in plain text JSON files - secure these files appropriately

### Best Practices

1. Use a dedicated wallet for bot operations (not your main wallet)
2. Keep only necessary funds in the master wallet
3. Regularly backup the `wallets/` directory
4. Review transaction logs before executing operations
5. Test with small amounts first

## 🐛 Troubleshooting

### Common Issues

**Issue**: "Configuration Error! Please set your MASTER_PRIVATE_KEY"
- **Solution**: Ensure `MASTER_PRIVATE_KEY` is set in `.env` or `src/config.ts`

**Issue**: "Insufficient funds" error
- **Solution**: Ensure master wallet has enough MONAD for gas fees and operations

**Issue**: Transaction failures
- **Solution**: Check network connectivity, RPC endpoint availability, and gas price settings

**Issue**: "No wallets found"
- **Solution**: Generate accounts first using the "Generate Accounts" option

### Getting Help

If you encounter issues:
1. Check the console output for detailed error messages
2. Verify your configuration settings
3. Ensure sufficient balance in master wallet
4. Check Monad network status

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 👤 Author

**Vladmeer**

---

**Disclaimer**: This bot is for educational and research purposes. Use at your own risk. Always test with small amounts first and ensure you understand the risks involved in automated trading operations.

