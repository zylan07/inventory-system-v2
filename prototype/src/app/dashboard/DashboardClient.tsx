"use client";

import { InventoryDb } from "@/lib/db";
import { useAuth } from "@/components/AuthProvider";
import { useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale, LinearScale, BarElement,
  LineElement, PointElement, Title, Tooltip, Legend, Filler
);

const TYPE_BADGE: Record<string, string> = {
  INWARD: 'badge-inward', OUTWARD: 'badge-outward',
  TRANSFER: 'badge-transfer', ADJUSTMENT: 'badge-adjustment',
};

export default function DashboardClient({ initialData }: { initialData: InventoryDb }) {
  const { userRole } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (userRole === 'Basic User') router.push('/outward');
  }, [userRole, router]);

  // ── Warehouse totals ──
  const warehouseStocks = useMemo(() => {
    const totals: Record<string, number> = {};
    initialData.warehouses.forEach(w => { totals[w.id] = 0; });
    initialData.items.forEach(item => {
      initialData.warehouses.forEach(w => {
        totals[w.id] = (totals[w.id] || 0) + (item.stock[w.id] || 0);
      });
    });
    return totals;
  }, [initialData]);

  const totalProducts = initialData.items.length;
  const totalWarehouses = initialData.warehouses.length;
  const totalTransactions = initialData.transactions.length;
  let totalLowStockItems = 0;
  initialData.items.forEach(item => {
    if (Object.values(item.stock).reduce((s, n) => s + n, 0) < 10) totalLowStockItems++;
  });

  // ── Item movement (OUTWARD = sold/used) ──
  const itemOutwardMap = useMemo(() => {
    const map: Record<string, number> = {};
    initialData.transactions.forEach(tx => {
      if (tx.type === 'OUTWARD') map[tx.itemId] = (map[tx.itemId] || 0) + tx.quantity;
    });
    return map;
  }, [initialData]);

  const moversData = useMemo(() => {
    const items = initialData.items
      .map(item => ({ id: item.id, model: item.model.trim(), product: item.product, group: item.group, outward: itemOutwardMap[item.id] || 0 }))
      .filter(i => i.outward > 0)
      .sort((a, b) => b.outward - a.outward);

    const total = items.length;
    if (total === 0) return { fast: [], moderate: [], slow: [] };
    const fastCount = Math.max(1, Math.ceil(total * 0.2));
    const slowCount = Math.max(1, Math.ceil(total * 0.2));

    return {
      fast: items.slice(0, fastCount),
      moderate: items.slice(fastCount, total - slowCount),
      slow: [...items.slice(total - slowCount)].reverse(),
    };
  }, [initialData, itemOutwardMap]);

  // ── Transfer analytics (simplified — no routes) ──
  const transferData = useMemo(() => {
    const itemTransfers: Record<string, number> = {};
    initialData.transactions.forEach(tx => {
      if (tx.type === 'TRANSFER')
        itemTransfers[tx.itemId] = (itemTransfers[tx.itemId] || 0) + tx.quantity;
    });
    return Object.entries(itemTransfers)
      .map(([id, qty]) => ({
        model: (initialData.items.find(i => i.id === id)?.model || 'Unknown').trim(),
        qty,
      }))
      .sort((a, b) => b.qty - a.qty);
  }, [initialData]);

  // ── Monthly trend (last 6 months, INWARD vs OUTWARD) ──
  const monthlyTrend = useMemo(() => {
    const months: Record<string, { inward: number; outward: number }> = {};
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      months[key] = { inward: 0, outward: 0 };
    }
    initialData.transactions.forEach(tx => {
      const key = tx.date.slice(0, 7);
      if (!months[key]) return;
      if (tx.type === 'INWARD') months[key].inward += tx.quantity;
      else if (tx.type === 'OUTWARD') months[key].outward += tx.quantity;
    });
    return months;
  }, [initialData]);

  const trendLabels = Object.keys(monthlyTrend).map(k => {
    const [y, m] = k.split('-');
    return new Date(Number(y), Number(m) - 1).toLocaleString('default', { month: 'short', year: '2-digit' });
  });

  // Charts
  const warehouseChartData = {
    labels: initialData.warehouses.map(w => w.name),
    datasets: [{
      label: 'Total Stock',
      data: initialData.warehouses.map(w => warehouseStocks[w.id] || 0),
      backgroundColor: ['rgba(37,99,235,0.7)', 'rgba(124,58,237,0.7)', 'rgba(5,150,105,0.7)'],
      borderColor: ['rgb(37,99,235)', 'rgb(124,58,237)', 'rgb(5,150,105)'],
      borderWidth: 1.5, borderRadius: 6,
    }],
  };

  const trendChartData = {
    labels: trendLabels,
    datasets: [
      {
        label: 'Inward',
        data: Object.values(monthlyTrend).map(m => m.inward),
        borderColor: 'rgb(5,150,105)', backgroundColor: 'rgba(5,150,105,0.15)',
        tension: 0.35, fill: true,
      },
      {
        label: 'Outward',
        data: Object.values(monthlyTrend).map(m => m.outward),
        borderColor: 'rgb(220,38,38)', backgroundColor: 'rgba(220,38,38,0.1)',
        tension: 0.35, fill: true,
      },
    ],
  };

  const chartBaseOpts = {
    responsive: true,
    plugins: { legend: { position: 'bottom' as const, labels: { font: { size: 11 } } } },
    scales: {
      y: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { color: '#64748b', font: { size: 10 } } },
      x: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 10 } } },
    },
  };

  const recentTxs = initialData.transactions.slice(0, 8);

  // Velocity list component
  const VelocityList = ({
    items, label, color, badgeClass,
  }: {
    items: { id: string; model: string; product?: string; group?: string; outward: number }[];
    label: string; color: string; badgeClass: string;
  }) => (
    <div className="stat-card">
      <div style={{ fontWeight: 700, fontSize: '0.875rem', color, marginBottom: '0.5rem' }}>{label}</div>
      {items.length === 0 ? (
        <div style={{ color: 'var(--foreground-muted)', fontSize: '0.8rem' }}>No movement data yet</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {items.slice(0, 5).map(item => (
            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.78rem', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`${item.product || ''} | ${item.group || ''} | ${item.model}`}>
                {item.model}
              </span>
              <span className={`badge ${badgeClass}`}>{item.outward}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  if (!userRole || userRole === 'Basic User') return null;

  return (
    <div>
      <h1 style={{ marginBottom: '1.5rem' }}>Dashboard</h1>

      {/* KPI Row */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div 
          className="stat-card clickable-kpi-card" 
          onClick={() => router.push('/products')}
          title="View Products Catalogue"
          aria-label="View Products Catalogue"
        >
          <div className="stat-label">Total SKUs</div>
          <div className="stat-value" style={{ color: 'var(--primary)' }}>{totalProducts}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Warehouses</div>
          <div className="stat-value" style={{ color: 'var(--success)' }}>{totalWarehouses}</div>
        </div>
        <div 
          className="stat-card clickable-kpi-card" 
          onClick={() => router.push('/reports')}
          title="View Transaction Reports"
          aria-label="View Transaction Reports"
        >
          <div className="stat-label">Total Transactions</div>
          <div className="stat-value" style={{ color: 'var(--accent)' }}>{totalTransactions}</div>
        </div>
        <div 
          className="stat-card clickable-kpi-card" 
          style={{ borderColor: totalLowStockItems > 0 ? '#fecaca' : undefined }}
          onClick={() => router.push('/stock')}
          title="View Low Stock Items"
          aria-label="View Low Stock Items"
        >
          <div className="stat-label">Low Stock (&lt;10)</div>
          <div className="stat-value" style={{ color: 'var(--danger)' }}>{totalLowStockItems}</div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="card">
          <h2 style={{ marginBottom: '1rem' }}>Stock by Warehouse</h2>
          <Bar options={{ ...chartBaseOpts, plugins: { legend: { display: false } } }} data={warehouseChartData} />
        </div>
        <div className="card">
          <h2 style={{ marginBottom: '1rem' }}>Movement Trend (6 Months)</h2>
          <Line options={chartBaseOpts} data={trendChartData} />
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="card mb-6">
        <h2 style={{ marginBottom: '1rem' }}>Recent Transactions</h2>
        {recentTxs.length === 0 ? (
          <p style={{ color: 'var(--foreground-muted)', fontSize: '0.875rem' }}>No transactions yet.</p>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Date / Time</th>
                  <th>Type</th>
                  <th>Model</th>
                  <th>Warehouse</th>
                  <th>Qty</th>
                  <th>User</th>
                </tr>
              </thead>
              <tbody>
                {recentTxs.map(tx => {
                  const item = initialData.items.find(i => i.id === tx.itemId);
                  const model = (tx.modelNumber || item?.model || 'Unknown').trim();
                  const wh = initialData.warehouses.find(w => w.id === tx.warehouseId)?.name || '—';
                  const d = new Date(tx.date);
                  return (
                    <tr key={tx.id}>
                      <td style={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                        {d.toLocaleDateString()}{' '}
                        <span style={{ color: 'var(--foreground-muted)' }}>{d.toLocaleTimeString()}</span>
                      </td>
                      <td><span className={`badge ${TYPE_BADGE[tx.type] || ''}`}>{tx.type}</span></td>
                      <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.8rem' }} title={model}>{model}</td>
                      <td style={{ fontSize: '0.8rem' }}>{wh}</td>
                      <td style={{ fontWeight: 700 }}>{tx.quantity}</td>
                      <td style={{ fontSize: '0.75rem', color: 'var(--foreground-muted)' }}>{tx.user}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Item Movement Analytics */}
      <h2 style={{ marginBottom: '1rem' }}>📊 Item Movement Analytics</h2>
      <div className="grid grid-cols-3 gap-4 mb-6">
        <VelocityList items={moversData.fast} label="🔥 Fast Moving" color="var(--danger)" badgeClass="velocity-fast" />
        <VelocityList items={moversData.moderate} label="⚡ Moderate" color="var(--warning)" badgeClass="velocity-moderate" />
        <VelocityList items={moversData.slow} label="🐢 Slow Moving" color="var(--success)" badgeClass="velocity-slow" />
      </div>

      {/* Transfer Analytics — simplified, no route tracking */}
      <h2 style={{ marginBottom: '1rem' }}>🔄 Transfer Analytics</h2>
      <div className="grid grid-cols-2 gap-4">
        <div className="card">
          <h3 style={{ marginBottom: '0.875rem' }}>Most Transferred Products</h3>
          {transferData.length === 0 ? (
            <p style={{ color: 'var(--foreground-muted)', fontSize: '0.875rem' }}>No transfers recorded yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {transferData.slice(0, 6).map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{
                    width: '22px', height: '22px', borderRadius: '50%', flexShrink: 0,
                    background: i === 0 ? 'var(--primary)' : '#e2e8f0',
                    color: i === 0 ? 'white' : 'var(--foreground-muted)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.7rem', fontWeight: 700,
                  }}>{i + 1}</span>
                  <span style={{ flex: 1, fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.model}>{item.model}</span>
                  <span className="badge badge-transfer">{item.qty} units</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h3 style={{ marginBottom: '0.875rem' }}>Least Transferred Products</h3>
          {transferData.length === 0 ? (
            <p style={{ color: 'var(--foreground-muted)', fontSize: '0.875rem' }}>No transfers recorded yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {[...transferData].reverse().slice(0, 6).map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontSize: '0.8rem', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.model}>{item.model}</span>
                  <span className="badge" style={{ background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0' }}>{item.qty} units</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <style>{`
        .clickable-kpi-card {
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .clickable-kpi-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(0, 0, 0, 0.05);
          border-color: var(--primary);
        }
        .clickable-kpi-card:active {
          transform: translateY(0);
        }
      `}</style>
    </div>
  );
}
