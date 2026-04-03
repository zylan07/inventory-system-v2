"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../AuthProvider';

const ROLE_BADGE: Record<string, string> = {
  'Admin': 'badge-admin',
  'Manager': 'badge-manager',
  'Basic User': 'badge-user',
};

const NAV_GROUPS = {
  Admin: [
    { section: 'Operations', items: [
      { name: 'Dashboard', path: '/dashboard', icon: '📊' },
      { name: 'Users', path: '/users', icon: '👥' },
      { name: 'Products', path: '/products', icon: '🏷️' },
      { name: 'Inward', path: '/inward', icon: '📥' },
      { name: 'Outward', path: '/outward', icon: '📤' },
      { name: 'Transfer', path: '/transfer', icon: '🔄' },
    ]},
    { section: 'Reports & Stock', items: [
      { name: 'Stock Levels', path: '/stock', icon: '📦' },
      { name: 'Transactions', path: '/reports', icon: '📄' },
      { name: 'Adjustment', path: '/adjustment', icon: '⚖️' },
    ]},
  ],
  Manager: [
    { section: 'Operations', items: [
      { name: 'Dashboard', path: '/dashboard', icon: '📊' },
      { name: 'Inward', path: '/inward', icon: '📥' },
      { name: 'Outward', path: '/outward', icon: '📤' },
      { name: 'Transfer', path: '/transfer', icon: '🔄' },
    ]},
    { section: 'Reports & Stock', items: [
      { name: 'Stock Levels', path: '/stock', icon: '📦' },
      { name: 'Transactions', path: '/reports', icon: '📄' },
    ]},
  ],
  'Basic User': [
    { section: 'My Actions', items: [
      { name: 'Dashboard', path: '/dashboard', icon: '🏠' },
      { name: 'Outward (Deduct)', path: '/outward', icon: '📤' },
    ]},
  ],
};

export default function Sidebar() {
  const { userRole } = useAuth();
  const pathname = usePathname();

  if (!userRole || userRole === 'Basic User') return null;

  const navGroups = NAV_GROUPS[userRole];

  return (
    <aside style={{
      width: '240px',
      background: 'var(--sidebar-bg)',
      borderRight: '1px solid rgba(255,255,255,0.05)',
      padding: '1.25rem 0.75rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.25rem',
      overflowY: 'auto',
      flexShrink: 0,
    }}>
      {/* Logo */}
      <div style={{ padding: '0.5rem 0.75rem', marginBottom: '1rem' }}>
        <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.02em' }}>
          📦 INVENTRA
        </div>
        <div style={{ marginTop: '0.375rem' }}>
          <span className={`badge ${ROLE_BADGE[userRole] || ''}`} style={{ fontSize: '0.65rem' }}>
            {userRole}
          </span>
        </div>
      </div>

      {/* Nav Groups */}
      {navGroups?.map(group => (
        <div key={group.section} style={{ marginBottom: '0.75rem' }}>
          <div style={{
            fontSize: '0.65rem',
            fontWeight: 700,
            color: 'rgba(203, 213, 225, 0.5)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            padding: '0.25rem 0.75rem',
            marginBottom: '0.25rem'
          }}>
            {group.section}
          </div>
          {group.items.map(item => {
            const isActive = pathname === item.path;
            return (
              <Link key={item.path} href={item.path} style={{
                padding: '0.625rem 0.875rem',
                borderRadius: '8px',
                background: isActive ? 'var(--sidebar-active)' : 'transparent',
                color: isActive ? 'white' : 'var(--sidebar-text)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.625rem',
                fontWeight: isActive ? 600 : 400,
                fontSize: '0.875rem',
                transition: 'var(--transition)',
                textDecoration: 'none',
                marginBottom: '0.125rem',
              }}
              onMouseEnter={e => {
                if (!isActive) (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(255,255,255,0.07)';
              }}
              onMouseLeave={e => {
                if (!isActive) (e.currentTarget as HTMLAnchorElement).style.background = 'transparent';
              }}
              >
                <span style={{ fontSize: '1rem', flexShrink: 0 }}>{item.icon}</span>
                {item.name}
              </Link>
            );
          })}
        </div>
      ))}
    </aside>
  );
}
