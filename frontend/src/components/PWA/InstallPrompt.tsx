'use client';

import { useEffect, useState } from 'react';

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [swUpdate, setSwUpdate] = useState<{ registration: ServiceWorkerRegistration | null, show: boolean }>({ registration: null, show: false });

  useEffect(() => {
    // 1. Install Prompt logic
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // Wait a moment and show the prompt subtly
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // 2. Service Worker Registration & Update Logic
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then((registration) => {
          console.log('[SW] Registered: ', registration.scope);

          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  // New SW is installed, but waiting to activate.
                  console.log('[SW] New version available!');
                  setSwUpdate({ registration, show: true });
                }
              });
            }
          });
        }).catch((err) => {
          console.log('[SW] Registration failed: ', err);
        });
      });
      
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
          window.location.reload();
          refreshing = true;
        }
      });
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowPrompt(false);
    }
    setDeferredPrompt(null);
  };

  const handleUpdateClick = () => {
    if (swUpdate.registration && swUpdate.registration.waiting) {
      swUpdate.registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
    setSwUpdate({ registration: null, show: false });
  };

  if (!showPrompt && !swUpdate.show) {
    return null;
  }

  return (
    <div style={{
      position: 'fixed',
      bottom: '1rem',
      right: '1rem',
      backgroundColor: '#1e293b',
      color: '#fff',
      padding: '1rem 1.5rem',
      borderRadius: '8px',
      boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      gap: '0.5rem',
      width: '320px',
      maxWidth: 'calc(100vw - 2rem)',
    }}>
      {swUpdate.show ? (
        <>
          <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9rem' }}>A new version is available!</p>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button 
              onClick={handleUpdateClick}
              style={{
                flex: 1, backgroundColor: '#2563eb', color: 'white', border: 'none', padding: '0.5rem', borderRadius: '4px', cursor: 'pointer', fontWeight: 500
              }}
            >Update Now</button>
            <button 
              onClick={() => setSwUpdate({ registration: null, show: false })}
              style={{
                background: 'transparent', color: '#cbd5e1', border: '1px solid #cbd5e1', padding: '0.5rem', borderRadius: '4px', cursor: 'pointer'
              }}
            >Dismiss</button>
          </div>
        </>
      ) : showPrompt ? (
        <>
          <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9rem' }}>Install the application for a better experience</p>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button 
              onClick={handleInstallClick}
              style={{
                flex: 1, backgroundColor: '#2563eb', color: 'white', border: 'none', padding: '0.5rem', borderRadius: '4px', cursor: 'pointer', fontWeight: 500
              }}
            >Add to Home Screen</button>
            <button 
              onClick={() => setShowPrompt(false)}
              style={{
                background: 'transparent', color: '#cbd5e1', border: '1px solid #cbd5e1', padding: '0.5rem', borderRadius: '4px', cursor: 'pointer'
              }}
            >Later</button>
          </div>
        </>
      ) : null}
    </div>
  );
}
