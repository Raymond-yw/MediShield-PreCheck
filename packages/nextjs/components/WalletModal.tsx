'use client';

import { useState } from 'react';

interface WalletOption {
  id: string;
  name: string;
  icon: string;
  description: string;
  isInstalled?: () => boolean;
  connect: () => Promise<void>;
}

interface WalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnect: (walletId: string) => Promise<void>;
}

export default function WalletModal({ isOpen, onClose, onConnect }: WalletModalProps) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const walletOptions: WalletOption[] = [
    {
      id: 'metamask',
      name: 'MetaMask',
      icon: '🦊',
      description: 'Connect with MetaMask wallet',
      isInstalled: () => typeof window !== 'undefined' && !!(window.ethereum as any)?.isMetaMask,
      connect: async () => {
        if (typeof window === 'undefined' || !window.ethereum) {
          throw new Error('MetaMask is not installed. Please install it from metamask.io');
        }
        await onConnect('metamask');
      },
    },
    {
      id: 'coinbase',
      name: 'Coinbase Wallet',
      icon: '🔷',
      description: 'Connect with Coinbase Wallet',
      isInstalled: () => typeof window !== 'undefined' && !!(window.ethereum as any)?.isCoinbaseWallet,
      connect: async () => {
        if (typeof window === 'undefined' || !window.ethereum) {
          throw new Error('Coinbase Wallet is not installed. Please install it from coinbase.com/wallet');
        }
        await onConnect('coinbase');
      },
    },
    {
      id: 'walletconnect',
      name: 'WalletConnect',
      icon: '🔗',
      description: 'Scan with WalletConnect',
      connect: async () => {
        // WalletConnect integration would be implemented here
        throw new Error('WalletConnect integration coming soon');
      },
    },
    {
      id: 'trust',
      name: 'Trust Wallet',
      icon: '⭐',
      description: 'Connect with Trust Wallet',
      isInstalled: () => typeof window !== 'undefined' && !!(window.ethereum as any)?.isTrust,
      connect: async () => {
        if (typeof window === 'undefined' || !window.ethereum) {
          throw new Error('Trust Wallet is not installed. Please install it from trustwallet.com');
        }
        await onConnect('trust');
      },
    },
    {
      id: 'okx',
      name: 'OKX Wallet',
      icon: '⚫',
      description: 'Connect with OKX Wallet',
      isInstalled: () => typeof window !== 'undefined' && !!(window as any).okxwallet,
      connect: async () => {
        if (typeof window === 'undefined' || !(window as any).okxwallet) {
          throw new Error('OKX Wallet is not installed. Please install it from okx.com/web3');
        }
        await onConnect('okx');
      },
    },
  ];

  const handleWalletClick = async (wallet: WalletOption) => {
    setIsConnecting(true);
    setError(null);

    try {
      await wallet.connect();
      onClose();
    } catch (err) {
      console.error(`Error connecting to ${wallet.name}:`, err);
      setError(err instanceof Error ? err.message : 'Failed to connect wallet');
    } finally {
      setIsConnecting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop with warm gradient overlay */}
      <div 
        className="absolute inset-0 bg-gradient-to-br from-black/40 via-red-900/20 to-orange-900/20 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal container */}
      <div className="relative z-10 w-full max-w-md rounded-3xl border-2 border-orange-200/60 bg-gradient-to-br from-amber-50/95 via-orange-50/95 to-rose-50/95 backdrop-blur-lg p-8 shadow-2xl shadow-orange-500/30">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-full border border-red-300/50 bg-white/80 text-gray-600 transition hover:bg-red-50 hover:text-red-700"
          aria-label="Close"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path
              d="M18 6L6 18M6 6l12 12"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        {/* Header */}
        <div className="text-center">
          <h2 className="text-2xl font-bold bg-gradient-to-r from-red-600 via-orange-600 to-yellow-600 bg-clip-text text-transparent">
            Connect Wallet
          </h2>
          <p className="mt-2 text-sm font-medium text-gray-700">
            Choose your preferred wallet to continue
          </p>
        </div>

        {/* Error message */}
        {error && (
          <div className="mt-6 rounded-xl border border-rose-400/50 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {error}
          </div>
        )}

        {/* Wallet options */}
        <div className="mt-6 space-y-3">
          {walletOptions.map(wallet => {
            const installed = wallet.isInstalled?.() ?? true;
            
            return (
              <button
                key={wallet.id}
                onClick={() => handleWalletClick(wallet)}
                disabled={isConnecting || !installed}
                className={`
                  w-full group relative flex items-center gap-4 rounded-2xl border-2 p-4 text-left transition-all
                  ${installed
                    ? 'border-orange-200/60 bg-white hover:border-orange-400 hover:bg-gradient-to-r hover:from-orange-50 hover:to-amber-50 hover:shadow-lg hover:shadow-orange-200/40 hover:scale-[1.02]'
                    : 'border-gray-200/60 bg-gray-50/50 cursor-not-allowed opacity-60'
                  }
                  ${isConnecting ? 'opacity-50 cursor-wait' : ''}
                `}
              >
                {/* Wallet icon */}
                <div className={`
                  flex h-12 w-12 items-center justify-center rounded-xl text-3xl transition-transform
                  ${installed ? 'bg-gradient-to-br from-orange-100 to-amber-100 group-hover:scale-110' : 'bg-gray-100'}
                `}>
                  {wallet.icon}
                </div>

                {/* Wallet info */}
                <div className="flex-1">
                  <p className="font-bold text-gray-900">{wallet.name}</p>
                  <p className="text-xs text-gray-600 mt-0.5">
                    {installed ? wallet.description : 'Not installed'}
                  </p>
                </div>

                {/* Status indicator */}
                {installed && (
                  <div className="flex items-center">
                    <svg 
                      width="20" 
                      height="20" 
                      viewBox="0 0 24 24" 
                      fill="none"
                      className="text-orange-500 group-hover:text-orange-600 transition-colors"
                    >
                      <path
                        d="M9 18l6-6-6-6"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Footer note */}
        <p className="mt-6 text-center text-xs text-gray-500">
          By connecting, you agree to our{' '}
          <a href="#" className="text-red-600 hover:text-red-700 underline">
            Terms of Service
          </a>
        </p>
      </div>
    </div>
  );
}

