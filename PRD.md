# PRD: MediShield PreCheck

> An English-only, privacy-first medical insurance pre-qualification website powered by FHEVM (Sepolia).

---

## 1. Vision

Use fully homomorphic encryption (FHE) so that users encrypt their health-related information locally in the browser, eligibility logic runs on-chain over ciphertext only, and the system reveals only a human‑readable eligibility category. This prevents insurers or third parties from ever accessing raw medical data and rebuilds trust and data sovereignty in medical insurance pre-checks.

---

## 2. Problem & FHE’s Unique Value

- **Current Web2 pain point:** traditional insurance portals ask users to submit detailed personal and medical information to centralized servers. That data can be resold or misused, leading to harassment, security issues, and privacy risks. Users also worry that “just checking eligibility” will trigger aggressive remarketing campaigns.
- **Unique value of FHE:**
  - User data is encrypted locally; eligibility logic executes on-chain over ciphertext without exposing raw inputs.
  - The contract returns only an eligibility category (Eligible / Moderate / Not Eligible); insurers cannot access underlying details, eliminating unsolicited outreach.
  - Users retain full data sovereignty: after seeing the result, they decide whether to consult an advisor or disclose more information.

---

## 3. Target Users

- Adults (18–64 as the primary audience) who want to understand whether they may qualify for standard medical insurance without revealing detailed health information.
- Insurers and brokers (future ecosystem partners) who respect privacy and compliance, and want low-friction funnels where users voluntarily share only the minimum necessary information.

---

## 4. Scope (v0.1 MVP)

- **Frontend (English-only UI):**
  - Four fields: Age, Past Medical History, Current Chronic Conditions, Smoking/Alcohol Habits.
  - Wallet connection (MetaMask, OKX Wallet, etc.).
  - Local encryption of inputs plus status indicators (Encrypting / On-chain processing).
  - Three eligibility outcomes (Eligible / Moderate / Not Eligible) with concise guidance copy.
- **Smart contract (on Sepolia):**
  - Receives encrypted inputs on FHEVM, evaluates eligibility, and outputs an encrypted category.
  - Returns only the encrypted category; does not store user-level plaintext.
- **Docs & demo:**
  - Clear README and demo flow documentation.
  - A 2–3 minute demo video.

Out of scope for v0.1:

- Real purchase / policy issuance flows and premium calculation (this is an indicative pre-check only).
- Multi-factor scoring beyond the core age + 3 risk flags.
- Integration with EHRs, prescriptions, or real medical records.

---

## 5. Eligibility Logic

The user provides four inputs (all encrypted in the frontend before being sent on-chain):

1. Whether age is between 18–64 inclusive.  
2. Whether there is any past medical history.  
3. Whether there is any current chronic condition.  
4. Whether there are smoking or alcohol habits.  

The result is grouped into three categories:

- **Eligible:** age is in range and all three risk flags are “No”.  
- **Moderate:** age is in range and at least one risk flag is “Yes”.  
- **Not Eligible:** age is out of range (i.e. \<18 or \>64).  

Key boundaries and assumptions:

- Age boundaries are fixed at 18–64 inclusive.  
- Chronic condition, past medical history, and smoking/alcohol are modeled as simple Yes/No flags; no extra detail in v0.1.  

Pseudo-code (encrypted on-chain logic):

```text
// Inputs: euint8 eAge, ebool eHistory, ebool eChronic, ebool eLifestyle
inRange  = TFHE.and(TFHE.gte(eAge, 18), TFHE.lte(eAge, 64))
anyRisk  = TFHE.or(TFHE.or(eHistory, eChronic), eLifestyle)
eligible = TFHE.and(inRange, TFHE.not(anyRisk))
moderate = TFHE.and(inRange, anyRisk)
// category: 1=Eligible, 2=Moderate, 3=Not Eligible
category = TFHE.cmux(eligible, 1,
           TFHE.cmux(moderate, 2, 3))
return TFHE.reencrypt(category, userPublicKey)
```

---

## 6. Core Flows

1. User connects a wallet (MetaMask / OKX Wallet, etc.).  
2. User fills out the English UI form; the client encrypts all inputs locally.  
3. The frontend generates an EIP‑712 decryption permit, then sends the encrypted transaction to Sepolia.  
4. The contract executes inside FHEVM and returns an encrypted category handle.  
5. The frontend uses the permit to decrypt the category and renders the result + guidance.  
6. The user reviews the guidance and decides the next step; no automatic advisor outreach is triggered.

---

## 7. UX/UI

- Visual style: warm, reassuring, and minimal, reducing the “underwriting anxiety” common in insurance flows.  
- Recommended stack: shadcn/ui + Tailwind CSS (or Chakra UI) on top of Next.js App Router.  

Key screens:

- **Landing**
  - Headline: “Privacy-first Medical Insurance Pre-Check”
  - Subtext: “Know your eligibility without sharing your personal details.”
  - CTAs: “Start Pre-Check” and “How FHE Protects You”.
- **Pre-Check Form**
  - Age: “Are you between 18 and 64 years old (inclusive)?” (Yes/No)
  - Past Medical History: “Any past medical history?” (Yes/No)
  - Current Chronic Conditions: “Any current chronic conditions?” (Yes/No)
  - Smoking/Alcohol Habits: “Smoking or alcohol use?” (Yes/No)
  - Actions: “Connect Wallet” → “Check Eligibility”
  - States: “Encrypting...”, “Submitting...”, “On-chain processing...”
- **Result**
  - Eligible: “You likely qualify for standard coverage.”
  - Moderate: “You may qualify with additional review, waiting period, or premium adjustment.”
  - Not Eligible: “You’re currently not eligible for this product. Explore other plans.”
  - Optional CTAs: “View Plans”, “Learn About FHE”.
