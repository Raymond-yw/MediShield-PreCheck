/**
 * Local FHEVM SDK
 * Simplified version for Next.js integration
 */

// Core FHEVM functionality
export * from './core/fhevm';
export * from './core/contracts';

// React hooks
export { useWallet } from './adapters/useWallet';
export { useFhevm } from './adapters/useFhevm';
export { useContract } from './adapters/useContract';
export { useDecrypt } from './adapters/useDecrypt';
export { useEncrypt } from './adapters/useEncrypt';
