"use client";

import React, { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/apiFetch';
import { useToast } from '@/components/ToastProvider';
import { useAuth } from '@/components/AuthProvider';
import { useLanguage } from '@/components/LanguageContext';
import Link from 'next/link';
import { MobileCard } from '@/components/MobileCard';

interface Client {
  id: number;
  company_name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  gst: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  industry: string | null;
  remarks: string | null;
  created_at: string;
  last_purchase_at: string | null;
  days_since_last_purchase: number | null;
  total_orders: number;
  lifetime_revenue: number;
  dynamic_status: 'Active' | 'Regular' | 'Inactive';
}

export default function ClientsPage() {
  const { showToast } = useToast();
  const { userRole } = useAuth();
  const { t } = useLanguage();

  // Search & Filter state
  const [search, setSearch] = useState('');
  const [industry, setIndustry] = useState('');
  const [status, setStatus] = useState('');
  const [sortKey, setSortKey] = useState('company_name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [limit] = useState(15);

  // Data states
  const [clients, setClients] = useState<Client[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(false);

  // Client stats KPI states
  const [stats, setStats] = useState({
    totalClients: 0,
    activeClients: 0,
    regularClients: 0,
    inactiveClients: 0,
  });

  // Modal / Form state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [activeClient, setActiveClient] = useState<Partial<Client> | null>(null);
  const [importText, setImportText] = useState('');

  // Form input states
  const [formCompany, setFormCompany] = useState('');
  const [formContact, setFormContact] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formGst, setFormGst] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formCity, setFormCity] = useState('');
  const [formState, setFormState] = useState('');
  const [formIndustry, setFormIndustry] = useState('Manufacturing');
  const [formRemarks, setFormRemarks] = useState('');

  const industries = ['Manufacturing', 'Technology', 'Healthcare', 'Automotive', 'Logistics', 'Retail', 'Wholesale', 'Other'];

  const loadClients = async () => {
    setIsLoading(true);
    try {
      const query = new URLSearchParams({
        search,
        industry,
        status,
        sortKey,
        sortDir,
        page: String(page),
        limit: String(limit)
      });
      const res = await apiFetch(`/clients?${query.toString()}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setClients(json.data);
          setTotalCount(json.pagination.total);
          setTotalPages(json.pagination.totalPages);
        }
      }
    } catch (e) {
      showToast('Failed to load client directory.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const res = await apiFetch('/clients/analytics');
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data?.kpis) {
          setStats({
            totalClients: json.data.kpis.totalClients,
            activeClients: json.data.kpis.activeClients,
            regularClients: json.data.kpis.regularClients,
            inactiveClients: json.data.kpis.inactiveClients,
          });
        }
      }
    } catch (e) {}
  };

  useEffect(() => {
    if (userRole === 'Admin' || userRole === 'Manager') {
      loadClients();
    }
  }, [search, industry, status, sortKey, sortDir, page, userRole]);

  useEffect(() => {
    if (userRole === 'Admin' || userRole === 'Manager') {
      loadStats();
    }
  }, [userRole]);

  const resetForm = () => {
    setFormCompany('');
    setFormContact('');
    setFormPhone('');
    setFormEmail('');
    setFormGst('');
    setFormAddress('');
    setFormCity('');
    setFormState('');
    setFormIndustry('Manufacturing');
    setFormRemarks('');
    setActiveClient(null);
  };

  const handleOpenAdd = () => {
    resetForm();
    setShowAddModal(true);
  };

  const handleOpenEdit = (client: Client) => {
    setActiveClient(client);
    setFormCompany(client.company_name);
    setFormContact(client.contact_person || '');
    setFormPhone(client.phone || '');
    setFormEmail(client.email || '');
    setFormGst(client.gst || '');
    setFormAddress(client.address || '');
    setFormCity(client.city || '');
    setFormState(client.state || '');
    setFormIndustry(client.industry || 'Manufacturing');
    setFormRemarks(client.remarks || '');
    setShowEditModal(true);
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formCompany.trim()) return showToast('Company Name is required', 'error');

    try {
      const res = await apiFetch('/clients', {
        method: 'POST',
        body: JSON.stringify({
          company_name: formCompany.trim(),
          contact_person: formContact.trim(),
          phone: formPhone.trim(),
          email: formEmail.trim(),
          gst: formGst.trim(),
          address: formAddress.trim(),
          city: formCity.trim(),
          state: formState.trim(),
          industry: formIndustry,
          remarks: formRemarks.trim()
        })
      });
      const json = await res.json();
      if (res.ok && json.success) {
        showToast('Client added successfully.', 'success');
        setShowAddModal(false);
        resetForm();
        loadClients();
        loadStats();
      } else {
        showToast(json.message || 'Failed to add client.', 'error');
      }
    } catch (err) {
      showToast('Connection failed.', 'error');
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeClient?.id) return;
    if (!formCompany.trim()) return showToast('Company Name is required', 'error');

    try {
      const res = await apiFetch(`/clients/${activeClient.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          company_name: formCompany.trim(),
          contact_person: formContact.trim(),
          phone: formPhone.trim(),
          email: formEmail.trim(),
          gst: formGst.trim(),
          address: formAddress.trim(),
          city: formCity.trim(),
          state: formState.trim(),
          industry: formIndustry,
          remarks: formRemarks.trim()
        })
      });
      const json = await res.json();
      if (res.ok && json.success) {
        showToast('Client updated successfully.', 'success');
        setShowEditModal(false);
        resetForm();
        loadClients();
        loadStats();
      } else {
        showToast(json.message || 'Failed to update client.', 'error');
      }
    } catch (err) {
      showToast('Connection failed.', 'error');
    }
  };

  const handleDeleteClient = async (id: number, name: string) => {
    const confirm = window.confirm(`Are you sure you want to delete client "${name}"?`);
    if (!confirm) return;

    try {
      const res = await apiFetch(`/clients/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (res.ok && json.success) {
        showToast('Client removed successfully.', 'success');
        loadClients();
        loadStats();
      } else {
        showToast(json.message || 'Failed to delete client.', 'error');
      }
    } catch (err) {
      showToast('Connection failed.', 'error');
    }
  };

  const handleExportClients = async () => {
    try {
      const res = await apiFetch('/clients/all');
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          const blob = new Blob([JSON.stringify(json.data, null, 2)], { type: 'application/json' });
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `Clients_Directory_${new Date().toISOString().split('T')[0]}.json`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(url);
          showToast('Clients exported successfully.', 'success');
        }
      }
    } catch (e) {
      showToast('Export failed.', 'error');
    }
  };

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importText.trim()) return showToast('Please enter clients JSON array', 'error');

    try {
      const parsed = JSON.parse(importText.trim());
      if (!Array.isArray(parsed)) {
        return showToast('Import format must be a JSON array of clients', 'error');
      }

      const res = await apiFetch('/clients/import', {
        method: 'POST',
        body: JSON.stringify({ clients: parsed })
      });
      const json = await res.json();
      if (res.ok && json.success) {
        showToast(json.message, 'success');
        setShowImportModal(false);
        setImportText('');
        loadClients();
        loadStats();
      } else {
        showToast(json.message || 'Import failed.', 'error');
      }
    } catch (err: any) {
      showToast(`Invalid JSON format: ${err.message}`, 'error');
    }
  };

  // Helper status color badges
  const getStatusBadgeStyle = (status: Client['dynamic_status']) => {
    if (status === 'Active') return { background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0' };
    if (status === 'Regular') return { background: '#fef9c3', color: '#a16207', border: '1px solid #fef08a' };
    return { background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5' };
  };

  if (!userRole || (userRole !== 'Admin' && userRole !== 'Manager')) {
    return (
      <main style={{ padding: '2rem', textAlign: 'center' }}>
        <h2>Forbidden: Access denied</h2>
      </main>
    );
  }

  return (
    <main style={{ padding: '2rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', flex: 1, minWidth: 0 }}>
      {/* Header section */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="text-2xl font-bold">Client Directory</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--foreground-muted)' }}>
            Manage client profiles, contact numbers, and monitor their purchase activity timelines.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={handleOpenAdd} className="btn-primary">➕ Add Client</button>
          <button onClick={() => setShowImportModal(true)} className="btn-secondary">📥 Import</button>
          <button onClick={handleExportClients} className="btn-secondary">📤 Export Directory</button>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div style={kpiGridStyle}>
        <div className="card" style={kpiCardStyle}>
          <span style={{ fontSize: '1.5rem' }}>👥</span>
          <div>
            <div style={kpiLabelStyle}>Total Clients</div>
            <div style={kpiValueStyle}>{stats.totalClients}</div>
          </div>
        </div>
        <div className="card" style={{ ...kpiCardStyle, borderLeft: '4px solid #16a34a' }}>
          <span style={{ fontSize: '1.5rem' }}>🟢</span>
          <div>
            <div style={kpiLabelStyle}>Active Clients (≤ 30 days)</div>
            <div style={kpiValueStyle}>{stats.activeClients}</div>
          </div>
        </div>
        <div className="card" style={{ ...kpiCardStyle, borderLeft: '4px solid #ca8a04' }}>
          <span style={{ fontSize: '1.5rem' }}>🟡</span>
          <div>
            <div style={kpiLabelStyle}>Regular Clients (31-90 days)</div>
            <div style={kpiValueStyle}>{stats.regularClients}</div>
          </div>
        </div>
        <div className="card" style={{ ...kpiCardStyle, borderLeft: '4px solid #dc2626' }}>
          <span style={{ fontSize: '1.5rem' }}>🔴</span>
          <div>
            <div style={kpiLabelStyle}>Inactive Clients (&gt; 90 days)</div>
            <div style={kpiValueStyle}>{stats.inactiveClients}</div>
          </div>
        </div>
      </div>

      {/* Filters & search wrapper */}
      <div className="card" style={{ padding: '1rem', display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
        <input 
          type="text" 
          placeholder="Search by company, email, contact..." 
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ ...inputStyle, flex: 1, minWidth: '200px' }}
        />
        <select value={industry} onChange={e => setIndustry(e.target.value)} style={{ ...inputStyle, width: '160px' }}>
          <option value="">All Industries</option>
          {industries.map(i => <option key={i} value={i}>{i}</option>)}
        </select>
        <select value={status} onChange={e => setStatus(e.target.value)} style={{ ...inputStyle, width: '160px' }}>
          <option value="">All Activity Statuses</option>
          <option value="Active">Active</option>
          <option value="Regular">Regular</option>
          <option value="Inactive">Inactive</option>
        </select>
        <select value={sortKey} onChange={e => setSortKey(e.target.value)} style={{ ...inputStyle, width: '160px' }}>
          <option value="company_name">Sort: Company Name</option>
          <option value="city">Sort: City</option>
          <option value="last_purchase_at">Sort: Last Purchase</option>
          <option value="lifetime_revenue">Sort: Total Revenue</option>
          <option value="total_orders">Sort: Total Orders</option>
        </select>
        <button 
          onClick={() => setSortDir(prev => prev === 'asc' ? 'desc' : 'asc')} 
          className="btn-secondary"
          style={{ height: '38px', padding: '0 0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          {sortDir === 'asc' ? '▲' : '▼'}
        </button>
      </div>

      {/* Table listing */}
      {isLoading ? (
        <div className="card" style={{ padding: '3rem', textAlign: 'center', fontSize: '0.9rem', color: 'var(--foreground-muted)' }}>
          Loading clients directory...
        </div>
      ) : clients.length === 0 ? (
        <div className="card" style={{ padding: '3rem', textAlign: 'center', fontSize: '0.9rem', color: 'var(--foreground-muted)' }}>
          No clients found matching the selected filters.
        </div>
      ) : (
        <>
          {/* Desktop Table Wrapper */}
          <div className="desktop-table-wrapper card" style={{ overflowX: 'auto', padding: 0 }}>
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border)' }}>
                  <th style={thStyle}>Company Name</th>
                  <th style={thStyle}>Contact Person</th>
                  <th style={thStyle}>City & State</th>
                  <th style={thStyle}>Industry</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Total Purchases</th>
                  <th style={thStyle}>Lifetime Revenue</th>
                  <th style={thStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {clients.map(client => (
                  <tr key={client.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.2s' }}>
                    <td style={tdStyle}>
                      <Link href={`/clients/${client.id}`} style={{ fontWeight: 700, color: 'var(--primary)', textDecoration: 'none' }}>
                        {client.company_name}
                      </Link>
                    </td>
                    <td style={tdStyle}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{client.contact_person || 'N/A'}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--foreground-muted)' }}>{client.email || ''}</div>
                    </td>
                    <td style={tdStyle}>{client.city ? `${client.city}, ${client.state || ''}` : 'N/A'}</td>
                    <td style={tdStyle}><span className="badge" style={{ background: '#f1f5f9', color: '#475569' }}>{client.industry || 'Other'}</span></td>
                    <td style={tdStyle}>
                      <span className="badge" style={getStatusBadgeStyle(client.dynamic_status)}>
                        {client.dynamic_status}
                      </span>
                    </td>
                    <td style={tdStyle}>{client.total_orders} Orders</td>
                    <td style={{ ...tdStyle, fontWeight: 700 }}>₹{parseFloat(String(client.lifetime_revenue)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', gap: '0.25rem' }}>
                        <Link href={`/clients/${client.id}`} className="btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', textDecoration: 'none' }}>
                          View
                        </Link>
                        <button onClick={() => handleOpenEdit(client)} className="btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>
                          Edit
                        </button>
                        {userRole === 'Admin' && (
                          <button onClick={() => handleDeleteClient(client.id, client.company_name)} className="btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', color: 'var(--danger)', borderColor: 'var(--danger)' }}>
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile view stacked cards list */}
          <div className="mobile-cards-list" style={{ display: 'none' }}>
            {clients.map(client => (
              <MobileCard
                key={client.id}
                title={
                  <Link href={`/clients/${client.id}`} style={{ fontWeight: 700, color: 'var(--primary)', textDecoration: 'none' }}>
                    {client.company_name}
                  </Link>
                }
                primaryInfo={
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <div><strong>Contact:</strong> {client.contact_person || 'N/A'}</div>
                    <div><strong>Industry:</strong> {client.industry || 'Other'}</div>
                    <div><strong>Total Orders:</strong> {client.total_orders}</div>
                    <div><strong>Lifetime Revenue:</strong> ₹{parseFloat(String(client.lifetime_revenue)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                  </div>
                }
                secondaryInfo={
                  <div>
                    {client.city ? `${client.city}, ${client.state || ''}` : ''} {client.email ? `• ${client.email}` : ''}
                  </div>
                }
                statusBadge={
                  <span className="badge" style={getStatusBadgeStyle(client.dynamic_status)}>
                    {client.dynamic_status}
                  </span>
                }
                actions={
                  <>
                    <Link href={`/clients/${client.id}`} className="btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', textDecoration: 'none' }}>
                      View Profile
                    </Link>
                    <button onClick={() => handleOpenEdit(client)} className="btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>
                      Edit
                    </button>
                  </>
                }
              />
            ))}
          </div>
        </>
      )}

      {/* Add responsive toggler classes */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media (max-width: 768px) {
          .desktop-table-wrapper { display: none !important; }
          .mobile-cards-list { display: block !important; }
        }
      `}} />

      {/* Pagination component */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--foreground-muted)' }}>
            Showing {clients.length} of {totalCount} clients
          </span>
          <div style={{ display: 'flex', gap: '0.25rem' }}>
            <button 
              disabled={page === 1} 
              onClick={() => setPage(p => Math.max(1, p - 1))} 
              className="btn-secondary"
            >
              Previous
            </button>
            {Array.from({ length: totalPages }).map((_, i) => (
              <button
                key={i}
                onClick={() => setPage(i + 1)}
                className={page === i + 1 ? 'btn-primary' : 'btn-secondary'}
                style={{ minWidth: '36px' }}
              >
                {i + 1}
              </button>
            ))}
            <button 
              disabled={page === totalPages} 
              onClick={() => setPage(p => Math.min(totalPages, p + 1))} 
              className="btn-secondary"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Add Client Dialog Modal */}
      {showAddModal && (
        <div style={modalOverlayStyle}>
          <div style={modalContentStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
              <h3 style={{ fontWeight: 800 }}>Add New Client Account</h3>
              <button onClick={() => setShowAddModal(false)} style={closeBtnStyle}>✕</button>
            </div>
            <form onSubmit={handleAddSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={labelStyle}>Company Name *</label>
                  <input type="text" required value={formCompany} onChange={e => setFormCompany(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Contact Person</label>
                  <input type="text" value={formContact} onChange={e => setFormContact(e.target.value)} style={inputStyle} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={labelStyle}>Phone Number</label>
                  <input type="text" value={formPhone} onChange={e => setFormPhone(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Email Address</label>
                  <input type="email" value={formEmail} onChange={e => setFormEmail(e.target.value)} style={inputStyle} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={labelStyle}>GST Number</label>
                  <input type="text" placeholder="e.g. 22AAAAA0000A1Z5" value={formGst} onChange={e => setFormGst(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Industry Category</label>
                  <select value={formIndustry} onChange={e => setFormIndustry(e.target.value)} style={inputStyle}>
                    {industries.map(ind => <option key={ind} value={ind}>{ind}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label style={labelStyle}>Client Office Address</label>
                <input type="text" value={formAddress} onChange={e => setFormAddress(e.target.value)} style={inputStyle} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={labelStyle}>City</label>
                  <input type="text" value={formCity} onChange={e => setFormCity(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>State</label>
                  <input type="text" value={formState} onChange={e => setFormState(e.target.value)} style={inputStyle} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Remarks & Notes</label>
                <textarea value={formRemarks} onChange={e => setFormRemarks(e.target.value)} style={{ ...inputStyle, minHeight: '60px' }} />
              </div>
              <div style={{ ...formActionsStyle, marginTop: '0.5rem' }}>
                <button type="button" onClick={() => setShowAddModal(false)} className="btn-secondary">Cancel</button>
                <button type="submit" className="btn-primary">Save Client</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Client Dialog Modal */}
      {showEditModal && (
        <div style={modalOverlayStyle}>
          <div style={modalContentStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
              <h3 style={{ fontWeight: 800 }}>Edit Client Details</h3>
              <button onClick={() => setShowEditModal(false)} style={closeBtnStyle}>✕</button>
            </div>
            <form onSubmit={handleEditSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={labelStyle}>Company Name *</label>
                  <input type="text" required value={formCompany} onChange={e => setFormCompany(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Contact Person</label>
                  <input type="text" value={formContact} onChange={e => setFormContact(e.target.value)} style={inputStyle} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={labelStyle}>Phone Number</label>
                  <input type="text" value={formPhone} onChange={e => setFormPhone(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Email Address</label>
                  <input type="email" value={formEmail} onChange={e => setFormEmail(e.target.value)} style={inputStyle} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={labelStyle}>GST Number</label>
                  <input type="text" value={formGst} onChange={e => setFormGst(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Industry Category</label>
                  <select value={formIndustry} onChange={e => setFormIndustry(e.target.value)} style={inputStyle}>
                    {industries.map(ind => <option key={ind} value={ind}>{ind}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label style={labelStyle}>Client Office Address</label>
                <input type="text" value={formAddress} onChange={e => setFormAddress(e.target.value)} style={inputStyle} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={labelStyle}>City</label>
                  <input type="text" value={formCity} onChange={e => setFormCity(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>State</label>
                  <input type="text" value={formState} onChange={e => setFormState(e.target.value)} style={inputStyle} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Remarks & Notes</label>
                <textarea value={formRemarks} onChange={e => setFormRemarks(e.target.value)} style={{ ...inputStyle, minHeight: '60px' }} />
              </div>
              <div style={{ ...formActionsStyle, marginTop: '0.5rem' }}>
                <button type="button" onClick={() => setShowEditModal(false)} className="btn-secondary">Cancel</button>
                <button type="submit" className="btn-primary">Update Details</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk JSON Import Modal */}
      {showImportModal && (
        <div style={modalOverlayStyle}>
          <div style={{ ...modalContentStyle, maxWidth: '600px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
              <h3 style={{ fontWeight: 800 }}>Bulk Import Clients</h3>
              <button onClick={() => setShowImportModal(false)} style={closeBtnStyle}>✕</button>
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--foreground-muted)', marginBottom: '1rem' }}>
              Paste a JSON array containing client records. Example format:<br />
              <code>[{"{"} "company_name": "Acme Corp", "contact_person": "Jane", "email": "jane@acme.com", "phone": "12345", "gst": "22AAAAA0000A1Z5", "city": "Mumbai", "industry": "Retail" {"}"}]</code>
            </p>
            <form onSubmit={handleImportSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <textarea 
                value={importText} 
                onChange={e => setImportText(e.target.value)} 
                placeholder="[{ ... }]"
                style={{ ...inputStyle, minHeight: '200px', fontFamily: 'monospace', fontSize: '0.8rem' }}
              />
              <div style={formActionsStyle}>
                <button type="button" onClick={() => setShowImportModal(false)} className="btn-secondary">Cancel</button>
                <button type="submit" className="btn-primary">Import Array</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}

// Styling Constants
const kpiGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
  gap: '1.25rem'
};

const kpiCardStyle: React.CSSProperties = {
  padding: '1.25rem',
  display: 'flex',
  alignItems: 'center',
  gap: '1rem'
};

const kpiLabelStyle = {
  fontSize: '0.75rem',
  color: 'var(--foreground-muted)',
  fontWeight: 600,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.02em'
};

const kpiValueStyle = {
  fontSize: '1.35rem',
  fontWeight: 800,
  color: 'var(--foreground)',
  marginTop: '0.125rem'
};

const labelStyle = {
  display: 'block', marginBottom: '0.25rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--foreground-muted)'
};

const inputStyle = {
  width: '100%', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '0.85rem', background: 'white', outline: 'none'
};

const thStyle = {
  padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 700, color: 'var(--foreground-muted)', textTransform: 'uppercase' as const, borderBottom: '1px solid var(--border)'
};

const tdStyle = {
  padding: '1rem', fontSize: '0.85rem', color: 'var(--foreground)', verticalAlign: 'middle'
};

const modalOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0, left: 0, right: 0, bottom: 0,
  background: 'rgba(0,0,0,0.4)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 2000
};

const modalContentStyle: React.CSSProperties = {
  background: 'white',
  padding: '1.5rem',
  borderRadius: '12px',
  boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
  width: '90%',
  maxWidth: '500px',
  maxHeight: '90vh',
  overflowY: 'auto'
};

const closeBtnStyle = {
  background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem', color: 'var(--foreground-muted)'
};

const formActionsStyle = {
  display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: '1rem'
};