- **About FHE**
  - Anchor copy: “Your data stays encrypted end-to-end. We only see a category — never your details.”

Accessibility & detail:

- Clear validation and boundary messages for age input.  
- Distinct loading / success / error states with inline explanations.  
- Mobile support (≥ 360px width); dark mode can be added in later versions.  

---

## 8. Tech Architecture

- **Frontend:** Next.js (App Router), TypeScript, shadcn/ui + Tailwind CSS, wagmi + WalletConnect, a browser-side FHEVM helper.  
- **Smart contracts:** Solidity (Zama FHEVM, TFHE library), Hardhat, `fhevm-mocks` for local unit tests.  
- **Network:** Ethereum Sepolia (testnet).  
- **Backend:** none in the traditional sense; only frontend + on-chain contracts (Minimalist Backend principle).  

Data & privacy:

- No plaintext health data is ever collected or stored server-side.  
- All encryption/decryption happens inside the user’s browser; the chain only processes ciphertext and outputs ciphertext results.  
- Optional: capture anonymous product analytics (if desired), strictly without any personally identifiable information (PII).  

---

## 9. Smart Contract Design

High-level interface (illustrative):

```text
contract MediShieldPreCheck {
  // euint8: age; ebool: history/chronic/lifestyle
  function checkEligibility(
    euint8 eAge,
    ebool eHistory,
    ebool eChronic,
    ebool eLifestyle,
    bytes calldata decryptPermit // EIP‑712 permit from user via FHEVM helper
  ) external returns (bytes memory reencCategory);
}
```

Design notes:

- Use the TFHE library for encrypted comparisons and boolean logic; do not decrypt user plaintext.  
- Return only the encrypted category (1/2/3); avoid storing user-level state on-chain (optionally emit events without identifiable information).  
- Use a “permit to decrypt” model: the EIP‑712 permit authorizes only the minimal decryption needed for this computation.  
- Keep gas costs low by focusing on boolean and range checks and optimizing constants/branches.  

---

## 10. Frontend Integration

- Initialize the FHEVM instance and fetch the contract public key.  
- Encrypt Age, History, Chronic, Lifestyle locally into `euint8` / `ebool` ciphertexts.  
- Generate the decryption authorization token (verifyingContract = contract address).  
- Call `checkEligibility` with encrypted inputs and receive the encrypted category handle.  
- Decrypt on the frontend and map the category to UI copy (Eligible / Moderate / Not Eligible).  

Typical status messages:

- Encrypting...  
- Generating permission...  
- Submitting transaction...  
- On-chain processing...  
- Decrypting result...  

---

## 11. Security & Compliance

- Use an isolated wallet for deployments and testing; confirm Sepolia ETH balances before deploying.  
- Do not store plaintext health data; avoid third-party plaintext analytics.  
- Make it explicit in the UI that this is an indicative pre-check demo, not medical or legal advice; actual underwriting decisions follow insurer terms.  

---

## 12. Testing Plan

- **Contract unit tests (fhevm-mocks):**
  - Age boundaries: Age = 18, 64, 17, 65.  
  - Risk combinations: 000, 001, 010, 011, 100, 101, 110, 111 (8 combinations).  
  - On-chain category matches expected outcomes.  
- **Frontend integration tests:**
  - Wallet connection failure / disconnect recovery; permit failure fallbacks; timeout handling.  
  - Decryption failure: user-facing error messaging and retry paths.  
- **E2E (Sepolia):**
  - Standard path completes within ~60 seconds.  
  - Consistent behavior across major browsers/devices.  

---

## 13. Deployment

- Deploy contracts to Sepolia and verify them on Etherscan.  
- Deploy the frontend to Vercel/Netlify with environment variables for RPC and contract addresses.  
- Support MetaMask, OKX Wallet, and WalletConnect (including mobile deep links).  
- Optionally add anonymized frontend error reporting (no PII) and on-chain event listeners for monitoring.  

---

## 14. Roadmap

- **v0.1 (this scope)**
  - Three-category eligibility, wallet connection, local encryption, on-chain evaluation, English-only UI.  
  - Minimal viable demo plus video walkthrough.  
- **v1.0**
  - Multi-factor scoring with configurable weights; more granular risk levels (e.g. “Sub-Moderate”).  
  - Opt-in data-sharing flows with partners under explicit consent and minimal disclosure.  
- **v2.0**
  - Integrations with medical proofs / lab results and verifiable credentials (VCs).  
  - Multi-language support and extended risk modeling.  

---

## 15. Risks & Mitigations

- Age boundaries fixed at 18–64 (inclusive); all logic and copy must stay aligned with this range.  
- Performance risk on low-end devices: optimize frontend and show progressive feedback; allow retries.  
- Risk of users interpreting the result as a binding insurance offer: strong disclaimers and guidance that this is only an indicative pre-check.  
- Wallet UX issues: support multiple wallets, with clear downgrade and retry paths.  

---

## 16. Acceptance Criteria

- The flow “connect wallet → fill form → encrypted submission → result” is stable end-to-end.  
- All 8 combinations of age and risk flags produce expected categories on-chain.  
- No plaintext health data is stored or transmitted across the full stack.  
- README, demo video, and online demo links are provided.  

---

## 17. Alignment with Zama Developer Program

- **Narrative & business potential:** grounded in a real “privacy-first pre-check” pain point with extensible commercial paths.  
- **UI/UX & presentation:** modern English UI, clear state transitions, and a video that walks through the full flow.  
- **Original tech architecture:** core logic lives in the FHEVM contract; no plaintext storage; frontend handles encryption/decryption.  
- **Working demo & development effort:** Sepolia demo with boundary test coverage, documentation, and automated tests.  


