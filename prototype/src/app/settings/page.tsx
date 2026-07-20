"use client";

import React, { useState, useEffect, useRef } from 'react';
import { apiFetch } from '@/lib/apiFetch';
import { useToast } from '@/components/ToastProvider';
import { useAuth } from '@/components/AuthProvider';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/components/LanguageContext';

interface CompanyInfo {
  name: string;
  logoUrl: string | null;
  versionMetadata?: { version: number; updatedBy: string; updatedAt: string };
}

interface BusinessConfig {
  company_details: {
    name: string;
    address: string;
    gst: string;
  };
  regional: {
    currency_symbol: string;
    currency_name: string;
    date_format: string;
    default_language: string;
  };
  thresholds: {
    global_safety_multiplier: number;
    low_stock_threshold: number;
  };
  notifications: {
    inventory: string[];
    purchase: string[];
    client: string[];
    security: string[];
    system: string[];
  };
  terminology: {
    ADJUSTMENT: string;
    TRANSFER: string;
    NARRATION: string;
    WAREHOUSE: string;
    STOCK: string;
  };
}

type TabName = 'general' | 'thresholds' | 'notifications' | 'terminology' | 'backups';

export default function SettingsPage() {
  const { showToast } = useToast();
  const { userRole } = useAuth();
  const { t, refreshTerminology } = useLanguage();
  const router = useRouter();

  // Active tab
  const [activeTab, setActiveTab] = useState<TabName>('general');

  // General branding logo/name states
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo>({ name: '', logoUrl: null });
  const [origCompanyInfo, setOrigCompanyInfo] = useState<CompanyInfo>({ name: '', logoUrl: null });

  // Centralised business settings state
  const [businessConfig, setBusinessConfig] = useState<BusinessConfig>({
    company_details: { name: '', address: '', gst: '' },
    regional: { currency_symbol: '₹', currency_name: 'INR', date_format: 'YYYY-MM-DD', default_language: 'en' },
    thresholds: { global_safety_multiplier: 1.0, low_stock_threshold: 10 },
    notifications: { inventory: [], purchase: [], client: [], security: [], system: [] },
    terminology: { ADJUSTMENT: '', TRANSFER: '', NARRATION: '', WAREHOUSE: '', STOCK: '' }
  });

  const [origBusinessConfig, setOrigBusinessConfig] = useState<BusinessConfig | null>(null);

  // Logo file uploads state
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  // Operation loaders
  const [isBackupLoading, setIsBackupLoading] = useState(false);
  const [isRestoreLoading, setIsRestoreLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState<Record<string, boolean>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);
  const restoreInputRef = useRef<HTMLInputElement>(null);

  // Enforce Admin access on mount
  useEffect(() => {
    if (userRole && userRole !== 'Admin') {
      router.push('/dashboard');
    }
  }, [userRole, router]);

  // Retrieve configurations from database
  const loadData = async () => {
    try {
      const res = await apiFetch('/settings');
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          const d = json.data;
          
          // 1. Company Branding Info
          if (d.company_info) {
            const filtered = {
              name: d.company_info.name || '',
              logoUrl: d.company_info.logoUrl || null,
              versionMetadata: d.company_info.versionMetadata
            };
            setCompanyInfo(filtered);
            setOrigCompanyInfo(filtered);
          }

          // 2. Business configuration parameters
          if (d.business_configuration) {
            setBusinessConfig(d.business_configuration);
            setOrigBusinessConfig(d.business_configuration);
          }
        }
      }
    } catch (e) {
      showToast('Failed to retrieve settings.', 'error');
    }
  };

  useEffect(() => {
    if (userRole === 'Admin') {
      loadData();
    }
  }, [userRole]);

  // Save branding settings
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
        showToast('Branding details saved.', 'success');
        const updated = {
          name: json.data.name,
          logoUrl: json.data.logoUrl,
          versionMetadata: json.data.versionMetadata
        };
        setCompanyInfo(updated);
        setOrigCompanyInfo(updated);
        window.dispatchEvent(new Event('branding-update'));
      } else {
        throw new Error(json.message);
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to save branding details.', 'error');
    } finally {
      setSaveLoading(prev => ({ ...prev, company_info: false }));
    }
  };

  // Upload company logo
  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 2 * 1024 * 1024) {
        return showToast('Logo image must be smaller than 2MB.', 'error');
      }
      setLogoFile(file);
      setLogoPreview(URL.createObjectURL(file));
    }
  };

  const handleUploadLogo = async () => {
    if (!logoFile) return;
    setSaveLoading(prev => ({ ...prev, branding: true }));
    const formData = new FormData();
    formData.append('logo', logoFile);
    formData.append('name', companyInfo.name);

    try {
      const res = await apiFetch('/settings/logo', {
        method: 'POST',
        body: formData
      });
      const json = await res.json();
      if (res.ok && json.success) {
        showToast('Logo uploaded successfully.', 'success');
        setCompanyInfo(prev => ({
          ...prev,
          logoUrl: json.logoUrl,
          versionMetadata: json.companyInfo.versionMetadata
        }));
        setOrigCompanyInfo(prev => ({
          ...prev,
          logoUrl: json.logoUrl,
          versionMetadata: json.companyInfo.versionMetadata
        }));
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
    const confirm = window.confirm('Are you sure you want to remove the logo?');
    if (!confirm) return;

    try {
      const res = await apiFetch('/settings/logo', {
        method: 'DELETE'
      });
      const json = await res.json();
      if (res.ok && json.success) {
        showToast('Branding logo removed successfully.', 'success');
        setCompanyInfo(prev => ({
          ...prev,
          logoUrl: null,
          versionMetadata: json.companyInfo.versionMetadata
        }));
        setOrigCompanyInfo(prev => ({
          ...prev,
          logoUrl: null,
          versionMetadata: json.companyInfo.versionMetadata
        }));
        setLogoFile(null);
        setLogoPreview(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        window.dispatchEvent(new Event('branding-update'));
      } else {
        throw new Error(json.message);
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to remove logo.', 'error');
    }
  };

  // Save centralized business settings
  const handleSaveBusinessConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveLoading(prev => ({ ...prev, business_config: true }));
    try {
      const res = await apiFetch('/settings/business_configuration', {
        method: 'PUT',
        body: JSON.stringify(businessConfig)
      });
      const json = await res.json();
      if (res.ok && json.success) {
        showToast('Business configuration saved successfully.', 'success');
        setOrigBusinessConfig(businessConfig);
        refreshTerminology(); // Update local translation strings
      } else {
        throw new Error(json.message);
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to save business settings.', 'error');
    } finally {
      setSaveLoading(prev => ({ ...prev, business_config: false }));
    }
  };

  // Reset business config forms
  const handleResetBusinessConfig = () => {
    if (origBusinessConfig) {
      setBusinessConfig(origBusinessConfig);
      showToast('Settings reset to last saved state.', 'success');
    }
  };

  // Checkbox handlers for notification routes
  const handleNotificationChange = (category: keyof BusinessConfig['notifications'], channel: string, checked: boolean) => {
    setBusinessConfig(prev => {
      const channels = [...prev.notifications[category]];
      if (checked) {
        if (!channels.includes(channel)) channels.push(channel);
      } else {
        const index = channels.indexOf(channel);
        if (index > -1) channels.splice(index, 1);
      }
      return {
        ...prev,
        notifications: {
          ...prev.notifications,
          [category]: channels
        }
      };
    });
  };

  // Database Backup download
  const handleCreateBackup = async () => {
    setIsBackupLoading(true);
    try {
      const res = await apiFetch('/settings/backup');
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          const blob = new Blob([JSON.stringify(json.data, null, 2)], { type: 'application/json' });
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          const dateStr = new Date().toISOString().split('T')[0];
          link.download = `Inventory_Backup_${dateStr}.json`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(url);
          showToast('Database backup downloaded successfully.', 'success');
        } else {
          throw new Error(json.message);
        }
      } else {
        throw new Error('Server backup generation failed.');
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to create backup.', 'error');
    } finally {
      setIsBackupLoading(false);
    }
  };

  // Restore Database backup file
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="text-2xl font-bold">Central settings</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--foreground-muted)' }}>
            Configure localized terms, company metadata, stock alert limits, and system routing.
          </p>
        </div>
      </div>

      {/* Lock overlay for back/restore ops */}
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

      {/* Premium Tab Bar Navigation */}
      <div style={tabBarContainerStyle}>
        {(['general', 'thresholds', 'notifications', 'terminology', 'backups'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              ...tabItemStyle,
              color: activeTab === tab ? 'var(--primary)' : 'var(--foreground-muted)',
              borderBottom: activeTab === tab ? '2px solid var(--primary)' : '2px solid transparent',
              fontWeight: activeTab === tab ? 700 : 500
            }}
          >
            {tab === 'general' && '🏢 Branding & Profile'}
            {tab === 'thresholds' && '⚖️ Multipliers & Thresholds'}
            {tab === 'notifications' && '🔔 Notification Channels'}
            {tab === 'terminology' && '🏷️ Terminology Overrides'}
            {tab === 'backups' && '💾 System Backups'}
          </button>
        ))}
      </div>

      {/* Tab Panels */}
      <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: '12px', padding: '2rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        
        {/* TAB 1: General Branding */}
        {activeTab === 'general' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div>
              <h2 style={sectionHeaderStyle}>General Profile & Branding</h2>
              <p style={sectionSubStyle}>Modify public logo, company title, and company metadata invoices details.</p>
            </div>

            <form onSubmit={handleSaveCompanyInfo} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div>
                <label style={labelStyle}>Company Branding Display Name *</label>
                <input 
                  type="text" 
                  required 
                  value={companyInfo.name} 
                  onChange={e => setCompanyInfo({ ...companyInfo, name: e.target.value })} 
                  style={inputStyle} 
                />
              </div>

              <div>
                <label style={labelStyle}>Branding Logo Preview</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '2rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                  <div style={logoPreviewBoxStyle}>
                    {logoPreview || companyInfo.logoUrl ? (
                      <img 
                        src={logoPreview || `http://localhost:5000${companyInfo.logoUrl}`} 
                        alt="Company Logo Preview" 
                        style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '0.25rem' }} 
                      />
                    ) : (
                      <span style={{ fontSize: '2.5rem' }}>🏢</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <input type="file" accept="image/*" onChange={handleLogoChange} ref={fileInputRef} style={{ display: 'none' }} />
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button type="button" onClick={() => fileInputRef.current?.click()} className="btn-secondary">
                        Choose File
                      </button>
                      {logoFile && (
                        <button type="button" onClick={handleUploadLogo} disabled={saveLoading['branding']} className="btn-primary">
                          {saveLoading['branding'] ? 'Saving...' : 'Upload Logo'}
                        </button>
                      )}
                      {companyInfo.logoUrl && (
                        <button type="button" onClick={handleRemoveLogo} className="btn-secondary" style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}>
                          Remove Logo
                        </button>
                      )}
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--foreground-muted)' }}>
                      Supports PNG, JPG, or WEBP. Max size: 2MB.
                    </span>
                  </div>
                </div>
              </div>

              <div style={formActionsStyle}>
                <button type="submit" disabled={saveLoading['company_info']} className="btn-primary">
                  {saveLoading['company_info'] ? 'Saving...' : 'Save Branding'}
                </button>
              </div>
            </form>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '2rem' }}>
              <h3 style={{ ...sectionHeaderStyle, fontSize: '1rem' }}>Invoice & Invoice Address details</h3>
              <p style={sectionSubStyle}>Central settings for billing invoices.</p>

              <form onSubmit={handleSaveBusinessConfig} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginTop: '1rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={labelStyle}>Billing Company Name</label>
                    <input 
                      type="text" 
                      value={businessConfig.company_details.name} 
                      onChange={e => setBusinessConfig({
                        ...businessConfig,
                        company_details: { ...businessConfig.company_details, name: e.target.value }
                      })} 
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>GST Registration Code</label>
                    <input 
                      type="text" 
                      placeholder="e.g. 22AAAAA0000A1Z5"
                      value={businessConfig.company_details.gst} 
                      onChange={e => setBusinessConfig({
                        ...businessConfig,
                        company_details: { ...businessConfig.company_details, gst: e.target.value.toUpperCase() }
                      })} 
                      style={inputStyle}
                    />
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Operational/Billing Address</label>
                  <textarea 
                    value={businessConfig.company_details.address} 
                    onChange={e => setBusinessConfig({
                      ...businessConfig,
                      company_details: { ...businessConfig.company_details, address: e.target.value }
                    })} 
                    style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={labelStyle}>Currency Symbol</label>
                    <input 
                      type="text" 
                      placeholder="₹"
                      value={businessConfig.regional.currency_symbol} 
                      onChange={e => setBusinessConfig({
                        ...businessConfig,
                        regional: { ...businessConfig.regional, currency_symbol: e.target.value }
                      })} 
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Currency Code</label>
                    <input 
                      type="text" 
                      placeholder="INR"
                      value={businessConfig.regional.currency_name} 
                      onChange={e => setBusinessConfig({
                        ...businessConfig,
                        regional: { ...businessConfig.regional, currency_name: e.target.value }
                      })} 
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>System Date Format</label>
                    <select 
                      value={businessConfig.regional.date_format}
                      onChange={e => setBusinessConfig({
                        ...businessConfig,
                        regional: { ...businessConfig.regional, date_format: e.target.value }
                      })}
                      style={inputStyle}
                    >
                      <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                      <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                      <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                    </select>
                  </div>
                </div>

                <div style={formActionsStyle}>
                  <button type="button" onClick={handleResetBusinessConfig} className="btn-secondary">Reset</button>
                  <button type="submit" disabled={saveLoading['business_config']} className="btn-primary">
                    {saveLoading['business_config'] ? 'Saving...' : 'Save Config'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* TAB 2: Thresholds & Safety Multipliers */}
        {activeTab === 'thresholds' && (
          <form onSubmit={handleSaveBusinessConfig} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div>
              <h2 style={sectionHeaderStyle}>Inventory Multipliers & Safety Thresholds</h2>
              <p style={sectionSubStyle}>Define reordering configurations and safety buffers used during purchase planning calculations.</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
              <div style={configBoxStyle}>
                <h3 style={configBoxHeaderStyle}>Global Safety Multiplier</h3>
                <p style={configBoxSubStyle}>
                  This multiplier adds a safety stock buffer to Average Daily Consumption calculations during predictive purchase planning.
                </p>
                <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <input 
                    type="number" 
                    step="0.1" 
                    min="1.0"
                    max="3.0"
                    value={businessConfig.thresholds.global_safety_multiplier} 
                    onChange={e => setBusinessConfig({
                      ...businessConfig,
                      thresholds: { ...businessConfig.thresholds, global_safety_multiplier: parseFloat(e.target.value) || 1.0 }
                    })} 
                    style={{ ...inputStyle, width: '120px' }}
                  />
                  <span style={{ fontSize: '0.8rem', color: 'var(--foreground-muted)' }}>
                    (e.g., 1.2 adds a 20% safety stock buffer)
                  </span>
                </div>
              </div>

              <div style={configBoxStyle}>
                <h3 style={configBoxHeaderStyle}>Alert Stock Minimum Limit</h3>
                <p style={configBoxSubStyle}>
                  Fallback threshold for warning notifications if product-specific minimum stock is unset.
                </p>
                <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <input 
                    type="number" 
                    min="0"
                    value={businessConfig.thresholds.low_stock_threshold} 
                    onChange={e => setBusinessConfig({
                      ...businessConfig,
                      thresholds: { ...businessConfig.thresholds, low_stock_threshold: parseInt(e.target.value) || 0 }
                    })} 
                    style={{ ...inputStyle, width: '120px' }}
                  />
                  <span style={{ fontSize: '0.8rem', color: 'var(--foreground-muted)' }}>
                    Units
                  </span>
                </div>
              </div>
            </div>

            <div style={formActionsStyle}>
              <button type="button" onClick={handleResetBusinessConfig} className="btn-secondary">Reset</button>
              <button type="submit" disabled={saveLoading['business_config']} className="btn-primary">
                {saveLoading['business_config'] ? 'Saving...' : 'Save Thresholds'}
              </button>
            </div>
          </form>
        )}

        {/* TAB 3: Category Notification Routing */}
        {activeTab === 'notifications' && (
          <form onSubmit={handleSaveBusinessConfig} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div>
              <h2 style={sectionHeaderStyle}>Category Notification Channels</h2>
              <p style={sectionSubStyle}>Route alerts to specific channels depending on transaction types.</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {(['inventory', 'purchase', 'client', 'security', 'system'] as const).map(category => (
                <div key={category} style={notificationRowStyle}>
                  <div style={{ flex: 1, minWidth: '150px' }}>
                    <h4 style={{ textTransform: 'capitalize', fontWeight: 700, fontSize: '0.9rem', color: 'var(--foreground)' }}>
                      {category} Alerts
                    </h4>
                    <span style={{ fontSize: '0.75rem', color: 'var(--foreground-muted)' }}>
                      {category === 'inventory' && 'Low stock warnings and reorder events.'}
                      {category === 'purchase' && 'Suggested purchases and ordering schedules.'}
                      {category === 'client' && 'Client status warning checks (Active / Inactive).'}
                      {category === 'security' && 'Unauthorized login attempts or privilege errors.'}
                      {category === 'system' && 'Database backups and system restores.'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                    <label style={checkboxLabelStyle}>
                      <input 
                        type="checkbox"
                        checked={businessConfig.notifications[category]?.includes('email')}
                        onChange={e => handleNotificationChange(category, 'email', e.target.checked)}
                      />
                      <span>Email</span>
                    </label>
                    <label style={{ ...checkboxLabelStyle, color: 'var(--foreground-muted)', cursor: 'not-allowed' }}>
                      <input 
                        type="checkbox"
                        disabled
                        checked={businessConfig.notifications[category]?.includes('sms')}
                        onChange={e => handleNotificationChange(category, 'sms', e.target.checked)}
                      />
                      <span>SMS (Coming Soon)</span>
                    </label>
                    <label style={{ ...checkboxLabelStyle, color: 'var(--foreground-muted)', cursor: 'not-allowed' }}>
                      <input 
                        type="checkbox"
                        disabled
                        checked={businessConfig.notifications[category]?.includes('whatsapp')}
                        onChange={e => handleNotificationChange(category, 'whatsapp', e.target.checked)}
                      />
                      <span>WhatsApp (Coming Soon)</span>
                    </label>
                  </div>
                </div>
              ))}
            </div>

            <div style={formActionsStyle}>
              <button type="button" onClick={handleResetBusinessConfig} className="btn-secondary">Reset</button>
              <button type="submit" disabled={saveLoading['business_config']} className="btn-primary">
                {saveLoading['business_config'] ? 'Saving...' : 'Save Routing'}
              </button>
            </div>
          </form>
        )}

        {/* TAB 4: Terminology Overrides */}
        {activeTab === 'terminology' && (
          <form onSubmit={handleSaveBusinessConfig} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div>
              <h2 style={sectionHeaderStyle}>Configurable Terminology Mappings</h2>
              <p style={sectionSubStyle}>Customize default vocabulary labels. Set custom display text for adjustments or transfers.</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={labelStyle}>Default Stock Adjustments (ADJUSTMENT)</label>
                <input 
                  type="text"
                  placeholder="e.g. Correct Stock"
                  value={businessConfig.terminology.ADJUSTMENT}
                  onChange={e => setBusinessConfig({
                    ...businessConfig,
                    terminology: { ...businessConfig.terminology, ADJUSTMENT: e.target.value }
                  })}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Default Stock Transfer (TRANSFER)</label>
                <input 
                  type="text"
                  placeholder="e.g. Move Stock"
                  value={businessConfig.terminology.TRANSFER}
                  onChange={e => setBusinessConfig({
                    ...businessConfig,
                    terminology: { ...businessConfig.terminology, TRANSFER: e.target.value }
                  })}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Default Transaction Client (NARRATION)</label>
                <input 
                  type="text"
                  placeholder="e.g. Client"
                  value={businessConfig.terminology.NARRATION}
                  onChange={e => setBusinessConfig({
                    ...businessConfig,
                    terminology: { ...businessConfig.terminology, NARRATION: e.target.value }
                  })}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Default Warehouse Title (WAREHOUSE)</label>
                <input 
                  type="text"
                  placeholder="e.g. Warehouse"
                  value={businessConfig.terminology.WAREHOUSE}
                  onChange={e => setBusinessConfig({
                    ...businessConfig,
                    terminology: { ...businessConfig.terminology, WAREHOUSE: e.target.value }
                  })}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Default Stock Title (STOCK)</label>
                <input 
                  type="text"
                  placeholder="e.g. Stock"
                  value={businessConfig.terminology.STOCK}
                  onChange={e => setBusinessConfig({
                    ...businessConfig,
                    terminology: { ...businessConfig.terminology, STOCK: e.target.value }
                  })}
                  style={inputStyle}
                />
              </div>
            </div>

            <div style={formActionsStyle}>
              <button type="button" onClick={handleResetBusinessConfig} className="btn-secondary">Reset</button>
              <button type="submit" disabled={saveLoading['business_config']} className="btn-primary">
                {saveLoading['business_config'] ? 'Saving...' : 'Save Terminology'}
              </button>
            </div>
          </form>
        )}

        {/* TAB 5: Backups */}
        {activeTab === 'backups' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div>
              <h2 style={sectionHeaderStyle}>Database Backups & Recovery</h2>
              <p style={sectionSubStyle}>Download complete JSON dumps of the databases, or upload a backup file to recover system data.</p>
            </div>

            <div style={configBoxStyle}>
              <h3 style={configBoxHeaderStyle}>Restore / Backup Utilities</h3>
              <p style={configBoxSubStyle}>
                Running a restore overwrites the active local database tables instantly.
              </p>
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem', flexWrap: 'wrap' }}>
                <button 
                  type="button" 
                  onClick={handleCreateBackup} 
                  disabled={isBackupLoading || isRestoreLoading} 
                  className="btn-primary"
                >
                  {isBackupLoading ? 'Creating Backup...' : 'Generate Backup JSON'}
                </button>
                <input type="file" accept=".json" onChange={handleRestoreBackup} ref={restoreInputRef} style={{ display: 'none' }} />
                <button 
                  type="button" 
                  onClick={() => restoreInputRef.current?.click()} 
                  disabled={isBackupLoading || isRestoreLoading} 
                  className="btn-secondary"
                >
                  Upload & Restore Backup
                </button>
              </div>
            </div>
          </div>
        )}
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
  display: 'block', marginBottom: '0.375rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--foreground-muted)'
};

