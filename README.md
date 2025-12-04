# MediShield PreCheck

> Privacy-first medical insurance pre-qualification powered by Fully Homomorphic Encryption (FHEVM) on Ethereum Sepolia.

## Why FHE?

Traditional insurance websites require uploading sensitive health data to centralized servers—risking data resale, breaches, and aggressive remarketing.

**MediShield PreCheck solves this:**
- 🔐 **No plaintext on-chain** – All health inputs are encrypted in-browser before any network call
- 🛡️ **Outcome-only disclosure** – Contract returns only a risk category (1/2/3), never the underlying reasons
- 👤 **User data sovereignty** – Only you can decrypt your result via EIP-712 signature

## Features

- ✅ Browser-side FHE encryption (age + 3 risk flags)
- ✅ On-chain encrypted eligibility computation
- ✅ EIP-712 user-controlled decryption
- ✅ Persistent encrypted results per wallet
- ✅ Beautiful warm-tone UI with real-time status feedback

## Demo

| Resource | Link |
|----------|------|
| **Live Demo** | *Deploy URL here* |
| **Contract** | [`0x6b2ce889faa4EeA304D04A9C6EBE06326d61B6C5`](https://sepolia.etherscan.io/address/0x6b2ce889faa4EeA304D04A9C6EBE06326d61B6C5) |
| **Network** | Ethereum Sepolia (Chain ID: 11155111) |

## Tech Stack

| Layer | Technology |
|-------|------------|
| Smart Contract | Solidity 0.8.24, FHEVM v0.9, Hardhat |
| Frontend | Next.js 15, React 19, TypeScript, Tailwind CSS |
| FHE | Zama RelayerSDK 0.3.0-5, EIP-712 decryption |
| Wallet | Ethers.js v6, MetaMask |

## Quick Start

```bash
# Clone & install
git clone https://github.com/Raymond-yw/MediShield-PreCheck.git
cd MediShield_PreCheck
pnpm install

# Run frontend (uses deployed Sepolia contract)
pnpm start
```

Open `http://localhost:3000`, connect MetaMask to Sepolia, and run the encrypted pre-check.

## Tests

```bash
pnpm test
```

6 test cases covering:
- ✅ Eligible (age 18-64, no risk flags)
- ✅ Moderate (age 18-64, with risk flags)
- ✅ Not Eligible (age < 18 or > 64)
- ✅ Boundary values (18, 64)
- ✅ Storage verification
- ✅ Uninitialized user handling

## How It Works

```
User Browser                    Blockchain (Sepolia)
     │                                │
     │ 1. Enter age + health flags    │
     │ 2. Encrypt locally (FHEVM)     │
     │                                │
     │ ──── encrypted handles ──────► │
     │                                │ 3. FHE computation
     │                                │    (ge/le/and/or/select)
     │                                │
     │ ◄─── encrypted category ────── │
     │                                │
     │ 4. EIP-712 sign & decrypt      │
     │ 5. Display result              │
     │                                │
```

## Eligibility Logic

| Category | Condition |
|----------|-----------|
| **Eligible** | Age 18-64 AND no risk flags |
| **Moderate** | Age 18-64 AND any risk flag = Yes |
| **Not Eligible** | Age < 18 OR > 64 |

Risk flags: Past medical history, Current chronic condition, Smoking/alcohol habits

## Deploy Your Own

```bash
# Set environment
export MNEMONIC="your mnemonic"
export SEPOLIA_RPC_URL="https://..."

# Deploy contract
pnpm hardhat:compile
pnpm hardhat:deploy:sepolia

# Update CONTRACT_ADDRESSES in packages/nextjs/app/page.tsx
```

## License

BSD-3-Clause-Clear

---

Built for the **Zama Developer Program** | Powered by [Zama FHEVM](https://github.com/zama-ai/fhevm)
