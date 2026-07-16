"use client";

import React, { useState, useEffect, useRef } from 'react';
import { apiFetch } from '@/lib/apiFetch';
import { useToast } from '@/components/ToastProvider';
import { useAuth } from '@/components/AuthProvider';
import { useRouter } from 'next/navigation';

interface CompanyInfo {
  name: string;
  logoUrl: string | null;
  versionMetadata?: { version: number; updatedBy: string; updatedAt: string };
}

export default function SettingsPage() {
  const { showToast } = useToast();
  const { userRole } = useAuth();
  const router = useRouter();

  // Settings states
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo>({ name: '', logoUrl: null });
  const [origCompanyInfo, setOrigCompanyInfo] = useState<CompanyInfo>({ name: '', logoUrl: null });

  // Upload logo state
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  // Operation loaders
  const [isBackupLoading, setIsBackupLoading] = useState(false);
  const [isRestoreLoading, setIsRestoreLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState<Record<string, boolean>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);
  const restoreInputRef = useRef<HTMLInputElement>(null);

  // Enforce role access on mount
  useEffect(() => {
    if (userRole && userRole !== 'Admin') {
      router.push('/dashboard');
    }
  }, [userRole, router]);

  // Load Company details
  const loadData = async () => {
    try {
      const res = await apiFetch('/settings');
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          const d = json.data;
          if (d.company_info) {
            // Keep only name and logoUrl
            const filtered = {
              name: d.company_info.name || '',
              logoUrl: d.company_info.logoUrl || null,
              versionMetadata: d.company_info.versionMetadata
            };
            setCompanyInfo(filtered);
            setOrigCompanyInfo(filtered);
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

  // Save company details
  const handleSaveCompanyInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyInfo.name.trim()) return showToast('Company Name is required.', 'error');

    setSaveLoading(prev => ({ ...prev, company_info: true }));
    try {
      const res = await apiFetch('/settings/company_info', {
        method: 'PUT',
        body: JSON.stringify({
          name: companyInfo.name.trim(),
          logoUrl: companyInfo.logoUrl
        })
      });
      const json = await res.json();
      if (res.ok && json.success) {
        showToast('Company details saved successfully.', 'success');
        const updated = {
          name: json.data.name,
          logoUrl: json.data.logoUrl,
          versionMetadata: json.data.versionMetadata
        };
        setCompanyInfo(updated);
        setOrigCompanyInfo(updated);
        // Dispatch window layout branding update alert
        window.dispatchEvent(new Event('branding-update'));
      } else {
        throw new Error(json.message);
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to save configuration.', 'error');
    } finally {
      setSaveLoading(prev => ({ ...prev, company_info: false }));
    }
  };

  // Logo uploads
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
        const updated = {
          name: json.companyInfo.name,
          logoUrl: json.companyInfo.logoUrl,
          versionMetadata: json.companyInfo.versionMetadata
        };
        setCompanyInfo(updated);
        setOrigCompanyInfo(updated);
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
        const updated = {
          name: json.companyInfo.name,
          logoUrl: json.companyInfo.logoUrl,
          versionMetadata: json.companyInfo.versionMetadata
        };
        setCompanyInfo(updated);
        setOrigCompanyInfo(updated);
        setLogoPreview(null);
        window.dispatchEvent(new Event('branding-update'));
      }
    } catch (e) {
      showToast('Failed to remove logo.', 'error');
    } finally {
      setSaveLoading(prev => ({ ...prev, branding: false }));
    }
  };

  // Backup & Restore
  const handleCreateBackup = async () => {
    if (isBackupLoading || isRestoreLoading) return;
    setIsBackupLoading(true);
    try {
      const res = await apiFetch('/settings/backup', { method: 'POST' });
      if (res.ok) {
        // Trigger client-side file download of the backup file content
        const json = await res.json();
        if (json.success && json.data) {
          const blob = new Blob([JSON.stringify(json.data, null, 2)], { type: 'application/json' });
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          const dateStr = new Date().toISOString().replace(/T/, '_').replace(/\..+/, '').replace(/:/g, '');
          link.href = url;
          link.download = `Inventory_Backup_${dateStr}.json`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(url);
          showToast('Database backup generated and downloaded successfully.', 'success');
        } else {
          throw new Error(json.message);
        }
      } else {
        throw new Error('Backup failed at server layer.');
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to create backup.', 'error');
    } finally {
      setIsBackupLoading(false);
    }
  };

  const handleRestoreBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isBackupLoading || isRestoreLoading) return;
    if (!e.target.files || !e.target.files[0]) return;
    const file = e.target.files[0];

    const confirmRestore = window.confirm(
      'This operation will overwrite the current database. Make sure you have a valid backup file.\n\nDo you want to continue?'
    );
    if (!confirmRestore) {
      if (restoreInputRef.current) restoreInputRef.current.value = '';
      return;
    }

    setIsRestoreLoading(true);
    const formData = new FormData();
    formData.append('backupFile', file);

    try {
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
      if (restoreInputRef.current) restoreInputRef.current.value = '';
    }
  };

  if (!userRole || userRole !== 'Admin') return null;

  return (
    <main style={{ padding: '2rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', flex: 1, minWidth: 0 }}>
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">System Administration</h1>
        <p style={{ fontSize: '0.85rem', color: 'var(--foreground-muted)' }}>
          Manage company name, branding logo, and system backups.
        </p>
      </div>

      {/* Database Operation Progress Lock Overlay */}
      {(isRestoreLoading || isBackupLoading) && (
        <div style={lockOverlayStyle}>
          <div style={{ background: 'white', padding: '2rem', borderRadius: '12px', textAlign: 'center', boxShadow: '0 10px 25px rgba(0,0,0,0.15)', maxWidth: '400px', width: '90%' }}>
            <div style={{ fontSize: '3rem', animation: 'spin 2s linear infinite', marginBottom: '1rem', display: 'inline-block' }}>🔄</div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.5rem' }}>
              {isRestoreLoading ? 'Restoring System Backup' : 'Generating Backup File'}
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--foreground-muted)', lineHeight: 1.5 }}>
              Please wait while the database operations complete. Do not refresh or close the browser window.
            </p>
            <div style={{ height: '4px', background: '#e2e8f0', borderRadius: '2px', marginTop: '1rem', overflow: 'hidden' }}>
              <div style={{ height: '100%', background: 'var(--primary)', width: '60%', animation: 'progressPulse 1.5s infinite' }} />
            </div>
          </div>
        </div>
      )}

      {/* Settings Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem' }}>

        {/* Company Details Card */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.5rem' }}>Company Details</h2>
          <p style={{ fontSize: '0.75rem', color: 'var(--foreground-muted)', marginBottom: '1rem' }}>
            {companyInfo.versionMetadata ? `Version ${companyInfo.versionMetadata.version} • Updated by ${companyInfo.versionMetadata.updatedBy} at ${new Date(companyInfo.versionMetadata.updatedAt).toLocaleString()}` : 'Not initialised'}
          </p>
          <form onSubmit={handleSaveCompanyInfo} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={labelStyle}>Company Name *</label>
              <input 
                type="text" 
                required 
                value={companyInfo.name} 
                onChange={e => setCompanyInfo({ ...companyInfo, name: e.target.value })} 
                style={inputStyle} 
              />
            </div>
            
            {/* Branding Logo Inner Section */}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1.5rem', marginTop: '0.5rem' }}>
              <label style={{ ...labelStyle, fontSize: '0.8rem', marginBottom: '0.75rem' }}>Company Logo</label>
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
                  <div className="logo-action-buttons" style={{ display: 'flex', gap: '0.5rem' }}>
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

            <div className="settings-actions" style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
              <button type="button" onClick={() => setCompanyInfo(origCompanyInfo)} className="btn-secondary">Reset Name</button>
              <button type="submit" disabled={saveLoading['company_info']} className="btn-primary">
                {saveLoading['company_info'] ? 'Saving...' : 'Save Details'}
              </button>
            </div>
          </form>
        </div>

        {/* Database Backup & Restore Card */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.5rem' }}>Database Backup</h2>
          <p style={{ fontSize: '0.75rem', color: 'var(--foreground-muted)', marginBottom: '1.25rem' }}>
            Generate database backups to download locally or upload a backup file to restore system records.
          </p>
          <div className="backup-action-buttons" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button 
              type="button" 
              onClick={handleCreateBackup} 
              disabled={isBackupLoading || isRestoreLoading} 
              className="btn-primary"
            >
              {isBackupLoading ? 'Generating...' : 'Create Backup'}
            </button>
            <input type="file" accept=".json" onChange={handleRestoreBackup} ref={restoreInputRef} style={{ display: 'none' }} />
            <button 
              type="button" 
              onClick={() => restoreInputRef.current?.click()} 
              disabled={isBackupLoading || isRestoreLoading} 
              className="btn-secondary"
            >
              Restore Backup
            </button>
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
