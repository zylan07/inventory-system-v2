"use client";

import { useAuth } from '@/components/AuthProvider';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Toast from '@/components/Toast';
import { apiFetch } from '@/lib/apiFetch';
import { useGoogleLogin } from '@react-oauth/google';

type AuthMode = 'login' | 'forgot_password' | 'verify_otp' | 'reset_password';

export default function LoginPage() {
  const { userRole, login } = useAuth();
  const router = useRouter();

  const [mode, setMode] = useState<AuthMode>('login');
  
  // Form fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{message: string, type: 'success' | 'error', id: number} | null>(null);

  useEffect(() => {
    if (userRole) {
      if (userRole === 'Basic User') router.push('/outward');
      else router.push('/dashboard');
    }
  }, [userRole, router]);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type, id: Date.now() });
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch('http://localhost:5000/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();

      if (res.ok) {
        login(data.token, data.user);
        if (data.user.role === 'Basic User') {
          router.push('/outward');
        } else {
          router.push('/dashboard');
        }
      } else {
        showToast(data.message || "Invalid credentials", "error");
      }
    } catch (err) {
      showToast("Network error. Please try again.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      console.log("🟢 [Frontend] Google Login Success. Token response received:", tokenResponse);
      setLoading(true);
      try {
        const res = await fetch('http://localhost:5000/auth/google-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accessToken: tokenResponse.access_token })
        });
        const data = await res.json();
        
        console.log("🟢 [Frontend] Backend response status:", res.status);
        console.log("🟢 [Frontend] Backend response data:", data);

        if (res.ok) {
          login(data.token, data.user);
          if (data.user.role === 'Basic User') {
            router.push('/outward');
          } else {
            router.push('/dashboard');
          }
        } else {
          showToast(data.message || "Google Login failed checking backend", "error");
        }
      } catch (err: any) {
        console.error("🔴 [Frontend] Network or fetch error:", err);
        showToast("Network error. Please try again.", "error");
      } finally {
        setLoading(false);
      }
    },
    onError: (errorResponse) => {
      console.error("🔴 [Frontend] Google Login component error:", errorResponse);
      showToast("Google Login failed (Invalid Client / Configuration Error)", "error");
    }
  });

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const res = await fetch('http://localhost:5000/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      if (res.ok) {
        showToast("OTP sent to your email", "success");
        setMode('verify_otp');
      } else {
        showToast(data.message || "Error sending OTP", "error");
      }
    } catch {
      showToast("Network error", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const res = await fetch('http://localhost:5000/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp })
      });
      const data = await res.json();
      if (res.ok) {
        showToast("OTP Verified", "success");
        setMode('reset_password');
      } else {
        showToast(data.message || "Invalid OTP", "error");
      }
    } catch {
      showToast("Network error", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const res = await fetch('http://localhost:5000/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp, newPassword })
      });
      const data = await res.json();
      if (res.ok) {
        showToast("Password reset successfully. Please login.", "success");
        setMode('login');
        setPassword('');
        setOtp('');
        setNewPassword('');
      } else {
        showToast(data.message || "Error resetting password", "error");
      }
    } catch {
      showToast("Network error", "error");
    } finally {
      setLoading(false);
    }
  };

  if (userRole) return null;

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #f0f4ff 0%, #faf5ff 50%, #f0fdf4 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
    }}>
      {toast && (
        <Toast 
          key={toast.id} 
          message={toast.message} 
          type={toast.type} 
          onClose={() => setToast(null)} 
        />
      )}
      <div style={{ width: '100%', maxWidth: '400px' }}>
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>📦</div>
          <h1 style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.03em', marginBottom: '0.25rem' }}>
            <span className="text-gradient">INVENTRA</span>
          </h1>
          <p style={{ color: 'var(--foreground-muted)', fontSize: '0.9rem' }}>
            Inventory Management System
          </p>
        </div>

        <form onSubmit={
          mode === 'login' ? handleLogin :
          mode === 'forgot_password' ? handleForgotPassword :
          mode === 'verify_otp' ? handleVerifyOtp :
          handleResetPassword
        } style={{
          background: 'white',
          borderRadius: 'var(--radius)',
          padding: '2rem',
          boxShadow: 'var(--shadow-md)',
          border: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem'
        }}>
          {/* LOGIN MODE */}
          {mode === 'login' && (
            <>
              <button 
                type="button" 
                onClick={() => handleGoogleLogin()} 
                disabled={loading}
                style={{
                  ...buttonStyle(loading),
                  background: 'white',
                  color: '#3c4043',
                  border: '1px solid #dadce0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.75rem',
                  fontSize: '0.95rem',
                  boxShadow: '0 1px 2px 0 rgba(60,64,67,0.30)',
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Continue with Google
              </button>
              
              <div style={{ display: 'flex', alignItems: 'center', margin: '0.5rem 0' }}>
                <div style={{ flex: 1, height: '1px', background: 'var(--border)' }}></div>
                <span style={{ padding: '0 0.75rem', fontSize: '0.85rem', color: 'var(--foreground-muted)' }}>OR</span>
                <div style={{ flex: 1, height: '1px', background: 'var(--border)' }}></div>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 600, color: 'var(--foreground)' }}>
                  Email Address
                </label>
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                  style={inputStyle}
                  onFocus={(e) => e.currentTarget.style.borderColor = 'var(--primary)'}
                  onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 600, color: 'var(--foreground)' }}>
                  Password
                </label>
                <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                  style={inputStyle}
                  onFocus={(e) => e.currentTarget.style.borderColor = 'var(--primary)'}
                  onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
                />
              </div>
              <button type="submit" disabled={loading} style={buttonStyle(loading)}>
                {loading ? 'Authenticating...' : 'Sign In'}
              </button>
              <div style={{ textAlign: 'center', marginTop: '0.5rem' }}>
                <button type="button" onClick={() => setMode('forgot_password')} style={textButtonStyle}>
                  Forgot Password?
                </button>
              </div>
            </>
          )}

          {/* FORGOT PASSWORD MODE */}
          {mode === 'forgot_password' && (
            <>
              <h3 style={{ margin: 0, textAlign: 'center', color: 'var(--foreground)' }}>Reset Password</h3>
              <p style={{ margin: 0, textAlign: 'center', fontSize: '0.85rem', color: 'var(--foreground-muted)' }}>
                Enter your email to receive an OTP
              </p>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 600, color: 'var(--foreground)' }}>
                  Email Address
                </label>
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                  style={inputStyle}
                  onFocus={(e) => e.currentTarget.style.borderColor = 'var(--primary)'}
                  onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
                />
              </div>
              <button type="submit" disabled={loading} style={buttonStyle(loading)}>
                {loading ? 'Sending...' : 'Send OTP'}
              </button>
              <div style={{ textAlign: 'center', marginTop: '0.5rem' }}>
                <button type="button" onClick={() => setMode('login')} style={textButtonStyle}>
                  Back to Login
                </button>
              </div>
            </>
          )}

          {/* VERIFY OTP MODE */}
          {mode === 'verify_otp' && (
            <>
              <h3 style={{ margin: 0, textAlign: 'center', color: 'var(--foreground)' }}>Verify OTP</h3>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 600, color: 'var(--foreground)' }}>
                  6-Digit OTP
                </label>
                <input type="text" required maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value)}
                  style={{...inputStyle, letterSpacing: '0.25em', textAlign: 'center', fontSize: '1.25rem'}}
                  onFocus={(e) => e.currentTarget.style.borderColor = 'var(--primary)'}
                  onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
                />
              </div>
              <button type="submit" disabled={loading} style={buttonStyle(loading)}>
                {loading ? 'Verifying...' : 'Verify OTP'}
              </button>
            </>
          )}

          {/* RESET PASSWORD MODE */}
          {mode === 'reset_password' && (
            <>
              <h3 style={{ margin: 0, textAlign: 'center', color: 'var(--foreground)' }}>Set New Password</h3>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 600, color: 'var(--foreground)' }}>
                  New Password
                </label>
                <input type="password" required value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                  style={inputStyle}
                  onFocus={(e) => e.currentTarget.style.borderColor = 'var(--primary)'}
                  onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
                />
              </div>
              <button type="submit" disabled={loading} style={buttonStyle(loading)}>
                {loading ? 'Saving...' : 'Save New Password'}
              </button>
            </>
          )}
        </form>

        <p style={{ textAlign: 'center', marginTop: '2rem', fontSize: '0.75rem', color: 'var(--foreground-muted)' }}>
          Secure Authentication System
        </p>
      </div>
    </div>
  );
}

// Reusable Styles
const inputStyle = {
  width: '100%',
  padding: '0.75rem 1rem',
  borderRadius: '8px',
  border: '1px solid var(--border)',
  outline: 'none',
  fontSize: '0.95rem',
  transition: 'var(--transition)'
};

const buttonStyle = (loading: boolean) => ({
  marginTop: '0.5rem',
  width: '100%',
  padding: '0.875rem',
  borderRadius: '8px',
  border: 'none',
  background: 'var(--primary)',
  color: 'white',
  fontWeight: 600,
  fontSize: '1rem',
  cursor: loading ? 'not-allowed' : 'pointer',
  opacity: loading ? 0.7 : 1,
  transition: 'var(--transition)'
});

const textButtonStyle = {
  background: 'none',
  border: 'none',
  color: 'var(--primary)',
  fontSize: '0.85rem',
  fontWeight: 600,
  cursor: 'pointer',
  padding: 0,
};
