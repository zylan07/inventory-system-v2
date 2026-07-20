"use client";

import React, { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/apiFetch';
import { useToast } from '@/components/ToastProvider';
import { useAuth } from '@/components/AuthProvider';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface ClientKPI {
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
  avg_order_value: number;
  dynamic_status: 'Active' | 'Regular' | 'Inactive';
}

interface PurchaseLog {
  id: number;
  date: string;
  quantity: number;
  unit_price: number;
  total_value: number;
  product_name: string;
  model_no: string;
  warehouse_name: string;
}

interface PopularProduct {
  product_name: string;
  model_no: string;
  total_qty: number;
  total_spent: number;
}

interface MonthlySpend {
  month: string;
  value: number;
  orders: number;
}

export default function ClientProfilePage({ params }: { params: { id: string } }) {
  const { id } = params;
  const { showToast } = useToast();
  const { userRole } = useAuth();
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'timeline' | 'popular' | 'trends'>('timeline');

  // Client data states
  const [client, setClient] = useState<ClientKPI | null>(null);
  const [purchases, setPurchases] = useState<PurchaseLog[]>([]);
  const [popularProducts, setPopularProducts] = useState<PopularProduct[]>([]);
  const [monthlySpends, setMonthlySpends] = useState<MonthlySpend[]>([]);

  useEffect(() => {
    if (!id) return;

    const loadProfile = async () => {
      setIsLoading(true);
      try {
        const res = await apiFetch(`/clients/${id}`);
        if (res.ok) {
          const json = await res.json();
          if (json.success && json.data) {
            setClient(json.data.client);
            setPurchases(json.data.purchases);
            setPopularProducts(json.data.popularProducts);
            setMonthlySpends(json.data.monthlySpend);
          } else {
            showToast(json.message || 'Client profile not found.', 'error');
            router.push('/clients');
          }
        } else {
          showToast('Failed to fetch client profile details.', 'error');
          router.push('/clients');
        }
      } catch (e) {
        showToast('Error loading profile details.', 'error');
      } finally {
        setIsLoading(false);
      }
    };

    if (userRole === 'Admin' || userRole === 'Manager') {
      loadProfile();
    }
  }, [id, userRole, router]);

  // Helper status color badges
  const getStatusBadgeStyle = (status: ClientKPI['dynamic_status'] | undefined) => {
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

  if (isLoading) {
    return (
      <main style={{ padding: '3rem', textAlign: 'center', color: 'var(--foreground-muted)' }}>
        Loading client profile and timeline...
      </main>
    );
  }

  if (!client) return null;

  return (
    <main style={{ padding: '2rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', flex: 1, minWidth: 0 }}>
      {/* Navigation / Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <Link href="/clients" style={{ textDecoration: 'none', color: 'var(--foreground-muted)', fontWeight: 600, fontSize: '0.85rem' }}>
          ← Back to Directory
        </Link>
      </div>

      {/* Main Profile Info Card */}
      <div className="card" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <h1 className="text-2xl font-bold" style={{ margin: 0 }}>{client.company_name}</h1>
              <span className="badge" style={getStatusBadgeStyle(client.dynamic_status)}>
                {client.dynamic_status}
              </span>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--foreground-muted)', marginTop: '0.25rem' }}>
              Industry Category: <span style={{ fontWeight: 600, color: 'var(--foreground)' }}>{client.industry || 'Other'}</span>
            </p>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--foreground-muted)', textAlign: 'right' }}>
            <span>Created on {new Date(client.created_at).toLocaleDateString()}</span>
          </div>
        </div>

        {/* Contact info grid */}
        <div style={infoGridStyle}>
          <div>
            <div style={infoLabelStyle}>Contact Person</div>
            <div style={infoValueStyle}>{client.contact_person || 'N/A'}</div>
          </div>
          <div>
            <div style={infoLabelStyle}>Phone Number</div>
            <div style={infoValueStyle}>{client.phone || 'N/A'}</div>
          </div>
          <div>
            <div style={infoLabelStyle}>Email Address</div>
            <div style={infoValueStyle}>{client.email || 'N/A'}</div>
          </div>
          <div>
            <div style={infoLabelStyle}>GST registration</div>
            <div style={infoValueStyle}>{client.gst || 'N/A'}</div>
          </div>
        </div>

        {/* Address */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
          <div style={infoLabelStyle}>Office / Billing Address</div>
          <div style={{ ...infoValueStyle, lineHeight: 1.4, marginTop: '0.25rem' }}>
            {client.address ? `${client.address}, ${client.city || ''}, ${client.state || ''}` : 'No address registered.'}
          </div>
        </div>

        {/* Remarks */}
        {client.remarks && (
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
            <div style={infoLabelStyle}>Remarks / Notes</div>
            <div style={{ fontSize: '0.8rem', color: '#475569', fontStyle: 'italic', marginTop: '0.25rem' }}>
              "{client.remarks}"
            </div>
          </div>
        )}
      </div>

      {/* KPI Stats summary blocks */}
      <div style={kpiGridStyle}>
        <div className="card" style={kpiCardStyle}>
          <div style={kpiLabelStyle}>Lifetime Revenue</div>
          <div style={kpiValueStyle}>₹{parseFloat(String(client.lifetime_revenue)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
        </div>
        <div className="card" style={kpiCardStyle}>
          <div style={kpiLabelStyle}>Total Orders</div>
          <div style={kpiValueStyle}>{client.total_orders} Orders</div>
        </div>
        <div className="card" style={kpiCardStyle}>
          <div style={kpiLabelStyle}>Average Order Value</div>
          <div style={kpiValueStyle}>₹{parseFloat(String(client.avg_order_value)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
        </div>
        <div className="card" style={kpiCardStyle}>
          <div style={kpiLabelStyle}>Last Purchase Date</div>
          <div style={{ ...kpiValueStyle, fontSize: '1.05rem', marginTop: '0.375rem' }}>
            {client.last_purchase_at ? new Date(client.last_purchase_at).toLocaleDateString() : 'No purchases yet'}
          </div>
        </div>
      </div>

      {/* Tabs navigation */}
      <div style={tabContainerStyle}>
        <button 
          onClick={() => setActiveTab('timeline')}
          style={{
            ...tabItemStyle,
            color: activeTab === 'timeline' ? 'var(--primary)' : 'var(--foreground-muted)',
            borderBottom: activeTab === 'timeline' ? '2px solid var(--primary)' : '2px solid transparent',
            fontWeight: activeTab === 'timeline' ? 700 : 500
          }}
        >
          📥 Purchase Log Timeline
        </button>
        <button 
          onClick={() => setActiveTab('popular')}
          style={{
            ...tabItemStyle,
            color: activeTab === 'popular' ? 'var(--primary)' : 'var(--foreground-muted)',
            borderBottom: activeTab === 'popular' ? '2px solid var(--primary)' : '2px solid transparent',
            fontWeight: activeTab === 'popular' ? 700 : 500
          }}
        >
          🏷️ Popular Products
        </button>
        <button 
          onClick={() => setActiveTab('trends')}
          style={{
            ...tabItemStyle,
            color: activeTab === 'trends' ? 'var(--primary)' : 'var(--foreground-muted)',
            borderBottom: activeTab === 'trends' ? '2px solid var(--primary)' : '2px solid transparent',
            fontWeight: activeTab === 'trends' ? 700 : 500
          }}
        >
          📈 Monthly Purchase Patterns
        </button>
      </div>

      {/* Tab content panels */}
      <div className="card" style={{ padding: 0, overflowHidden: 'true' }}>
        
        {/* PANEL 1: Purchase timeline log */}
        {activeTab === 'timeline' && (
          <div style={{ overflowX: 'auto' }}>
            {purchases.length === 0 ? (
              <div style={emptyPanelStyle}>No purchases logged for this client yet.</div>
            ) : (
              <table className="table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border)' }}>
                    <th style={thStyle}>Date & Time</th>
                    <th style={thStyle}>Product Name</th>
                    <th style={thStyle}>Model Number</th>
                    <th style={thStyle}>Source Warehouse</th>
                    <th style={thStyle}>Quantity</th>
                    <th style={thStyle}>Unit Selling Price</th>
                    <th style={thStyle}>Total Value</th>
                  </tr>
                </thead>
                <tbody>
                  {purchases.map(p => (
                    <tr key={p.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.2s' }}>
                      <td style={tdStyle}>{new Date(p.date).toLocaleString()}</td>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>{p.product_name}</td>
                      <td style={tdStyle}><span className="badge" style={{ background: '#f1f5f9', color: '#334155' }}>{p.model_no}</span></td>
                      <td style={tdStyle}>{p.warehouse_name}</td>
                      <td style={tdStyle}>{p.quantity}</td>
                      <td style={tdStyle}>₹{parseFloat(String(p.unit_price)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      <td style={{ ...tdStyle, fontWeight: 700 }}>₹{parseFloat(String(p.total_value)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* PANEL 2: Popular products */}
        {activeTab === 'popular' && (
          <div style={{ overflowX: 'auto' }}>
            {popularProducts.length === 0 ? (
              <div style={emptyPanelStyle}>No product purchases logged.</div>
            ) : (
              <table className="table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border)' }}>
                    <th style={thStyle}>Product Name</th>
                    <th style={thStyle}>Model Number</th>
                    <th style={thStyle}>Total Qty Purchased</th>
                    <th style={thStyle}>Total Revenue Contribution</th>
                  </tr>
                </thead>
                <tbody>
                  {popularProducts.map((p, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>{p.product_name}</td>
                      <td style={tdStyle}><span className="badge" style={{ background: '#f1f5f9', color: '#334155' }}>{p.model_no}</span></td>
                      <td style={tdStyle}>{p.total_qty} units</td>
                      <td style={{ ...tdStyle, fontWeight: 700 }}>₹{parseFloat(String(p.total_spent)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* PANEL 3: Monthly Trends */}
        {activeTab === 'trends' && (
          <div style={{ overflowX: 'auto' }}>
            {monthlySpends.length === 0 ? (
              <div style={emptyPanelStyle}>No monthly purchase trends available.</div>
            ) : (
              <table className="table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border)' }}>
                    <th style={thStyle}>Month</th>
                    <th style={thStyle}>Order Count</th>
                    <th style={thStyle}>Monthly Order Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlySpends.map((m, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>{m.month}</td>
                      <td style={tdStyle}>{m.orders} Orders</td>
                      <td style={{ ...tdStyle, fontWeight: 700 }}>₹{parseFloat(String(m.value)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

      </div>
    </main>
  );
}

// Styles
const infoGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: '1.25rem'
};

const infoLabelStyle = {
  fontSize: '0.75rem',
  color: 'var(--foreground-muted)',
  fontWeight: 600,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.02em'
};

const infoValueStyle = {
  fontSize: '0.85rem',
  fontWeight: 700,
  color: 'var(--foreground)',
  marginTop: '0.125rem'
};

const kpiGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
  gap: '1.25rem'
};

const kpiCardStyle: React.CSSProperties = {
  padding: '1.25rem',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center'
};

const kpiLabelStyle = {
  fontSize: '0.75rem',
  color: 'var(--foreground-muted)',
  fontWeight: 600,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.02em'
};

const kpiValueStyle = {
  fontSize: '1.4rem',
  fontWeight: 800,
  color: 'var(--foreground)',
  marginTop: '0.25rem'
};

const tabContainerStyle: React.CSSProperties = {
  display: 'flex',
  borderBottom: '1px solid var(--border)',
  overflowX: 'auto',
  gap: '1.5rem',
  paddingBottom: '0.125rem'
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

const thStyle = {
  padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 700, color: 'var(--foreground-muted)', textTransform: 'uppercase' as const, borderBottom: '1px solid var(--border)'
};

const tdStyle = {
  padding: '1rem', fontSize: '0.85rem', color: 'var(--foreground)', verticalAlign: 'middle'
};

const emptyPanelStyle = {
  padding: '3rem', textAlign: 'center' as const, fontSize: '0.85rem', color: 'var(--foreground-muted)'
};
