"use client";

import { useAuth } from '../AuthProvider';
import { useRouter, usePathname } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { apiFetch } from '@/lib/apiFetch';

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

type Notification = {
  id: number;
  title: string;
  message: string;
  type: string;
  role: string | null;
  user_id: number | null;
  is_read: boolean;
  created_at: string;
  redirect_path: string | null;
  group_count: number;
};

function timeAgo(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours > 1 ? 's' : ''} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days > 1 ? 's' : ''} ago`;
}

function getIcon(type: string) {
  switch(type) {
    case 'low_stock': return '⚠️';
    case 'transfer': return '🔄';
    default: return '📦';
  }
}

export default function Navbar() {
  const { userRole, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeTab, setActiveTab] = useState<'All' | 'Alerts' | 'Transactions'>('All');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [profileName, setProfileName] = useState('');
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [showAccountDropdown, setShowAccountDropdown] = useState(false);
  const accountDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!userRole) return;

    const fetchNotifications = async () => {
      try {
        const res = await apiFetch('/notifications');
        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            setNotifications(data.data);
          }
        }
      } catch (err) {
        console.error('Failed to fetch notifications', err);
      }
    };

    fetchNotifications();
    const interval = setInterval(fetchNotifications, 15000); // 15 seconds
    
    return () => clearInterval(interval);
  }, [userRole]);

  useEffect(() => {
    if (!userRole) return;
    const fetchProfile = async () => {
      try {
        const res = await apiFetch('/profile');
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.data) {
            setProfileName(data.data.name || data.data.email || 'User');
            setProfileImage(data.data.profile_image);
          }
        }
      } catch (err) {
        console.error('Failed to fetch profile in navbar', err);
      }
    };
    fetchProfile();
    window.addEventListener('focus', fetchProfile);
    return () => window.removeEventListener('focus', fetchProfile);
  }, [userRole]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
      if (accountDropdownRef.current && !accountDropdownRef.current.contains(event.target as Node)) {
        setShowAccountDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleReadAndNavigate = async (notif: Notification) => {
    if (!notif.is_read) {
      setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, is_read: true } : n));
      try {
        await apiFetch(`/notifications/${notif.id}/read`, { method: 'PATCH' });
      } catch (err) {
        console.error('Failed to mark read', err);
      }
    }
    
    if (notif.redirect_path) {
      setShowDropdown(false);
      router.push(notif.redirect_path);
    }
  };

  const markAllRead = async () => {
    const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id);
    for (const id of unreadIds) {
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
      try {
        await apiFetch(`/notifications/${id}/read`, { method: 'PATCH' });
      } catch (err) { }
    }
  };

  if (!userRole) return null;

  const pageTitle = PAGE_TITLES[pathname] || 'Inventra';
  const roleColor = ROLE_COLORS[userRole] || '#2563eb';
  const unreadCount = notifications.filter(n => !n.is_read).length;

  const displayNotifications = notifications.filter(n => {
    if (activeTab === 'All') return true;
    if (activeTab === 'Alerts') return n.type === 'low_stock';
    if (activeTab === 'Transactions') return n.type !== 'low_stock';
    return true;
  });

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

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        
        {/* Notification Bell */}
        <div ref={dropdownRef} style={{ position: 'relative' }}>
          <button 
            onClick={() => setShowDropdown(!showDropdown)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0.5rem',
              color: 'var(--foreground)',
              transition: 'color 0.2s',
              borderRadius: '50%',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--secondary)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
            </svg>
            {unreadCount > 0 && (
              <div style={{
                position: 'absolute',
                top: '2px',
                right: '4px',
                width: '18px',
                height: '18px',
                background: '#ef4444',
                color: 'white',
                borderRadius: '50%',
                fontSize: '0.65rem',
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '2px solid white'
              }}>
                {unreadCount > 9 ? '9+' : unreadCount}
              </div>
            )}
          </button>

          {/* Notification Dropdown Container */}
          {showDropdown && (
            <div style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              width: '360px',
              background: 'white',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
              marginTop: '0.5rem',
              zIndex: 50,
              maxHeight: '450px',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              animation: 'slideDown 0.2s ease-out'
            }}>
              {/* Header */}
              <div style={{ 
                padding: '0.875rem 1rem 0.5rem', 
                borderBottom: '1px solid var(--border)',
                background: '#f8fafc'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>Notifications</h3>
                  {unreadCount > 0 && (
                    <button 
                      onClick={markAllRead}
                      style={{ background: 'none', border: 'none', fontSize: '0.75rem', color: '#2563eb', cursor: 'pointer', fontWeight: 500 }}
                    >
                      Mark all read ({unreadCount})
                    </button>
                  )}
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid transparent' }}>
                  {(['All', 'Alerts', 'Transactions'] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      style={{
                        background: 'none',
                        border: 'none',
                        borderBottom: activeTab === tab ? '2px solid #2563eb' : '2px solid transparent',
                        padding: '0.25rem 0.25rem 0.5rem',
                        fontSize: '0.8rem',
                        fontWeight: activeTab === tab ? 600 : 500,
                        color: activeTab === tab ? '#2563eb' : '#64748b',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
              </div>

              {/* Body */}
              <div style={{ overflowY: 'auto' }}>
                {displayNotifications.length === 0 ? (
                  <div style={{ 
                    padding: '2.5rem 1rem', 
                    textAlign: 'center', 
                    display: 'flex', 
                    flexDirection: 'column', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    gap: '0.5rem' 
                  }}>
                    <div style={{ 
                      width: '48px', 
                      height: '48px', 
                      borderRadius: '50%', 
                      background: '#f1f5f9', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      color: '#94a3b8'
                    }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                      </svg>
                    </div>
                    <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1e293b' }}>
                      All caught up!
                    </span>
                    <span style={{ fontSize: '0.75rem', color: '#64748b', maxWidth: '200px', lineHeight: 1.4 }}>
                      No notifications in this view.
                    </span>
                  </div>
                ) : (
                  displayNotifications.map(n => (
                    <div 
                      key={n.id} 
                      onClick={() => handleReadAndNavigate(n)}
                      style={{ 
                        padding: '1rem', 
                        borderBottom: '1px solid var(--border)',
                        background: n.is_read ? 'transparent' : '#f0fdf4',
                        cursor: 'pointer',
                        transition: 'background 0.2s',
                        display: 'flex',
                        gap: '0.75rem',
                        alignItems: 'flex-start'
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = n.is_read ? '#f8fafc' : '#dcfce3')}
                      onMouseLeave={e => (e.currentTarget.style.background = n.is_read ? 'transparent' : '#f0fdf4')}
                    >
                      <div style={{ fontSize: '1.25rem', marginTop: '2px' }}>
                        {getIcon(n.type)}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                          <span style={{ fontSize: '0.85rem', fontWeight: n.is_read ? 500 : 600, color: '#1e293b' }}>
                            {n.title} {n.group_count > 1 ? `(${n.group_count})` : ''}
                          </span>
                          {!n.is_read && (
                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e', flexShrink: 0, marginTop: '4px' }} />
                          )}
                        </div>
                        <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', lineHeight: 1.4 }}>
                          {n.message}
                        </p>
                        <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '0.5rem', fontWeight: 500 }}>
                          {timeAgo(n.created_at)}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

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

        {/* User Account Menu Dropdown */}
        <div ref={accountDropdownRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setShowAccountDropdown(!showAccountDropdown)}
            style={{
              background: 'white',
              color: 'var(--foreground)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              padding: '0.375rem 0.75rem',
              fontSize: '0.825rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              transition: 'var(--transition)',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--secondary)')}
            onMouseLeave={e => { if (!showAccountDropdown) e.currentTarget.style.background = 'white'; }}
          >
            {profileImage ? (
              <img 
                src={profileImage.startsWith('http') ? profileImage : `http://localhost:5000${profileImage}`} 
                alt="Profile" 
                style={{ width: '20px', height: '20px', borderRadius: '50%', objectFit: 'cover' }}
              />
            ) : (
              <span style={{ fontSize: '1rem' }}>👤</span>
            )}
            <span>{profileName || 'Loading...'}</span>
            <span style={{ fontSize: '0.6rem', color: 'var(--foreground-muted)', transform: showAccountDropdown ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
          </button>

          {showAccountDropdown && (
            <div 
              style={{
                position: 'absolute',
                top: '110%',
                right: 0,
                background: 'white',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                width: '160px',
                boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
                padding: '0.5rem',
                zIndex: 1000,
                display: 'flex',
                flexDirection: 'column',
                gap: '0.25rem',
                animation: 'slideDown 0.2s ease',
              }}
            >
              <button
                onClick={() => { setShowAccountDropdown(false); router.push('/profile'); }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--foreground)',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '4px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  fontWeight: 500,
                  transition: 'var(--transition)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--secondary)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >
                <span>👤</span>
                <span>My Profile</span>
              </button>
              <button
                onClick={() => { setShowAccountDropdown(false); logout(); }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--danger)',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '4px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  fontWeight: 500,
                  transition: 'var(--transition)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = '#fef2f2')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >
                <span>🚪</span>
                <span>Logout</span>
              </button>
            </div>
          )}
        </div>

        {/* Add minimal css for animation inline to avoid editing global files */}
        <style dangerouslySetInnerHTML={{__html: `
          @keyframes slideDown {
            from { opacity: 0; transform: translateY(-10px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}} />
      </div>
    </header>
  );
}
