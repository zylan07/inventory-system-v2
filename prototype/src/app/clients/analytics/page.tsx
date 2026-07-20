"use client";

import React, { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/apiFetch';
import { useToast } from '@/components/ToastProvider';
import { useAuth } from '@/components/AuthProvider';
import Link from 'next/link';

interface KPIStats {
  totalClients: number;
  activeClients: number;
  regularClients: number;
  inactiveClients: number;
  newClientsThisMonth: number;
  revenueThisMonth: number;
  lifetimeRevenue: number;
  totalOrders: number;
  averageOrderValue: number;
}

interface ChartItem {
  company_name: string;
  value: number;
  orders: number;
}

interface TrendItem {
  month: string;
  revenue: number;
  orders: number;
}

export default function ClientAnalyticsPage() {
  const { showToast } = useToast();
  const { userRole } = useAuth();

  const [isLoading, setIsLoading] = useState(true);
  const [kpis, setKpis] = useState<KPIStats | null>(null);
  const [topRevenue, setTopRevenue] = useState<ChartItem[]>([]);
  const [topFrequency, setTopFrequency] = useState<ChartItem[]>([]);
  const [monthlyTrend, setMonthlyTrend] = useState<TrendItem[]>([]);

  useEffect(() => {
    const loadAnalytics = async () => {
      setIsLoading(true);
      try {
        const res = await apiFetch('/clients/analytics');
        if (res.ok) {
          const json = await res.json();
          if (json.success && json.data) {
            setKpis(json.data.kpis);
            setTopRevenue(json.data.charts.topClientsRevenue);
            setTopFrequency(json.data.charts.topClientsOrders);
            setMonthlyTrend(json.data.charts.monthlyTrend);
          }
        }
      } catch (e) {
        showToast('Failed to compile client analytics.', 'error');
      } finally {
        setIsLoading(false);
      }
    };

    if (userRole === 'Admin' || userRole === 'Manager') {
      loadAnalytics();
    }
  }, [userRole]);

  if (!userRole || (userRole !== 'Admin' && userRole !== 'Manager')) {
    return (
      <main style={{ padding: '2rem', textAlign: 'center' }}>
        <h2>Forbidden: Access denied</h2>
      </main>
    );
  }

  if (isLoading || !kpis) {
    return (
      <main style={{ padding: '3rem', textAlign: 'center', color: 'var(--foreground-muted)' }}>
        Compiling client performance graphs and lifetime values...
      </main>
    );
  }

  // Calculate highest revenue to scale charts
  const maxRevenue = topRevenue.length > 0 ? Math.max(...topRevenue.map(c => parseFloat(String(c.value)))) : 1;
  const maxOrders = topFrequency.length > 0 ? Math.max(...topFrequency.map(c => c.orders)) : 1;
  const maxTrend = monthlyTrend.length > 0 ? Math.max(...monthlyTrend.map(t => parseFloat(String(t.revenue)))) : 1;

  return (
    <main style={{ padding: '2rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', flex: 1, minWidth: 0 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="text-2xl font-bold">Client Performance Analytics</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--foreground-muted)' }}>
            Insights into client ordering frequencies, monthly sales trends, and lifetime values.
          </p>
        </div>
        <Link href="/clients" className="btn-secondary" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
          🏢 Back to Directory
        </Link>
      </div>

      {/* KPI Cards Grid */}
      <div style={kpiGridStyle}>
        <div className="card" style={kpiCardStyle}>
          <div style={kpiLabelStyle}>Total Revenue Contributions</div>
          <div style={kpiValueStyle}>₹{parseFloat(String(kpis.lifetimeRevenue)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
          <span style={kpiSubStyle}>From {kpis.totalOrders} total sales orders</span>
        </div>
        <div className="card" style={kpiCardStyle}>
          <div style={kpiLabelStyle}>Revenue This Month</div>
          <div style={{ ...kpiValueStyle, color: 'var(--primary)' }}>₹{parseFloat(String(kpis.revenueThisMonth)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
          <span style={kpiSubStyle}>Last 30 rolling calendar days</span>
        </div>
        <div className="card" style={kpiCardStyle}>
          <div style={kpiLabelStyle}>Average Order Value</div>
          <div style={kpiValueStyle}>₹{parseFloat(String(kpis.averageOrderValue)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
          <span style={kpiSubStyle}>Mean revenue per transaction</span>
        </div>
        <div className="card" style={kpiCardStyle}>
          <div style={kpiLabelStyle}>Client Base Split</div>
          <div style={{ ...kpiValueStyle, display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '1.25rem', marginTop: '0.375rem' }}>
            <span style={{ color: '#16a34a' }}>🟢{kpis.activeClients}</span>
            <span style={{ color: '#ca8a04' }}>🟡{kpis.regularClients}</span>
            <span style={{ color: '#dc2626' }}>🔴{kpis.inactiveClients}</span>
          </div>
          <span style={kpiSubStyle}>Active / Regular / Inactive</span>
        </div>
      </div>

      {/* Main charts layout */}
      <div style={chartsGridStyle}>
        
        {/* Top Clients by Revenue contribution */}
        <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <h3 style={chartTitleStyle}>Top 10 Clients by Cumulative Revenue</h3>
            <p style={chartSubStyle}>Highest lifetime value accounts.</p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
            {topRevenue.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--foreground-muted)' }}>No data available</div>
            ) : (
              topRevenue.map((c, i) => {
                const pct = (parseFloat(String(c.value)) / maxRevenue) * 100;
                return (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 600 }}>
                      <span>{c.company_name}</span>
                      <span>₹{parseFloat(String(c.value)).toLocaleString('en-IN')}</span>
                    </div>
                    <div style={{ height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', background: 'var(--primary)', width: `${pct}%`, borderRadius: '4px', transition: 'width 0.5s ease-out' }} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Top Clients by order frequency */}
        <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <h3 style={chartTitleStyle}>Top 10 Clients by Order Frequencies</h3>
            <p style={chartSubStyle}>Most frequent purchasing partners.</p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
            {topFrequency.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--foreground-muted)' }}>No data available</div>
            ) : (
              topFrequency.map((c, i) => {
                const pct = (c.orders / maxOrders) * 100;
                return (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 600 }}>
                      <span>{c.company_name}</span>
                      <span>{c.orders} Orders (₹{parseFloat(String(c.value)).toLocaleString('en-IN')})</span>
                    </div>
                    <div style={{ height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', background: '#0ea5e9', width: `${pct}%`, borderRadius: '4px', transition: 'width 0.5s ease-out' }} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>

      {/* Monthly Sales Revenue trends */}
      <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div>
          <h3 style={chartTitleStyle}>Rolling Monthly Sales Revenue & Orders</h3>
          <p style={chartSubStyle}>Visualizes outward sales values over the last 6 months.</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
          {monthlyTrend.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--foreground-muted)' }}>No recent data.</div>
          ) : (
            monthlyTrend.map((t, idx) => {
              const pct = (parseFloat(String(t.revenue)) / maxTrend) * 100;
              return (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ width: '80px', fontSize: '0.75rem', fontWeight: 700, color: 'var(--foreground-muted)' }}>{t.month}</div>
                  <div style={{ flex: 1, height: '12px', background: '#f1f5f9', borderRadius: '6px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', background: 'linear-gradient(90deg, var(--primary) 0%, #3b82f6 100%)', width: `${pct}%`, borderRadius: '6px' }} />
                  </div>
                  <div style={{ width: '150px', textAlign: 'right', fontSize: '0.75rem', fontWeight: 700 }}>
                    ₹{parseFloat(String(t.revenue)).toLocaleString('en-IN')} <span style={{ fontWeight: 500, color: 'var(--foreground-muted)' }}>({t.orders} txn)</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </main>
  );
}

// Styles
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

const kpiSubStyle = {
  fontSize: '0.7rem',
  color: 'var(--foreground-muted)',
  marginTop: '0.25rem'
};

const chartsGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
  gap: '1.5rem'
};

const chartTitleStyle = {
  fontSize: '0.95rem',
  fontWeight: 800,
  color: 'var(--foreground)'
};

const chartSubStyle = {
  fontSize: '0.75rem',
  color: 'var(--foreground-muted)'
};
