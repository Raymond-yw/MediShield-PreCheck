/**
 * Wagmi-like hook for FHEVM instance
 */

import { useState, useCallback } from 'react';
import { initializeFheInstance } from '../core/index';

export function useFhevm() {
  const [instance, setInstance] = useState<any>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [error, setError] = useState<string>('');

  const initialize = useCallback(async () => {
    setStatus('loading');
    setError('');
    
    try {
      const fheInstance = await initializeFheInstance();
      setInstance(fheInstance);
      setStatus('ready');
      console.log('✅ FHEVM initialized');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setStatus('error');
      console.error('❌ FHEVM initialization failed:', err);
    }
  }, []);

  const reset = useCallback(() => {
    setInstance(null);
    setStatus('idle');
    setError('');
    console.log('🔄 FHEVM reset');
  }, []);

  return {
    instance,
    status,
    error,
    initialize,
    reset,
    isInitialized: status === 'ready',
  };
}
