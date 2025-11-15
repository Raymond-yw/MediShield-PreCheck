# MediShield PreCheck

> Privacy-first medical insurance pre-qualification powered by Zama’s Fully Homomorphic Encryption Virtual Machine (FHEVM) on Sepolia.

## 1. Project overview & vision

### What this project is

MediShield PreCheck is a focused demo dApp that shows how FHEVM can be used for privacy-preserving medical insurance triage.  
Instead of asking users to upload sensitive medical history to a server, the dApp:

- Encrypts all answers locally in the browser.
- Runs the eligibility logic on-chain over ciphertext using Zama’s FHEVM.
- Stores only an encrypted eligibility category that can later be re-decrypted by the same user.

**Current Web2 pain point:** traditional insurance websites require users to upload detailed personal and medical information to centralized servers. That data can be resold or misused, leading to spam, security and privacy risks, and users often worry that “just checking eligibility” will trigger aggressive remarketing.

### Who it is for

- **Individuals (18–64)** who want to know whether they are likely to qualify for a standard medical insurance product without sharing detailed health data.
- **Insurance and protocol builders** who want a concrete example of FHE-powered underwriting flows on Ethereum.

### Why FHEVM

- **No plaintext on-chain** – smart contracts only see ciphertext handles; raw ages and risk flags never leave the browser in clear form.
- **Outcome-only disclosure** – the system exposes only a risk level (Eligible / Moderate / Not Eligible), never the underlying reasons.
- **User data sovereignty** – the demo does not auto-contact users; they choose whether to share their result with an advisor.

---

## 2. Eligibility rules & how to use the website

### Eligibility rules

The contract evaluates four encrypted factors:

1. **Age** – integer age; valid band is 18–64 (inclusive).
2. **Past medical history** – whether the user reports relevant past conditions (Yes/No).
3. **Current chronic condition** – whether the user has any ongoing chronic condition (Yes/No).
4. **Smoking or alcohol habits** – lifestyle risk flag (Yes/No).

These are combined inside the encrypted computation to produce a category:

- **Eligible (risk level)** – age in [18, 64] and all three risk flags are **No**.
- **Moderate (risk level)** – age in [18, 64] and at least one risk flag is **Yes**.
- **Not Eligible (risk level)** – age \< 18 or \> 64.

### How to use the demo

1. **Connect wallet** – open the site, connect MetaMask (or another EVM wallet), and switch to **Sepolia**.
2. **Fill the form** – enter your age and answer the three Yes/No questions.
3. **Run the encrypted pre-check** – click **Check eligibility**:
   - Your inputs are encrypted in the browser through the FHEVM relayer.
   - The encrypted payload is sent to the `MediShieldPreCheck` contract on Sepolia.
   - The contract evaluates the rules over ciphertext and stores an encrypted category handle.
4. **Authorize decryption** – sign the EIP-712 permit when prompted so the browser can decrypt your encrypted category.
5. **Read the result** – the UI shows:
   - Your **risk level** label (Eligible / Moderate / Not Eligible).
   - The ciphertext handle.
   - The evaluation timestamp.
   - For freshly submitted checks, a link to the transaction on Sepolia Etherscan.
6. **Reload the last outcome (optional)** – click **Show last encrypted outcome** to fetch and decrypt the last stored category for your wallet.

At no point are your raw health answers stored on a server or on-chain.

---

## 3. Technical specifications

- **Network**
  - Ethereum **Sepolia** testnet (`chainId 11155111`).
  - Uses Zama’s **FHEVM v0.9** configuration and relayer for encryption / decryption.
- **Smart contracts**
  - `packages/contracts/contracts/MediShieldPreCheck.sol` – FHE-enabled eligibility contract.
  - Solidity `0.8.24`, Hardhat-based toolchain.
- **Front-end**
  - Next.js 15 (App Router), React 19, TypeScript.
  - Tailwind CSS for the warm, cloud-style UI.
  - Ethers v6 for JSON-RPC calls.
- **FHE / relayer**
  - Browser-side FHEVM helper built on top of Zama’s relayer SDK.
  - Encrypted inputs (`euint8` + `ebool`) and encrypted category output.
