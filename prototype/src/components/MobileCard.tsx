import React from 'react';

interface MobileCardProps {
  title: React.ReactNode;
  primaryInfo: React.ReactNode;
  secondaryInfo?: React.ReactNode;
  statusBadge?: React.ReactNode;
  actions?: React.ReactNode;
  onClick?: () => void;
}

export function MobileCard({ title, primaryInfo, secondaryInfo, statusBadge, actions, onClick }: MobileCardProps) {
  return (
    <div 
      onClick={onClick}
      style={{
        background: 'white',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        padding: '1.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
        transition: 'all 0.2s ease',
        cursor: onClick ? 'pointer' : 'default',
        marginBottom: '0.75rem',
      }}
    >
      {/* Title + Status Badge Row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
        <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--foreground)', wordBreak: 'break-word' }}>
          {title}
        </div>
        {statusBadge && (
          <div style={{ flexShrink: 0 }}>
            {statusBadge}
          </div>
        )}
      </div>

      {/* Primary Information */}
      <div style={{ fontSize: '0.85rem', color: 'var(--foreground)', lineHeight: 1.4 }}>
        {primaryInfo}
      </div>

      {/* Secondary Information */}
      {secondaryInfo && (
        <div style={{ fontSize: '0.75rem', color: 'var(--foreground-muted)', lineHeight: 1.4 }}>
          {secondaryInfo}
        </div>
      )}

      {/* Action Buttons Row */}
      {actions && (
        <div style={{ 
          display: 'flex', 
          gap: '0.5rem', 
          justifyContent: 'flex-end', 
          borderTop: '1px solid var(--border)', 
          paddingTop: '0.75rem',
          marginTop: '0.25rem' 
        }}
        onClick={(e) => e.stopPropagation()} // Prevent card click when clicking action buttons
        >
          {actions}
        </div>
      )}
    </div>
  );
}
