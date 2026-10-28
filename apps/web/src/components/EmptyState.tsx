// Reusable Empty State and Error Banner components for robust graceful degradation

import React from 'react';

interface EmptyStateProps {
  icon?: string;
  title: string;
  description: string;
  actionText?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon = '📦',
  title,
  description,
  actionText,
  onAction,
}) => {
  return (
    <div className="empty-state-box">
      <div className="empty-state-icon">{icon}</div>
      <h3 className="empty-state-title">{title}</h3>
      <p className="empty-state-desc">{description}</p>
      {actionText && onAction && (
        <button type="button" className="btn-empty-action" onClick={onAction}>
          {actionText}
        </button>
      )}
    </div>
  );
};

interface ErrorBannerProps {
  message: string;
  onRetry?: () => void;
}

export const ErrorBanner: React.FC<ErrorBannerProps> = ({ message, onRetry }) => {
  return (
    <div className="system-error-banner" role="alert">
      <div className="error-icon">⚠</div>
      <div className="error-text">
        <strong>Connection or Request Warning:</strong> {message}
      </div>
      {onRetry && (
        <button type="button" className="btn-retry-banner" onClick={onRetry}>
          Retry Request
        </button>
      )}
    </div>
  );
};
