"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../AuthProvider';
import { useLanguage } from '../LanguageContext';

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
      { name: 'Clients', path: '/clients', icon: '🏢' },
      { name: 'Inward', path: '/inward', icon: '📥' },
      { name: 'Outward', path: '/outward', icon: '📤' },
      { name: 'Transfer', path: '/transfer', icon: '🔄' },
    ]},
    { section: 'Reports & Stock', items: [
      { name: 'Stock Levels', path: '/stock', icon: '📦' },
      { name: 'Transactions', path: '/reports', icon: '📄' },
      { name: 'Adjustment', path: '/adjustment', icon: '⚖️' },
    ]},
    { section: 'System Administration', items: [
      { name: 'Settings', path: '/settings', icon: '⚙️' },
    ]},
  ],
  Manager: [
    { section: 'Operations', items: [
      { name: 'Dashboard', path: '/dashboard', icon: '📊' },
      { name: 'Clients', path: '/clients', icon: '🏢' },
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
      { name: 'Outward (Deduct)', path: '/outward', icon: '📤' },
    ]},
  ],
};

const MENU_KEYS: Record<string, string> = {
  'Dashboard': 'dashboard',
  'Users': 'users',
  'Products': 'products',
  'Clients': 'clients',
  'Client Analytics': 'analytics',
  'Inward': 'inward',
  'Outward': 'outward',
  'Outward (Deduct)': 'outward',
  'Transfer': 'transfer',
  'Stock Levels': 'stock',
  'Transactions': 'reports',
  'Adjustment': 'adjustment',
  'Settings': 'settings'
};

export default function Sidebar() {
  const { userRole } = useAuth();
  const { t } = useLanguage();
  const pathname = usePathname();
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string>('INVENTRA');
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const fetchBranding = async () => {
      try {
        const res = await fetch(`${baseUrl}/auth/branding`);
        const json = await res.json();
        if (json.success && json.data) {
          setLogoUrl(json.data.logoUrl || null);
          setCompanyName(json.data.name || 'INVENTRA');
        }
      } catch (e) {}
    };
    fetchBranding();

    const handleBrandingUpdate = () => {
      fetchBranding();
    };
    window.addEventListener('branding-update', handleBrandingUpdate);

    // Responsive events
    const handleToggle = () => setIsOpen(prev => !prev);
    const handleClose = () => setIsOpen(false);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    
    window.addEventListener('toggle-sidebar', handleToggle);
    window.addEventListener('close-sidebar', handleClose);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('popstate', handleClose);

    return () => {
      window.removeEventListener('branding-update', handleBrandingUpdate);
      window.removeEventListener('toggle-sidebar', handleToggle);
      window.removeEventListener('close-sidebar', handleClose);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('popstate', handleClose);
    };
  }, []);

  // Body scroll lock effect
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!userRole || userRole === 'Basic User') return null;

  const navGroups = NAV_GROUPS[userRole];

  return (
    <>
      <div 
        className={`sidebar-overlay ${isOpen ? 'active' : ''}`}
        onClick={() => setIsOpen(false)}
      />
      <aside className={`app-sidebar ${isOpen ? 'open' : ''}`}>
      {/* Logo */}
      <div style={{ padding: '0.5rem 0.75rem', marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          {logoUrl ? (
            <img 
              src={`${baseUrl}${logoUrl}`} 
              alt="Company Logo" 
              style={{ height: '28px', width: 'auto', objectFit: 'contain', borderRadius: '4px' }} 
            />
          ) : (
            <span style={{ fontSize: '1.2rem' }}>📦</span>
          )}
          <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.02em', textTransform: 'uppercase' }}>
            {companyName}
          </div>
        </div>
        <div style={{ marginTop: '0.125rem' }}>
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
              onClick={() => setIsOpen(false)}
              >
                <span style={{ fontSize: '1rem', flexShrink: 0 }}>{item.icon}</span>
                {t(`nav.${MENU_KEYS[item.name] || item.name.toLowerCase()}`)}
              </Link>
            );
          })}
        </div>
      ))}
    </aside>
    </>
  );
}
