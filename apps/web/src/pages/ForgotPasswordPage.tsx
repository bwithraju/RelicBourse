import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { apiClient, getErrorMessage } from '../api/client';

export const ForgotPasswordPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const urlToken = searchParams.get('token') || '';
  const [step, setStep] = useState<'request' | 'reset'>(urlToken ? 'reset' : 'request');

  // Request state
  const [email, setEmail] = useState('');
  const [isRequesting, setIsRequesting] = useState(false);
  const [requestSuccess, setRequestSuccess] = useState<string | null>(null);
  const [devToken, setDevToken] = useState<string | null>(null);

  // Reset state
  const [token, setToken] = useState(urlToken);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  // Error state
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (urlToken) {
      setToken(urlToken);
      setStep('reset');
    }
  }, [urlToken]);

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
      hasSymbol,
      isValid: hasMinLen && hasLetter && hasNumber,
    };
  }, [password]);

  const handleRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setRequestSuccess(null);
    setDevToken(null);

    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }

    setIsRequesting(true);
    try {
      const res = await apiClient.forgotPassword(email);
      setRequestSuccess(
        res.message || 'If this email is registered, password reset instructions have been issued.'
      );
      if (res.resetToken) {
        setDevToken(res.resetToken);
        setToken(res.resetToken);
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsRequesting(false);
    }
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!token.trim()) {
      setError('Reset token is required.');
      return;
    }
    if (!strength.isValid) {
      setError('Password must be at least 8 characters long and contain both letters and numbers.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsResetting(true);
    try {
      await apiClient.resetPassword(token.trim(), password);
      setResetSuccess(true);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="auth-page-container">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-logo">
            ⚡ RELIC<span className="brand-accent">BOURSE</span>
          </div>
          <h2>{step === 'request' ? 'Password Recovery' : 'Reset Credentials'}</h2>
          <p className="auth-subtitle">
            {step === 'request'
              ? 'Enter your registered email to receive cryptographic reset authorization'
              : 'Supply your single-use reset token and configure a hardened password'}
          </p>
        </div>

        {/* Tab switch */}
        <div className="auth-tabs">
          <button
            type="button"
            className={`auth-tab-btn ${step === 'request' ? 'active' : ''}`}
            onClick={() => {
              setStep('request');
              setError(null);
            }}
          >
            1. Request Token
          </button>
          <button
            type="button"
            className={`auth-tab-btn ${step === 'reset' ? 'active' : ''}`}
            onClick={() => {
              setStep('reset');
              setError(null);
            }}
          >
            2. Reset Password
          </button>
        </div>

        {error && (
          <div className="error-banner" role="alert">
            <div className="error-body">{error}</div>
          </div>
        )}

        {step === 'request' && (
          <>
            {requestSuccess && (
              <div className="auth-success-box">
                <div className="auth-success-title">✓ Request Processed</div>
                <div className="auth-success-body">{requestSuccess}</div>
              </div>
            )}

            {devToken && (
              <div className="token-callout">
                <div className="token-callout-header">
                  <span className="token-callout-badge">DEV ENVIRONMENT</span>
                  <span>Active Reset Token Generated</span>
                </div>
                <code className="token-code">{devToken}</code>
                <button
                  type="button"
                  className="btn-use-token"
                  onClick={() => {
                    setToken(devToken);
                    setStep('reset');
                  }}
                >
                  Proceed to Reset with this Token →
                </button>
              </div>
            )}

            <form onSubmit={handleRequestSubmit} className="auth-form">
              <div className="form-group">
                <label className="form-label">Registered Email</label>
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

              <button
                type="submit"
                className="btn-primary-auth"
                disabled={isRequesting}
              >
                {isRequesting ? 'Authorizing Request...' : 'Send Reset Token'}
              </button>
            </form>
          </>
        )}

        {step === 'reset' && (
          <>
            {resetSuccess ? (
              <div className="auth-success-box">
                <div className="auth-success-title">✓ Password Reset Complete</div>
                <p className="auth-success-body">
                  Your security credentials have been updated and synchronized with exchange nodes. You can now log in.
                </p>
                <button
                  type="button"
                  className="btn-primary-auth"
                  style={{ marginTop: '1rem' }}
                  onClick={() => navigate('/login')}
                >
                  Sign In to Darkhold Exchange
                </button>
              </div>
            ) : (
              <form onSubmit={handleResetSubmit} className="auth-form">
                <div className="form-group">
                  <label className="form-label">Reset Token</label>
                  <input
                    type="text"
                    className="text-input"
                    placeholder="Enter 64-character reset token"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    required
                  />
                  <span className="form-hint">Tokens are valid for 15 minutes and expire after single use.</span>
                </div>

                <div className="form-group">
                  <label className="form-label">New Password</label>
                  <input
                    type="password"
                    className="text-input"
                    placeholder="Minimum 8 characters, letters & numbers"
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
                  <label className="form-label">Confirm New Password</label>
                  <input
                    type="password"
                    className="text-input"
                    placeholder="Repeat new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="btn-primary-auth"
                  disabled={isResetting || !strength.isValid}
                >
                  {isResetting ? 'Updating Credentials...' : 'Update Password'}
                </button>
              </form>
            )}
          </>
        )}

        <div className="auth-footer">
          <span>Remember your password?</span>{' '}
          <Link to="/login" className="auth-link">
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
};
