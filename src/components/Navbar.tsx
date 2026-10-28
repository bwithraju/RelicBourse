// Top navigation bar for RelicBourse
// Displays branding, WS connection status indicator, live balance, user email, and links

import React from 'react';
import { NavLink, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useWs } from '../context/WsContext';
import { formatMoney } from '../utils/format';

export const Navbar: React.FC = () => {
  const { user, portfolio, logout, switchDemoUser } = useAuth();
  const { status, reconnect } = useWs();

  // Balance calculation (Available cash = balance - reserved)
  const availableBalanceMinor = portfolio
    ? Math.max(0, portfolio.balanceMinor - portfolio.reservedMinor)
    : 0;

  const isWsConnected = status === 'CONNECTED';

  return (
    <header className="navbar-container">
      <div className="navbar-left">
        <Link to="/" className="brand-logo">
          <span className="brand-icon">⚡</span>
          <span className="brand-title">RELIC<span className="brand-accent">BOURSE</span></span>
          <span className="brand-badge">DARKHOLD</span>
        </Link>

        {/* WebSocket Connection Indicator */}
        <div
          className={`ws-indicator ${isWsConnected ? 'status-live' : 'status-reconnecting'}`}
          title={isWsConnected ? 'WebSocket: Live Stream Connected' : `WebSocket: ${status} (Click to reconnect)`}
          onClick={() => !isWsConnected && reconnect()}
        >
          <span className="ws-dot" />
          <span className="ws-text">{isWsConnected ? 'LIVE' : status}</span>
        </div>

        {/* Nav Links */}
        <nav className="nav-links">
          <NavLink
            to="/"
            end
            className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
          >
            Markets
          </NavLink>
          <NavLink
            to="/orders"
            className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
          >
            My Orders
          </NavLink>
          <NavLink
            to="/portfolio"
            className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
          >
            Portfolio
          </NavLink>
          <NavLink
            to="/auctions"
            className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
          >
            Auctions
          </NavLink>
        </nav>
      </div>

      <div className="navbar-right">
        {user ? (
          <>
            {/* Live Balance Display */}
            <div className="balance-pill" title="Live Available Balance from GET /portfolio">
              <span className="balance-label">Cash:</span>
              <span className="balance-amount">{formatMoney(availableBalanceMinor)}</span>
              {portfolio && portfolio.reservedMinor > 0 && (
                <span className="balance-reserved">
                  ({formatMoney(portfolio.reservedMinor)} held)
                </span>
              )}
            </div>

            {/* User Info & Persona Switcher */}
            <div className="user-dropdown">
              <span className="user-email" title={user.email}>{user.email}</span>
              <div className="demo-switcher">
                <button
                  type="button"
                  className="btn-persona"
                  onClick={() => switchDemoUser(user.email.includes('buyer') ? 'seller' : 'buyer')}
                  title="Switch between Demo Buyer and Demo Seller personas for multi-window testing"
                >
                  Switch Persona
                </button>
              </div>
            </div>

            {/* Logout Button */}
            <button type="button" className="btn-logout" onClick={logout}>
              Sign Out
            </button>
          </>
        ) : (
          <div className="auth-buttons">
            <Link to="/login" className="btn-login-nav">
              Log In
            </Link>
            <Link to="/register" className="btn-register-nav">
              Register
            </Link>
          </div>
        )}
      </div>
    </header>
  );
};
