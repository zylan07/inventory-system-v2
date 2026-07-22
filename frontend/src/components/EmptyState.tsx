"use client";

import React from "react";

type EmptyStateProps = {
  type: "products" | "users" | "stock" | "reports" | "search" | "filter";
  onPrimaryAction?: () => void;
  onSecondaryAction?: () => void;
  primaryActionLabel?: string;
  secondaryActionLabel?: string;
};

export default function EmptyState({
  type,
  onPrimaryAction,
  onSecondaryAction,
  primaryActionLabel,
  secondaryActionLabel,
}: EmptyStateProps) {
  const config = {
    products: {
      icon: (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--primary)' }}>
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
          <line x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
      ),
      title: "No Products Yet",
      description: "Start building your catalogue by adding your first product.",
      defaultPrimaryLabel: "Add Product",
    },
    users: {
      icon: (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--primary)' }}>
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      ),
      title: "No Users Found",
      description: "Create your first user account to grant access.",
      defaultPrimaryLabel: "Add User",
    },
    stock: {
      icon: (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--primary)' }}>
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
      ),
      title: "No Stock Available",
      description: "Inventory will appear here after products are added.",
      defaultPrimaryLabel: "",
    },
    reports: {
      icon: (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--primary)' }}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
      ),
      title: "No Transactions Found",
      description: "No transaction history is available for the selected criteria.",
      defaultPrimaryLabel: "",
    },
    search: {
      icon: (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--primary)' }}>
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      ),
      title: "No Results Found",
      description: "Try a different keyword or clear the filters.",
      defaultPrimaryLabel: "Clear Search",
    },
    filter: {
      icon: (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--primary)' }}>
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
        </svg>
      ),
      title: "Nothing Matches Your Filters",
      description: "Adjust your filters to see more results.",
      defaultPrimaryLabel: "Clear Filters",
    },
  }[type];

  const primaryLabel = primaryActionLabel || config.defaultPrimaryLabel;

  return (
    <div className="empty-state-container" style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      textAlign: "center",
      padding: "2.5rem 1.5rem",
      background: "#ffffff",
      borderRadius: "12px",
      margin: "1.5rem auto",
      maxWidth: "380px",
      border: "1px dashed var(--border)",
      boxShadow: "0 4px 12px rgba(0, 0, 0, 0.01)",
      animation: "emptyStateFadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards",
    }}>
      <div className="empty-state-icon" style={{
        marginBottom: "1rem",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "64px",
        height: "64px",
        borderRadius: "50%",
        background: "var(--secondary)",
      }}>
        {config.icon}
      </div>

      <h3 style={{
        fontSize: "1.05rem",
        fontWeight: 700,
        marginBottom: "0.5rem",
        color: "var(--foreground)",
        marginTop: 0,
      }}>
        {config.title}
      </h3>

      <p style={{
        fontSize: "0.825rem",
        color: "var(--foreground-muted)",
        marginBottom: "1.25rem",
        lineHeight: "1.4",
        maxWidth: "280px",
        marginRight: "auto",
        marginLeft: "auto",
      }}>
        {config.description}
      </p>

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", justifyContent: "center" }}>
        {onPrimaryAction && primaryLabel && (
          <button
            type="button"
            onClick={onPrimaryAction}
            className="btn-primary"
            style={{
              padding: "0.45rem 1rem",
              fontSize: "0.8rem",
              borderRadius: "6px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {primaryLabel}
          </button>
        )}

        {onSecondaryAction && secondaryActionLabel && (
          <button
            type="button"
            onClick={onSecondaryAction}
            className="btn-secondary"
            style={{
              padding: "0.45rem 1rem",
              fontSize: "0.8rem",
              borderRadius: "6px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {secondaryActionLabel}
          </button>
        )}
      </div>

      <style>{`
        @keyframes emptyStateFadeIn {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
