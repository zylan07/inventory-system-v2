"use client";

import { useState, useEffect } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/apiFetch';
import Toast from '@/components/Toast';
import EmptyState from '@/components/EmptyState';

type User = {
  id: number;
  email: string;
  role: 'Admin' | 'Manager' | 'Basic User';
  is_active: boolean;
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

  // Prevent background scrolling when modal is open
  useEffect(() => {
    if (showModal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [showModal]);

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

  useEffect(() => {
    if (userRole === 'Manager' || userRole === 'Basic User') {
      router.push('/dashboard');
    } else if (userRole === 'Admin') {
      fetchUsers();
    }
  }, [userRole, router]);

  const openAddModal = () => {
    setEditMode(null);
    setEmail('');
    setPassword('');
    setRole('Basic User');
    setIsActive(true);
    setShowModal(true);
  };

  const openEditModal = (user: User) => {
    setEditMode(user);
    setEmail(user.email);
    setPassword(''); // leave blank implicitly
    setRole(user.role);
    setIsActive(Boolean(user.is_active));
    setShowModal(true);
  };

  const handleResetEdit = () => {
    if (editMode) {
      setEmail(editMode.email);
      setPassword('');
      setRole(editMode.role);
      setIsActive(Boolean(editMode.is_active));
      showToast('Form fields reset to original values', 'success');
    } else {
      setEmail('');
      setPassword('');
      setRole('Basic User');
      setIsActive(true);
      showToast('Form fields cleared', 'success');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editMode) {
        // Update user
        const body: Record<string, any> = { role, is_active: isActive };
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
        if (!email || !password || !role) {
          showToast('Please fill all fields', 'error');
          return;
        }
        const res = await apiFetch('/users', {
          method: 'POST',
          body: JSON.stringify({ email, password, role, is_active: isActive }),
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
        <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th>ID</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2rem' }}>Loading users...</td></tr>
            ) : (users || []).length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: '2rem' }}>
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
