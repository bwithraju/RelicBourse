// Authentication context for RelicBourse
// Manages JWT token, current user, live balance, and portfolio state

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { User, PortfolioView } from '../types';
import { apiClient, TOKEN_STORAGE_KEY, USER_STORAGE_KEY } from '../api/client';

interface AuthContextType {
  user: User | null;
  token: string | null;
  portfolio: PortfolioView | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshPortfolio: () => Promise<void>;
  switchDemoUser: (persona: 'buyer' | 'seller') => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_STORAGE_KEY));
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem(USER_STORAGE_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return null;
      }
    }
    // Default demo user so testing works immediately
    return { id: 'usr-demo-me', email: 'trader1@darkhold.exchange' };
  });

  const [portfolio, setPortfolio] = useState<PortfolioView | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const refreshPortfolio = useCallback(async () => {
    try {
      const data = await apiClient.getPortfolio();
      setPortfolio(data);
    } catch (err) {
      console.warn('Could not refresh portfolio:', err);
    }
  }, []);

  // Fetch portfolio whenever token or user is set
  useEffect(() => {
    if (token || user) {
      refreshPortfolio();
    }
  }, [token, user, refreshPortfolio]);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const res = await apiClient.login(email, password);
      setToken(res.token);
      setUser(res.user);
      localStorage.setItem(TOKEN_STORAGE_KEY, res.token);
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(res.user));
      await refreshPortfolio();
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const res = await apiClient.register(email, password);
      setToken(res.token);
      setUser(res.user);
      localStorage.setItem(TOKEN_STORAGE_KEY, res.token);
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(res.user));
      await refreshPortfolio();
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    setPortfolio(null);
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
  };

  // Switch demo account for multi-window / two-party trading test flow
  const switchDemoUser = (persona: 'buyer' | 'seller') => {
    if (persona === 'buyer') {
      const newUser = { id: 'usr-buyer-01', email: 'vip.buyer@darkhold.exchange' };
      setUser(newUser);
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(newUser));
    } else {
      const newUser = { id: 'usr-seller-02', email: 'scalp.shield@darkhold.exchange' };
      setUser(newUser);
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(newUser));
    }
    refreshPortfolio();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        portfolio,
        isLoading,
        login,
        register,
        logout,
        refreshPortfolio,
        switchDemoUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
