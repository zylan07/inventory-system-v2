"use client";

import React, { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/apiFetch';

export default function MaintenancePage() {
  const [msg, setMsg] = useState('System is currently under maintenance. Please try again later.');

  useEffect(() => {
    // Attempt to fetch custom maintenance message from settings (it might fail if unauthorized, but we fall back gracefully)
    const fetchMsg = async () => {
      try {
        const res = await fetch('http://localhost:5000/auth/maintenance-status');
        // Wait, auth routes are public. Let's make a public health check or similar, or just try to get it.
        // Let's create a quick public auth status route if needed, or simply let the login fail with 503 and return the message in the json!
        // Yes, the 503 response itself returns the exact message string! But in case they visited /maintenance directly, we can show default or query.
        // Let's check query params as well!
        const params = new URLSearchParams(window.location.search);
        const queryMsg = params.get('msg');
        if (queryMsg) setMsg(queryMsg);
      } catch (e) {}
    };
    fetchMsg();
  }, []);

  const handleRetry = () => {
    // Redirect to dashboard to check if maintenance is disabled
    window.location.href = '/dashboard';
  };

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', fontFamily: 'Inter, sans-serif', padding: '1rem', textAlign: 'center' }}>
      <div style={{ fontSize: '4.5rem', marginBottom: '1.25rem' }}>⚙️</div>
      <h1 style={{ fontSize: '2.25rem', fontWeight: 800, color: '#1e293b', marginBottom: '0.75rem', letterSpacing: '-0.025em' }}>System Under Maintenance</h1>
      <p style={{ fontSize: '1.05rem', color: '#64748b', maxWidth: '460px', lineHeight: 1.6, margin: '0 auto 1.5rem auto' }}>
        {msg}
      </p>
      <button 
        onClick={handleRetry}
        className="btn-primary" 
        style={{ 
          padding: '0.625rem 1.5rem', 
          borderRadius: '6px', 
          fontWeight: 600, 
          background: 'var(--primary)',
          color: 'white',
          border: 'none',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
          cursor: 'pointer'
        }}
      >
        Retry Connection
      </button>
    </div>
  );
}
