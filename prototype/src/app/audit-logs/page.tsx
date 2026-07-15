"use client";

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { apiFetch } from '@/lib/apiFetch';
import { useToast } from '@/components/ToastProvider';
import EmptyState from '@/components/EmptyState';
import * as XLSX from 'xlsx';

interface AuditLog {
  id: number;
  user_id: number | null;
  user_name: string | null;
  user_email: string | null;
  role: string | null;
  module: string;
  action: string;
  reference_type: string | null;
  reference_id: string | null;
  old_value: any;
  new_value: any;
  description: string | null;
  status: string;
  ip_address: string | null;
  browser: string | null;
  created_at: string;
}

export default function AuditLogsPage() {
  const { showToast } = useToast();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Filter States
  const [search, setSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const limit = 50;

  // Selected Log Details Modal
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showRawJson, setShowRawJson] = useState(false);

  // Fetch Audit Logs from backend
  const fetchLogs = async () => {
    setLoading(true);
    setError(false);
    try {
      const queryParams = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        q: search,
        moduleName: moduleFilter,
        actionType: actionFilter,
        role: roleFilter,
        status: statusFilter,
        startDate,
        endDate
      });

      const res = await apiFetch(`/audit-logs?${queryParams}`);
      if (!res.ok) throw new Error('Failed to load audit logs');
      const json = await res.json();
      if (json.success) {
        setLogs(json.data);
        setTotalPages(json.pagination.totalPages || 1);
        setTotalItems(json.pagination.total || 0);
      } else {
        throw new Error(json.message);
      }
    } catch (err) {
      console.error(err);
      setError(true);
      showToast('Failed to retrieve system audit logs.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [page, moduleFilter, actionFilter, roleFilter, statusFilter, startDate, endDate]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchLogs();
  };

  // Keyboard navigation for details modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showDetailsModal) {
        setShowDetailsModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showDetailsModal]);

  // View details modal trigger
  const openDetails = (log: AuditLog) => {
    setSelectedLog(log);
    setShowRawJson(false);
    setShowDetailsModal(true);
  };

  // Status badge styling helper
  const renderStatusBadge = (status: string) => {
    const s = String(status || '').toUpperCase();
    if (s === 'SUCCESS') {
      return <span className="badge badge-admin" style={{ background: '#dcfce7', color: '#16a34a', border: 'none' }}>🟢 Success</span>;
    }
    if (s === 'WARNING') {
      return <span className="badge badge-manager" style={{ background: '#fef3c7', color: '#d97706', border: 'none' }}>🟡 Warning</span>;
    }
    return <span className="badge badge-user" style={{ background: '#fee2e2', color: '#dc2626', border: 'none' }}>🔴 Failed</span>;
  };

  // Comparison logic helper (old vs new values)
  const getValueDifferences = (log: AuditLog) => {
    let oldVal: Record<string, any> = {};
    let newVal: Record<string, any> = {};
    try {
      oldVal = typeof log.old_value === 'string' ? JSON.parse(log.old_value) : (log.old_value || {});
    } catch (e) {}
    try {
      newVal = typeof log.new_value === 'string' ? JSON.parse(log.new_value) : (log.new_value || {});
    } catch (e) {}

    const allKeys = Array.from(new Set([...Object.keys(oldVal), ...Object.keys(newVal)]))
      .filter(k => k !== 'versionMetadata' && k !== 'password'); // omit metadata and hashes

    return allKeys.map(key => {
      const o = oldVal[key];
      const n = newVal[key];
      // Format arrays/objects as strings
      const formatVal = (v: any) => {
        if (v === null || v === undefined) return 'N/A';
        if (typeof v === 'object') return JSON.stringify(v);
        return String(v);
      };
      return {
        field: key,
        oldValue: formatVal(o),
        newValue: formatVal(n),
        changed: formatVal(o) !== formatVal(n)
      };
    });
  };

  // Exporter data builder helper
  const getExportData = async () => {
    // Fetches all matching log entries without pagination limits for the export
    try {
      const queryParams = new URLSearchParams({
        page: '1',
        limit: '10000', // large upper bound
        q: search,
        moduleName: moduleFilter,
        actionType: actionFilter,
        role: roleFilter,
        status: statusFilter,
        startDate,
        endDate
      });

      const res = await apiFetch(`/audit-logs?${queryParams}`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      return json.success ? json.data : [];
    } catch (e) {
      showToast('Failed to retrieve full export data.', 'error');
      return [];
    }
  };

  // Export to Excel trigger
  const handleExportExcel = async () => {
    const rawData = await getExportData();
    if (rawData.length === 0) return;

    // Map rows to sheet columns
    const sheetData = rawData.map((log: AuditLog) => ({
      'Log ID': log.id,
      'Timestamp': new Date(log.created_at).toLocaleString(),
      'User Name': log.user_name || 'System',
      'User Email': log.user_email || 'N/A',
      'User Role': log.role || 'N/A',
      'Module': log.module,
      'Action': log.action,
      'Reference Type': log.reference_type || 'N/A',
      'Reference ID': log.reference_id || 'N/A',
      'Description': log.description || '',
      'Status': log.status,
      'IP Address': log.ip_address || 'N/A',
      'Browser Agent': log.browser || 'N/A'
    }));

    // Create sheets and apply metadata headers
    const ws = XLSX.utils.json_to_sheet([]);
    
    // Add custom metadata header rows
    const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
    const headerInfo = [
      ['System Audit Log Export Report'],
      [`Export Date: ${new Date().toLocaleString()}`],
      [`Generated By: ${currentUser.name || currentUser.email || 'Admin'}`],
      [`Filters Applied - Module: ${moduleFilter || 'All'}, Action: ${actionFilter || 'All'}, Status: ${statusFilter || 'All'}, Date: ${startDate || 'Any'} to ${endDate || 'Any'}`],
      [''], // empty spacer row
    ];

    XLSX.utils.sheet_add_aoa(ws, headerInfo, { origin: 'A1' });
    XLSX.utils.sheet_add_json(ws, sheetData, { origin: 'A6', skipHeader: false });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Audit Logs');
    XLSX.writeFile(wb, `Audit_Logs_${Date.now()}.xlsx`);
    showToast('Audit logs exported to Excel successfully.', 'success');
  };

  // Export to CSV trigger
  const handleExportCSV = async () => {
    const rawData = await getExportData();
    if (rawData.length === 0) return;

    const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
    let csvContent = `System Audit Log Export Report\r\n`;
    csvContent += `Export Date: ${new Date().toLocaleString()}\r\n`;
    csvContent += `Generated By: ${currentUser.name || currentUser.email || 'Admin'}\r\n`;
    csvContent += `Filters - Module: ${moduleFilter || 'All'}, Action: ${actionFilter || 'All'}, Status: ${statusFilter || 'All'}, Date: ${startDate || 'Any'} to ${endDate || 'Any'}\r\n\r\n`;

    // Headers
    const headers = ['Log ID', 'Timestamp', 'User Name', 'User Email', 'User Role', 'Module', 'Action', 'Reference Type', 'Reference ID', 'Description', 'Status', 'IP Address', 'Browser Agent'];
    csvContent += headers.join(',') + '\r\n';

    // Rows
    rawData.forEach((log: AuditLog) => {
      const row = [
        log.id,
        `"${new Date(log.created_at).toLocaleString()}"`,
        `"${log.user_name || 'System'}"`,
        `"${log.user_email || 'N/A'}"`,
        `"${log.role || 'N/A'}"`,
        `"${log.module}"`,
        `"${log.action}"`,
        `"${log.reference_type || 'N/A'}"`,
        `"${log.reference_id || 'N/A'}"`,
        `"${(log.description || '').replace(/"/g, '""')}"`,
        `"${log.status}"`,
        `"${log.ip_address || 'N/A'}"`,
        `"${(log.browser || 'N/A').replace(/"/g, '""')}"`
      ];
      csvContent += row.join(',') + '\r\n';
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Audit_Logs_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Audit logs exported to CSV successfully.', 'success');
  };

  return (
    <main style={{ padding: '2rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', flex: 1, minWidth: 0 }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="text-2xl font-bold">System Audit Logs</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--foreground-muted)' }}>
            Enterprise-grade monitoring tracking system-wide user and administration modifications.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button 
            onClick={handleExportCSV} 
            className="btn-excel-export" 
            style={{ background: 'linear-gradient(135deg, #475569 0%, #334155 100%)', boxShadow: '0 2px 4px rgba(71, 85, 105, 0.2)' }}
          >
            <span>📄 Export CSV</span>
          </button>
          <button onClick={handleExportExcel} className="btn-excel-export">
            <span>📊 Export Excel</span>
          </button>
        </div>
      </div>

      {/* Advanced Filters Panel */}
      <div className="card" style={{ padding: '1.25rem' }}>
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
            {/* Module Filter */}
            <div>
              <label style={labelStyle}>Module</label>
              <select value={moduleFilter} onChange={e => { setModuleFilter(e.target.value); setPage(1); }} style={inputStyle}>
                <option value="">All Modules</option>
                <option value="Authentication">Authentication</option>
                <option value="User Management">User Management</option>
                <option value="Products">Products</option>
                <option value="Stock">Stock</option>
                <option value="Settings">Settings</option>
                <option value="Branding">Branding</option>
                <option value="Profile">Profile</option>
              </select>
            </div>

            {/* Action Filter */}
            <div>
              <label style={labelStyle}>Action Type</label>
              <select value={actionFilter} onChange={e => { setActionFilter(e.target.value); setPage(1); }} style={inputStyle}>
                <option value="">All Actions</option>
                <option value="LOGIN">Login</option>
                <option value="GOOGLE_LOGIN">Google Login</option>
                <option value="FAILED_LOGIN">Failed Login</option>
                <option value="CREATE_USER">Create User</option>
                <option value="EDIT_USER">Edit User</option>
                <option value="DELETE_USER">Delete User</option>
                <option value="ACTIVATE_USER">Activate User</option>
                <option value="DEACTIVATE_USER">Deactivate User</option>
                <option value="ROLE_CHANGED">Role Changed</option>
                <option value="CREATE_PRODUCT">Create Product</option>
                <option value="PRODUCT_UPDATED">Product Updated</option>
                <option value="EXCEL_IMPORT">Excel Import</option>
                <option value="EXCEL_IMPORT_FAILED">Excel Import Failed</option>
                <option value="INWARD">Inward Stock</option>
                <option value="OUTWARD">Outward Stock</option>
                <option value="TRANSFER">Transfer Stock</option>
                <option value="ADJUSTMENT">Adjustment Stock</option>
                <option value="UPDATE_SETTINGS">Update Settings</option>
                <option value="CHANGE_LOGO">Change Logo</option>
                <option value="REMOVE_LOGO">Remove Logo</option>
                <option value="CREATE_BACKUP">Create Backup</option>
                <option value="DELETE_BACKUP">Delete Backup</option>
                <option value="RESTORE_BACKUP">Restore Backup</option>
              </select>
            </div>

            {/* Role Filter */}
            <div>
              <label style={labelStyle}>Role</label>
              <select value={roleFilter} onChange={e => { setRoleFilter(e.target.value); setPage(1); }} style={inputStyle}>
                <option value="">All Roles</option>
                <option value="Admin">Admin</option>
                <option value="Manager">Manager</option>
                <option value="Basic User">Basic User</option>
              </select>
            </div>

            {/* Status Filter */}
            <div>
              <label style={labelStyle}>Status</label>
              <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} style={inputStyle}>
                <option value="">All Statuses</option>
                <option value="SUCCESS">Success</option>
                <option value="WARNING">Warning</option>
                <option value="FAILED">Failed</option>
              </select>
            </div>

            {/* Start Date */}
            <div>
              <label style={labelStyle}>Start Date</label>
              <input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setPage(1); }} style={inputStyle} />
            </div>

            {/* End Date */}
            <div>
              <label style={labelStyle}>End Date</label>
              <input type="date" value={endDate} onChange={e => { setEndDate(e.target.value); setPage(1); }} style={inputStyle} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <input 
                type="text" 
                placeholder="Search user, email, module, action, description, old/new properties..." 
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={inputStyle}
              />
            </div>
            <button type="submit" className="btn-primary" style={{ height: '38px', padding: '0 1rem' }}>
              Search
            </button>
            <button 
              type="button" 
              onClick={() => {
                setSearch('');
                setModuleFilter('');
                setActionFilter('');
                setRoleFilter('');
                setStatusFilter('');
                setStartDate('');
                setEndDate('');
                setPage(1);
              }}
              className="btn-secondary"
              style={{ height: '38px', padding: '0 1rem' }}
            >
              Reset
            </button>
          </div>
        </form>
      </div>

      {/* Logs Table Container */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '2rem' }}>
            <div style={{ height: '35px', background: '#f1f5f9', borderRadius: '4px', animation: 'pulse 1.5s infinite' }} />
            <div style={{ height: '50px', background: '#f1f5f9', borderRadius: '4px', animation: 'pulse 1.5s infinite' }} />
            <div style={{ height: '50px', background: '#f1f5f9', borderRadius: '4px', animation: 'pulse 1.5s infinite' }} />
          </div>
        ) : error ? (
          <div style={{ padding: '3rem', textAlign: 'center' }}>
            <EmptyState type="search" onPrimaryAction={fetchLogs} />
            <p style={{ marginTop: '1rem', color: 'var(--danger)', fontWeight: 600 }}>Failed to fetch audit trails.</p>
            <button onClick={fetchLogs} className="btn-primary" style={{ marginTop: '0.5rem' }}>Retry</button>
          </div>
        ) : logs.length === 0 ? (
          <div style={{ padding: '4rem 2rem' }}>
            <EmptyState type="search" onPrimaryAction={() => setSearch('')} />
            <p style={{ textAlign: 'center', marginTop: '1rem', color: 'var(--foreground-muted)' }}>
              No audit logs matched the selected filters.
            </p>
          </div>
        ) : (
          <>
            <div className="table-wrapper" style={{ maxHeight: '600px', overflowY: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Date & Time</th>
                    <th>User</th>
                    <th>Role</th>
                    <th>Module</th>
                    <th>Action</th>
                    <th>Description</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'center' }}>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(log => (
                    <tr key={log.id}>
                      <td style={{ whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{log.user_name || 'System'}</div>
                        <div style={{ fontSize: '0.725rem', color: 'var(--foreground-muted)' }}>{log.user_email || 'N/A'}</div>
                      </td>
                      <td>
                        <span className={`badge ${log.role === 'Admin' ? 'badge-admin' : log.role === 'Manager' ? 'badge-manager' : 'badge-user'}`} style={{ fontSize: '0.7rem' }}>
                          {log.role || 'System'}
                        </span>
                      </td>
                      <td style={{ fontWeight: 600 }}>{log.module}</td>
                      <td style={{ fontSize: '0.825rem', fontFamily: 'monospace' }}>{log.action}</td>
                      <td style={{ fontSize: '0.825rem', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {log.description}
                      </td>
                      <td>{renderStatusBadge(log.status)}</td>
                      <td style={{ textAlign: 'center' }}>
                        <button 
                          onClick={() => openDetails(log)} 
                          className="btn-action-edit"
                          title="View Log Details"
                        >
                          👁️
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div style={{ padding: '1rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', flexWrap: 'wrap', gap: '0.75rem' }}>
              <span style={{ fontSize: '0.825rem', color: 'var(--foreground-muted)' }}>
                Showing {logs.length} of {totalItems} logs
              </span>
              <div style={{ display: 'flex', gap: '0.25rem' }}>
                <button 
                  disabled={page <= 1} 
                  onClick={() => setPage(page - 1)} 
                  className="btn-secondary" 
                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                >
                  Prev
                </button>
                {Array.from({ length: totalPages }).map((_, i) => (
                  <button 
                    key={i} 
                    onClick={() => setPage(i + 1)}
                    className={page === i + 1 ? 'btn-primary' : 'btn-secondary'}
                    style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem', minWidth: '32px' }}
                  >
                    {i + 1}
                  </button>
                ))}
                <button 
                  disabled={page >= totalPages} 
                  onClick={() => setPage(page + 1)} 
                  className="btn-secondary" 
                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Log Details Modal */}
      {showDetailsModal && selectedLog && (
        <div style={modalOverlayStyle} role="dialog" aria-modal="true" aria-label="Audit Log Details">
          <div 
            style={{ 
              background: 'white',
              borderRadius: '12px',
              width: '95%',
              maxWidth: '650px',
              boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
              display: 'flex',
              flexDirection: 'column',
              maxHeight: '85vh',
              overflow: 'hidden'
            }}
          >
            {/* Header */}
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              padding: '1rem 1.5rem', 
              borderBottom: '1px solid var(--border)' 
            }}>
              <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>Audit Trail Details</h2>
              <button 
                onClick={() => setShowDetailsModal(false)} 
                style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--foreground-muted)', cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
              >
                &times;
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Event Meta Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.825rem', background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <div><strong>Who:</strong> {selectedLog.user_name || 'System'} ({selectedLog.user_email || 'N/A'})</div>
                <div><strong>Role:</strong> {selectedLog.role || 'System'}</div>
                <div><strong>Date & Time:</strong> {new Date(selectedLog.created_at).toLocaleString()}</div>
                <div><strong>Module:</strong> {selectedLog.module}</div>
                <div><strong>Action:</strong> <span style={{ fontFamily: 'monospace' }}>{selectedLog.action}</span></div>
                <div><strong>Status:</strong> {selectedLog.status}</div>
                <div style={{ gridColumn: 'span 2' }}><strong>Description:</strong> {selectedLog.description}</div>
                {selectedLog.reference_id && <div><strong>Ref Type/ID:</strong> {selectedLog.reference_type || 'N/A'} - {selectedLog.reference_id}</div>}
                {selectedLog.ip_address && <div><strong>IP Address:</strong> {selectedLog.ip_address}</div>}
                {selectedLog.browser && <div style={{ gridColumn: 'span 2' }}><strong>Browser User Agent:</strong> {selectedLog.browser}</div>}
              </div>

              {/* Field Difference Diff Comparison Table */}
              {(selectedLog.old_value || selectedLog.new_value) && (
                <div>
                  <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--foreground)' }}>Field Comparison (Old → New)</h3>
                  <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: '6px' }}>
                    <table style={{ width: '100%', margin: 0 }}>
                      <thead style={{ background: '#f1f5f9' }}>
                        <tr>
                          <th style={{ padding: '0.5rem', fontSize: '0.75rem' }}>Field</th>
                          <th style={{ padding: '0.5rem', fontSize: '0.75rem' }}>Old Value</th>
                          <th style={{ padding: '0.5rem', fontSize: '0.75rem' }}>New Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {getValueDifferences(selectedLog).map(diff => (
                          <tr key={diff.field} style={{ background: diff.changed ? '#fffbeb' : 'white' }}>
                            <td style={{ padding: '0.5rem', fontSize: '0.75rem', fontWeight: 600 }}>{diff.field}</td>
                            <td style={{ padding: '0.5rem', fontSize: '0.75rem', color: 'var(--foreground-muted)', textDecoration: diff.changed ? 'line-through' : 'none', wordBreak: 'break-all' }}>{diff.oldValue}</td>
                            <td style={{ padding: '0.5rem', fontSize: '0.75rem', fontWeight: diff.changed ? 700 : 400, color: diff.changed ? '#b45309' : 'var(--foreground)', wordBreak: 'break-all' }}>{diff.newValue}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Expandable Raw JSON Viewer */}
              <div>
                <button 
                  type="button" 
                  onClick={() => setShowRawJson(!showRawJson)} 
                  style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem', padding: 0 }}
                >
                  {showRawJson ? '▼ Hide Raw JSON Data' : '▶ Show Raw JSON Data'}
                </button>
                {showRawJson && (
                  <pre style={{ background: '#1e293b', color: '#f8fafc', padding: '1rem', borderRadius: '6px', fontSize: '0.75rem', overflowX: 'auto', marginTop: '0.5rem', maxHeight: '200px' }}>
                    {JSON.stringify({ old_value: selectedLog.old_value, new_value: selectedLog.new_value }, null, 2)}
                  </pre>
                )}
              </div>
            </div>

            {/* Footer */}
            <div style={{ 
              padding: '1rem 1.5rem', 
              borderTop: '1px solid var(--border)', 
              background: 'var(--secondary)', 
              display: 'flex', 
              justifyContent: 'flex-end'
            }}>
              <button 
                type="button" 
                onClick={() => setShowDetailsModal(false)} 
                className="btn-secondary"
                style={{ padding: '0.5rem 1rem', borderRadius: '6px', fontWeight: 600 }}
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

const labelStyle = {
  display: 'block', marginBottom: '0.25rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--foreground-muted)'
};

const inputStyle = {
  width: '100%', padding: '0.45rem 0.625rem', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '0.8rem', background: 'white'
};

const modalOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0, left: 0, right: 0, bottom: 0,
  background: 'rgba(0,0,0,0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000
};
