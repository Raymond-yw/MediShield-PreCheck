'use client';

import { useEffect, useMemo, useState } from 'react';
import { ethers } from 'ethers';
import { useDecrypt, useFhevm, useWallet, getFheInstance } from '../lib/fhevm';
import WalletModal from '../components/WalletModal';

const CONTRACT_ABI = [
  {
    inputs: [
      { internalType: 'externalEuint8', name: 'ageHandle', type: 'bytes32' },
      { internalType: 'bytes', name: 'ageProof', type: 'bytes' },
      { internalType: 'externalEbool', name: 'historyHandle', type: 'bytes32' },
      { internalType: 'bytes', name: 'historyProof', type: 'bytes' },
      { internalType: 'externalEbool', name: 'chronicHandle', type: 'bytes32' },
      { internalType: 'bytes', name: 'chronicProof', type: 'bytes' },
      { internalType: 'externalEbool', name: 'lifestyleHandle', type: 'bytes32' },
      { internalType: 'bytes', name: 'lifestyleProof', type: 'bytes' },
    ],
    name: 'checkEligibility',
    outputs: [{ internalType: 'bytes32', name: 'categoryHandle', type: 'bytes32' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'account', type: 'address' }],
    name: 'getLastEligibility',
    outputs: [
      { internalType: 'bytes32', name: 'categoryHandle', type: 'bytes32' },
      { internalType: 'uint256', name: 'evaluatedAt', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'protocolId',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const CONTRACT_ADDRESSES: Record<number, string> = {
  31337: process.env.NEXT_PUBLIC_LOCAL_CONTRACT ?? ZERO_ADDRESS,
  11155111: '0x6b2ce889faa4EeA304D04A9C6EBE06326d61B6C5', // Hardcoded Sepolia contract address
};

const SEPOLIA_CHAIN_ID = 11155111;
const SEPOLIA_CHAIN_ID_HEX = '0xaa36a7';

const SEPOLIA_CONFIG = {
  chainId: SEPOLIA_CHAIN_ID_HEX,
  chainName: 'Sepolia',
  nativeCurrency: {
    name: 'Sepolia Ether',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: ['https://rpc.sepolia.org/'],
  blockExplorerUrls: ['https://sepolia.etherscan.io/'],
};

type TimelineStepKey = 'encrypt' | 'submit' | 'process' | 'decrypt';

const TIMELINE_STEPS: { key: TimelineStepKey; title: string; detail: string }[] = [
  {
    key: 'encrypt',
    title: 'Encrypt inputs locally',
    detail: 'Your information stays inside the browser and is converted to ciphertext.',
  },
  {
    key: 'submit',
    title: 'Send encrypted request',
    detail: 'A signed transaction delivers only encrypted data to MediShield PreCheck.',
  },
  {
    key: 'process',
    title: 'On-chain FHE evaluation',
    detail: 'The smart contract evaluates eligibility with fully homomorphic operations.',
  },
  {
    key: 'decrypt',
    title: 'Privately reveal your result',
    detail: 'A short-lived permit lets you decrypt the outcome back on your device.',
  },
];

const CATEGORY_CONTENT: Record<
  number,
  { title: string; summary: string; tone: 'success' | 'warning' | 'critical'; guidance: string }
> = {
  1: {
    title: 'Eligible',
    summary: 'You likely qualify for standard coverage.',
    tone: 'success',
    guidance:
      'An agent can follow up once you decide to share more details. We do not expose your underlying answers.',
  },
  2: {
    title: 'Moderate',
    summary: 'You may qualify with additional review or adjusted terms.',
    tone: 'warning',
    guidance:
      'Expect a request for supplementary paperwork (e.g., physician notes or lifestyle statements) if you proceed.',
  },
  3: {
    title: 'Not Eligible',
    summary: 'This product is currently not aligned with your profile.',
    tone: 'critical',
    guidance:
      'Explore alternative plans such as short-term, supplemental, or community-based coverage that better accommodate your situation.',
  },
};

const booleanOptions = [
  { value: false, label: 'No', helper: 'Everything is clear.' },
  { value: true, label: 'Yes', helper: 'I have or had this factor.' },
];

const cn = (...classes: (string | false | undefined | null)[]) => classes.filter(Boolean).join(' ');

const formatAddress = (value?: string | null, size = 4) => {
  if (!value) return '';
  return `${value.slice(0, 2 + size)}…${value.slice(value.length - size)}`;
};

type ResultState = {
  category: number;
  handle: string;
  timestamp?: number;
  txHash?: string;
} | null;

type TimelineState = 'idle' | TimelineStepKey | 'complete';

export default function Page() {
  const {
    address,
    chainId,
    isConnected,
    connect: connectWallet,
    disconnect: disconnectWallet,
    isConnecting,
    error: walletError,
  } = useWallet();

  const { status: fheStatus, initialize: initializeFhe, reset: resetFhevm, error: fheError } = useFhevm();
  const { decrypt, isDecrypting, error: decryptError } = useDecrypt();

  const [age, setAge] = useState('');
  const [hasHistory, setHasHistory] = useState<boolean | null>(null);
  const [hasChronic, setHasChronic] = useState<boolean | null>(null);
  const [hasLifestyleRisk, setHasLifestyleRisk] = useState<boolean | null>(null);

  const [timelineState, setTimelineState] = useState<TimelineState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [evaluationResult, setEvaluationResult] = useState<ResultState>(null);
  const [isFetchingHistory, setIsFetchingHistory] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [ageInputError, setAgeInputError] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);
  const [showWalletModal, setShowWalletModal] = useState(false);

  const contractAddress = useMemo(() => {
    if (!chainId) return undefined;
    return CONTRACT_ADDRESSES[chainId] ?? undefined;
  }, [chainId]);

  const walletReady = isConnected && !!address;
  const onSepolia = chainId === SEPOLIA_CHAIN_ID;
  const isContractConfigured = contractAddress && contractAddress !== ZERO_ADDRESS;

  // Reset scroll position on page load to prevent auto-scroll
  useEffect(() => {
    // Scroll to top immediately on mount
    window.scrollTo(0, 0);
    
    // Prevent browser's scroll restoration
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
  }, []);

  useEffect(() => {
    setErrorMessage(null);
    setSuccessMessage(null);
  }, [address, chainId]);

  useEffect(() => {
    if (walletReady && fheStatus === 'idle') {
      initializeFhe();
    }
  }, [walletReady, fheStatus, initializeFhe]);

  // Reset FHEVM when wallet disconnects
  useEffect(() => {
    if (!walletReady && fheStatus !== 'idle') {
      resetFhevm();
      // Also clear evaluation result when wallet disconnects
      setEvaluationResult(null);
    }
  }, [walletReady, fheStatus, resetFhevm]);

  // Ensure the shake animation re-triggers whenever ageInputError changes
  useEffect(() => {
    if (ageInputError) {
      // Bump the key to force a remount
      setShakeKey(prev => prev + 1);
      // Clear the error state after 500ms
      const timer = setTimeout(() => {
        setAgeInputError(false);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [ageInputError]);

  const requestNetworkSwitch = async () => {
    if (!window.ethereum) {
      setErrorMessage('No Ethereum provider found. Please install MetaMask or a compatible wallet.');
      return;
    }
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: SEPOLIA_CHAIN_ID_HEX }],
      });
    } catch (err) {
      const error = err as { code?: number };
      if (error?.code === 4902) {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [SEPOLIA_CONFIG],
        });
      } else {
        throw error ?? err;
      }
    }
  };

  const handleConnect = async () => {
    setShowWalletModal(true);
  };

  const handleWalletConnect = async () => {
    try {
      await connectWallet();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unable to connect wallet.');
    }
  };

  const encryptBoolean = async (contractAddr: string, userAddr: string, value: boolean) => {
    const instance = getFheInstance();
    if (!instance) throw new Error('FHE instance is not ready.');
    const input = instance.createEncryptedInput(contractAddr, userAddr);
    input.addBool(value);
    const encrypted = await input.encrypt();
    return {
      handle: ethers.hexlify(encrypted.handles[0]),
      proof: ethers.hexlify(encrypted.inputProof),
    };
  };

  const encryptAge = async (contractAddr: string, userAddr: string, value: number) => {
    const instance = getFheInstance();
    if (!instance) throw new Error('FHE instance is not ready.');
    const input = instance.createEncryptedInput(contractAddr, userAddr);
    input.add8(value);
    const encrypted = await input.encrypt();
    return {
      handle: ethers.hexlify(encrypted.handles[0]),
      proof: ethers.hexlify(encrypted.inputProof),
    };
  };

  const resetTimeline = () => setTimelineState('idle');

  // Reset evaluation result, success message, and timeline
  const resetResults = () => {
    setEvaluationResult(null);
    setSuccessMessage(null);
    resetTimeline();
  };

  const copyToClipboard = async (text: string, type: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedAddress(type);
      setTimeout(() => setCopiedAddress(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    // Do not clear ageInputError here; let the validation logic control it
    resetTimeline();

    if (!walletReady) {
      setErrorMessage('Please connect your wallet to continue.');
      return;
    }

    if (!onSepolia) {
      setErrorMessage('Switch to Sepolia testnet to run the secure pre-check.');
      try {
        await requestNetworkSwitch();
      } catch {
        setErrorMessage('We could not switch networks automatically. Please choose Sepolia in your wallet.');
      }
      return;
    }

    if (!isContractConfigured) {
      setErrorMessage('Contract address not configured. Update NEXT_PUBLIC_SEPOLIA_CONTRACT before running the demo.');
      return;
    }

    // Age validation - first check for empty input
    const ageStr = age.trim();
    
    if (!ageStr) {
      setErrorMessage('Please enter your age.');
      setAgeInputError(true);
      return;
    }

    // Clear the visual error state
    setAgeInputError(false);

    // Validate age format and range (without triggering shake)
    if (ageStr.includes('.')) {
      setErrorMessage('Age must be a whole number (no decimals).');
      return;
    }

    if (ageStr.length > 1 && ageStr.startsWith('0')) {
      setErrorMessage('Please enter a valid age.');
      return;
    }

    if (ageStr.includes('-')) {
      setErrorMessage('Please enter a valid age.');
      return;
    }

    const numericAge = parseInt(ageStr, 10);
    
    if (Number.isNaN(numericAge)) {
      setErrorMessage('Please enter a valid age.');
      return;
    }

    if (numericAge <= 0) {
      setErrorMessage('Age must be greater than 0.');
      return;
    }

    if (numericAge > 150) {
      setErrorMessage('Age must be 150 or less.');
      return;
    }

    if (hasHistory === null || hasChronic === null || hasLifestyleRisk === null) {
      setErrorMessage('Select Yes or No for each health question.');
      return;
    }

    if (fheStatus === 'idle' || fheStatus === 'error') {
      await initializeFhe();
    }

    const instance = getFheInstance();
    if (!instance) {
      setErrorMessage('FHE instance is not available. Refresh the page or reconnect your wallet.');
      return;
    }

    setIsSubmitting(true);
    setTimelineState('encrypt');

    try {
      const ethereumProvider = window.ethereum as ethers.Eip1193Provider | undefined;
      if (!ethereumProvider) {
        throw new Error('Ethereum provider unavailable.');
      }
      const provider = new ethers.BrowserProvider(ethereumProvider);
      const signer = await provider.getSigner();
      const userAddress = await signer.getAddress();
      const contract = new ethers.Contract(contractAddress, CONTRACT_ABI, signer);

      const ageCipher = await encryptAge(contractAddress, userAddress, numericAge);
      const historyCipher = await encryptBoolean(contractAddress, userAddress, hasHistory);
      const chronicCipher = await encryptBoolean(contractAddress, userAddress, hasChronic);
      const lifestyleCipher = await encryptBoolean(contractAddress, userAddress, hasLifestyleRisk);

      setTimelineState('submit');

      // Wait for the user to sign the transaction
      let tx;
      let handle;
      try {
        // First use staticCall to get the returned handle
        handle = await contract.checkEligibility.staticCall(
          ageCipher.handle,
          ageCipher.proof,
          historyCipher.handle,
          historyCipher.proof,
          chronicCipher.handle,
          chronicCipher.proof,
          lifestyleCipher.handle,
          lifestyleCipher.proof,
        );
        
        // Then send the real transaction
        tx = await contract.checkEligibility(
          ageCipher.handle,
          ageCipher.proof,
          historyCipher.handle,
          historyCipher.proof,
          chronicCipher.handle,
          chronicCipher.proof,
          lifestyleCipher.handle,
          lifestyleCipher.proof,
        );
      } catch (signError: unknown) {
        // User rejected the signature
        const error = signError as { code?: number | string; message?: string };
        if (error?.code === 4001 || error?.code === 'ACTION_REJECTED' || error?.message?.includes('user rejected')) {
          setErrorMessage('Transaction signature rejected. No data was sent.');
          resetTimeline();
          return;
        }
        throw signError;
      }

      setTimelineState('process');
      const receipt = await tx.wait();

      setTimelineState('decrypt');
      const decrypted = await decrypt(handle, contractAddress, signer);
      const categoryNumber = Number(decrypted);

      setEvaluationResult({
        category: categoryNumber,
        handle,
        timestamp: Number(receipt.blockTimestamp ?? Math.floor(Date.now() / 1000)),
        txHash: receipt.hash,
      });
      setTimelineState('complete');
      setSuccessMessage('Eligibility result decrypted securely. Details below.');
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : undefined;
      if (message?.includes('user rejected')) {
        setErrorMessage('Transaction rejected. No data was sent.');
      } else {
        setErrorMessage(message ?? 'Something went wrong. Please try again.');
      }
      resetTimeline();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLoadHistory = async () => {
    if (!walletReady || !onSepolia || !isContractConfigured) return;
    setIsFetchingHistory(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    resetTimeline(); // Reset the timeline state
    setEvaluationResult(null); // Clear previous evaluation result

    // Clear all inputs
    setAge('');
    setHasHistory(null);
    setHasChronic(null);
    setHasLifestyleRisk(null);

    try {
      const ethereumProvider = window.ethereum as ethers.Eip1193Provider | undefined;
      if (!ethereumProvider) {
        throw new Error('Ethereum provider unavailable.');
      }
      const provider = new ethers.BrowserProvider(ethereumProvider);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(contractAddress, CONTRACT_ABI, signer);
      const [handle, timestamp] = await contract.getLastEligibility(address);

      if (handle === ZERO_ADDRESS || handle === ethers.ZeroHash) {
        setErrorMessage('No encrypted result stored for this wallet yet.');
        return;
      }

      const decrypted = await decrypt(handle, contractAddress, signer);
      const categoryNumber = Number(decrypted);

      setEvaluationResult({
        category: categoryNumber,
        handle,
        timestamp: Number(timestamp),
      });
      setTimelineState('complete');
      setSuccessMessage('Loaded your most recent encrypted decision from chain.');
    } catch (err) {
      console.error(err);
      setErrorMessage(err instanceof Error ? err.message : 'Unable to load previous result.');
    } finally {
      setIsFetchingHistory(false);
    }
  };

  const activeStepIndex =
    timelineState === 'idle'
      ? -1
      : timelineState === 'complete'
      ? TIMELINE_STEPS.length
      : TIMELINE_STEPS.findIndex(step => step.key === timelineState);

  const categoryInfo = evaluationResult ? CATEGORY_CONTENT[evaluationResult.category] ?? null : null;

  const needsNetworkSwitch = walletReady && !onSepolia;

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-100 via-orange-100 via-rose-100 to-pink-100 text-gray-900 relative overflow-hidden">
      {/* Cloud-like background layer - evenly spaced warm gradients */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Top-left cluster */}
        <div className="absolute -top-20 -left-20 w-[450px] h-[450px] bg-gradient-radial from-yellow-400/50 via-orange-300/35 via-amber-300/20 to-transparent rounded-full blur-3xl animate-float opacity-85" />
        
        {/* Top-right cluster */}
        <div className="absolute -top-10 right-10 w-[400px] h-[400px] bg-gradient-radial from-orange-400/45 via-yellow-300/30 to-transparent rounded-full blur-3xl animate-float-delayed opacity-80" />
        
        {/* Mid-left cluster */}
        <div className="absolute top-1/3 -left-10 w-[420px] h-[420px] bg-gradient-radial from-pink-400/50 via-rose-300/35 to-transparent rounded-full blur-3xl animate-float-slow opacity-75" />
        
        {/* Mid-right cluster */}
        <div className="absolute top-1/3 -right-10 w-[380px] h-[380px] bg-gradient-radial from-rose-400/45 via-pink-300/30 to-transparent rounded-full blur-3xl animate-float opacity-80" />
        
        {/* Center-left cluster */}
        <div className="absolute top-1/2 left-1/4 w-[360px] h-[360px] bg-gradient-radial from-purple-300/40 via-violet-300/25 to-transparent rounded-full blur-3xl animate-float-delayed opacity-70" />
        
        {/* Center-right cluster */}
        <div className="absolute top-1/2 right-1/4 w-[340px] h-[340px] bg-gradient-radial from-amber-400/45 via-yellow-300/30 to-transparent rounded-full blur-3xl animate-float-slow opacity-75" />
        
        {/* Bottom-left cluster */}
        <div className="absolute -bottom-10 left-10 w-[380px] h-[380px] bg-gradient-radial from-orange-300/40 via-peach-200/25 to-transparent rounded-full blur-3xl animate-float opacity-70" />
        
        {/* Bottom-right cluster */}
        <div className="absolute -bottom-20 -right-10 w-[400px] h-[400px] bg-gradient-radial from-red-300/40 via-rose-200/25 to-transparent rounded-full blur-3xl animate-float-delayed opacity-70" />
        
        {/* Bottom-center cluster */}
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 w-[350px] h-[350px] bg-gradient-radial from-pink-300/35 via-rose-200/20 to-transparent rounded-full blur-3xl animate-float-slow opacity-65" />
        
        {/* Top-center cluster */}
        <div className="absolute top-5 left-1/2 -translate-x-1/2 w-[320px] h-[320px] bg-gradient-radial from-yellow-300/40 via-amber-200/25 to-transparent rounded-full blur-3xl animate-float opacity-65" />
      </div>

      <section className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-8 lg:px-8">
        <div className="relative z-10 mx-auto flex max-w-7xl flex-col gap-6 lg:flex-row lg:items-center lg:justify-between lg:gap-10">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border-2 border-yellow-400/60 bg-gradient-to-r from-yellow-50 to-amber-50 px-4 py-2 text-base font-medium text-red-700 shadow-lg shadow-yellow-400/20">
              <span className={cn(
                'h-2.5 w-2.5 rounded-full shadow-sm',
                walletReady ? 'bg-emerald-500 shadow-emerald-500/50 animate-pulse' : 'bg-red-500 shadow-red-500/50'
              )} />
              Privacy-first medical insurance triage
            </div>
            <h1 className="mt-6 text-5xl font-bold tracking-tight bg-gradient-to-r from-gray-900 via-red-800 to-orange-700 bg-clip-text text-transparent sm:text-6xl lg:text-7xl drop-shadow-sm leading-tight pb-2">
              Know your eligibility. Keep your health history sovereign.
            </h1>
            <p className="mt-6 text-xl leading-relaxed text-gray-800 font-medium">
              MediShield PreCheck evaluates key underwriting factors entirely on encrypted data. Your browser handles
              the math, the blockchain confirms the outcome, and no one sees the raw answers.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              {!walletReady ? (
                <button
                  onClick={handleConnect}
                  disabled={isConnecting}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-red-500 via-orange-500 to-yellow-500 px-8 py-4 text-lg font-bold text-white shadow-xl shadow-orange-500/40 transition hover:shadow-2xl hover:shadow-orange-500/50 hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 disabled:opacity-65 min-w-[220px]"
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M4 7a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V7Z"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    />
                    <path
                      d="M8 12h8M12 8v8"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  {isConnecting ? 'Connecting…' : 'Connect wallet'}
                </button>
              ) : (
                <button
                  onClick={() => disconnectWallet()}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-red-300 bg-white/80 backdrop-blur-sm px-6 py-3 text-base font-semibold text-gray-900 shadow-lg transition hover:border-red-400 hover:bg-red-50/80 hover:scale-105 min-w-[220px]"
                >
                  Disconnect {formatAddress(address)}
                </button>
              )}
              <a
                href="#precheck"
                className="inline-flex items-center gap-2 rounded-xl border-2 border-yellow-400 bg-gradient-to-r from-yellow-50 to-amber-50 backdrop-blur-sm px-8 py-4 text-lg font-bold text-orange-700 shadow-xl shadow-yellow-400/30 transition hover:border-yellow-500 hover:shadow-2xl hover:shadow-yellow-400/40 hover:scale-105"
              >
                Explore workflow
              </a>
            </div>
          </div>
          <div className="w-full max-w-md rounded-3xl border-2 border-orange-200/60 bg-gradient-to-br from-orange-50/80 via-amber-50/70 to-yellow-50/80 backdrop-blur-md p-6 shadow-2xl shadow-orange-200/40">
            <h2 className="text-2xl font-bold bg-gradient-to-r from-orange-600 via-red-600 to-pink-600 bg-clip-text text-transparent">Environment diagnostics</h2>
            <dl className="mt-5 space-y-3 text-base text-gray-700">
              <div className="flex items-center justify-between rounded-xl border-2 border-amber-300/60 bg-gradient-to-r from-amber-50/90 to-yellow-50/90 px-5 py-4 shadow-md backdrop-blur-sm">
                <div>
                  <dt className="text-base uppercase tracking-wider text-amber-800 font-black mb-1">WALLET</dt>
                  <dd className="font-bold text-gray-900 text-lg mt-1">
                    {walletReady ? (
                      <button
                        onClick={() => copyToClipboard(address!, 'wallet')}
                        className="text-left hover:text-amber-700 transition-colors cursor-pointer relative"
                        title="Click to copy address"
                      >
                        {formatAddress(address, 5)}
                        {copiedAddress === 'wallet' && (
                          <span className="absolute left-full ml-2 text-sm text-emerald-600 font-medium whitespace-nowrap">✓ Copied!</span>
                        )}
                      </button>
                    ) : (
                      'Not connected'
                    )}
                  </dd>
                </div>
                <span
                  className={cn(
                    'flex h-3 w-3 items-center justify-center rounded-full shadow-lg flex-shrink-0',
                    walletReady ? 'bg-emerald-500 shadow-emerald-500/60 animate-pulse' : 'bg-red-500 shadow-red-500/60',
                  )}
                />
              </div>
              <div className="flex items-center justify-between rounded-xl border-2 border-green-300/60 bg-gradient-to-r from-green-50/90 to-emerald-50/90 px-5 py-4 shadow-md backdrop-blur-sm">
                <div>
                  <dt className="text-base uppercase tracking-wider text-green-800 font-black mb-1">NETWORK</dt>
                  <dd className="font-bold text-gray-900 text-lg mt-1">{onSepolia ? 'Sepolia testnet' : chainId ? `Chain ${chainId}` : 'No network detected'}</dd>
                  {needsNetworkSwitch && (
                    <p className="mt-1 text-xs text-amber-700 font-medium">Switch to Sepolia to run the secure flow.</p>
                  )}
                </div>
                <span className={cn('h-3 w-3 rounded-full shadow-lg', walletReady && onSepolia ? 'bg-emerald-500 shadow-emerald-500/60 animate-pulse' : 'bg-red-500 shadow-red-500/60')} />
              </div>
              <div className="flex items-center justify-between rounded-xl border-2 border-rose-300/60 bg-gradient-to-r from-rose-50/90 to-pink-50/90 px-5 py-4 shadow-md backdrop-blur-sm">
                <div>
                  <dt className="text-base uppercase tracking-wider text-rose-800 font-black mb-1">FHEVM STATUS</dt>
                  <dd className="font-bold capitalize text-gray-900 text-lg mt-1">{fheStatus === 'idle' ? 'Uninitialized' : fheStatus}</dd>
                  {fheError && <p className="mt-1 text-xs text-rose-700 font-medium">{fheError}</p>}
                </div>
                <span
                  className={cn(
                    'h-3 w-3 rounded-full shadow-lg',
                    walletReady && fheStatus === 'ready'
                      ? 'bg-emerald-500 shadow-emerald-500/60 animate-pulse'
                      : 'bg-red-500 shadow-red-500/60',
                  )}
                />
              </div>
              <div className="flex items-center justify-between rounded-xl border-2 border-purple-300/60 bg-gradient-to-r from-purple-50/90 to-pink-50/90 px-5 py-4 shadow-md backdrop-blur-sm">
                <div>
                  <dt className="text-base uppercase tracking-wider text-purple-800 font-black mb-1">CONTRACT</dt>
                  <dd className="font-bold text-gray-900 text-lg mt-1">
                    <button
                      onClick={() => copyToClipboard(CONTRACT_ADDRESSES[11155111], 'contract')}
                      className="text-left hover:text-purple-700 transition-colors cursor-pointer relative"
                      title="Click to copy address"
                    >
                      {formatAddress(CONTRACT_ADDRESSES[11155111], 5)}
                      {copiedAddress === 'contract' && (
                        <span className="absolute left-full ml-2 text-sm text-emerald-600 font-medium whitespace-nowrap">✓ Copied!</span>
                      )}
                    </button>
                  </dd>
                </div>
                <span
                  className={cn(
                    'h-3 w-3 rounded-full shadow-lg flex-shrink-0',
                    walletReady && isContractConfigured ? 'bg-emerald-500 shadow-emerald-500/60 animate-pulse' : 'bg-red-500 shadow-red-500/60',
                  )}
                />
              </div>
            </dl>
            <div className="mt-4 space-y-2 text-sm text-gray-600">
              {walletError && <p className="text-rose-700 font-medium">Wallet error: {walletError}</p>}
              {decryptError && <p className="text-rose-700 font-medium">Decrypt error: {decryptError}</p>}
            </div>
          </div>
        </div>
      </section>

      {/* Wallet Modal */}
      <WalletModal
        isOpen={showWalletModal}
        onClose={() => setShowWalletModal(false)}
        onConnect={handleWalletConnect}
      />

      <main id="precheck" className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-10">
        <section className="grid gap-10 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-3xl border border-red-200/60 bg-white p-8 shadow-xl shadow-red-100/30">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-gray-950">Step 1 · Secure pre-check</h2>
                <p className="mt-2 text-sm font-medium text-gray-700">
                  Answer key underwriting questions. Inputs are encrypted before leaving your browser.
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="mt-8 space-y-8">
              <div className="grid gap-7 md:grid-cols-2">
                {/* Age input - top-left card */}
                <div 
                  key={`age-input-${shakeKey}`}
                  className={cn(
                    'rounded-2xl border border-red-200/60 bg-rose-50/30 p-6 shadow-sm transition-all',
                    ageInputError && 'animate-shake border-red-500 bg-red-50'
                  )}
                >
                  <h3 className="text-sm font-bold text-gray-950">Age</h3>
                  <p className="mt-1 text-xs font-medium text-gray-700">(18–64 considered standard)</p>
                  <div className="mt-4">
                    <input
                      type="number"
                      min={1}
                      max={150}
                      step={1}
                      value={age}
                      onChange={event => {
                        const newAge = event.target.value;
                        setAge(newAge);
                        setAgeInputError(false);
                        resetResults(); // Reset results when age changes

                        // If the new age is valid, clear any existing error message
                        if (newAge && !newAge.includes('.') && !newAge.includes('-') && 
                            !(newAge.length > 1 && newAge.startsWith('0'))) {
                          const numAge = parseInt(newAge, 10);
                          if (!Number.isNaN(numAge) && numAge > 0 && numAge <= 150) {
                            setErrorMessage(null);
                          }
                        }
                      }}
                      className={cn(
                        'w-full rounded-lg border px-4 py-2.5 text-gray-900 shadow-sm focus:outline-none focus:ring-2 text-sm font-medium transition-colors',
                        ageInputError
                          ? 'border-red-500 bg-red-50 focus:border-red-600 focus:ring-red-500/30'
                          : 'border-red-200 bg-white focus:border-red-400 focus:ring-red-400/30'
                      )}
                      placeholder="Enter your age"
                    />
                  </div>
                  <p className="mt-3 text-xs text-gray-600">
                    We use the precise number to enforce the 18–64 boundary inside the encrypted contract.
                  </p>
                </div>

                {/* Past medical history - top-right card */}
                <div className="rounded-2xl border border-red-200/60 bg-rose-50/30 p-6 shadow-sm">
                  <h3 className="text-sm font-bold text-gray-950">Past medical history</h3>
                  <p className="mt-1 text-xs font-medium text-gray-700">Any notable conditions or hospitalisations in your history?</p>
                  <div className="mt-4 flex gap-3">
                    {booleanOptions.map(option => {
                      const isActive = hasHistory === option.value;
                      return (
                        <button
                          key={option.value ? 'yes' : 'no'}
                          type="button"
                          onClick={() => {
                            setHasHistory(option.value);
                            resetResults();
                          }}
                          className={cn(
                            'flex-1 rounded-xl border px-5 py-3 text-sm font-medium transition shadow-sm',
                            isActive
                              ? option.value
                                ? 'border-amber-400/70 bg-amber-50 text-amber-800 shadow-amber-200/60'
                                : 'border-emerald-400/70 bg-emerald-50 text-emerald-800 shadow-emerald-200/60'
                              : 'border-red-200/70 bg-white text-gray-700 hover:border-red-300',
                          )}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                  {hasHistory !== null && (
                    <p className="mt-3 text-xs text-gray-600">{booleanOptions.find(o => o.value === hasHistory)?.helper}</p>
                  )}
                </div>
              </div>

              <div className="grid gap-7 md:grid-cols-2">
                {/* Current chronic condition - bottom-left card */}
                <div className="rounded-2xl border border-red-200/60 bg-rose-50/30 p-6 shadow-sm">
                  <h3 className="text-sm font-bold text-gray-950">Current chronic condition</h3>
                  <p className="mt-1 text-xs font-medium text-gray-700">Are you managing an ongoing chronic illness today?</p>
                  <div className="mt-4 flex gap-3">
                    {booleanOptions.map(option => {
                      const isActive = hasChronic === option.value;
                      return (
                        <button
                          key={option.value ? 'yes' : 'no'}
                          type="button"
                          onClick={() => {
                            setHasChronic(option.value);
                            resetResults();
                          }}
                          className={cn(
                            'flex-1 rounded-xl border px-5 py-3 text-sm font-medium transition shadow-sm',
                            isActive
                              ? option.value
                                ? 'border-amber-400/70 bg-amber-50 text-amber-800 shadow-amber-200/60'
                                : 'border-emerald-400/70 bg-emerald-50 text-emerald-800 shadow-emerald-200/60'
                              : 'border-red-200/70 bg-white text-gray-700 hover:border-red-300',
                          )}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                  {hasChronic !== null && (
                    <p className="mt-3 text-xs text-gray-600">{booleanOptions.find(o => o.value === hasChronic)?.helper}</p>
                  )}
                </div>

                {/* Smoking or alcohol habits - bottom-right card */}
                <div className="rounded-2xl border border-red-200/60 bg-rose-50/30 p-6 shadow-sm">
                  <h3 className="text-sm font-bold text-gray-950">Smoking or alcohol habits</h3>
                  <p className="mt-1 text-xs font-medium text-gray-700">Do you actively smoke or have high-frequency alcohol consumption?</p>
                  <div className="mt-4 flex gap-3">
                    {booleanOptions.map(option => {
                      const isActive = hasLifestyleRisk === option.value;
                      return (
                        <button
                          key={option.value ? 'yes' : 'no'}
                          type="button"
                          onClick={() => {
                            setHasLifestyleRisk(option.value);
                            resetResults();
                          }}
                          className={cn(
                            'flex-1 rounded-xl border px-5 py-3 text-sm font-medium transition shadow-sm',
                            isActive
                              ? option.value
                                ? 'border-amber-400/70 bg-amber-50 text-amber-800 shadow-amber-200/60'
                                : 'border-emerald-400/70 bg-emerald-50 text-emerald-800 shadow-emerald-200/60'
                              : 'border-red-200/70 bg-white text-gray-700 hover:border-red-300',
                          )}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                  {hasLifestyleRisk !== null && (
                    <p className="mt-3 text-xs text-gray-600">{booleanOptions.find(o => o.value === hasLifestyleRisk)?.helper}</p>
                  )}
                </div>
              </div>

              {errorMessage && (
                <div className="rounded-xl border border-rose-400/50 bg-rose-50 px-4 py-3 text-sm text-rose-800 shadow-sm">
                  {errorMessage}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={
                    isSubmitting ||
                    isDecrypting ||
                    !walletReady ||
                    !onSepolia ||
                    !isContractConfigured ||
                    fheStatus !== 'ready'
                  }
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-red-500 to-red-600 px-6 py-3 text-base font-semibold text-white shadow-md shadow-red-500/30 transition hover:from-red-600 hover:to-red-700 hover:shadow-lg hover:shadow-red-500/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500 disabled:cursor-not-allowed disabled:opacity-65"
                >
                  {isSubmitting ? (
                    <>
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                        <circle
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeOpacity=".3"
                          strokeWidth="4"
                          fill="none"
                        />
                        <path
                          d="M4 12a8 8 0 018-8"
                          stroke="currentColor"
                          strokeWidth="4"
                          strokeLinecap="round"
                          fill="none"
                        />
                      </svg>
                      Submitting…
                    </>
                  ) : (
                    <>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                        <path
                          d="M4 7a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V7Z"
                          stroke="currentColor"
                          strokeWidth="1.5"
                        />
                        <path
                          d="M9 12h6"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                        />
                      </svg>
                      Check eligibility
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleLoadHistory}
                  disabled={!walletReady || !onSepolia || isFetchingHistory}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-300/70 bg-white px-6 py-3 text-base font-semibold text-gray-700 shadow-sm transition hover:border-red-400 hover:bg-red-50/50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isFetchingHistory ? 'Loading…' : 'Show last encrypted outcome'}
                </button>

                {needsNetworkSwitch && (
                  <button
                    type="button"
                    onClick={requestNetworkSwitch}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-400/70 bg-amber-50 px-5 py-3 text-sm text-amber-800 shadow-sm transition hover:border-amber-500 hover:bg-amber-100"
                  >
                    Switch to Sepolia
                  </button>
                )}
              </div>

              {/* Success message with downward arrow placed below the buttons */}
              {successMessage && (
                <div className="relative mt-10">
                  <div className="rounded-xl border-2 border-emerald-400 bg-emerald-50 px-6 py-4 text-base font-medium text-emerald-800 shadow-lg">
                    {successMessage}
                  </div>
                  {/* Downward arrow below the success message to guide scrolling */}
                  <button
                    type="button"
                    onClick={() => {
                      const element = document.getElementById('encrypted-result');
                      if (element) {
                        const yOffset = -40; // Slight offset so ENCRYPTED DECISION has some top margin
                        const y = element.getBoundingClientRect().top + window.pageYOffset + yOffset;
                        window.scrollTo({ top: y, behavior: 'smooth' });
                      }
                    }}
                    className="absolute -bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center animate-bounce cursor-pointer hover:scale-110 transition-transform"
                    aria-label="Scroll to result"
                  >
                    <svg 
                      width="32" 
                      height="24" 
                      viewBox="0 0 32 24" 
                      fill="none"
                    >
                      <path 
                        d="M16 24L4 12L8 8L16 16L24 8L28 12L16 24Z" 
                        fill="rgb(52 211 153)"
                      />
                    </svg>
                  </button>
                </div>
              )}
            </form>
          </div>

          <aside className="space-y-6">
            <div className="rounded-3xl border border-red-200/60 bg-white p-6 shadow-lg shadow-red-100/30">
              <h3 className="text-lg font-bold text-gray-950">Timeline</h3>
              <p className="mt-1 text-sm font-medium text-gray-700">
                Each stage runs on encrypted data. You control when decrypt permissions are issued.
              </p>
              <ol className="mt-6 space-y-4 text-sm text-gray-700">
                {TIMELINE_STEPS.map((step, index) => {
                  const status =
                    activeStepIndex === -1
                      ? 'idle'
                      : index < activeStepIndex
                      ? 'done'
                      : index === activeStepIndex
                      ? 'active'
                      : 'upcoming';
                  
                  const isLast = index === TIMELINE_STEPS.length - 1;
                  
                  return (
                    <li key={step.key} className="flex gap-3 relative">
                      {/* Vertical progress line between steps */}
                      {!isLast && (
                        <div className="absolute left-[5px] top-6 bottom-0 w-0.5">
                          <div className="h-full bg-gray-200">
                            <div
                              className={cn(
                                'w-full transition-all duration-500',
                                index < activeStepIndex ? 'h-full bg-emerald-500' : 'h-0'
                              )}
                            />
                          </div>
                        </div>
                      )}

                      {/* Status dot */}
                      <span
                        className={cn(
                          'relative mt-1 h-3 w-3 flex-none rounded-full shadow-md transition-all duration-300',
                          status === 'done'
                            ? 'bg-emerald-500 shadow-emerald-500/50 ring-2 ring-emerald-100 border-2 border-emerald-600'
                            : status === 'active'
                            ? 'bg-red-500 shadow-red-500/50 ring-2 ring-red-100 animate-pulse border-2 border-red-600'
                            : 'bg-gray-300 shadow-gray-300/30 border-2 border-gray-400',
                        )}
                      />

                      {/* Step content */}
                      <div className="flex-1 pb-2">
                        <p className={cn(
                          'font-medium transition-colors',
                          status === 'done' ? 'text-emerald-700' : status === 'active' ? 'text-red-700' : 'text-gray-900'
                        )}>
                          {step.title}
                        </p>
                        <p className="text-xs text-gray-600 mt-0.5">{step.detail}</p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>

            <div className="rounded-3xl border border-red-200/60 bg-white p-6 shadow-lg shadow-red-100/30">
              <h3 className="text-lg font-semibold text-gray-900">How we translate results</h3>
              <p className="mt-2 text-sm text-gray-600">
                FHE outputs a numeric category (1–3). We map it to human language before rendering, so your raw inputs
                never appear in logs or storage.
              </p>
              <ul className="mt-5 space-y-4 text-sm text-gray-700">
                <li className="rounded-2xl border border-emerald-400/30 bg-emerald-50/80 px-4 py-3 shadow-sm">
                  <span className="font-semibold text-emerald-800">1 · Eligible</span>
                  <p className="text-xs text-emerald-700">
                    Age in range and all risk toggles set to &ldquo;No&rdquo;.
                  </p>
                </li>
                <li className="rounded-2xl border border-amber-400/30 bg-amber-50/80 px-4 py-3 shadow-sm">
                  <span className="font-semibold text-amber-800">2 · Moderate</span>
                  <p className="text-xs text-amber-700">
                    Age in range with at least one risk factor marked &ldquo;Yes&rdquo;.
                  </p>
                </li>
                <li className="rounded-2xl border border-rose-400/30 bg-rose-50/80 px-4 py-3 shadow-sm">
                  <span className="font-semibold text-rose-800">3 · Not eligible</span>
                  <p className="text-xs text-rose-700">Age outside the 18–64 window regardless of other answers.</p>
                </li>
              </ul>
            </div>
          </aside>
        </section>

        {evaluationResult && categoryInfo && (
          <section id="encrypted-result" className="rounded-3xl border border-red-200/60 bg-white p-8 shadow-xl shadow-red-100/30">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div>
                <h3 className="text-sm uppercase tracking-widest text-gray-500">Encrypted decision</h3>
                <p className="mt-2 text-3xl font-semibold text-gray-900">
                  {categoryInfo.title}{' '}
                  <span
                    className={cn(
                      'ml-3 inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-widest shadow-sm',
                      categoryInfo.tone === 'success'
                        ? 'bg-emerald-100 text-emerald-800'
                        : categoryInfo.tone === 'warning'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-rose-100 text-rose-800',
                    )}
                  >
                    Risk Level
                  </span>
                </p>
                <p className="mt-3 text-sm text-gray-700">{categoryInfo.summary}</p>
                <p className="mt-2 text-sm text-gray-600">{categoryInfo.guidance}</p>
              </div>
              <div className="w-full max-w-sm rounded-2xl border border-red-200/60 bg-rose-50/40 p-5 text-sm text-gray-600">
                <dt className="font-medium text-gray-500">Ciphertext handle</dt>
                <dd className="mt-1 font-mono text-xs text-red-700 break-all">{evaluationResult.handle}</dd>
                {evaluationResult.timestamp && (
                  <div className="mt-4">
                    <dt className="font-medium text-gray-500">Evaluated on</dt>
                    <dd className="mt-1 text-gray-700">
                      {new Date(evaluationResult.timestamp * 1000).toLocaleString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </dd>
                  </div>
                )}
                {evaluationResult.txHash && (
                  <div className="mt-4">
                    <dt className="font-medium text-gray-500">Transaction</dt>
                    <dd className="mt-1">
                      <a
                        className="text-red-600 underline-offset-2 hover:underline"
                        target="_blank"
                        rel="noreferrer"
                        href={`https://sepolia.etherscan.io/tx/${evaluationResult.txHash}`}
                      >
                        {formatAddress(evaluationResult.txHash, 7)}
                      </a>
                    </dd>
                  </div>
                )}
              </div>
            </div>
            <p className="mt-6 text-xs text-gray-500">
              MediShield PreCheck stores only encrypted categories. You control if/when to share the plaintext result
              with an advisor.
            </p>
          </section>
        )}

        <section className="grid gap-8 rounded-3xl border border-red-200/60 bg-white p-8 shadow-lg shadow-red-100/30 sm:grid-cols-2">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">How FHE protects every step</h3>
            <ul className="mt-5 space-y-4 text-sm text-gray-700">
              <li className="flex gap-3">
                <span className="mt-1 h-2.5 w-2.5 flex-none rounded-full bg-red-500 shadow-sm shadow-red-500/40" />
                <p>
                  <strong className="text-gray-900">Local encryption first.</strong> We use Zama&apos;s FHEVM relayer
                  to encrypt your inputs before any network call.
                </p>
              </li>
              <li className="flex gap-3">
                <span className="mt-1 h-2.5 w-2.5 flex-none rounded-full bg-red-500 shadow-sm shadow-red-500/40" />
                <p>
                  <strong className="text-gray-900">On-chain privacy.</strong> The MediShield contract runs comparisons
                  on ciphertexts and stores only the encrypted category.
                </p>
              </li>
              <li className="flex gap-3">
                <span className="mt-1 h-2.5 w-2.5 flex-none rounded-full bg-red-500 shadow-sm shadow-red-500/40" />
                <p>
                  <strong className="text-gray-900">Controlled reveal.</strong> An EIP-712 permit lets{' '}
                  <em>you</em> decrypt the result. No one else gains access unless you explicitly share.
                </p>
              </li>
            </ul>
          </div>
          <div className="space-y-4 text-sm text-gray-700">
            <h4 className="text-lg font-semibold text-gray-900">What happens after this pre-check?</h4>
            <p>
              The pre-check provides an indicative category. An advisor may request additional information, but only if
              you initiate contact. No automated outreach is triggered by this demo.
            </p>
            <p>
              For transparency, all smart-contract logic is available on GitHub and deployed to Sepolia. Feel free to
              inspect the code or run the tests locally.
            </p>
          </div>
        </section>

        <section className="rounded-3xl border border-red-200/60 bg-rose-50/30 p-8 shadow-lg shadow-red-100/30">
          <h3 className="text-lg font-semibold text-gray-900">Frequently asked questions</h3>
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <div>
              <h4 className="text-sm font-semibold text-gray-900">Is this real health advice?</h4>
              <p className="mt-2 text-sm text-gray-700">
                No. MediShield PreCheck is a technology demonstration. It provides an encrypted recommendation category
                only. Final underwriting decisions require formal filings and medical review.
              </p>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-gray-900">Does the insurer see my answers?</h4>
              <p className="mt-2 text-sm text-gray-700">
                No raw data is stored on-chain, off-chain, or in analytics logs. You can export or delete the result at
                any time. Sharing the decrypted outcome is entirely voluntary.
              </p>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-gray-900">What if I close the page?</h4>
              <p className="mt-2 text-sm text-gray-700">
                You can reconnect your wallet and press "Show last encrypted outcome". The contract keeps only the
                ciphertext; decrypting it again requires your signature.
              </p>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-gray-900">How do I deploy my own copy?</h4>
              <p className="mt-2 text-sm text-gray-700">
                Please visit the official Zama documentation:{' '}
                <a 
                  href="https://github.com/zama-ai/fhevm" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-red-600 hover:text-red-700 underline"
                >
                  https://github.com/zama-ai/fhevm
                </a>
              </p>
            </div>
          </div>
          <p className="mt-8 text-xs text-gray-500">
            Disclaimer: This application is for demonstration purposes. Results are indicative and not a binding offer.
            Consult a licensed insurance representative for definitive guidance.
          </p>
        </section>
      </main>
    </div>
  );
}
