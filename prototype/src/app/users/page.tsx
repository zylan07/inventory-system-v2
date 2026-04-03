"use client";

import { useState, useEffect } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/apiFetch';
import Toast from '@/components/Toast';

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

  const showToast = (message: string, type: 'success'|'error') => {
    setToast({ message, type, id: Date.now() });
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/users');
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editMode) {
        // Update user
        const body: Record<string, any> = { role, is_active: isActive };
        if (password) body.password = password; // only send if changed

        await apiFetch(`/users/${editMode.id}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        });
        showToast('User updated successfully', 'success');
      } else {
        // Create user
        if (!email || !password || !role) {
          showToast('Please fill all fields', 'error');
          return;
        }
        await apiFetch('/users', {
          method: 'POST',
          body: JSON.stringify({ email, password, role, is_active: isActive }),
        });
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
      await apiFetch(`/users/${user.id}`, { method: 'DELETE' });
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
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2rem' }}>No users found</td></tr>
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
                      <button onClick={() => openEditModal(u)} style={actionBtnStyle}>Edit</button>
                      <button onClick={() => handleDelete(u)} style={{...actionBtnStyle, color: '#ef4444'}}>Delete</button>
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
          <div style={modalContentStyle}>
            <h2 style={{ margin: '0 0 1.5rem 0', fontSize: '1.25rem' }}>
              {editMode ? 'Edit User' : 'Add New User'}
            </h2>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              
              <div>
                <label style={labelStyle}>Email</label>
                <input 
                  type="email" 
                  required 
                  value={email} 
                  onChange={e => setEmail(e.target.value)}
                  disabled={!!editMode}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>{editMode ? 'New Password (leave blank to keep current)' : 'Password'}</label>
                <input 
                  type="password" 
                  required={!editMode} 
                  value={password} 
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

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input 
                  type="checkbox" 
                  id="isActive" 
                  checked={isActive} 
                  onChange={e => setIsActive(e.target.checked)} 
                />
                <label htmlFor="isActive" style={{ fontWeight: 600, fontSize: '0.875rem' }}>Active Account</label>
              </div>

              <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                <button type="button" onClick={() => setShowModal(false)} style={{
                  flex: 1, padding: '0.75rem', background: 'var(--secondary)', border: 'none', borderRadius: '6px', cursor: 'pointer'
                }}>Cancel</button>
                <button type="submit" style={{
                  flex: 1, padding: '0.75rem', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer'
                }}>{editMode ? 'Save Changes' : 'Create User'}</button>
              </div>

            </form>
          </div>
        </div>
      )}
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
