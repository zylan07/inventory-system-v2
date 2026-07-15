"use client";

import React, { useState, useEffect, useRef } from 'react';
import { apiFetch } from '@/lib/apiFetch';
import { useToast } from '@/components/ToastProvider';

interface CompanyInfo {
  name: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  gstNumber: string;
  logoUrl: string | null;
  footerText: string;
  versionMetadata?: { version: number; updatedBy: string; updatedAt: string };
}

interface SecuritySettings {
  minPasswordLength: number;
  sessionTimeout: number;
  maxLoginAttempts: number;
  enableGoogleLogin: boolean;
  enableLocalLogin: boolean;
  emailNotifications: boolean;
  versionMetadata?: { version: number; updatedBy: string; updatedAt: string };
}

interface NotificationSettings {
  lowStockAlerts: boolean;
  emailAlerts: boolean;
  browserNotifications: boolean;
  defaultThreshold: number;
  versionMetadata?: { version: number; updatedBy: string; updatedAt: string };
}

interface MaintenanceMode {
  enabled: boolean;
  message: string;
  versionMetadata?: { version: number; updatedBy: string; updatedAt: string };
}

interface BackupFile {
  filename: string;
  sizeBytes: number;
  createdAt: string;
}

interface SystemInfo {
  products: number;
  users: number;
  warehouses: number;
  transactions: number;
  dbSize: string;
  lastBackupTime: string;
}

