'use client';

import { useState, useCallback } from 'react';

export function useLoginState() {
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const handleLoginStart = useCallback(() => {
    setLoading(true);
    setError('');
  }, []);

  const handleLoginComplete = useCallback(() => {
    setLoading(false);
  }, []);

  const handleLoginError = useCallback((loginError: Error) => {
    setError(loginError.message);
    setLoading(false);
  }, []);

  return {
    error,
    loading,
    setError,
    setLoading,
    handleLoginStart,
    handleLoginComplete,
    handleLoginError,
  };
}
