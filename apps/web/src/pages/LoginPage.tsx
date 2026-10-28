// Login Page for RelicBourse
import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getErrorMessage } from '../api/client';

export const LoginPage: React.FC = () => {
  const { login, user, token } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (user && token) {
      const destination = (location.state as { from?: { pathname: string } })?.from?.pathname || '/';
      navigate(destination, { replace: true });
    }
  }, [user, token, navigate, location]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!password || password.length < 4) {
      setError('Password must be at least 4 characters.');
      return;
    }

    setIsSubmitting(true);
    try {
      await login(email, password);
      const destination = (location.state as { from?: { pathname: string } })?.from?.pathname || '/';
      navigate(destination, { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-page-container">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-logo">⚡ RELIC<span className="brand-accent">BOURSE</span></div>
          <h2>Sign in to Darkhold Exchange</h2>
          <p className="auth-subtitle">High-frequency secondary order book for festival assets</p>
        </div>

        {error && (
          <div className="error-banner" role="alert">
            <div className="error-body">{error}</div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input
              type="email"
              className="text-input"
              placeholder="trader@darkhold.exchange"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <div className="form-label-row">
              <label className="form-label">Password</label>
              <Link to="/forgot-password" className="auth-forgot-link">
                Forgot password?
              </Link>
            </div>
            <input
              type="password"
              className="text-input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            className="btn-primary-auth"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>

        <div className="auth-footer">
          <span>New to RelicBourse?</span>{' '}
          <Link to="/register" className="auth-link">
            Create an account (₹1,00,000 demo credit seeded)
          </Link>
        </div>
      </div>
    </div>
  );
};
