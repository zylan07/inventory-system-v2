"use client";

import { InventoryDb, Item } from "@/lib/db";
import { useState, useMemo } from "react";
import EmptyState from "@/components/EmptyState";

const PAGE_SIZE = 50;

type SortKey = 'group' | 'product' | 'model' | 'total';
type SortDir = 'asc' | 'desc';

export default function StockClient({ initialData }: { initialData: InventoryDb }) {
  const [search, setSearch] = useState("");
  const [warehouseFilter, setWarehouseFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>('group');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(1);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const itemAdjustments = useMemo(() => {
    const adjs: Record<string, number> = {};
    initialData.transactions.forEach(tx => {
      if (tx.type === 'ADJUSTMENT' && tx.itemId) {
        if (!adjs[tx.itemId]) adjs[tx.itemId] = 0;
        if (tx.adjustmentType === 'ADD') adjs[tx.itemId] += tx.quantity;
        if (tx.adjustmentType === 'SUBTRACT') adjs[tx.itemId] -= tx.quantity;
      }
    });
    return adjs;
  }, [initialData.transactions]);

  const downloadExcel = () => {
    const headers = ['Model No', 'Product', 'Total Quantity', 'Adjustment Quantity'];
    const rows = filteredSorted.map(item => {
      const total = Object.values(item.stock).reduce((s, n) => s + n, 0);
      const adj = itemAdjustments[item.id] || 0;
      return [`"${item.model}"`, `"${item.product}"`, total, adj];
    });
    
    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
      + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
      
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "stock_export.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
    setPage(1);
  };

  const sortArrow = (key: SortKey) => sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';

  const toggleExpand = (id: string) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredSorted = useMemo(() => {
    let items = initialData.items.filter(item => {
      const q = search.toLowerCase();
      if (search && !(
        item.model.toLowerCase().includes(q) ||
        item.product.toLowerCase().includes(q) ||
        item.group.toLowerCase().includes(q)
      )) return false;

      if (warehouseFilter) {
        if (!item.stock[warehouseFilter] || item.stock[warehouseFilter] === 0) return false;
      }
      return true;
    });

    items = [...items].sort((a, b) => {
      let va: string | number, vb: string | number;
      if (sortKey === 'total') {
        va = Object.values(a.stock).reduce((s, n) => s + n, 0);
        vb = Object.values(b.stock).reduce((s, n) => s + n, 0);
      } else {
        va = a[sortKey as 'group' | 'product' | 'model'];
        vb = b[sortKey as 'group' | 'product' | 'model'];
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return items;
  }, [initialData.items, search, warehouseFilter, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filteredSorted.length / PAGE_SIZE));
  const paginated = filteredSorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Summary stats
  const totalItems = filteredSorted.length;
  const totalStock = filteredSorted.reduce((sum, item) => {
    return sum + Object.values(item.stock).reduce((s, n) => s + n, 0);
  }, 0);
  const lowStockCount = filteredSorted.filter(item => {
    const total = Object.values(item.stock).reduce((s, n) => s + n, 0);
    return total < (item.minStock ?? 10);
  }).length;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <h1 style={{ margin: 0 }}>Stock Levels</h1>
        <button
          onClick={downloadExcel}
          style={{
            background: 'var(--primary)',
            color: 'white',
            padding: '0.625rem 1.25rem',
            borderRadius: 'var(--radius-sm)',
            fontWeight: 600,
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          📥 Download Excel
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="stat-card">
          <div className="stat-label">Total SKUs</div>
          <div className="stat-value" style={{ color: 'var(--primary)' }}>{totalItems}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Units</div>
          <div className="stat-value" style={{ color: 'var(--success)' }}>{totalStock.toLocaleString()}</div>
        </div>
        <div className="stat-card" style={{ borderColor: lowStockCount > 0 ? '#fecaca' : undefined }}>
          <div className="stat-label">Low Stock (&lt;10)</div>
          <div className="stat-value" style={{ color: 'var(--danger)' }}>{lowStockCount}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="card mb-4" style={{ display: 'flex', gap: '0.875rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '200px' }}>
          <label className="form-label mb-1">Search</label>
          <input
            type="text"
            placeholder="Model, product, or group..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <div style={{ minWidth: '200px' }}>
          <label className="form-label mb-1">Filter by Warehouse</label>
          <select
            value={warehouseFilter}
            onChange={e => { setWarehouseFilter(e.target.value); setPage(1); }}
          >
            <option value="">All Warehouses</option>
            {initialData.warehouses.map(w => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </div>
        {(search || warehouseFilter) && (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => { setSearch(''); setWarehouseFilter(''); setPage(1); }}
          >
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th className="sortable" onClick={() => handleSort('group')}>Group{sortArrow('group')}</th>
                <th className="sortable" onClick={() => handleSort('product')}>Product{sortArrow('product')}</th>
                <th className="sortable" onClick={() => handleSort('model')}>Model Number{sortArrow('model')}</th>
                {warehouseFilter ? (
                  <th className="sortable" onClick={() => handleSort('total')}>
                    {initialData.warehouses.find(w => w.id === warehouseFilter)?.name} Stock{sortArrow('total')}
                  </th>
                ) : (
                  <>
                    {initialData.warehouses.map(w => (
                      <th key={w.id}>{w.name}</th>
                    ))}
                    <th className="sortable" onClick={() => handleSort('total')}>Total Quantity{sortArrow('total')}</th>
                    <th>Adjustment Quantity</th>
                  </>
                )}
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map(item => {
                const total = Object.values(item.stock).reduce((s, n) => s + n, 0);
                const isLow = total < (item.minStock ?? 10);
                const displayStock = warehouseFilter ? item.stock[warehouseFilter] || 0 : total;

                return (
                  <tr key={item.id} style={{ background: isLow ? '#fef2f200' : 'transparent' }}>
                    <td style={{ color: 'var(--foreground-muted)', fontSize: '0.8rem' }}>{item.group}</td>
                    <td style={{ fontSize: '0.875rem' }}>{item.product}</td>
                    <td style={{ fontWeight: 600 }}>{item.model}</td>

                    {warehouseFilter ? (
                      <td style={{
                        fontWeight: 700,
                        color: displayStock < (item.minStock ?? 10) ? 'var(--danger)' : 'var(--success)',
                        fontSize: '1rem',
                      }}>
                        {displayStock}
                      </td>
                    ) : (
                      <>
                        {initialData.warehouses.map(w => {
                          const qty = item.stock[w.id] || 0;
                          return (
                            <td key={w.id} style={{
                              fontWeight: 500,
                              color: qty === 0 ? '#cbd5e1' : qty < (item.minStock ?? 10) ? 'var(--danger)' : 'var(--foreground)',
                            }}>
                              {qty}
                            </td>
                          );
                        })}
                        <td style={{
                          fontWeight: 700,
                          color: isLow ? 'var(--danger)' : 'var(--success)',
                          fontSize: '1rem',
                        }}>
                          {total}
                        </td>
                        <td style={{
                          fontWeight: 600,
                          color: (itemAdjustments[item.id] || 0) > 0 ? 'var(--success)' : (itemAdjustments[item.id] || 0) < 0 ? 'var(--danger)' : 'var(--foreground-muted)'
                        }}>
                          {itemAdjustments[item.id] > 0 ? `+${itemAdjustments[item.id]}` : (itemAdjustments[item.id] || 0)}
                        </td>
                      </>
                    )}

                    <td>
                      <span className={`badge ${isLow ? 'badge-low' : 'badge-ok'}`}>
                        {isLow ? 'Low' : 'OK'}
                      </span>
                    </td>
                  </tr>
                );
              })}

              {paginated.length === 0 && (
                <tr>
                  <td colSpan={12} style={{ padding: '2rem' }}>
                    {initialData.items.length === 0 ? (
                      <EmptyState type="stock" />
                    ) : (
                      <EmptyState 
                        type="search" 
                        onPrimaryAction={() => {
                          setSearch("");
                          setWarehouseFilter("");
                          setPage(1);
                        }} 
                      />
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0.875rem 1rem',
          borderTop: '1px solid var(--border)',
          background: 'var(--secondary)',
        }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--foreground-muted)' }}>
            Showing {Math.min((page - 1) * PAGE_SIZE + 1, filteredSorted.length)}–{Math.min(page * PAGE_SIZE, filteredSorted.length)} of {filteredSorted.length} items
          </span>
          <div className="pagination">
            <button className="page-btn" onClick={() => setPage(1)} disabled={page === 1}>«</button>
            <button className="page-btn" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>‹</button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const p = Math.max(1, Math.min(totalPages - 4, page - 2)) + i;
              return (
                <button key={p} className={`page-btn ${p === page ? 'active' : ''}`} onClick={() => setPage(p)}>
                  {p}
                </button>
              );
            })}
            <button className="page-btn" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>›</button>
            <button className="page-btn" onClick={() => setPage(totalPages)} disabled={page === totalPages}>»</button>
          </div>
        </div>
      </div>
    </div>
  );
}
