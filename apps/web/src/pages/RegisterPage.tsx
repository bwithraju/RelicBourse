// Register Page for RelicBourse
// Seeds new user with ₹1,00,000 minor simulated balance upon account creation

import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getErrorMessage } from '../api/client';

export const RegisterPage: React.FC = () => {
  const { register, user, token } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (user && token) {
      navigate('/', { replace: true });
    }
  }, [user, token, navigate]);

  // Password strength calculation
  const strength = useMemo(() => {
    const hasMinLen = password.length >= 8;
    const hasLetter = /[a-zA-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSymbol = /[^a-zA-Z0-9]/.test(password);
    const hasUpper = /[A-Z]/.test(password) && /[a-z]/.test(password);

    let score = 0;
    if (hasMinLen) score++;
    if (hasLetter) score++;
    if (hasNumber) score++;
    if (hasSymbol || hasUpper) score++;

    let label = 'Very Weak';
    let color = '#ef4444';
    let width = '20%';

    if (score === 2) {
      label = 'Moderate';
      color = '#f59e0b';
      width = '50%';
    } else if (score === 3) {
      label = 'Good';
      color = '#38bdf8';
      width = '75%';
    } else if (score >= 4) {
      label = 'Strong';
      color = '#10b981';
      width = '100%';
    }

    return {
      score,
      label,
      color,
      width,
      hasMinLen,
      hasLetter,
      hasNumber,
      isValid: password.length >= 6, // Backward-compatible minimum while encouraging 8+
    };
  }, [password]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !email.includes('@')) {
      setError('Please provide a valid email.');
      return;
    }
    if (!password || password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      await register(email, password);
      navigate('/', { replace: true });
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
          <h2>Open Trading Account</h2>
          <p className="auth-subtitle">
            Includes instant demo seed of ₹1,00,000 (10,000,000 paise) simulated capital
          </p>
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
            <label className="form-label">Password</label>
            <input
              type="password"
              className="text-input"
              placeholder="Minimum 6 characters (8+ recommended)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {password.length > 0 && (
              <div className="password-strength-widget">
                <div className="strength-header">
                  <span className="strength-label">Strength:</span>
                  <span className="strength-value" style={{ color: strength.color }}>
                    {strength.label}
                  </span>
                </div>
                <div className="strength-bar-bg">
                  <div
                    className="strength-bar-fill"
                    style={{
                      width: strength.width,
                      backgroundColor: strength.color,
                    }}
                  />
                </div>
                <div className="strength-rules">
                  <span className={strength.hasMinLen ? 'rule-met' : 'rule-unmet'}>
                    {strength.hasMinLen ? '✓' : '•'} 8+ characters
                  </span>
                  <span className={strength.hasLetter ? 'rule-met' : 'rule-unmet'}>
                    {strength.hasLetter ? '✓' : '•'} Letters
                  </span>
                  <span className={strength.hasNumber ? 'rule-met' : 'rule-unmet'}>
                    {strength.hasNumber ? '✓' : '•'} Numbers
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Confirm Password</label>
            <input
              type="password"
              className="text-input"
              placeholder="Re-enter password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            className="btn-primary-auth"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Creating Account & Seeding Balance...' : 'Register & Claim ₹1,00,000 Demo Funds'}
          </button>
        </form>

        <div className="auth-footer">
          <span>Already registered?</span>{' '}
          <Link to="/login" className="auth-link">
            Log in to existing session
          </Link>
        </div>
      </div>
    </div>
  );
};
