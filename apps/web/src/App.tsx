// Root Application for RelicBourse Web Client
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { WsProvider } from './context/WsContext';
import { Navbar } from './components/Navbar';
import { ProtectedRoute } from './components/ProtectedRoute';

import { MarketsPage } from './pages/MarketsPage';
import { MarketDetailPage } from './pages/MarketDetailPage';
import { OrdersPage } from './pages/OrdersPage';
import { PortfolioPage } from './pages/PortfolioPage';
import { AuctionsPage } from './pages/AuctionsPage';
import { AuctionDetailPage } from './pages/AuctionDetailPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <WsProvider>
          <div className="app-layout">
            <Navbar />
            <main className="app-main-content">
              <Routes>
                {/* Core trading routes — protected so visitors load login screen first */}
                <Route
                  path="/"
                  element={
                    <ProtectedRoute>
                      <MarketsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/market/:id"
                  element={
                    <ProtectedRoute>
                      <MarketDetailPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/auctions"
                  element={
                    <ProtectedRoute>
                      <AuctionsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/auctions/:id"
                  element={
                    <ProtectedRoute>
                      <AuctionDetailPage />
                    </ProtectedRoute>
                  }
                />

                {/* Auth routes */}
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />

                {/* Protected trader routes */}
                <Route
                  path="/orders"
                  element={
                    <ProtectedRoute>
                      <OrdersPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/portfolio"
                  element={
                    <ProtectedRoute>
                      <PortfolioPage />
                    </ProtectedRoute>
                  }
                />

                {/* Catch-all redirect */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </main>

            <footer className="app-footer">
              <div className="footer-content">
                <div className="footer-left">
                  <span>RelicBourse — The Darkhold Exchange</span>
                  <span className="footer-tagline">
                    Pure price-time priority • Anti-scalping collar protection • Atomic multi-table settlement
                  </span>
                </div>
                <div className="footer-right">
                  <span className="footer-badge">Paise minor units</span>
                  <span className="footer-badge">Rule 12 Solvency Audit</span>
                </div>
              </div>
            </footer>
          </div>
        </WsProvider>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;