export default function SettingsPage() {
  const { showToast } = useToast();

  // Settings states
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo>({ name: '', address: '', phone: '', email: '', website: '', gstNumber: '', logoUrl: null, footerText: '' });
  const [origCompanyInfo, setOrigCompanyInfo] = useState<CompanyInfo>({ name: '', address: '', phone: '', email: '', website: '', gstNumber: '', logoUrl: null, footerText: '' });

  const [securitySettings, setSecuritySettings] = useState<SecuritySettings>({ minPasswordLength: 8, sessionTimeout: 30, maxLoginAttempts: 5, enableGoogleLogin: true, enableLocalLogin: true, emailNotifications: true });
  const [origSecuritySettings, setOrigSecuritySettings] = useState<SecuritySettings>({ minPasswordLength: 8, sessionTimeout: 30, maxLoginAttempts: 5, enableGoogleLogin: true, enableLocalLogin: true, emailNotifications: true });

  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>({ lowStockAlerts: true, emailAlerts: true, browserNotifications: true, defaultThreshold: 10 });
  const [origNotificationSettings, setOrigNotificationSettings] = useState<NotificationSettings>({ lowStockAlerts: true, emailAlerts: true, browserNotifications: true, defaultThreshold: 10 });

  const [maintenanceMode, setMaintenanceMode] = useState<MaintenanceMode>({ enabled: false, message: 'System is currently under maintenance. Please try again later.' });
  const [origMaintenanceMode, setOrigMaintenanceMode] = useState<MaintenanceMode>({ enabled: false, message: 'System is currently under maintenance. Please try again later.' });

  // System Stats and Backups list
  const [systemInfo, setSystemInfo] = useState<SystemInfo>({ products: 0, users: 0, warehouses: 0, transactions: 0, dbSize: '0.05', lastBackupTime: 'Never' });
  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  // Operation locks and loaders
  const [isBackupLoading, setIsBackupLoading] = useState(false);
  const [isRestoreLoading, setIsRestoreLoading] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState('');
  const [saveLoading, setSaveLoading] = useState<Record<string, boolean>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);
  const restoreInputRef = useRef<HTMLInputElement>(null);

  // Fetch settings, backups list and system stats on mount
  const loadData = async () => {
    try {
      const res = await apiFetch('/settings');
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          const d = json.data;
          if (d.company_info) { setCompanyInfo(d.company_info); setOrigCompanyInfo(d.company_info); }
          if (d.security_settings) { setSecuritySettings(d.security_settings); setOrigSecuritySettings(d.security_settings); }
          if (d.notification_settings) { setNotificationSettings(d.notification_settings); setOrigNotificationSettings(d.notification_settings); }
          if (d.maintenance_mode) { setMaintenanceMode(d.maintenance_mode); setOrigMaintenanceMode(d.maintenance_mode); }
        }
      }

      fetchBackupHistory();
      fetchSystemInfo();
    } catch (e) {
      showToast('Failed to retrieve system settings.', 'error');
    }
  };

  const fetchBackupHistory = async () => {
    try {
      const res = await apiFetch('/settings/backup-history');
      if (res.ok) {
        const json = await res.json();
        if (json.success) setBackups(json.data);
      }
    } catch (e) {}
  };

  const fetchSystemInfo = async () => {
    try {
      const res = await apiFetch('/settings/system-info');
      if (res.ok) {
        const json = await res.json();
        if (json.success) setSystemInfo(json.data);
      }
    } catch (e) {}
  };

  useEffect(() => {
    loadData();
  }, []);

  // Generic settings PUT helper
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
        // Update states
        if (key === 'company_info') { setCompanyInfo(json.data); setOrigCompanyInfo(json.data); }
        if (key === 'security_settings') { setSecuritySettings(json.data); setOrigSecuritySettings(json.data); }
        if (key === 'notification_settings') { setNotificationSettings(json.data); setOrigNotificationSettings(json.data); }
        if (key === 'maintenance_mode') { setMaintenanceMode(json.data); setOrigMaintenanceMode(json.data); }
        
        // Dispatch window layout branding update alert
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

  // 1. Company info validations before save
  const handleSaveCompanyInfo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyInfo.name.trim()) return showToast('Company Name is required.', 'error');
    
    // Email regex validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (companyInfo.email && !emailRegex.test(companyInfo.email)) {
      return showToast('Invalid email address format.', 'error');
    }

    // Website URL regex validation
    if (companyInfo.website) {
      const urlRegex = /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([\/\w .-]*)*\/?$/;
      if (!urlRegex.test(companyInfo.website)) {
        return showToast('Invalid website URL format.', 'error');
      }
    }

    // Phone length check
    if (companyInfo.phone && companyInfo.phone.replace(/\D/g, '').length < 7) {
      return showToast('Phone number is too short.', 'error');
    }

    handleSaveSetting('company_info', companyInfo);
  };

  // 2. Branding (Logo uploads)
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

  // 3. Backup & Restore (Mutual db lock, Warnings, History checks)
  const handleCreateBackup = async () => {
    if (isBackupLoading || isRestoreLoading) return;
    setIsBackupLoading(true);
    try {
      const res = await apiFetch('/settings/backup', { method: 'POST' });
      const json = await res.json();
      if (res.ok && json.success) {
        showToast('Database backup package created successfully.', 'success');
        fetchBackupHistory();
        fetchSystemInfo();
      } else {
        throw new Error(json.message);
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to create backup.', 'error');
    } finally {
      setIsBackupLoading(false);
    }
  };

  const handleDeleteBackup = async (filename: string) => {
    if (!window.confirm('This backup will be permanently deleted. Continue?')) return;
    try {
      const res = await apiFetch(`/settings/backup/${filename}`, { method: 'DELETE' });
      const json = await res.json();
      if (res.ok && json.success) {
        showToast('Backup package permanently deleted.', 'success');
        fetchBackupHistory();
        fetchSystemInfo();
      }
    } catch (e) {
      showToast('Failed to delete backup file.', 'error');
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

  return (
    <main style={{ padding: '2rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', flex: 1, minWidth: 0 }}>
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">System Settings</h1>
        <p style={{ fontSize: '0.85rem', color: 'var(--foreground-muted)' }}>
          Configure enterprise company parameters, backup schedules, user access policies, and appearance rules.
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

        {/* System Information KPI Cards */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem' }}>System Performance Metrics</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '1rem' }}>
            <div style={kpiCardStyle}>
              <div style={kpiLabelStyle}>Total Products</div>
              <div style={kpiValueStyle}>{systemInfo.products}</div>
            </div>
            <div style={kpiCardStyle}>
              <div style={kpiLabelStyle}>Total Users</div>
              <div style={kpiValueStyle}>{systemInfo.users}</div>
            </div>
            <div style={kpiCardStyle}>
              <div style={kpiLabelStyle}>Total Warehouses</div>
              <div style={kpiValueStyle}>{systemInfo.warehouses}</div>
            </div>
            <div style={kpiCardStyle}>
              <div style={kpiLabelStyle}>Transactions Logs</div>
              <div style={kpiValueStyle}>{systemInfo.transactions}</div>
            </div>
            <div style={kpiCardStyle}>
              <div style={kpiLabelStyle}>Database Size</div>
              <div style={kpiValueStyle}>{systemInfo.dbSize} MB</div>
            </div>
            <div style={kpiCardStyle}>
              <div style={kpiLabelStyle}>Last Backup Time</div>
              <div style={{ ...kpiValueStyle, fontSize: '0.78rem', marginTop: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {systemInfo.lastBackupTime !== 'Never' ? new Date(systemInfo.lastBackupTime).toLocaleDateString() + ' ' + new Date(systemInfo.lastBackupTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Never'}
              </div>
            </div>
          </div>
        </div>

        {/* Company Information Card */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.5rem' }}>Company Information</h2>
          <p style={{ fontSize: '0.75rem', color: 'var(--foreground-muted)', marginBottom: '1rem' }}>
            {companyInfo.versionMetadata ? `Version ${companyInfo.versionMetadata.version} • Updated by ${companyInfo.versionMetadata.updatedBy} at ${new Date(companyInfo.versionMetadata.updatedAt).toLocaleString()}` : 'Not initialised'}
          </p>
          <form onSubmit={handleSaveCompanyInfo} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={labelStyle}>Company Name *</label>
                <input type="text" required value={companyInfo.name} onChange={e => setCompanyInfo({ ...companyInfo, name: e.target.value })} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>GST Number</label>
                <input type="text" placeholder="e.g. 22AAAAA0000A1Z5" value={companyInfo.gstNumber} onChange={e => setCompanyInfo({ ...companyInfo, gstNumber: e.target.value })} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Contact Email</label>
                <input type="email" value={companyInfo.email} onChange={e => setCompanyInfo({ ...companyInfo, email: e.target.value })} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Phone Number</label>
                <input type="text" value={companyInfo.phone} onChange={e => setCompanyInfo({ ...companyInfo, phone: e.target.value })} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Website URL</label>
                <input type="text" placeholder="https://..." value={companyInfo.website} onChange={e => setCompanyInfo({ ...companyInfo, website: e.target.value })} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Footer Text</label>
                <input type="text" value={companyInfo.footerText} onChange={e => setCompanyInfo({ ...companyInfo, footerText: e.target.value })} style={inputStyle} />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={labelStyle}>Corporate Address</label>
                <textarea rows={2} value={companyInfo.address} onChange={e => setCompanyInfo({ ...companyInfo, address: e.target.value })} style={inputStyle} />
              </div>
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
                  src={logoPreview || `http://localhost:5000${companyInfo.logoUrl}`} 
                  alt="Company Logo Preview" 
                  style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '0.25rem' }} 
                />
              ) : (
                <span style={{ fontSize: '2rem' }}>📦</span>
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
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.5rem' }}>Backup & Recovery Administration</h2>
          <p style={{ fontSize: '0.75rem', color: 'var(--foreground-muted)', marginBottom: '1.25rem' }}>
            Generate version-aware structured backups of database records and settings or restore from local backup archives.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
            <button 
              type="button" 
              onClick={handleCreateBackup} 
              disabled={isBackupLoading || isRestoreLoading} 
              className="btn-primary"
            >
              {isBackupLoading ? 'Creating Backup...' : 'Create Backup Package'}
            </button>
            <input type="file" accept=".json" onChange={handleRestoreBackup} ref={restoreInputRef} style={{ display: 'none' }} />
            <button 
              type="button" 
              onClick={() => restoreInputRef.current?.click()} 
              disabled={isBackupLoading || isRestoreLoading} 
              className="btn-secondary"
            >
              Restore Database from File
            </button>
          </div>

          <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.75rem' }}>Backup History List</h3>
          {backups.length === 0 ? (
            <div style={{ padding: '1rem', background: '#f8fafc', borderRadius: '6px', fontSize: '0.8rem', color: 'var(--foreground-muted)' }}>
              No local backups found in storage.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {backups.map(bk => (
                <div key={bk.filename} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', border: '1px solid var(--border)', borderRadius: '6px', background: 'white' }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{bk.filename}</span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--foreground-muted)' }}>
                      {(bk.sizeBytes / 1024).toFixed(1)} KB • Created {new Date(bk.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <a 
                      href={`http://localhost:5000/settings/backup/download/${bk.filename}`} 
                      download 
                      className="btn-secondary" 
                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', textDecoration: 'none' }}
                    >
                      Download
                    </a>
                    <button 
                      type="button" 
                      onClick={() => handleDeleteBackup(bk.filename)} 
                      className="btn-secondary" 
                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', color: 'var(--danger)', borderColor: 'var(--danger)' }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Security Settings Card */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.5rem' }}>Security Policies</h2>
          <p style={{ fontSize: '0.75rem', color: 'var(--foreground-muted)', marginBottom: '1rem' }}>
            {securitySettings.versionMetadata ? `Version ${securitySettings.versionMetadata.version} • Updated by ${securitySettings.versionMetadata.updatedBy} at ${new Date(securitySettings.versionMetadata.updatedAt).toLocaleString()}` : 'Not initialised'}
          </p>
          <form onSubmit={e => { e.preventDefault(); handleSaveSetting('security_settings', securitySettings); }} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={labelStyle}>Minimum Password Length</label>
                <input type="number" min="6" max="20" value={securitySettings.minPasswordLength} onChange={e => setSecuritySettings({ ...securitySettings, minPasswordLength: parseInt(e.target.value) || 8 })} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Session Timeout Duration (minutes)</label>
                <input type="number" min="5" max="1440" value={securitySettings.sessionTimeout} onChange={e => setSecuritySettings({ ...securitySettings, sessionTimeout: parseInt(e.target.value) || 30 })} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Maximum Login Attempts before Lockout</label>
                <input type="number" min="3" max="10" value={securitySettings.maxLoginAttempts} onChange={e => setSecuritySettings({ ...securitySettings, maxLoginAttempts: parseInt(e.target.value) || 5 })} style={inputStyle} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '0.5rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.8rem' }}>
                  <input type="checkbox" checked={securitySettings.enableGoogleLogin} onChange={e => setSecuritySettings({ ...securitySettings, enableGoogleLogin: e.target.checked })} />
                  Enable Google OAuth 2.0 Login
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.8rem' }}>
                  <input type="checkbox" checked={securitySettings.enableLocalLogin} onChange={e => setSecuritySettings({ ...securitySettings, enableLocalLogin: e.target.checked })} />
                  Enable Local Email/Password Login
                </label>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setSecuritySettings(origSecuritySettings)} className="btn-secondary">Reset</button>
              <button type="submit" disabled={saveLoading['security_settings']} className="btn-primary">
                {saveLoading['security_settings'] ? 'Saving...' : 'Save Policies'}
              </button>
            </div>
          </form>
        </div>

        {/* Notification Settings Card */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.5rem' }}>Notification Settings</h2>
          <p style={{ fontSize: '0.75rem', color: 'var(--foreground-muted)', marginBottom: '1rem' }}>
            {notificationSettings.versionMetadata ? `Version ${notificationSettings.versionMetadata.version} • Updated by ${notificationSettings.versionMetadata.updatedBy} at ${new Date(notificationSettings.versionMetadata.updatedAt).toLocaleString()}` : 'Not initialised'}
          </p>
          <form onSubmit={e => { e.preventDefault(); handleSaveSetting('notification_settings', notificationSettings); }} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={labelStyle}>Default Low Stock Alert Threshold</label>
                <input type="number" min="1" max="1000" value={notificationSettings.defaultThreshold} onChange={e => setNotificationSettings({ ...notificationSettings, defaultThreshold: parseInt(e.target.value) || 10 })} style={inputStyle} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '0.5rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.8rem' }}>
                  <input type="checkbox" checked={notificationSettings.lowStockAlerts} onChange={e => setNotificationSettings({ ...notificationSettings, lowStockAlerts: e.target.checked })} />
                  Trigger Low Stock Alerts
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.8rem' }}>
                  <input type="checkbox" checked={notificationSettings.emailAlerts} onChange={e => setNotificationSettings({ ...notificationSettings, emailAlerts: e.target.checked })} />
                  Send Low Stock Email Alerts to Managers
                </label>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setNotificationSettings(origNotificationSettings)} className="btn-secondary">Reset</button>
              <button type="submit" disabled={saveLoading['notification_settings']} className="btn-primary">
                {saveLoading['notification_settings'] ? 'Saving...' : 'Save Notification Rules'}
              </button>
            </div>
          </form>
        </div>

        {/* Maintenance Mode Card */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.5rem' }}>System Maintenance Mode</h2>
          <p style={{ fontSize: '0.75rem', color: 'var(--foreground-muted)', marginBottom: '1rem' }}>
            {maintenanceMode.versionMetadata ? `Version ${maintenanceMode.versionMetadata.version} • Updated by ${maintenanceMode.versionMetadata.updatedBy} at ${new Date(maintenanceMode.versionMetadata.updatedAt).toLocaleString()}` : 'Not initialised'}
          </p>
          <form onSubmit={e => { e.preventDefault(); handleSaveSetting('maintenance_mode', maintenanceMode); }} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.825rem', fontWeight: 700, color: 'var(--foreground)' }}>
                <input type="checkbox" checked={maintenanceMode.enabled} onChange={e => setMaintenanceMode({ ...maintenanceMode, enabled: e.target.checked })} />
                Enable System Maintenance Mode
              </label>
              <div>
                <label style={labelStyle}>Custom Maintenance Message Banner</label>
                <textarea rows={2} value={maintenanceMode.message} onChange={e => setMaintenanceMode({ ...maintenanceMode, message: e.target.value })} style={inputStyle} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setMaintenanceMode(origMaintenanceMode)} className="btn-secondary">Reset</button>
              <button type="submit" disabled={saveLoading['maintenance_mode']} className="btn-primary">
                {saveLoading['maintenance_mode'] ? 'Saving...' : 'Save Maintenance Settings'}
              </button>
            </div>
          </form>
        </div>

        {/* About App Card */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.5rem' }}>About Product Catalog</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem 1rem', fontSize: '0.8rem', marginTop: '0.5rem' }}>
            <div><strong>Application:</strong> Inventra Stock Management</div>
            <div><strong>Version:</strong> v1.4.0</div>
            <div><strong>Build Date:</strong> 2026-07-15</div>
            <div><strong>License:</strong> Proprietary Commercial License</div>
            <div><strong>Developer:</strong> Advanced Coding Agency</div>
            <div><strong>Base Stack:</strong> React, Next.js, Node.js, Express, MySQL</div>
          </div>
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

const labelStyle = {
  display: 'block', marginBottom: '0.25rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--foreground-muted)'
};

const inputStyle = {
  width: '100%', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '0.85rem', background: 'white', outline: 'none'
};

const kpiCardStyle: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: '8px',
  padding: '0.75rem 1rem',
  background: '#f8fafc',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  minWidth: '100px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
};

const kpiLabelStyle: React.CSSProperties = {
  fontSize: '0.68rem',
  fontWeight: 700,
  color: 'var(--foreground-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.025em'
};

const kpiValueStyle: React.CSSProperties = {
  fontSize: '1.2rem',
  fontWeight: 800,
  color: 'var(--foreground)',
  marginTop: '2px'
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
