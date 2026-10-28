// WebSocket Context providing live socket status and subscription utilities across components

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { wsClient, WsConnectionStatus } from '../ws/client';

interface WsContextType {
  status: WsConnectionStatus;
  subscribeMarket: (marketId: string) => void;
  unsubscribeMarket: (marketId: string) => void;
  reconnect: () => void;
}

const WsContext = createContext<WsContextType | undefined>(undefined);

export const WsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<WsConnectionStatus>(wsClient.getStatus());

  useEffect(() => {
    // Connect to WebSocket server on mount
    wsClient.connect();

    const unsub = wsClient.onStatusChange((newStatus) => {
      setStatus(newStatus);
    });

    return () => {
      unsub();
    };
  }, []);

  const subscribeMarket = (marketId: string) => {
    wsClient.subscribeMarket(marketId);
  };

  const unsubscribeMarket = (marketId: string) => {
    wsClient.unsubscribeMarket(marketId);
  };

  const reconnect = () => {
    wsClient.connect();
  };

  return (
    <WsContext.Provider value={{ status, subscribeMarket, unsubscribeMarket, reconnect }}>
      {children}
    </WsContext.Provider>
  );
};

export function useWs(): WsContextType {
  const context = useContext(WsContext);
  if (!context) {
    throw new Error('useWs must be used within a WsProvider');
  }
  return context;
}
