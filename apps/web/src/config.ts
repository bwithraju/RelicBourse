// Configuration for RelicBourse Web Client
// Assumed Backend Port: 4000 (per specification default)

const defaultHost = typeof window !== 'undefined' && window.location.hostname ? window.location.hostname : 'localhost';

export const API_BASE = (import.meta.env.VITE_API_URL as string) || `http://${defaultHost}:4000`;
export const WS_URL = (import.meta.env.VITE_WS_URL as string) || `ws://${defaultHost}:4000/ws`;

export const CONFIG = {
  API_BASE,
  WS_URL,
  ASSUMED_BACKEND_PORT: 4000,
} as const;
