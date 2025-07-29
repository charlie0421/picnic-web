'use client';

import { createContext, useContext } from 'react';
import useSWR from 'swr';
import type { User } from '@supabase/supabase-js';

type AuthContextType = {
  user: User | null;
  isLoading: boolean;
  error: any;
  isAuthenticated: boolean;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export const useAuthSession = () => {
  const { data, error, isLoading } = useSWR('/api/auth/session', fetcher, {
    shouldRetryOnError: false,
    revalidateOnFocus: true,
  });

  return {
    user: data?.user || null,
    isLoading,
    error,
    isAuthenticated: !!data?.user,
  };
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const { user, isLoading, error, isAuthenticated } = useAuthSession();

  return (
    <AuthContext.Provider value={{ user, isLoading, error, isAuthenticated }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}; 