- **Tooling**
  - `pnpm` workspaces.
  - Hardhat for compilation, testing and deployment.

---

## 4. Technical architecture & data flow

```text
┌─────────────────────────────────────────────────────────────────────┐
│                        User browser (Next.js)                       │
│  - React UI: form, timeline, diagnostics                            │
│  - FHEVM helper: encrypt(), decrypt(), generatePermit()             │
│  - Wallet provider: window.ethereum (MetaMask / others)             │
└─────────────────────────────────────────────────────────────────────┘
                               │
                               │ (A) plain answers (age + 3 flags)
                               ▼
                    Local encryption in the browser
                    - FHEVM helper asks relayer for FHE keys
                    - Answers are turned into ciphertext handles
                               │
                               │ (B) encrypted payload + decrypt permit
                               ▼
┌──────────────────────────────┴──────────────────────────────────────┐
│           Zama FHEVM relayer + KMS (Sepolia, FHEVM v0.9)           │
│  - Manages FHE public keys and decryption permissions               │
│  - Forwards encrypted inputs to the FHE-enabled EVM                 │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               │ (C) encrypted inputs and proof
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│     MediShieldPreCheck.sol (FHE-enabled smart contract on Sepolia)  │
│  - Receives encrypted age & risk flags                              │
│  - Applies FHE comparison logic to compute category (1/2/3)         │
│  - Stores only the encrypted category handle per wallet             │
└─────────────────────────────────────────────────────────────────────┘
                               │
                               │ (D) encrypted category handle
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                 User browser (decrypt + display)                    │
│  - Calls FHEVM helper with handle + permit                          │
│  - Decrypts category locally                                        │
│  - Maps category → human-readable risk level + guidance             │
└─────────────────────────────────────────────────────────────────────┘
```

## 5. How to deploy this product

> These steps assume `pnpm` is installed and you have a Sepolia RPC endpoint plus a funded deployment wallet.

### 5.1 Clone & install

```bash
git clone https://github.com/your-org/MediShield_PreCheck.git
cd MediShield_PreCheck
pnpm install
```

### 5.2 Configure environment

For contract deployment and tools, export:

```bash
export MNEMONIC="word word word ..."     # Wallet used for deployments
export SEPOLIA_RPC_URL="https://..."     # Sepolia RPC (Infura, Alchemy, etc.)
```

For optional local FHEVM testing (Hardhat chain), set in `packages/nextjs/.env.local`:

```env
NEXT_PUBLIC_LOCAL_CONTRACT=0x0000000000000000000000000000000000000000
```

By default, the front-end is wired to the deployed Sepolia contract address
`0x6b2ce889faa4EeA304D04A9C6EBE06326d61B6C5` via the `CONTRACT_ADDRESSES` constant
in `packages/nextjs/app/page.tsx`. If you redeploy the contract, update that constant.

### 5.3 Deploy contracts to Sepolia

```bash
pnpm hardhat:compile
pnpm hardhat:deploy:sepolia
```

Copy the new `MediShieldPreCheck` address if you want to replace the default one.

### 5.4 Run the front-end locally

```bash
pnpm --filter ./packages/nextjs dev
```

Open `http://localhost:3000`, connect a Sepolia wallet, and run the full encrypted pre-check flow.

### 5.5 Production deployment

The Next.js app can be deployed to Vercel or any other platform that supports Next.js builds:

1. Create a new Vercel project from this repository.
2. Set the **build command** to `pnpm --filter ./packages/nextjs build` and the **output directory** to `packages/nextjs/.next`.
3. If you changed the contract address, either:
   - hard-code it in `CONTRACT_ADDRESSES` and redeploy; or
   - expose it via an environment variable and read it from the front-end.

---

## 6. Acknowledgments

MediShield PreCheck was built for the **Zama Developer Program** as a focused demonstration of privacy-first medical insurance triage.

**Powered by Zama’s FHEVM** – including the Solidity FHE libraries, FHEVM Hardhat tooling, and the browser relayer stack that makes fully homomorphic encrypted eligibility checks possible.


