"use client";

import { useState, useMemo } from 'react';
import { InventoryDb, Transaction } from '@/lib/db';
import { useAuth } from '@/components/AuthProvider';

const PAGE_SIZE = 50;

type SortKey = 'date' | 'type' | 'model' | 'user' | 'quantity';
type SortDir = 'asc' | 'desc';
type ActiveTab = 'transactions' | 'stock-report';

const TYPE_BADGE: Record<string, string> = {
  INWARD: 'badge-inward',
  OUTWARD: 'badge-outward',
  TRANSFER: 'badge-transfer',
  ADJUSTMENT: 'badge-adjustment',
};

export default function ReportsClient({ initialData }: { initialData: InventoryDb }) {
  const { userRole } = useAuth();
  const [activeTab, setActiveTab] = useState<ActiveTab>('transactions');

  // ── Transaction filters ──
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [searchModel, setSearchModel] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(1);

  // ── Stock report ──
  const [reportMonth, setReportMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const resolveItem = (tx: Transaction) => initialData.items.find(i => i.id === tx.itemId) || null;

  const getRow = (tx: Transaction) => {
    const item = resolveItem(tx);
    const modelNumber = (tx.modelNumber || item?.model || 'Unknown').trim();
    const fromWh = initialData.warehouses.find(w => w.id === tx.warehouseId)?.name || 'N/A';
    const toWh = tx.toWarehouseId
      ? initialData.warehouses.find(w => w.id === tx.toWarehouseId)?.name || 'N/A'
      : '-';
    return { modelNumber, fromWh, toWh, item };
  };

  const filteredTx = useMemo(() => {
    let txs = initialData.transactions.filter(tx => {
      const d = new Date(tx.date);
      if (dateFrom && d < new Date(dateFrom)) return false;
      if (dateTo) {
        const toD = new Date(dateTo);
        toD.setHours(23, 59, 59);
        if (d > toD) return false;
      }
      if (typeFilter && tx.type !== typeFilter) return false;
      if (searchModel) {
        const model = (tx.modelNumber || resolveItem(tx)?.model || '').toLowerCase();
        if (!model.includes(searchModel.toLowerCase())) return false;
      }
      return true;
    });

    txs = [...txs].sort((a, b) => {
      let va: string | number, vb: string | number;
      switch (sortKey) {
        case 'date': va = a.date; vb = b.date; break;
        case 'type': va = a.type; vb = b.type; break;
        case 'model': va = a.modelNumber || ''; vb = b.modelNumber || ''; break;
        case 'user': va = a.user; vb = b.user; break;
        case 'quantity': va = a.quantity; vb = b.quantity; break;
        default: va = a.date; vb = b.date;
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return txs;
  }, [initialData, dateFrom, dateTo, typeFilter, searchModel, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filteredTx.length / PAGE_SIZE));
  const paginated = filteredTx.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
    setPage(1);
  };
  const sortArrow = (key: SortKey) => sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';

  // ── Opening/Closing Stock Report ──
  const stockReport = useMemo(() => {
    if (!reportMonth) return [];
    const [y, m] = reportMonth.split('-').map(Number);
    const monthStart = new Date(y, m - 1, 1);
    const monthEnd = new Date(y, m, 0, 23, 59, 59);

    return initialData.items.map(item => {
      // Current stock is "closing stock"
      const closing = Object.values(item.stock).reduce((s, n) => s + n, 0);

      // Compute what happened during the month
      let inwardThisMonth = 0;
      let outwardThisMonth = 0;
      let adjustmentThisMonth = 0;

      initialData.transactions.forEach(tx => {
        if (tx.itemId !== item.id) return;
        const d = new Date(tx.date);
        if (d < monthStart || d > monthEnd) return;
        if (tx.type === 'INWARD') inwardThisMonth += tx.quantity;
        else if (tx.type === 'OUTWARD') outwardThisMonth += tx.quantity;
        else if (tx.type === 'ADJUSTMENT') adjustmentThisMonth += tx.quantity;
      });

      // Opening = Closing - Inward + Outward (reverse the month's net change)
      const opening = closing - inwardThisMonth + outwardThisMonth;

      return {
        id: item.id,
        group: item.group,
        product: item.product,
        model: item.model.trim(),
        opening: Math.max(0, opening),
        inward: inwardThisMonth,
        outward: outwardThisMonth,
        closing,
      };
    }).sort((a, b) => a.group.localeCompare(b.group) || a.model.localeCompare(b.model));
  }, [initialData, reportMonth]);

  // ── Exports ──
  const handleExportCSV = () => {
    let csv = 'Date,Time,Type,Model Number,Product,Group,From Warehouse,To Warehouse,Quantity,User,Reason,Notes\n';
    filteredTx.forEach(tx => {
      const { modelNumber, fromWh, toWh, item } = getRow(tx);
      const d = new Date(tx.date);
      csv += [
        d.toLocaleDateString(), d.toLocaleTimeString(), tx.type,
        `"${modelNumber}"`, `"${item?.product || ''}"`, `"${item?.group || ''}"`,
        `"${fromWh}"`, `"${toWh}"`, tx.quantity, tx.user,
        tx.adjustmentReason || '', `"${tx.notes || ''}"`,
      ].join(',') + '\n';
    });
    download(csv, 'text/csv', `inventra-transactions-${reportMonth}.csv`);
  };

  const handleExportStockCSV = () => {
    let csv = 'Group,Product,Model Number,Opening Stock,Inward,Outward,Closing Stock\n';
    stockReport.forEach(r => {
      csv += `"${r.group}","${r.product}","${r.model}",${r.opening},${r.inward},${r.outward},${r.closing}\n`;
    });
    download(csv, 'text/csv', `inventra-stock-report-${reportMonth}.csv`);
  };

  const handleExportExcel = async () => {
    try {
      const XLSX = await import('xlsx');
      const rows = filteredTx.map(tx => {
        const { modelNumber, fromWh, toWh, item } = getRow(tx);
        const d = new Date(tx.date);
        return {
          Date: d.toLocaleDateString(), Time: d.toLocaleTimeString(), Type: tx.type,
          'Model Number': modelNumber, Product: item?.product || '', Group: item?.group || '',
          'From Warehouse': fromWh, 'To Warehouse': toWh, Quantity: tx.quantity,
          User: tx.user, Reason: tx.adjustmentReason || '', Notes: tx.notes || '',
        };
      });
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Transactions');
      XLSX.writeFile(wb, `inventra-report-${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch { alert('Excel export failed.'); }
  };

  const handleExportStockExcel = async () => {
    try {
      const XLSX = await import('xlsx');
      const ws = XLSX.utils.json_to_sheet(stockReport.map(r => ({
        Group: r.group, Product: r.product, 'Model Number': r.model,
        'Opening Stock': r.opening, Inward: r.inward, Outward: r.outward, 'Closing Stock': r.closing,
      })));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Stock Report');
      XLSX.writeFile(wb, `inventra-stock-report-${reportMonth}.xlsx`);
    } catch { alert('Excel export failed.'); }
  };

  const handleExportPDF = async () => {
    try {
      const { default: jsPDF } = await import('jspdf');
      const autoTable = (await import('jspdf-autotable')).default;
      const doc = new jsPDF({ orientation: 'landscape' });
      doc.setFontSize(13);
      doc.text('Inventra — Transaction Report', 14, 15);
      doc.setFontSize(9);
      doc.text(`Generated: ${new Date().toLocaleString()} | Records: ${filteredTx.length}`, 14, 22);
      autoTable(doc, {
        startY: 28,
        head: [['Date', 'Time', 'Type', 'Model Number', 'From WH', 'To WH', 'Qty', 'User']],
        body: filteredTx.map(tx => {
          const { modelNumber, fromWh, toWh } = getRow(tx);
          const d = new Date(tx.date);
          return [d.toLocaleDateString(), d.toLocaleTimeString(), tx.type, modelNumber, fromWh, toWh, tx.quantity, tx.user];
        }),
        styles: { fontSize: 7, cellPadding: 2 },
        headStyles: { fillColor: [37, 99, 235] },
        alternateRowStyles: { fillColor: [248, 250, 252] },
      });
      doc.save(`inventra-report-${new Date().toISOString().split('T')[0]}.pdf`);
    } catch { alert('PDF export failed.'); }
  };

  const handleExportStockPDF = async () => {
    try {
      const { default: jsPDF } = await import('jspdf');
      const autoTable = (await import('jspdf-autotable')).default;
      const doc = new jsPDF({ orientation: 'landscape' });
      doc.setFontSize(13);
      doc.text(`Inventra — Stock Report (${reportMonth})`, 14, 15);
      doc.setFontSize(9);
      doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 22);
      autoTable(doc, {
        startY: 28,
        head: [['Group', 'Product', 'Model Number', 'Opening', 'Inward', 'Outward', 'Closing']],
        body: stockReport.map(r => [r.group, r.product, r.model, r.opening, r.inward, r.outward, r.closing]),
        styles: { fontSize: 7, cellPadding: 2 },
        headStyles: { fillColor: [37, 99, 235] },
        alternateRowStyles: { fillColor: [248, 250, 252] },
      });
      doc.save(`inventra-stock-report-${reportMonth}.pdf`);
    } catch { alert('PDF export failed.'); }
  };

  function download(content: string, type: string, filename: string) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.875rem' }}>
        <h1>Reports</h1>

        {/* Tab Switcher */}
        <div className="toggle-group" style={{ maxWidth: '380px' }}>
          <button
            type="button"
            className={`toggle-btn ${activeTab === 'transactions' ? 'active-add' : ''}`}
            onClick={() => setActiveTab('transactions')}
          >
            📄 Transactions
          </button>
          <button
            type="button"
            className={`toggle-btn ${activeTab === 'stock-report' ? 'active-add' : ''}`}
            onClick={() => setActiveTab('stock-report')}
          >
            📊 Stock Report
          </button>
        </div>
      </div>

      {/* ─────────────── TRANSACTIONS TAB ─────────────── */}
      {activeTab === 'transactions' && (
        <>
          {/* Filters */}
          <div className="card mb-4" style={{ display: 'flex', gap: '0.875rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: 1, minWidth: '150px' }}>
              <label className="form-label mb-1">Search Model</label>
              <input type="text" placeholder="Model number..." value={searchModel}
                onChange={e => { setSearchModel(e.target.value); setPage(1); }} />
            </div>
            <div style={{ minWidth: '140px' }}>
              <label className="form-label mb-1">From Date</label>
              <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} />
            </div>
            <div style={{ minWidth: '140px' }}>
              <label className="form-label mb-1">To Date</label>
              <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }} />
            </div>
            <div style={{ minWidth: '130px' }}>
              <label className="form-label mb-1">Type</label>
              <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1); }}>
                <option value="">All Types</option>
                <option value="INWARD">Inward</option>
                <option value="OUTWARD">Outward</option>
                <option value="TRANSFER">Transfer</option>
                <option value="ADJUSTMENT">Adjustment</option>
              </select>
            </div>
            {(searchModel || dateFrom || dateTo || typeFilter) && (
              <button className="btn-secondary" onClick={() => { setSearchModel(''); setDateFrom(''); setDateTo(''); setTypeFilter(''); setPage(1); }}>
                Clear
              </button>
            )}
          </div>

          {/* Export buttons */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--foreground-muted)', flex: 1 }}>{filteredTx.length} records</span>
            <button onClick={handleExportPDF} className="btn-secondary">📄 PDF</button>
            <button onClick={handleExportCSV} className="btn-secondary">📊 CSV</button>
            {userRole === 'Admin' && (
              <button onClick={handleExportExcel} className="btn-primary">📗 Excel</button>
            )}
          </div>

          {/* Table */}
          <div className="card" style={{ padding: 0 }}>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th className="sortable" onClick={() => handleSort('date')}>Date / Time{sortArrow('date')}</th>
                    <th className="sortable" onClick={() => handleSort('type')}>Type{sortArrow('type')}</th>
                    <th className="sortable" onClick={() => handleSort('model')}>Model Number{sortArrow('model')}</th>
                    <th>From Warehouse</th>
                    <th>To Warehouse</th>
                    <th className="sortable" onClick={() => handleSort('quantity')}>Qty{sortArrow('quantity')}</th>
                    <th className="sortable" onClick={() => handleSort('user')}>User{sortArrow('user')}</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map(tx => {
                    const { modelNumber, fromWh, toWh } = getRow(tx);
                    const d = new Date(tx.date);
                    return (
                      <tr key={tx.id}>
                        <td style={{ whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
                          <div>{d.toLocaleDateString()}</div>
                          <div style={{ color: 'var(--foreground-muted)', fontSize: '0.7rem' }}>{d.toLocaleTimeString()}</div>
                        </td>
                        <td><span className={`badge ${TYPE_BADGE[tx.type] || ''}`}>{tx.type}</span></td>
                        <td style={{ fontWeight: 600, maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{modelNumber}</td>
                        <td style={{ fontSize: '0.8rem' }}>{fromWh}</td>
                        <td style={{ fontSize: '0.8rem', color: toWh === '-' ? '#cbd5e1' : 'inherit' }}>{toWh}</td>
                        <td style={{ fontWeight: 700 }}>{tx.quantity}</td>
                        <td style={{ fontSize: '0.8rem', color: 'var(--foreground-muted)' }}>{tx.user}</td>
                        <td style={{ fontSize: '0.75rem', color: 'var(--foreground-muted)', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {tx.notes || tx.adjustmentReason || '—'}
                        </td>
                      </tr>
                    );
                  })}
                  {paginated.length === 0 && (
                    <tr><td colSpan={8} style={{ textAlign: 'center', padding: '3rem', color: 'var(--foreground-muted)' }}>No records found</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.875rem 1rem', borderTop: '1px solid var(--border)', background: 'var(--secondary)', flexWrap: 'wrap', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--foreground-muted)' }}>
                Page {page} of {totalPages}
              </span>
              <div className="pagination">
                <button className="page-btn" onClick={() => setPage(1)} disabled={page === 1}>«</button>
                <button className="page-btn" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>‹</button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const p = Math.max(1, Math.min(totalPages - 4, page - 2)) + i;
                  return p <= totalPages ? (
                    <button key={p} className={`page-btn ${p === page ? 'active' : ''}`} onClick={() => setPage(p)}>{p}</button>
                  ) : null;
                })}
                <button className="page-btn" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>›</button>
                <button className="page-btn" onClick={() => setPage(totalPages)} disabled={page === totalPages}>»</button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ─────────────── STOCK REPORT TAB ─────────────── */}
      {activeTab === 'stock-report' && (
        <>
          <div className="card mb-4" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <label className="form-label mb-1">Month</label>
              <input type="month" value={reportMonth} onChange={e => setReportMonth(e.target.value)} style={{ width: 'auto' }} />
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button onClick={handleExportStockPDF} className="btn-secondary">📄 PDF</button>
              <button onClick={handleExportStockCSV} className="btn-secondary">📊 CSV</button>
              {userRole === 'Admin' && (
                <button onClick={handleExportStockExcel} className="btn-primary">📗 Excel</button>
              )}
            </div>
          </div>

          {/* Summary bar */}
          <div className="grid grid-cols-4 gap-4 mb-4">
            {(() => {
              const totalOpening = stockReport.reduce((s, r) => s + r.opening, 0);
              const totalInward = stockReport.reduce((s, r) => s + r.inward, 0);
              const totalOutward = stockReport.reduce((s, r) => s + r.outward, 0);
              const totalClosing = stockReport.reduce((s, r) => s + r.closing, 0);
              return (
                <>
                  <div className="stat-card"><div className="stat-label">Opening Stock</div><div className="stat-value" style={{ color: 'var(--foreground)' }}>{totalOpening.toLocaleString()}</div></div>
                  <div className="stat-card"><div className="stat-label">Total Inward</div><div className="stat-value" style={{ color: 'var(--success)' }}>+{totalInward.toLocaleString()}</div></div>
                  <div className="stat-card"><div className="stat-label">Total Outward</div><div className="stat-value" style={{ color: 'var(--danger)' }}>-{totalOutward.toLocaleString()}</div></div>
                  <div className="stat-card"><div className="stat-label">Closing Stock</div><div className="stat-value" style={{ color: 'var(--primary)' }}>{totalClosing.toLocaleString()}</div></div>
                </>
              );
            })()}
          </div>

          <div className="card" style={{ padding: 0 }}>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Group</th>
                    <th>Product</th>
                    <th>Model Number</th>
                    <th style={{ textAlign: 'right' }}>Opening</th>
                    <th style={{ textAlign: 'right', color: 'var(--success)' }}>Inward</th>
                    <th style={{ textAlign: 'right', color: 'var(--danger)' }}>Outward</th>
                    <th style={{ textAlign: 'right' }}>Closing</th>
                  </tr>
                </thead>
                <tbody>
                  {stockReport.map(row => (
                    <tr key={row.id}>
                      <td style={{ fontSize: '0.78rem', color: 'var(--foreground-muted)' }}>{row.group}</td>
                      <td style={{ fontSize: '0.8rem' }}>{row.product}</td>
                      <td style={{ fontWeight: 600, fontSize: '0.85rem' }}>{row.model}</td>
                      <td style={{ textAlign: 'right' }}>{row.opening}</td>
                      <td style={{ textAlign: 'right', color: row.inward > 0 ? 'var(--success)' : 'inherit', fontWeight: row.inward > 0 ? 600 : 400 }}>
                        {row.inward > 0 ? `+${row.inward}` : '0'}
                      </td>
                      <td style={{ textAlign: 'right', color: row.outward > 0 ? 'var(--danger)' : 'inherit', fontWeight: row.outward > 0 ? 600 : 400 }}>
                        {row.outward > 0 ? `-${row.outward}` : '0'}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{row.closing}</td>
                    </tr>
                  ))}
                  {stockReport.length === 0 && (
                    <tr><td colSpan={7} style={{ textAlign: 'center', padding: '3rem', color: 'var(--foreground-muted)' }}>No data</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
