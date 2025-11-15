/**
 * React Adapter - Universal FHEVM SDK
 * Wagmi-like React hooks for FHEVM operations
 * 
 * This file re-exports all React hooks from individual files for a clean structure.
 */

// Import and re-export all individual hooks
export { useWallet } from './useWallet';
export { useFhevm } from './useFhevm';
export { useContract } from './useContract';
export { useDecrypt } from './useDecrypt';
export { useEncrypt } from './useEncrypt';
