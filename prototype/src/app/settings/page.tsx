"use client";

import React, { useState, useEffect, useRef } from 'react';
import { apiFetch } from '@/lib/apiFetch';
import { useToast } from '@/components/ToastProvider';
import { useAuth } from '@/components/AuthProvider';
import { useRouter } from 'next/navigation';

interface CompanyInfo {
  name: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  gstNumber: string;
  logoUrl: string | null;
  footerText: string;
}

interface NotificationSettings {
  lowStockAlerts: boolean;
  emailAlerts: boolean;
  browserNotifications: boolean;
  defaultThreshold: number;
}

export default function SettingsPage() {
  const { showToast } = useToast();
  const { userRole } = useAuth();
  const router = useRouter();
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

  // Settings states
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo>({ name: '', address: '', phone: '', email: '', website: '', gstNumber: '', logoUrl: null, footerText: '' });
  const [origCompanyInfo, setOrigCompanyInfo] = useState<CompanyInfo>({ name: '', address: '', phone: '', email: '', website: '', gstNumber: '', logoUrl: null, footerText: '' });

  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>({ lowStockAlerts: true, emailAlerts: true, browserNotifications: true, defaultThreshold: 10 });
  const [origNotificationSettings, setOrigNotificationSettings] = useState<NotificationSettings>({ lowStockAlerts: true, emailAlerts: true, browserNotifications: true, defaultThreshold: 10 });

  // Threshold safety multipliers states
  const [globalSafetyMultiplier, setGlobalSafetyMultiplier] = useState(1.0);
  const [origGlobalSafetyMultiplier, setOrigGlobalSafetyMultiplier] = useState(1.0);
  const [lowStockLimit, setLowStockLimit] = useState(10);
  const [origLowStockLimit, setOrigLowStockLimit] = useState(10);
  const [origBusinessConfig, setOrigBusinessConfig] = useState<any>(null);

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  // Operation locks and loaders
  const [isBackupLoading, setIsBackupLoading] = useState(false);
  const [isRestoreLoading, setIsRestoreLoading] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState('');
  const [saveLoading, setSaveLoading] = useState<Record<string, boolean>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);
  const restoreInputRef = useRef<HTMLInputElement>(null);

  // Enforce Admin access on mount
  useEffect(() => {
    if (userRole && userRole !== 'Admin') {
      router.push('/dashboard');
    }
  }, [userRole, router]);

  // Fetch settings on mount
  const loadData = async () => {
    try {
      const res = await apiFetch('/settings');
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          const d = json.data;
          if (d.company_info) { 
            setCompanyInfo(d.company_info); 
            setOrigCompanyInfo(d.company_info); 
          }
          if (d.notification_settings) { 
            setNotificationSettings(d.notification_settings); 
            setOrigNotificationSettings(d.notification_settings); 
          }
          
          if (d.business_configuration) {
            setOrigBusinessConfig(d.business_configuration);
            const bc = d.business_configuration;
            if (bc.thresholds) {
              setGlobalSafetyMultiplier(parseFloat(bc.thresholds.global_safety_multiplier) || 1.0);
              setOrigGlobalSafetyMultiplier(parseFloat(bc.thresholds.global_safety_multiplier) || 1.0);
              setLowStockLimit(parseInt(bc.thresholds.low_stock_threshold) || 10);
              setOrigLowStockLimit(parseInt(bc.thresholds.low_stock_threshold) || 10);
            }
          }
        }
      }
    } catch (e) {
      showToast('Failed to retrieve system settings.', 'error');
    }
  };

  useEffect(() => {
    if (userRole === 'Admin') {
      loadData();
    }
  }, [userRole]);

  // Save Settings helper
  const handleSaveSetting = async (key: string, value: any) => {
    setSaveLoading(prev => ({ ...prev, [key]: true }));
    try {
      const res = await apiFetch(`/settings/${key}`, {
        method: 'PUT',
        body: JSON.stringify(value)
      });
      const json = await res.json();
      if (res.ok && json.success) {
        showToast(`${key.replace('_', ' ')} settings saved successfully.`, 'success');
        if (key === 'company_info') { 
          setCompanyInfo(json.data); 
          setOrigCompanyInfo(json.data); 
        }
        window.dispatchEvent(new Event('branding-update'));
      } else {
        throw new Error(json.message);
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to save configuration.', 'error');
    } finally {
      setSaveLoading(prev => ({ ...prev, [key]: false }));
    }
  };

  const handleSaveCompanyInfo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!(companyInfo.name || '').trim()) return showToast('Company Name is required.', 'error');
    handleSaveSetting('company_info', companyInfo);
  };

  // Branding (Logo uploads)
  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 2 * 1024 * 1024) {
        return showToast('Logo image size cannot exceed 2 MB.', 'error');
      }
      setLogoFile(file);
      const reader = new FileReader();
      reader.onload = (event) => {
        setLogoPreview(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUploadLogo = async () => {
    if (!logoFile) return;
    setSaveLoading(prev => ({ ...prev, branding: true }));
    const formData = new FormData();
    formData.append('logo', logoFile);

    try {
      const res = await apiFetch('/settings/logo', {
        method: 'POST',
        body: formData
      });
      const json = await res.json();
      if (res.ok && json.success) {
        showToast('Logo uploaded successfully.', 'success');
        setCompanyInfo(json.companyInfo);
        setOrigCompanyInfo(json.companyInfo);
        setLogoFile(null);
        setLogoPreview(null);
        window.dispatchEvent(new Event('branding-update'));
      } else {
        throw new Error(json.message);
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to upload logo.', 'error');
    } finally {
      setSaveLoading(prev => ({ ...prev, branding: false }));
    }
  };

  const handleRemoveLogo = async () => {
    if (!window.confirm('Are you sure you want to remove the company branding logo?')) return;
    setSaveLoading(prev => ({ ...prev, branding: true }));
    try {
      const res = await apiFetch('/settings/logo', { method: 'DELETE' });
      const json = await res.json();
      if (res.ok && json.success) {
        showToast('Logo removed successfully.', 'success');
        setCompanyInfo(json.companyInfo);
        setOrigCompanyInfo(json.companyInfo);
        setLogoPreview(null);
        window.dispatchEvent(new Event('branding-update'));
      }
    } catch (e) {
      showToast('Failed to remove logo.', 'error');
    } finally {
      setSaveLoading(prev => ({ ...prev, branding: false }));
    }
  };

  const handleResetNotificationSettings = () => {
    setNotificationSettings(origNotificationSettings);
    setGlobalSafetyMultiplier(origGlobalSafetyMultiplier);
    setLowStockLimit(origLowStockLimit);
    showToast('Notification and threshold settings reset to saved values.', 'success');
  };

  const handleSaveNotificationAndThresholds = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveLoading(prev => ({ ...prev, notification_settings: true }));
    try {
      // 1. Save notification settings
      const res1 = await apiFetch('/settings/notification_settings', {
        method: 'PUT',
        body: JSON.stringify(notificationSettings)
      });
      if (!res1.ok) throw new Error('Failed to save notification settings');
      const json1 = await res1.json();

      // 2. Save business configuration thresholds
      const currentBC = origBusinessConfig || {
        company_details: { name: companyInfo.name, address: companyInfo.address, gst: companyInfo.gstNumber },
        regional: { currency_symbol: '₹', currency_name: 'INR', date_format: 'YYYY-MM-DD', default_language: 'en' },
        thresholds: { global_safety_multiplier: globalSafetyMultiplier, low_stock_threshold: lowStockLimit },
        notifications: { inventory: [], purchase: [], client: [], security: [], system: [] },
        terminology: { ADJUSTMENT: 'Correct Stock', TRANSFER: 'Move Stock', WAREHOUSE: 'Warehouse', STOCK: 'Stock', NARRATION: 'Client' }
      };

      const newBC = {
        ...currentBC,
        thresholds: {
          global_safety_multiplier: globalSafetyMultiplier,
          low_stock_threshold: lowStockLimit
        }
      };

      const res2 = await apiFetch('/settings/business_configuration', {
        method: 'PUT',
        body: JSON.stringify(newBC)
      });
      if (!res2.ok) throw new Error('Failed to save threshold safety configurations');
      const json2 = await res2.json();

      showToast('Notification and threshold settings saved successfully.', 'success');

      if (json1.success) {
        setNotificationSettings(json1.data);
        setOrigNotificationSettings(json1.data);
      }
      if (json2.success) {
        setOrigBusinessConfig(json2.data);
        setGlobalSafetyMultiplier(parseFloat(json2.data.thresholds.global_safety_multiplier) || 1.0);
        setOrigGlobalSafetyMultiplier(parseFloat(json2.data.thresholds.global_safety_multiplier) || 1.0);
        setLowStockLimit(parseInt(json2.data.thresholds.low_stock_threshold) || 10);
        setOrigLowStockLimit(parseInt(json2.data.thresholds.low_stock_threshold) || 10);
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to save settings.', 'error');
    } finally {
      setSaveLoading(prev => ({ ...prev, notification_settings: false }));
    }
  };

  // Backup Export directly to local file system in browser
  const handleCreateBackup = async () => {
    if (isBackupLoading || isRestoreLoading) return;
    setIsBackupLoading(true);
    try {
      const res = await apiFetch('/settings/backup', { method: 'POST' });
      const json = await res.json();
      if (res.ok && json.success && json.data) {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(json.data, null, 2));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        downloadAnchor.setAttribute("download", `backup_${timestamp}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
        showToast('Database backup exported and downloaded successfully.', 'success');
      } else {
        throw new Error(json.message || 'Backup file generation failed');
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to export backup.', 'error');
    } finally {
      setIsBackupLoading(false);
    }
  };

  const handleRestoreBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isBackupLoading || isRestoreLoading) return;
    if (!e.target.files || !e.target.files[0]) return;
    const file = e.target.files[0];

    const confirmRestore = window.confirm(
      'This operation will overwrite the current database.\n\nDo you want to continue?'
    );
    if (!confirmRestore) {
      if (restoreInputRef.current) restoreInputRef.current.value = '';
      return;
    }

    setIsRestoreLoading(true);
    setRestoreProgress('Initializing snapshot fallback target...');
    const formData = new FormData();
    formData.append('backupFile', file);

    try {
      setRestoreProgress('Overwriting tables and restoring records...');
      const res = await apiFetch('/settings/restore', {
        method: 'POST',
        body: formData
      });
      const json = await res.json();
      if (res.ok && json.success) {
        showToast('Database restored successfully.', 'success');
        loadData();
      } else {
        throw new Error(json.message);
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to restore database.', 'error');
    } finally {
      setIsRestoreLoading(false);
      setRestoreProgress('');
      if (restoreInputRef.current) restoreInputRef.current.value = '';
    }
  };

  if (!userRole || userRole !== 'Admin') return null;

  return (
    <main style={{ padding: '2rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', flex: 1, minWidth: 0 }}>
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">System Settings</h1>
        <p style={{ fontSize: '0.85rem', color: 'var(--foreground-muted)' }}>
          Configure enterprise company parameters, safety stock buffers, and perform system backups.
        </p>
      </div>

      {/* Database Operation Progress Lock Overlay */}
      {isRestoreLoading && (
        <div style={lockOverlayStyle}>
          <div style={{ background: 'white', padding: '2rem', borderRadius: '12px', textAlign: 'center', boxShadow: '0 10px 25px rgba(0,0,0,0.15)', maxWidth: '400px', width: '90%' }}>
            <div style={{ fontSize: '3rem', animation: 'spin 2s linear infinite', marginBottom: '1rem', display: 'inline-block' }}>🔄</div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.5rem' }}>Restoring System Backup</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--foreground-muted)', lineHeight: 1.5 }}>
              {restoreProgress}
            </p>
            <div style={{ height: '4px', background: '#e2e8f0', borderRadius: '2px', marginTop: '1rem', overflow: 'hidden' }}>
              <div style={{ height: '100%', background: 'var(--primary)', width: '60%', animation: 'progressPulse 1.5s infinite' }} />
            </div>
          </div>
        </div>
      )}

      {/* Settings Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem' }}>

        {/* Company Information Card */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem' }}>Company Information</h2>
          <form onSubmit={handleSaveCompanyInfo} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={labelStyle}>Company Name *</label>
              <input 
                type="text" 
                required 
                value={companyInfo.name ?? ''} 
                onChange={e => setCompanyInfo({ ...companyInfo, name: e.target.value })} 
                style={inputStyle} 
              />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
              <button type="button" onClick={() => setCompanyInfo(origCompanyInfo)} className="btn-secondary">Reset</button>
              <button type="submit" disabled={saveLoading['company_info']} className="btn-primary">
                {saveLoading['company_info'] ? 'Saving...' : 'Save Company Info'}
              </button>
            </div>
          </form>
        </div>

        {/* Branding & Logo Customizer */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.5rem' }}>Corporate Branding Logo</h2>
          <p style={{ fontSize: '0.75rem', color: 'var(--foreground-muted)', marginBottom: '1.25rem' }}>
            Upload custom company branding logos propagating dynamic images to navigation bars, dashboards, and PDF/Excel sheets.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '2rem', flexWrap: 'wrap' }}>
            <div style={{ width: '120px', height: '120px', border: '2px dashed var(--border)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', overflow: 'hidden', position: 'relative' }}>
              {logoPreview || companyInfo.logoUrl ? (
                <img 
                  src={logoPreview || `${baseUrl}${companyInfo.logoUrl}`} 
                  alt="Company Logo Preview" 
                  style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '0.25rem' }} 
                />
              ) : (
                <span style={{ fontSize: '2rem' }}>🖼️</span>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <input type="file" accept="image/*" onChange={handleLogoChange} ref={fileInputRef} style={{ display: 'none' }} />
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="button" onClick={() => fileInputRef.current?.click()} className="btn-secondary">
                  Choose Image
                </button>
                {logoFile && (
                  <button type="button" onClick={handleUploadLogo} disabled={saveLoading['branding']} className="btn-primary">
                    {saveLoading['branding'] ? 'Uploading...' : 'Save Logo'}
                  </button>
                )}
                {companyInfo.logoUrl && (
                  <button type="button" onClick={handleRemoveLogo} className="btn-secondary" style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}>
                    Delete Logo
                  </button>
                )}
              </div>
              <span style={{ fontSize: '0.7rem', color: 'var(--foreground-muted)' }}>
                Supported formats: PNG, JPEG, WEBP. Maximum size limit: 2 MB.
              </span>
            </div>
          </div>
        </div>

        {/* Database Backup & Restore Card */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.5rem' }}>Backup Administration</h2>
          <p style={{ fontSize: '0.75rem', color: 'var(--foreground-muted)', marginBottom: '1.25rem' }}>
            Export a backup of all system databases and configuration records or restore from a previously exported database archive.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button 
              type="button" 
              onClick={handleCreateBackup} 
              disabled={isBackupLoading || isRestoreLoading} 
              className="btn-primary"
            >
              {isBackupLoading ? 'Exporting...' : 'Backup Export (Download)'}
            </button>
            <input type="file" accept=".json" onChange={handleRestoreBackup} ref={restoreInputRef} style={{ display: 'none' }} />
            <button 
              type="button" 
              onClick={() => restoreInputRef.current?.click()} 
              disabled={isBackupLoading || isRestoreLoading} 
              className="btn-secondary"
            >
              Backup Import / Restore
            </button>
          </div>
        </div>

        {/* Notification & Threshold Settings Card */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.5rem' }}>Low Stock & Threshold Settings</h2>
          <p style={{ fontSize: '0.75rem', color: 'var(--foreground-muted)', marginBottom: '1rem' }}>
            Configure default alerting stock levels and safety multipliers used for purchase calculations.
          </p>
          <form onSubmit={handleSaveNotificationAndThresholds} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={labelStyle}>Default Low Stock Alert Threshold</label>
                <input 
                  type="number" 
                  min="1" 
                  max="1000" 
                  value={notificationSettings.defaultThreshold ?? 10} 
                  onChange={e => setNotificationSettings({ ...notificationSettings, defaultThreshold: parseInt(e.target.value) || 10 })} 
                  style={inputStyle} 
                />
              </div>
              <div>
                <label style={labelStyle}>Global Safety Stock Multiplier</label>
                <input 
                  type="number" 
                  step="0.1" 
                  min="1.0" 
                  max="3.0" 
                  value={globalSafetyMultiplier ?? 1.0} 
                  onChange={e => setGlobalSafetyMultiplier(parseFloat(e.target.value) || 1.0)} 
                  style={inputStyle} 
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button type="button" onClick={handleResetNotificationSettings} className="btn-secondary">Reset</button>
              <button type="submit" disabled={saveLoading['notification_settings']} className="btn-primary">
                {saveLoading['notification_settings'] ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </form>
        </div>

      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes progressPulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
      `}} />
    </main>
  );
}

// Layout Styles
const labelStyle = {
  display: 'block', marginBottom: '0.25rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--foreground-muted)'
};

const inputStyle = {
  width: '100%', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '0.85rem', background: 'white', outline: 'none'
};

const lockOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0, left: 0, right: 0, bottom: 0,
  background: 'rgba(0,0,0,0.4)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 10000,
  fontFamily: 'Inter, sans-serif'
};
