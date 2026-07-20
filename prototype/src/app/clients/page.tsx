"use client";

import React, { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/apiFetch';
import { useToast } from '@/components/ToastProvider';
import { useAuth } from '@/components/AuthProvider';
import { useLanguage } from '@/components/LanguageContext';
import Link from 'next/link';
import { MobileCard } from '@/components/MobileCard';
import * as XLSX from 'xlsx';
import { validatePhone, validateEmail, sanitizeEmail } from "@/utils/validation";

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
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewingClient, setViewingClient] = useState<Client | null>(null);
  const [importStep, setImportStep] = useState<'guide' | 'upload' | 'summary'>('guide');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [validationPreview, setValidationPreview] = useState<{
    totalRows: number;
    validRowsCount: number;
    dbDuplicatesCount: number;
    fileDuplicatesCount: number;
    missingDataCount: number;
    rows: any[];
    errors: string[];
    failedReportData: any[];
  } | null>(null);
  const [importResult, setImportResult] = useState<{
    total: number;
    imported: number;
    skipped: number;
    failed: number;
    errors: string[];
  } | null>(null);

  const [activeClient, setActiveClient] = useState<Partial<Client> | null>(null);

  const handleOpenView = (client: Client) => {
    setViewingClient(client);
    setShowViewModal(true);
  };

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
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

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
    setFormErrors({});
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
    
    // Validations
    const tempErrors: Record<string, string> = {};
    if (formCompany.trim().length < 2) {
      tempErrors.company = 'Company Name must be at least 2 characters.';
    }
    if (formContact.trim().length < 2) {
      tempErrors.contact = 'Contact Person must be at least 2 characters.';
    }
    if (!validatePhone(formPhone)) {
      tempErrors.phone = 'Invalid phone number format (7 to 15 digits).';
    }
    let sanitizedEmail = '';
    if (formEmail.trim() !== '') {
      if (!validateEmail(formEmail)) {
        tempErrors.email = 'Invalid email address format.';
      } else {
        sanitizedEmail = sanitizeEmail(formEmail);
      }
    }

    if (Object.keys(tempErrors).length > 0) {
      setFormErrors(tempErrors);
      showToast('Please fix form validation errors.', 'error');
      return;
    }
    setFormErrors({});

    try {
      const res = await apiFetch('/clients', {
        method: 'POST',
        body: JSON.stringify({
          company_name: formCompany.trim(),
          contact_person: formContact.trim(),
          phone: formPhone.trim(),
          email: sanitizedEmail || null,
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

    // Validations
    const tempErrors: Record<string, string> = {};
    if (formCompany.trim().length < 2) {
      tempErrors.company = 'Company Name must be at least 2 characters.';
    }
    if (formContact.trim().length < 2) {
      tempErrors.contact = 'Contact Person must be at least 2 characters.';
    }
    if (!validatePhone(formPhone)) {
      tempErrors.phone = 'Invalid phone number format (7 to 15 digits).';
    }
    let sanitizedEmail = '';
    if (formEmail.trim() !== '') {
      if (!validateEmail(formEmail)) {
        tempErrors.email = 'Invalid email address format.';
      } else {
        sanitizedEmail = sanitizeEmail(formEmail);
      }
    }

    if (Object.keys(tempErrors).length > 0) {
      setFormErrors(tempErrors);
      showToast('Please fix form validation errors.', 'error');
      return;
    }
    setFormErrors({});

    try {
      const res = await apiFetch(`/clients/${activeClient.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          company_name: formCompany.trim(),
          contact_person: formContact.trim(),
          phone: formPhone.trim(),
          email: sanitizedEmail || null,
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
          const exportRows = json.data.map((c: any) => ({
            'Client Name': c.company_name,
            'Contact Person': c.contact_person || 'N/A',
            'Phone': c.phone || 'N/A',
            'Email': c.email || 'N/A',
            'Address': c.address || 'N/A',
            'City': c.city || 'N/A',
            'State': c.state || 'N/A',
            'Industry': c.industry || 'Other',
            'Remarks': c.remarks || 'N/A',
            'Status': c.dynamic_status,
            'Last Purchase': c.last_purchase_at ? new Date(c.last_purchase_at).toLocaleDateString() : 'No purchases yet',
            'Created Date': new Date(c.created_at).toLocaleDateString()
          }));

          const worksheet = XLSX.utils.json_to_sheet(exportRows);
          const workbook = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(workbook, worksheet, 'Clients Directory');
          XLSX.writeFile(workbook, `Clients_Directory_${new Date().toISOString().split('T')[0]}.xlsx`);
          showToast('Clients exported successfully.', 'success');
        }
      }
    } catch (e: any) {
      showToast('Export failed: ' + e.message, 'error');
    }
  };

  const handleDownloadTemplate = () => {
    try {
      const headers = ['Client Name', 'Contact Person', 'Phone', 'Email', 'Address', 'City', 'State', 'Industry', 'Remarks'];
      const sampleRow = {
        'Client Name': 'Acme Corp',
        'Contact Person': 'Jane Doe',
        'Phone': '9876543210',
        'Email': 'jane@acme.com',
        'Address': '123 Business St',
        'City': 'Mumbai',
        'State': 'Maharashtra',
        'Industry': 'Manufacturing',
        'Remarks': 'Preferred client'
      };

      const worksheet = XLSX.utils.json_to_sheet([sampleRow], { header: headers });
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Client Import Template');
      XLSX.writeFile(workbook, 'client_import_template.xlsx');
      showToast('Template downloaded successfully.', 'success');
    } catch (e: any) {
      showToast('Template download failed: ' + e.message, 'error');
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setSelectedFile(file);
    if (!file) {
      setValidationPreview(null);
      return;
    }

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

      if (json.length === 0) {
        throw new Error("Excel file is empty");
      }

      const headers = json[0].map(h => String(h || '').trim());
      const required = ['Client Name'];
      const missing = required.filter(r => !headers.includes(r));
      
      if (missing.length > 0) {
        setValidationPreview({
          totalRows: 0,
          validRowsCount: 0,
          dbDuplicatesCount: 0,
          fileDuplicatesCount: 0,
          missingDataCount: 0,
          rows: [],
          errors: [`Missing required columns: ${missing.join(', ')}`],
          failedReportData: []
        });
        return;
      }

      const headerIndices = {
        companyName: headers.indexOf('Client Name'),
        contactPerson: headers.indexOf('Contact Person'),
        phone: headers.indexOf('Phone'),
        email: headers.indexOf('Email'),
        address: headers.indexOf('Address'),
        city: headers.indexOf('City'),
        state: headers.indexOf('State'),
        industry: headers.indexOf('Industry'),
        remarks: headers.indexOf('Remarks'),
      };

      // Load all existing client names from database to check for duplicates
      const allClientsRes = await apiFetch('/clients/all');
      let existingNames = new Set<string>();
      if (allClientsRes.ok) {
        const resJson = await allClientsRes.json();
        if (resJson.success && Array.isArray(resJson.data)) {
          existingNames = new Set(resJson.data.map((c: any) => c.company_name.trim().toLowerCase()));
        }
      }

      const seenInFile = new Set<string>();
      let totalRows = 0;
      let validRowsCount = 0;
      let dbDuplicatesCount = 0;
      let fileDuplicatesCount = 0;
      let missingDataCount = 0;
      const errors: string[] = [];
      const parsedRows: any[] = [];
      const failedReportData: any[] = [];

      for (let i = 1; i < json.length; i++) {
        const row = json[i];
        if (!row || row.length === 0) continue;
        const isRowEmpty = row.every(cell => cell === undefined || cell === null || String(cell).trim() === '');
        if (isRowEmpty) continue;

        totalRows++;
        const rowNum = i + 1;

        const companyNameVal = row[headerIndices.companyName];
        const contactPersonVal = headerIndices.contactPerson !== -1 ? row[headerIndices.contactPerson] : null;
        const phoneVal = headerIndices.phone !== -1 ? row[headerIndices.phone] : null;
        const emailVal = headerIndices.email !== -1 ? row[headerIndices.email] : null;
        const addressVal = headerIndices.address !== -1 ? row[headerIndices.address] : null;
        const cityVal = headerIndices.city !== -1 ? row[headerIndices.city] : null;
        const stateVal = headerIndices.state !== -1 ? row[headerIndices.state] : null;
        const industryVal = headerIndices.industry !== -1 ? row[headerIndices.industry] : null;
        const remarksVal = headerIndices.remarks !== -1 ? row[headerIndices.remarks] : null;

        if (companyNameVal === undefined || companyNameVal === null || String(companyNameVal).trim() === '') {
          errors.push(`Row ${rowNum}: Client Name is missing.`);
          failedReportData.push({
            'Row Number': rowNum,
            'Client Name': 'N/A',
            'Contact Person': contactPersonVal || '',
            'Error Reason': 'Client Name is required and cannot be empty.'
          });
          missingDataCount++;
          continue;
        }

        const companyName = String(companyNameVal).trim();
        const normName = companyName.toLowerCase();

        if (companyName.length < 2) {
          errors.push(`Row ${rowNum}: Company Name must be at least 2 characters.`);
          failedReportData.push({
            'Row Number': rowNum,
            'Client Name': companyName,
            'Contact Person': contactPersonVal || '',
            'Error Reason': 'Company Name must be at least 2 characters.'
          });
          missingDataCount++;
          continue;
        }

        const contactPerson = contactPersonVal ? String(contactPersonVal).trim() : '';
        if (!contactPerson || contactPerson.length < 2) {
          errors.push(`Row ${rowNum}: Contact Person name must be at least 2 characters.`);
          failedReportData.push({
            'Row Number': rowNum,
            'Client Name': companyName,
            'Contact Person': contactPerson || 'N/A',
            'Error Reason': 'Contact Person name must be at least 2 characters.'
          });
          missingDataCount++;
          continue;
        }

        const phone = phoneVal ? String(phoneVal).trim() : '';
        if (!phone || !validatePhone(phone)) {
          errors.push(`Row ${rowNum}: Invalid phone number format "${phone}".`);
          failedReportData.push({
            'Row Number': rowNum,
            'Client Name': companyName,
            'Contact Person': contactPerson,
            'Error Reason': 'Invalid phone number format (7 to 15 digits).'
          });
          missingDataCount++;
          continue;
        }

        const email = emailVal ? String(emailVal).trim() : '';
        let sanitizedImportEmail = null;
        if (email) {
          if (!validateEmail(email)) {
            errors.push(`Row ${rowNum}: Invalid email address format "${email}".`);
            failedReportData.push({
              'Row Number': rowNum,
              'Client Name': companyName,
              'Contact Person': contactPerson,
              'Error Reason': 'Invalid email address format.'
            });
            missingDataCount++;
            continue;
          }
          sanitizedImportEmail = sanitizeEmail(email);
        }

        // Duplicate in file check
        if (seenInFile.has(normName)) {
          errors.push(`Row ${rowNum}: Duplicate Client Name "${companyName}" found in the upload file.`);
          failedReportData.push({
            'Row Number': rowNum,
            'Client Name': companyName,
            'Contact Person': contactPerson,
            'Error Reason': 'Duplicate Client Name in the upload file.'
          });
          fileDuplicatesCount++;
          continue;
        }
        seenInFile.add(normName);

        // Duplicate in DB check
        if (existingNames.has(normName)) {
          errors.push(`Row ${rowNum}: Client Name "${companyName}" already exists in database. (Will be skipped).`);
          failedReportData.push({
            'Row Number': rowNum,
            'Client Name': companyName,
            'Contact Person': contactPerson,
            'Error Reason': 'Client already registered in system.'
          });
          dbDuplicatesCount++;
          continue;
        }

        // Row is valid
        validRowsCount++;
        parsedRows.push({
          company_name: companyName,
          contact_person: contactPerson,
          phone: phone,
          email: sanitizedImportEmail,
          address: addressVal ? String(addressVal).trim() : null,
          city: cityVal ? String(cityVal).trim() : null,
          state: stateVal ? String(stateVal).trim() : null,
          industry: industryVal ? String(industryVal).trim() : 'Other',
          remarks: remarksVal ? String(remarksVal).trim() : null
        });
      }

      setValidationPreview({
        totalRows,
        validRowsCount,
        dbDuplicatesCount,
        fileDuplicatesCount,
        missingDataCount,
        rows: parsedRows,
        errors,
        failedReportData
      });
    } catch (err: any) {
      setValidationPreview({
        totalRows: 0,
        validRowsCount: 0,
        dbDuplicatesCount: 0,
        fileDuplicatesCount: 0,
        missingDataCount: 0,
        rows: [],
        errors: [`Failed to parse Excel file: ${err.message}`],
        failedReportData: []
      });
    }
  };

  const handleImport = async () => {
    if (!validationPreview || validationPreview.rows.length === 0) return;
    setImporting(true);
    try {
      const res = await apiFetch('/clients/import', {
        method: 'POST',
        body: JSON.stringify({ clients: validationPreview.rows }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || 'Failed to import clients');
      }

      setImportResult({
        total: validationPreview.totalRows,
        imported: validationPreview.rows.length,
        skipped: validationPreview.dbDuplicatesCount,
        failed: validationPreview.missingDataCount + validationPreview.fileDuplicatesCount,
        errors: json.errors || []
      });
      setImportStep('summary');
      showToast("Clients imported successfully", "success");
      loadClients();
      loadStats();
    } catch (err: any) {
      showToast(err.message || "Failed to import clients", "error");
    } finally {
      setImporting(false);
    }
  };

  const handleDownloadErrorReport = () => {
    if (!validationPreview || validationPreview.failedReportData.length === 0) return;
    try {
      const worksheet = XLSX.utils.json_to_sheet(validationPreview.failedReportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Import Errors');
      XLSX.writeFile(workbook, 'client_import_errors.xlsx');
      showToast('Error report downloaded.', 'success');
    } catch (err: any) {
      showToast('Failed to download error report: ' + err.message, 'error');
    }
  };

  const closeImportModal = () => {
    setShowImportModal(false);
    setImportStep('guide');
    setSelectedFile(null);
    setValidationPreview(null);
    setImportResult(null);
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
          <div className="desktop-table-wrapper card" style={{ padding: 0, overflowX: 'hidden' }}>
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', tableLayout: 'fixed' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ ...thStyle, width: '30%' }}>Company</th>
                  <th style={{ ...thStyle, width: '20%' }}>Client</th>
                  <th style={{ ...thStyle, width: '15%' }}>Phone</th>
                  <th style={{ ...thStyle, width: '10%' }}>Status</th>
                  <th style={{ ...thStyle, width: '15%' }}>Last Active</th>
                  <th style={{ ...thStyle, width: '10%' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {clients.map(client => (
                  <tr key={client.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.2s' }}>
                    <td style={{ ...tdStyle, fontWeight: 700, color: 'var(--primary)', wordWrap: 'break-word', overflowWrap: 'break-word', whiteSpace: 'normal' }}>
                      {client.company_name}
                    </td>
                    <td style={{ ...tdStyle, wordWrap: 'break-word', overflowWrap: 'break-word', whiteSpace: 'normal' }}>
                      {client.contact_person || 'N/A'}
                    </td>
                    <td style={{ ...tdStyle, wordWrap: 'break-word', overflowWrap: 'break-word', whiteSpace: 'normal' }}>
                      {client.phone || 'N/A'}
                    </td>
                    <td style={{ ...tdStyle, wordWrap: 'break-word', overflowWrap: 'break-word', whiteSpace: 'normal' }}>
                      <span className="badge" style={{ ...getStatusBadgeStyle(client.dynamic_status), padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, display: 'inline-block' }}>
                        {client.dynamic_status}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, wordWrap: 'break-word', overflowWrap: 'break-word', whiteSpace: 'normal', fontSize: '0.85rem' }}>
                      {client.last_purchase_at ? new Date(client.last_purchase_at).toLocaleDateString() : 'No transactions'}
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                        <button onClick={() => handleOpenView(client)} className="btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>
                          View
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
                  <span style={{ fontWeight: 700, color: 'var(--primary)' }}>
                    {client.company_name}
                  </span>
                }
                primaryInfo={
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <div><strong>Client Name:</strong> {client.contact_person || 'N/A'}</div>
                    <div><strong>Phone:</strong> {client.phone || 'N/A'}</div>
                  </div>
                }
                secondaryInfo={
                  <div style={{ fontSize: '0.85rem', color: 'var(--foreground-muted)' }}>
                    <strong>Last Active:</strong> {client.last_purchase_at ? new Date(client.last_purchase_at).toLocaleDateString() : 'No transactions'}
                  </div>
                }
                statusBadge={
                  <span className="badge" style={{ ...getStatusBadgeStyle(client.dynamic_status), padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, display: 'inline-block' }}>
                    {client.dynamic_status}
                  </span>
                }
                actions={
                  <>
                    <button onClick={() => handleOpenView(client)} className="btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>
                      View
                    </button>
                    {userRole === 'Admin' && (
                      <button onClick={() => handleDeleteClient(client.id, client.company_name)} className="btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', color: 'var(--danger)', borderColor: 'var(--danger)' }}>
                        Delete
                      </button>
                    )}
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
                  {formErrors.company && <div style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: '0.25rem' }}>{formErrors.company}</div>}
                </div>
                <div>
                  <label style={labelStyle}>Contact Person *</label>
                  <input type="text" required value={formContact} onChange={e => setFormContact(e.target.value)} style={inputStyle} />
                  {formErrors.contact && <div style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: '0.25rem' }}>{formErrors.contact}</div>}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={labelStyle}>Phone Number *</label>
                  <input type="text" required value={formPhone} onChange={e => setFormPhone(e.target.value)} style={inputStyle} />
                  {formErrors.phone && <div style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: '0.25rem' }}>{formErrors.phone}</div>}
                </div>
                <div>
                  <label style={labelStyle}>Email Address</label>
                  <input type="email" value={formEmail} onChange={e => setFormEmail(e.target.value)} style={inputStyle} />
                  {formErrors.email && <div style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: '0.25rem' }}>{formErrors.email}</div>}
                </div>
              </div>
              <div>
                <label style={labelStyle}>Industry Category</label>
                <select value={formIndustry} onChange={e => setFormIndustry(e.target.value)} style={inputStyle}>
                  {industries.map(ind => <option key={ind} value={ind}>{ind}</option>)}
                </select>
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
                  {formErrors.company && <div style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: '0.25rem' }}>{formErrors.company}</div>}
                </div>
                <div>
                  <label style={labelStyle}>Contact Person *</label>
                  <input type="text" required value={formContact} onChange={e => setFormContact(e.target.value)} style={inputStyle} />
                  {formErrors.contact && <div style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: '0.25rem' }}>{formErrors.contact}</div>}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={labelStyle}>Phone Number *</label>
                  <input type="text" required value={formPhone} onChange={e => setFormPhone(e.target.value)} style={inputStyle} />
                  {formErrors.phone && <div style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: '0.25rem' }}>{formErrors.phone}</div>}
                </div>
                <div>
                  <label style={labelStyle}>Email Address</label>
                  <input type="email" value={formEmail} onChange={e => setFormEmail(e.target.value)} style={inputStyle} />
                  {formErrors.email && <div style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: '0.25rem' }}>{formErrors.email}</div>}
                </div>
              </div>
              <div>
                <label style={labelStyle}>Industry Category</label>
                <select value={formIndustry} onChange={e => setFormIndustry(e.target.value)} style={inputStyle}>
                  {industries.map(ind => <option key={ind} value={ind}>{ind}</option>)}
                </select>
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

      {/* Bulk Excel Import Stepper Modal */}
      {showImportModal && (
        <div style={modalOverlayStyle}>
          <div style={{ ...modalContentStyle, maxWidth: '650px', width: '90%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
              <h3 style={{ fontWeight: 800, margin: 0 }}>📥 Bulk Client Import Wizard</h3>
              <button onClick={closeImportModal} style={closeBtnStyle}>✕</button>
            </div>

            {/* Stepper Progress Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem', background: '#f8fafc', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <div style={{ fontWeight: importStep === 'guide' ? 'bold' : 'normal', color: importStep === 'guide' ? 'var(--primary)' : 'inherit', fontSize: '0.8rem' }}>
                1. Download Template {importStep !== 'guide' && '✅'}
              </div>
              <div style={{ fontWeight: importStep === 'upload' ? 'bold' : 'normal', color: importStep === 'upload' ? 'var(--primary)' : 'inherit', fontSize: '0.8rem' }}>
                2. Upload & Validate {importStep === 'summary' && '✅'}
              </div>
              <div style={{ fontWeight: importStep === 'summary' ? 'bold' : 'normal', color: importStep === 'summary' ? 'var(--primary)' : 'inherit', fontSize: '0.8rem' }}>
                3. Import Summary
              </div>
            </div>

            {/* Step 1: Guide */}
            {importStep === 'guide' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <p style={{ fontSize: '0.85rem', color: '#475569', margin: 0 }}>
                  To ensure smooth data mapping, please download the standard Excel template, populate your client list, and upload it in the next step.
                </p>
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '1rem', borderRadius: '6px', fontSize: '0.8rem', color: '#166534' }}>
                  <strong>Format Requirements:</strong>
                  <ul style={{ margin: '0.5rem 0 0 1rem', padding: 0 }}>
                    <li><strong>Client Name</strong> is required and must be unique.</li>
                    <li>GST must be valid alphanumeric character sequence.</li>
                    <li>Industry can be Manufacturing, Retail, Tech, Healthcare, etc.</li>
                  </ul>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', justifyContent: 'flex-end' }}>
                  <button type="button" onClick={closeImportModal} className="btn-secondary">Cancel</button>
                  <button type="button" onClick={handleDownloadTemplate} className="btn-secondary" style={{ background: '#f8fafc', borderColor: '#cbd5e1' }}>
                    📄 Download Excel Template
                  </button>
                  <button type="button" onClick={() => setImportStep('upload')} className="btn-primary">
                    Next: Choose File ➔
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Upload & Validate */}
            {importStep === 'upload' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ ...labelStyle, marginBottom: '0.5rem' }}>Select spreadsheet file (.xlsx, .xls):</label>
                  <input 
                    type="file" 
                    accept=".xlsx, .xls" 
                    onChange={handleFileChange}
                    style={{ ...inputStyle, padding: '0.5rem', background: '#f8fafc' }}
                  />
                </div>

                {validationPreview && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {/* Validation indicators */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '0.5rem' }}>
                      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '0.5rem', textAlign: 'center' }}>
                        <div style={{ fontSize: '0.7rem', color: 'var(--foreground-muted)' }}>Total Rows</div>
                        <strong style={{ fontSize: '1.1rem' }}>{validationPreview.totalRows}</strong>
                      </div>
                      <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '6px', padding: '0.5rem', textAlign: 'center' }}>
                        <div style={{ fontSize: '0.7rem', color: '#065f46' }}>Ready to Import</div>
                        <strong style={{ fontSize: '1.1rem', color: '#047857' }}>{validationPreview.validRowsCount}</strong>
                      </div>
                      <div style={{ background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: '6px', padding: '0.5rem', textAlign: 'center' }}>
                        <div style={{ fontSize: '0.7rem', color: '#92400e' }}>DB Duplicates</div>
                        <strong style={{ fontSize: '1.1rem', color: '#b45309' }}>{validationPreview.dbDuplicatesCount}</strong>
                      </div>
                      <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '6px', padding: '0.5rem', textAlign: 'center' }}>
                        <div style={{ fontSize: '0.7rem', color: '#991b1b' }}>File Errors</div>
                        <strong style={{ fontSize: '1.1rem', color: '#b91c1c' }}>
                          {validationPreview.fileDuplicatesCount + validationPreview.missingDataCount}
                        </strong>
                      </div>
                    </div>

                    {/* Warning / Error report block */}
                    {validationPreview.errors.length > 0 && (
                      <div style={{ maxHeight: '140px', overflowY: 'auto', background: '#fff1f2', border: '1px solid #fecdd3', padding: '0.75rem', borderRadius: '6px', fontSize: '0.8rem', color: '#9f1239' }}>
                        <strong>Validation Logs & Warnings:</strong>
                        <ul style={{ margin: '0.25rem 0 0 1rem', padding: 0 }}>
                          {validationPreview.errors.slice(0, 15).map((err, idx) => (
                            <li key={idx}>{err}</li>
                          ))}
                          {validationPreview.errors.length > 15 && (
                            <li style={{ fontStyle: 'italic', fontWeight: 600 }}>...and {validationPreview.errors.length - 15} more warnings.</li>
                          )}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                  <button type="button" onClick={() => setImportStep('guide')} className="btn-secondary" disabled={importing}>
                    Back
                  </button>
                  {validationPreview && validationPreview.failedReportData.length > 0 && (
                    <button type="button" onClick={handleDownloadErrorReport} className="btn-secondary" style={{ color: '#b91c1c', borderColor: '#fca5a5' }}>
                      ⚠️ Download Excel Error Report
                    </button>
                  )}
                  <button 
                    type="button" 
                    onClick={handleImport} 
                    className="btn-primary"
                    disabled={!validationPreview || validationPreview.validRowsCount === 0 || importing}
                  >
                    {importing ? "Importing..." : `Import ${validationPreview?.validRowsCount || 0} Clients`}
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Summary */}
            {importStep === 'summary' && importResult && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div style={{ textAlign: 'center', padding: '1rem' }}>
                  <span style={{ fontSize: '3rem' }}>🎉</span>
                  <h4 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0.5rem 0' }}>Client Import Process Completed</h4>
                  <p style={{ fontSize: '0.85rem', color: 'var(--foreground-muted)', margin: 0 }}>
                    Your spreadsheet data has been successfully ingested into the client database directory.
                  </p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--foreground-muted)' }}>Successfully Ingested:</div>
                    <strong style={{ fontSize: '1.25rem', color: '#16a34a' }}>{importResult.imported} clients</strong>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--foreground-muted)' }}>Skipped / Duplicates:</div>
                    <strong style={{ fontSize: '1.25rem', color: '#b45309' }}>{importResult.skipped} records</strong>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--foreground-muted)' }}>Failed Entries:</div>
                    <strong style={{ fontSize: '1.25rem', color: '#dc2626' }}>{importResult.failed} records</strong>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--foreground-muted)' }}>Total Processed:</div>
                    <strong style={{ fontSize: '1.25rem' }}>{importResult.total} records</strong>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', justifyContent: 'flex-end' }}>
                  {validationPreview && validationPreview.failedReportData.length > 0 && (
                    <button type="button" onClick={handleDownloadErrorReport} className="btn-secondary" style={{ color: '#b91c1c', borderColor: '#fca5a5' }}>
                      ⚠️ Download Excel Error Report
                    </button>
                  )}
                  <button type="button" onClick={closeImportModal} className="btn-primary">
                    Close Wizard
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* View Client Details Popup Card Modal */}
      {showViewModal && viewingClient && (
        <div style={modalOverlayStyle}>
          <div style={modalContentStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
              <h3 style={{ fontWeight: 800, margin: 0, fontSize: '1.2rem' }}>Client Profile Card</h3>
              <button onClick={() => { setShowViewModal(false); setViewingClient(null); }} style={closeBtnStyle}>✕</button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontSize: '0.875rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: '1.25rem', color: 'var(--foreground)' }}>{viewingClient.company_name}</strong>
                  <span className="badge" style={getStatusBadgeStyle(viewingClient.dynamic_status)}>
                    {viewingClient.dynamic_status}
                  </span>
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--foreground-muted)' }}>Industry: {viewingClient.industry || 'Other'}</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', borderTop: '1px solid #f1f5f9', paddingTop: '0.75rem' }}>
                <div>
                  <label style={labelStyle}>Contact Person</label>
                  <span style={{ fontWeight: 600 }}>{viewingClient.contact_person || 'N/A'}</span>
                </div>
                <div>
                  <label style={labelStyle}>Phone Number</label>
                  <span style={{ fontWeight: 600 }}>{viewingClient.phone || 'N/A'}</span>
                </div>
                <div>
                  <label style={labelStyle}>Email Address</label>
                  <span style={{ fontWeight: 600 }}>{viewingClient.email || 'N/A'}</span>
                </div>
                <div>
                  <label style={labelStyle}>Activity Status</label>
                  <span className="badge" style={{ ...getStatusBadgeStyle(viewingClient.dynamic_status), display: 'inline-block', marginTop: '2px' }}>
                    {viewingClient.dynamic_status}
                  </span>
                </div>
              </div>

              <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '0.75rem' }}>
                <label style={labelStyle}>Billing / Office Address</label>
                <span>
                  {viewingClient.address 
                    ? `${viewingClient.address}, ${viewingClient.city || ''}, ${viewingClient.state || ''}`
                    : 'No address registered.'
                  }
                </span>
              </div>

              <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '0.75rem' }}>
                <label style={labelStyle}>Remarks / Notes</label>
                <span style={{ fontStyle: 'italic', color: '#475569' }}>
                  {viewingClient.remarks ? `"${viewingClient.remarks}"` : 'No notes.'}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', borderTop: '1px solid #f1f5f9', paddingTop: '0.75rem', background: '#fafafa', padding: '0.75rem', borderRadius: '8px' }}>
                <div>
                  <label style={labelStyle}>Total Transactions</label>
                  <strong style={{ fontSize: '1rem', color: 'var(--primary)' }}>{viewingClient.total_orders || 0} orders</strong>
                </div>
                <div>
                  <label style={labelStyle}>Last Purchase Date</label>
                  <strong style={{ fontSize: '0.9rem' }}>
                    {viewingClient.last_purchase_at 
                      ? new Date(viewingClient.last_purchase_at).toLocaleDateString()
                      : 'No purchases'
                    }
                  </strong>
                </div>
              </div>

              <div style={{ fontSize: '0.75rem', color: 'var(--foreground-muted)', textAlign: 'right', borderTop: '1px solid #f1f5f9', paddingTop: '0.75rem' }}>
                Account Created: {new Date(viewingClient.created_at).toLocaleDateString()}
              </div>
            </div>

            <div style={{ ...formActionsStyle, marginTop: '1rem' }}>
              <button type="button" onClick={() => { setShowViewModal(false); setViewingClient(null); }} className="btn-primary">
                Close Card
              </button>
            </div>
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
