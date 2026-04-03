"use client";

import { useAuth } from '../AuthProvider';
import { useRouter, usePathname } from 'next/navigation';

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard Overview',
  '/inward': 'Inward Stock',
  '/outward': 'Outward Stock',
  '/transfer': 'Stock Transfer',
  '/stock': 'Stock Levels',
  '/reports': 'Transaction Reports',
  '/adjustment': 'Stock Adjustment',
};

const ROLE_COLORS: Record<string, string> = {
  'Admin': '#7c3aed',
  'Manager': '#2563eb',
  'Basic User': '#c2410c',
};

export default function Navbar() {
  const { userRole, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  if (!userRole) return null;

  const pageTitle = PAGE_TITLES[pathname] || 'Inventra';
  const roleColor = ROLE_COLORS[userRole] || '#2563eb';

  return (
    <header style={{
      height: '60px',
      background: '#ffffff',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 1.5rem',
      position: 'sticky',
      top: 0,
      zIndex: 10,
      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--foreground)' }}>
          {pageTitle}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
        {/* Role pill */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          background: `${roleColor}12`,
          border: `1.5px solid ${roleColor}30`,
          borderRadius: '20px',
          padding: '0.25rem 0.75rem',
        }}>
          <div style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: roleColor,
            flexShrink: 0,
          }} />
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: roleColor }}>
            {userRole}
          </span>
        </div>

        {/* Logout */}
        <button
          onClick={() => { logout(); router.push('/'); }}
          style={{
            background: 'var(--secondary)',
            color: 'var(--foreground)',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            padding: '0.375rem 0.875rem',
            fontSize: '0.8rem',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'var(--transition)',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--secondary-hover)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'var(--secondary)')}
        >
          Logout
        </button>
      </div>
    </header>
  );
}