const inputStyle = {
  width: '100%', padding: '0.625rem 0.875rem', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '0.85rem', background: 'white', outline: 'none', transition: 'border-color 0.2s', fontFamily: 'inherit'
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

const tabBarContainerStyle: React.CSSProperties = {
  display: 'flex',
  borderBottom: '1px solid var(--border)',
  overflowX: 'auto',
  gap: '1.5rem',
  paddingBottom: '0.25rem'
};

const tabItemStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: '0.75rem 0.25rem',
  cursor: 'pointer',
  fontSize: '0.85rem',
  transition: 'all 0.2s',
  whiteSpace: 'nowrap'
};

const sectionHeaderStyle: React.CSSProperties = {
  fontSize: '1.15rem',
  fontWeight: 800,
  color: 'var(--foreground)',
  marginBottom: '0.25rem'
};

const sectionSubStyle: React.CSSProperties = {
  fontSize: '0.8rem',
  color: 'var(--foreground-muted)',
  marginBottom: '1rem'
};

const logoPreviewBoxStyle: React.CSSProperties = {
  width: '100px',
  height: '100px',
  border: '2px dashed var(--border)',
  borderRadius: '12px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#f8fafc',
  overflow: 'hidden'
};

const formActionsStyle: React.CSSProperties = {
  display: 'flex',
  gap: '0.75rem',
  justifyContent: 'flex-end',
  marginTop: '1.5rem',
  borderTop: '1px solid var(--border)',
  paddingTop: '1.5rem'
};

const configBoxStyle: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: '12px',
  padding: '1.25rem',
  background: '#f8fafc'
};

const configBoxHeaderStyle: React.CSSProperties = {
  fontSize: '0.9rem',
  fontWeight: 700,
  color: 'var(--foreground)',
  marginBottom: '0.25rem'
};

const configBoxSubStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  color: 'var(--foreground-muted)',
  lineHeight: 1.4
};

const notificationRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '1rem 0',
  borderBottom: '1px solid var(--border)',
  flexWrap: 'wrap',
  gap: '1rem'
};

const checkboxLabelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  fontSize: '0.85rem',
  fontWeight: 500,
  color: 'var(--foreground)',
  cursor: 'pointer'
};
