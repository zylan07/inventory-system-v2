"use client";

import { useState, useEffect } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/apiFetch';
import Toast from '@/components/Toast';
import EmptyState from '@/components/EmptyState';
import { validateEmail, sanitizeEmail } from "@/utils/validation";

type User = {
  id: number;
  email: string;
  role: 'Admin' | 'Manager' | 'Basic User';
  is_active: boolean;
  purchase_team?: boolean;
  created_at: string;
};

type Recipient = {
  id: number;
  email: string;
  name?: string;
  is_active: boolean;
  notes?: string;
  created_at: string;
};

export default function UsersPage() {
  const { userRole } = useAuth();
  const router = useRouter();

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{message: string; type: 'success'|'error'; id: number} | null>(null);

  // Form State
  const [showModal, setShowModal] = useState(false);
  const [editMode, setEditMode] = useState<User | null>(null);
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'Admin' | 'Manager' | 'Basic User'>('Basic User');
  const [isActive, setIsActive] = useState(true);
  const [purchaseTeam, setPurchaseTeam] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // External Recipients States
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [showRecipientModal, setShowRecipientModal] = useState(false);
  const [recipientEditMode, setRecipientEditMode] = useState<Recipient | null>(null);
  
  const [recipientEmail, setRecipientEmail] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientIsActive, setRecipientIsActive] = useState(true);
  const [recipientNotes, setRecipientNotes] = useState('');
  const [recipientErrors, setRecipientErrors] = useState<Record<string, string>>({});

  // Prevent background scrolling when modal is open
  useEffect(() => {
    if (showModal || showRecipientModal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [showModal, showRecipientModal]);

  const showToast = (message: string, type: 'success'|'error') => {
    setToast({ message, type, id: Date.now() });
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/users');
      if (!res.ok) {
        throw new Error('Failed to load users');
      }
      const data = await res.json();
      const userArray = Array.isArray(data) ? data : (data.data || []);
      setUsers(userArray);
    } catch (err) {
      showToast('Failed to load users', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchRecipients = async () => {
    try {
      const res = await apiFetch('/users/purchase-recipients');
      if (res.ok) {
        const data = await res.json();
        setRecipients(data || []);
      }
    } catch (err) {
      showToast('Failed to load recipients', 'error');
    }
  };

  useEffect(() => {
    if (userRole === 'Manager' || userRole === 'Basic User') {
      router.push('/dashboard');
    } else if (userRole === 'Admin') {
      fetchUsers();
      fetchRecipients();
    }
  }, [userRole, router]);

  const openAddModal = () => {
    setEditMode(null);
    setEmail('');
    setPassword('');
    setRole('Basic User');
    setIsActive(true);
    setPurchaseTeam(false);
    setFormErrors({});
    setShowModal(true);
  };

  const openEditModal = (user: User) => {
    setEditMode(user);
    setEmail(user.email);
    setPassword(''); // leave blank implicitly
    setRole(user.role);
    setIsActive(Boolean(user.is_active));
    setPurchaseTeam(Boolean(user.purchase_team));
    setFormErrors({});
    setShowModal(true);
  };

  const openRecipientAddModal = () => {
    setRecipientEditMode(null);
    setRecipientEmail('');
    setRecipientName('');
    setRecipientIsActive(true);
    setRecipientNotes('');
    setRecipientErrors({});
    setShowRecipientModal(true);
  };

  const openRecipientEditModal = (r: Recipient) => {
    setRecipientEditMode(r);
    setRecipientEmail(r.email);
    setRecipientName(r.name || '');
    setRecipientIsActive(Boolean(r.is_active));
    setRecipientNotes(r.notes || '');
    setRecipientErrors({});
    setShowRecipientModal(true);
  };

  const handleRecipientSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const tempErrors: Record<string, string> = {};
    if (!recipientEmail) {
      tempErrors.email = 'Email is required';
    } else if (!validateEmail(recipientEmail)) {
      tempErrors.email = 'Invalid email address format';
    }

    if (Object.keys(tempErrors).length > 0) {
      setRecipientErrors(tempErrors);
      showToast('Please fix validation errors.', 'error');
      return;
    }
    setRecipientErrors({});

    try {
      const payload = {
        email: recipientEmail.trim(),
        name: recipientName.trim() || null,
        is_active: recipientIsActive,
        notes: recipientNotes.trim() || null
      };

      const url = recipientEditMode 
        ? `/users/purchase-recipients/${recipientEditMode.id}`
        : '/users/purchase-recipients';
      
      const method = recipientEditMode ? 'PUT' : 'POST';

      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (res.ok) {
        showToast(recipientEditMode ? 'Recipient updated successfully.' : 'Recipient created successfully.', 'success');
        setShowRecipientModal(false);
        fetchRecipients();
      } else {
        showToast(data.message || 'Failed to save recipient', 'error');
      }
    } catch (err) {
      showToast('Error saving recipient', 'error');
    }
  };

  const handleDeleteRecipient = async (id: number, emailStr: string) => {
    if (!window.confirm(`Are you sure you want to delete external recipient: ${emailStr}?`)) {
      return;
    }
    try {
      const res = await apiFetch(`/users/purchase-recipients/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        showToast('Recipient deleted successfully.', 'success');
        fetchRecipients();
      } else {
        const data = await res.json();
        showToast(data.message || 'Failed to delete recipient', 'error');
      }
    } catch (err) {
      showToast('Error deleting recipient', 'error');
    }
  };

  const handleResetEdit = () => {
    if (editMode) {
      setEmail(editMode.email);
      setPassword('');
      setRole(editMode.role);
      setIsActive(Boolean(editMode.is_active));
      setPurchaseTeam(Boolean(editMode.purchase_team));
      setFormErrors({});
      showToast('Form fields reset to original values', 'success');
    } else {
      setEmail('');
      setPassword('');
      setRole('Basic User');
      setIsActive(true);
      setPurchaseTeam(false);
      setFormErrors({});
      showToast('Form fields cleared', 'success');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validations
    const tempErrors: Record<string, string> = {};
    if (!editMode) {
      if (!email.trim()) {
        tempErrors.email = 'Email address is required.';
      } else if (!validateEmail(email)) {
        tempErrors.email = 'Invalid email address format.';
      }
      if (!password) {
        tempErrors.password = 'Password is required.';
      }
    }

    if (Object.keys(tempErrors).length > 0) {
      setFormErrors(tempErrors);
      showToast('Please fix form validation errors.', 'error');
      return;
    }
    setFormErrors({});

    try {
      if (editMode) {
        // Update user
        const body: Record<string, any> = { role, is_active: isActive, purchase_team: purchaseTeam };
        if (password) body.password = password; // only send if changed

        const res = await apiFetch(`/users/${editMode.id}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.message || 'Failed to update user');
        }
        showToast('User updated successfully', 'success');
      } else {
        // Create user
        const sanitized = sanitizeEmail(email);
        const res = await apiFetch('/users', {
          method: 'POST',
          body: JSON.stringify({ email: sanitized, password, role, is_active: isActive, purchase_team: purchaseTeam }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.message || 'Failed to create user');
        }
        showToast('User created successfully', 'success');
      }
      setShowModal(false);
      fetchUsers();
    } catch (err: any) {
      showToast(err.message || 'Operation failed', 'error');
    }
  };

  const handleDelete = async (user: User) => {
    if (!confirm(`Are you sure you want to delete user ${user.email}?`)) return;
    
    try {
      const res = await apiFetch(`/users/${user.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Failed to delete user');
      }
      showToast('User deleted successfully', 'success');
      fetchUsers();
    } catch (err: any) {
      showToast(err.message || 'Failed to delete user', 'error');
    }
  };

  if (!userRole || userRole !== 'Admin') return null;

  return (
    <div style={{ padding: '2rem', maxWidth: '1000px', margin: '0 auto' }}>
      {toast && <Toast key={toast.id} message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--foreground)' }}>User Management</h1>
          <p style={{ color: 'var(--foreground-muted)' }}>Mange system access, roles, and accounts.</p>
        </div>
        <button 
          onClick={openAddModal}
          style={{
            background: 'var(--primary)',
            color: 'white',
            padding: '0.625rem 1rem',
            borderRadius: '6px',
            border: 'none',
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          + Add User
        </button>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-wrapper">
          <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th>ID</th>
              <th>Email</th>
              <th>Role</th>
              <th>Purchase Team</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem' }}>Loading users...</td></tr>
            ) : (users || []).length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '2rem' }}>
                  <EmptyState type="users" onPrimaryAction={openAddModal} />
                </td>
              </tr>
            ) : (
              (users || []).map(u => (
                <tr key={u.id}>
                  <td>#{u.id}</td>
                  <td style={{ fontWeight: 500 }}>{u.email}</td>
                  <td>
                    <span className={`badge ${
                      u.role === 'Admin' ? 'badge-admin' :
                      u.role === 'Manager' ? 'badge-manager' : 'badge-user'
                    }`}>
                      {u.role}
                    </span>
                  </td>
                  <td>
                    <label className="switch">
                      <input 
                        type="checkbox"
                        checked={Boolean(u.purchase_team)}
                        onChange={async (e) => {
                          try {
                            const checked = e.target.checked;
                            const res = await apiFetch(`/users/${u.id}`, {
                              method: 'PUT',
                              body: JSON.stringify({ role: u.role, is_active: u.is_active, purchase_team: checked })
                            });
                            if (res.ok) {
                              showToast("Purchase team preferences updated", "success");
                              fetchUsers();
                            } else {
                              throw new Error("Failed to update preferences");
                            }
                          } catch (err: any) {
                            showToast(err.message, "error");
                          }
                        }}
                      />
                      <span className="slider"></span>
                    </label>
                  </td>
                  <td>
                    <span style={{ 
                      fontSize: '0.75rem', 
                      fontWeight: 600, 
                      padding: '0.25rem 0.5rem', 
                      borderRadius: '12px',
                      background: u.is_active ? '#dcfce7' : '#fee2e2',
                      color: u.is_active ? '#166534' : '#991b1b'
                    }}>
                      {u.is_active ? 'Active' : 'Disabled'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button 
                        onClick={() => openEditModal(u)} 
                        className="btn-action-edit"
                        title="Edit User"
                        aria-label="Edit User"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle' }}>
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                        </svg>
                      </button>
                      <button 
                        onClick={() => handleDelete(u)} 
                        className="btn-action-delete"
                        title="Delete User"
                        aria-label="Delete User"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle' }}>
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          <line x1="10" y1="11" x2="10" y2="17" />
                          <line x1="14" y1="11" x2="14" y2="17" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          </table>
        </div>
      </div>

      {/* External Recipients Section */}
      <div className="card mb-6" style={{ marginTop: '2.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2 className="text-xl font-bold">Purchase Team Email Recipients</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--foreground-muted)' }}>
              Add and manage email addresses that receive reorder notifications but do not have login accounts.
            </p>
          </div>
          <button onClick={openRecipientAddModal} className="btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
            ➕ Add Recipient
          </button>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border)' }}>
                <th style={{ ...thStyle, width: '25%' }}>Email Address</th>
                <th style={{ ...thStyle, width: '25%' }}>Recipient Name</th>
                <th style={{ ...thStyle, width: '15%' }}>Status</th>
                <th style={{ ...thStyle, width: '25%' }}>Notes</th>
                <th style={{ ...thStyle, width: '10%' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {recipients.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ ...tdStyle, textAlign: 'center', color: 'var(--foreground-muted)', padding: '2rem' }}>
                    No external email recipients registered.
                  </td>
                </tr>
              ) : (
                recipients.map(r => (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.2s' }}>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{r.email}</td>
                    <td style={tdStyle}>{r.name || 'N/A'}</td>
                    <td style={tdStyle}>
                      <span style={{ 
                        fontSize: '0.75rem', 
                        fontWeight: 600, 
                        padding: '0.25rem 0.5rem', 
                        borderRadius: '12px',
                        background: r.is_active ? '#dcfce7' : '#fee2e2',
                        color: r.is_active ? '#166534' : '#991b1b',
                        display: 'inline-block'
                      }}>
                        {r.is_active ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td style={tdStyle}>{r.notes || 'N/A'}</td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button onClick={() => openRecipientEditModal(r)} className="btn-action-edit" title="Edit Recipient">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                        </button>
                        <button onClick={() => handleDeleteRecipient(r.id, r.email)} className="btn-action-delete" title="Delete Recipient">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showRecipientModal && (
        <div style={modalOverlayStyle}>
          <form 
            onSubmit={handleRecipientSubmit} 
            className="modal-animate"
            style={{ 
              background: 'white',
              borderRadius: '12px',
              width: '95%',
              maxWidth: '450px',
              boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
              display: 'flex',
              flexDirection: 'column',
              maxHeight: '90vh',
              overflow: 'hidden'
            }}
          >
            {/* Modal Header */}
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              padding: '1.25rem 1.5rem', 
              borderBottom: '1px solid var(--border)' 
            }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>
                {recipientEditMode ? 'Edit Recipient' : 'Add New Recipient'}
              </h2>
              <button 
                type="button" 
                onClick={() => setShowRecipientModal(false)} 
                style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--foreground-muted)', cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
              >
                &times;
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ 
              padding: '1.5rem', 
              overflowY: 'auto', 
              flex: 1, 
              display: 'flex', 
              flexDirection: 'column', 
              gap: '1.25rem' 
            }}>
              <div>
                <label style={labelStyle}>Email Address *</label>
                <input 
                  type="email" 
                  required 
                  value={recipientEmail} 
                  onChange={e => setRecipientEmail(e.target.value)}
                  style={inputStyle}
                  placeholder="e.g. buyer@company.com"
                />
                {recipientErrors.email && <div style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: '0.25rem' }}>{recipientErrors.email}</div>}
              </div>

              <div>
                <label style={labelStyle}>Recipient Name (Optional)</label>
                <input 
                  type="text" 
                  value={recipientName} 
                  onChange={e => setRecipientName(e.target.value)}
                  style={inputStyle}
                  placeholder="e.g. John Doe"
                />
              </div>

              <div>
                <label style={labelStyle}>Recipient Status</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.25rem 0' }}>
                  <label className="switch">
                    <input 
                      type="checkbox" 
                      checked={recipientIsActive} 
                      onChange={e => setRecipientIsActive(e.target.checked)} 
                    />
                    <span className="slider"></span>
                  </label>
                  <span style={{ fontSize: '0.875rem', fontWeight: 500, color: recipientIsActive ? 'var(--success)' : 'var(--danger)' }}>
                    {recipientIsActive ? 'Active (Will receive alerts)' : 'Disabled (Muted alerts)'}
                  </span>
                </div>
              </div>

              <div>
                <label style={labelStyle}>Notes / Description</label>
                <input 
                  type="text" 
                  value={recipientNotes} 
                  onChange={e => setRecipientNotes(e.target.value)}
                  style={inputStyle}
                  placeholder="e.g. Vendor Procurement, Regional Buyer"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{ 
              padding: '1rem 1.5rem', 
              borderTop: '1px solid var(--border)', 
              background: 'var(--secondary)', 
              display: 'flex', 
              gap: '0.5rem',
              justifyContent: 'flex-end'
            }}>
              <button 
                type="button" 
                onClick={() => setShowRecipientModal(false)} 
                className="btn-secondary"
                style={{ padding: '0.5rem 1rem', borderRadius: '6px', fontWeight: 600 }}
              >
                Cancel
              </button>
              <button 
                type="submit" 
                className="btn-primary"
                style={{ padding: '0.5rem 1rem', borderRadius: '6px' }}
              >
                Save Recipient
              </button>
            </div>
          </form>
        </div>
      )}

      {showModal && (
        <div style={modalOverlayStyle}>
          <form 
            onSubmit={handleSubmit} 
            className="modal-animate"
            style={{ 
              background: 'white',
              borderRadius: '12px',
              width: '95%',
              maxWidth: '450px',
              boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
              display: 'flex',
              flexDirection: 'column',
              maxHeight: '90vh',
              overflow: 'hidden'
            }}
          >
            {/* Modal Header */}
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              padding: '1.25rem 1.5rem', 
              borderBottom: '1px solid var(--border)' 
            }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>
                {editMode ? 'Edit User' : 'Add New User'}
              </h2>
              <button 
                type="button" 
                onClick={() => setShowModal(false)} 
                style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--foreground-muted)', cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
              >
                &times;
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ 
              padding: '1.5rem', 
              overflowY: 'auto', 
              flex: 1, 
              display: 'flex', 
              flexDirection: 'column', 
              gap: '1.25rem' 
            }}>
              <div>
                <label style={labelStyle}>Email Address</label>
                <input 
                  type="email" 
                  required 
                  value={email} 
                  onChange={e => setEmail(e.target.value)}
                  disabled={!!editMode}
                  style={!!editMode ? disabledInputStyle : inputStyle}
                  placeholder="e.g. name@company.com"
                />
                {formErrors.email && <div style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: '0.25rem' }}>{formErrors.email}</div>}
                {!!editMode && (
                  <span style={{ fontSize: '0.75rem', color: 'var(--foreground-muted)', marginTop: '2px', display: 'block' }}>
                    Email address cannot be edited once created.
                  </span>
                )}
              </div>

              <div>
                <label style={labelStyle}>
                  {editMode ? 'New Password (leave blank to keep current)' : 'Password'}
                </label>
                <input 
                  type="password" 
                  required={!editMode} 
                  value={password} 
                  placeholder={editMode ? "••••••••" : "Enter account password"}
                  onChange={e => setPassword(e.target.value)}
                  style={inputStyle}
                />
                {formErrors.password && <div style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: '0.25rem' }}>{formErrors.password}</div>}
              </div>

              <div>
                <label style={labelStyle}>Role</label>
                <select value={role} onChange={e => setRole(e.target.value as any)} style={inputStyle}>
                  <option value="Admin">Admin</option>
                  <option value="Manager">Manager</option>
                  <option value="Basic User">Basic User</option>
                </select>
              </div>

              <div>
                <label style={labelStyle}>Account Status</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.25rem 0' }}>
                  <label className="switch">
                    <input 
                      type="checkbox" 
                      id="isActive"
                      checked={isActive} 
                      onChange={e => setIsActive(e.target.checked)} 
                    />
                    <span className="slider"></span>
                  </label>
                  <span style={{ fontSize: '0.875rem', fontWeight: 500, color: isActive ? 'var(--success)' : 'var(--danger)' }}>
                    {isActive ? 'Active (Authorized system access)' : 'Disabled (Suspended access)'}
                  </span>
                </div>
              </div>

              <div>
                <label style={labelStyle}>Purchase Team Notifications</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.25rem 0' }}>
                  <label className="switch">
                    <input 
                      type="checkbox" 
                      id="purchaseTeam"
                      checked={purchaseTeam} 
                      onChange={e => setPurchaseTeam(e.target.checked)} 
                    />
                    <span className="slider"></span>
                  </label>
                  <span style={{ fontSize: '0.875rem', fontWeight: 500, color: purchaseTeam ? 'var(--primary)' : 'var(--foreground-muted)' }}>
                    {purchaseTeam ? 'Subscribed (Receives reorder warning emails)' : 'Not Subscribed'}
                  </span>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="modal-footer-actions" style={{ 
              padding: '1rem 1.5rem', 
              borderTop: '1px solid var(--border)', 
              background: 'var(--secondary)', 
              display: 'flex', 
              gap: '0.5rem',
              justifyContent: 'flex-end'
            }}>
              <button 
                type="button" 
                onClick={handleResetEdit} 
                className="btn-secondary"
                style={{ padding: '0.5rem 1rem', borderRadius: '6px', fontWeight: 600 }}
              >
                Reset
              </button>
              <button 
                type="button" 
                onClick={() => setShowModal(false)} 
                className="btn-secondary"
                style={{ padding: '0.5rem 1rem', borderRadius: '6px', fontWeight: 600 }}
              >
                Cancel
              </button>
              <button 
                type="submit" 
                className="btn-primary"
                style={{ padding: '0.5rem 1rem', borderRadius: '6px' }}
              >
                {editMode ? 'Save Changes' : 'Create User'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Switch Toggle styles & opening animations */}
      <style>{`
        @keyframes modalFadeScale {
          from {
            opacity: 0;
            transform: scale(0.95) translateY(10px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
        .modal-animate {
          animation: modalFadeScale 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }

        .switch {
          position: relative;
          display: inline-block;
          width: 48px;
          height: 24px;
          flex-shrink: 0;
        }
        .switch input {
          opacity: 0;
          width: 0;
          height: 0;
        }
        .slider {
          position: absolute;
          cursor: pointer;
          top: 0; left: 0; right: 0; bottom: 0;
          background-color: #cbd5e1;
          transition: 0.2s ease;
          border-radius: 24px;
        }
        .slider:before {
          position: absolute;
          content: "";
          height: 18px;
          width: 18px;
          left: 3px;
          bottom: 3px;
          background-color: white;
          transition: 0.2s ease;
          border-radius: 50%;
          box-shadow: 0 1px 3px rgba(0,0,0,0.15);
        }
        input:checked + .slider {
          background-color: var(--primary);
        }
        input:focus + .slider {
          box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.2);
        }
        input:checked + .slider:before {
          transform: translateX(24px);
        }
      `}</style>
    </div>
  );
}

// Styles
const actionBtnStyle = {
  background: 'none',
  border: 'none',
  color: 'var(--primary)',
  fontWeight: 600,
  fontSize: '0.85rem',
  cursor: 'pointer',
  padding: '0.25rem'
};

const modalOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0, left: 0, right: 0, bottom: 0,
  background: 'rgba(0,0,0,0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
};

const modalContentStyle: React.CSSProperties = {
  background: 'white',
  padding: '2rem',
  borderRadius: '12px',
  width: '100%',
  maxWidth: '400px',
  boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
};

const labelStyle = {
  display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 600, color: 'var(--foreground)'
};

const inputStyle = {
  width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '0.95rem'
};

const disabledInputStyle = {
  ...inputStyle,
  background: 'var(--secondary)',
  color: 'var(--foreground-muted)',
  cursor: 'not-allowed',
  borderColor: 'var(--border)',
};

const thStyle: React.CSSProperties = {
  padding: '1rem',
  borderBottom: '1px solid var(--border)',
  fontWeight: 600,
  fontSize: '0.85rem',
  color: 'var(--foreground-muted)',
};

const tdStyle: React.CSSProperties = {
  padding: '1rem',
  fontSize: '0.9rem',
  color: 'var(--foreground)',
  verticalAlign: 'middle',
};
