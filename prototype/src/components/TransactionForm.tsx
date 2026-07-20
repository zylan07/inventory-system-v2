"use client";

import { useAuth } from '@/components/AuthProvider';
import { InventoryDb } from '@/lib/db';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import ProductSelector, { ProductSelection } from '@/components/ProductSelector';
import { apiFetch } from '@/lib/apiFetch';
import { useToast } from '@/components/ToastProvider';

type TransactionType = 'INWARD' | 'OUTWARD' | 'TRANSFER';

const EMPTY_SELECTION: ProductSelection = { group: '', product: '', model: '', itemId: '' };

export default function TransactionForm({ db, type, refresh }: { db: InventoryDb; type: TransactionType; refresh: () => void }) {
  const { userRole } = useAuth();
  const router = useRouter();
  const [selection, setSelection] = useState<ProductSelection>(EMPTY_SELECTION);
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [toWarehouse, setToWarehouse] = useState('');
  const [quantity, setQuantity] = useState<number>(1);
  const [narration, setNarration] = useState('');
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  // Searchable client states
  const [clients, setClients] = useState<any[]>([]);
  const [clientSearch, setClientSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState<any | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    if (type === 'OUTWARD') {
      apiFetch('/clients/all')
        .then(res => res.json())
        .then(json => {
          if (json.success && Array.isArray(json.data)) {
            setClients(json.data);
          }
        })
        .catch(err => console.error("Failed to load clients:", err));
    }
  }, [type]);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.form-group')) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, []);

  const currentItem = db.items.find(i => i.id === selection.itemId);
  const currentStock = currentItem && selectedWarehouse ? currentItem.stock[selectedWarehouse] || 0 : 0;

  // Warehouse-wise stock for selected item
  const warehouseStocks = currentItem
    ? db.warehouses.map(w => ({ id: w.id, name: w.name, qty: currentItem.stock[w.id] || 0 }))
    : [];

  const totalItemStock = currentItem
    ? Object.values(currentItem.stock).reduce((a, b) => a + b, 0)
    : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selection.itemId) { showToast('Please select a product/model.', 'error'); return; }
    if (type === 'OUTWARD' && !selectedClient) {
      showToast('Please select a client before confirming the outward transaction.', 'error');
      return;
    }
    setLoading(true);
    try {
      const payload = {
        type,
        product_id: parseInt(selection.itemId),
        quantity,
        warehouse_id: selectedWarehouse,
        to_warehouse_id: type === 'TRANSFER' ? toWarehouse : undefined,
        client_id: type === 'OUTWARD' && selectedClient ? selectedClient.id : undefined,
        narration: type === 'OUTWARD' ? (selectedClient ? `Sale to ${selectedClient.company_name}` : 'Direct Sale') : undefined,
      };

      const res = await apiFetch('/transactions', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Transaction failed');
      }

console.log("TOAST TRIGGERED");

      // Local mapping removed: relying natively on refresh callback
      if (refresh) refresh();

      showToast(`${type} transaction recorded successfully!`, 'success');

      setTimeout(() => {
        if (refresh) refresh();
      }, 1500);

      setSelection(EMPTY_SELECTION);
      setQuantity(1);
      setSelectedWarehouse('');
      setToWarehouse('');
      setNarration('');
      setSelectedClient(null);
      setClientSearch('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Transaction failed';
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const isBasicUser = userRole === 'Basic User';
  const inputFontSize = isBasicUser ? '1rem' : '0.875rem';
  const inputPadding = isBasicUser ? '0.875rem 1rem' : '0.625rem 0.875rem';

  const typeColors: Record<string, string> = {
    INWARD: '#059669',
    OUTWARD: '#dc2626',
    TRANSFER: '#2563eb',
  };
  const typeColor = typeColors[type] || '#2563eb';
  const typeIcons: Record<string, string> = { INWARD: '📥', OUTWARD: '📤', TRANSFER: '🔄' };

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: '640px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{
        background: `linear-gradient(135deg, ${typeColor}18, ${typeColor}08)`,
        border: `1.5px solid ${typeColor}30`,
        borderRadius: 'var(--radius)',
        padding: '1rem 1.25rem',
        marginBottom: '1.25rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem'
      }}>
        <span style={{ fontSize: isBasicUser ? '2rem' : '1.5rem' }}>{typeIcons[type]}</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: isBasicUser ? '1.25rem' : '1rem', color: typeColor }}>
            {type === 'INWARD' ? 'Add Stock (Inward)' : type === 'OUTWARD' ? 'Deduct Stock (Outward)' : 'Transfer Between Warehouses'}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--foreground-muted)' }}>
            Logged as: <strong>{userRole}</strong>
          </div>
        </div>
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {/* Product Selector */}
        <div className="form-group">
          <label className="form-label" style={{ fontSize: isBasicUser ? '1rem' : '0.875rem' }}>
            Product / Model Selection
          </label>
          <ProductSelector db={db} value={selection} onChange={setSelection} isBasicUser={isBasicUser} />
        </div>

        <hr className="divider" />

        {/* Warehouse selection */}
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ flex: 1, minWidth: '180px' }}>
            <label className="form-label" style={{ fontSize: isBasicUser ? '1rem' : '0.875rem' }}>
              {type === 'TRANSFER' ? 'From Warehouse' : 'Warehouse'}
            </label>
            <select
              value={selectedWarehouse}
              onChange={e => setSelectedWarehouse(e.target.value)}
              required
              style={{ fontSize: inputFontSize, padding: inputPadding }}
            >
              <option value="">Select Warehouse...</option>
              {db.warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>

          {type === 'TRANSFER' && (
            <div className="form-group" style={{ flex: 1, minWidth: '180px' }}>
              <label className="form-label">To Warehouse</label>
              <select
                value={toWarehouse}
                onChange={e => setToWarehouse(e.target.value)}
                required
                style={{ fontSize: inputFontSize, padding: inputPadding }}
              >
                <option value="">Select Warehouse...</option>
                {db.warehouses.filter(w => w.id !== selectedWarehouse).map(w => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Stock info panel */}
        {currentItem && (
          <div style={{
            background: 'var(--secondary)',
            borderRadius: 'var(--radius-sm)',
            padding: '1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
            border: '1px solid var(--border)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--foreground-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Stock Availability
              </div>
              <div style={{
                background: 'var(--primary-light)',
                color: 'var(--primary-dark)',
                padding: '0.25rem 0.75rem',
                borderRadius: '9999px',
                fontSize: '0.85rem',
                fontWeight: 700,
                border: '1px solid var(--primary)',
              }}>
                Total System Stock: {totalItemStock}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              {warehouseStocks.map(ws => (
                <div key={ws.id} style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  background: 'white',
                  border: `2px solid ${ws.id === selectedWarehouse ? 'var(--primary)' : 'var(--border)'}`,
                  borderRadius: 'var(--radius-sm)',
                  padding: '0.5rem 0.75rem',
                  minWidth: '90px',
                  transition: 'var(--transition)'
                }}>
                  <span style={{ fontSize: isBasicUser ? '1.5rem' : '1.25rem', fontWeight: 700, color: ws.qty < 10 ? 'var(--danger)' : 'var(--success)' }}>
                    {ws.qty}
                  </span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--foreground-muted)', textAlign: 'center' }}>{ws.name}</span>
                </div>
              ))}
            </div>
            {selectedWarehouse && (
              <div style={{ fontSize: '0.8rem', color: 'var(--foreground-muted)' }}>
                Current stock in selected warehouse: <strong style={{ color: currentStock < 10 ? 'var(--danger)' : 'var(--success)' }}>{currentStock} units</strong>
              </div>
            )}
          </div>
        )}

        {/* Client Selector (OUTWARD) & Quantity */}
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', width: '100%' }}>
          {type === 'OUTWARD' && (
            <div className="form-group" style={{ flex: 2, minWidth: '200px', position: 'relative' }}>
              <label className="form-label" style={{ fontSize: isBasicUser ? '1rem' : '0.875rem' }}>
                Client Selection (Optional)
              </label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input
                  type="text"
                  value={clientSearch}
                  onFocus={() => setShowDropdown(true)}
                  onChange={e => {
                    setClientSearch(e.target.value);
                    if (selectedClient && e.target.value !== selectedClient.company_name) {
                      setSelectedClient(null);
                    }
                  }}
                  placeholder="Search by client name, contact, phone..."
                  style={{
                    fontSize: inputFontSize,
                    padding: inputPadding,
                    width: '100%'
                  }}
                />
                {clientSearch && (
                  <button
                    type="button"
                    onClick={() => {
                      setClientSearch('');
                      setSelectedClient(null);
                      setShowDropdown(false);
                    }}
                    style={{
                      position: 'absolute',
                      right: '10px',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '1rem',
                      color: 'var(--foreground-muted)'
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>

              {showDropdown && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  background: 'white',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                  zIndex: 100,
                  maxHeight: '200px',
                  overflowY: 'auto',
                  marginTop: '4px'
                }}>
                  {clients.filter(c => {
                    const q = clientSearch.toLowerCase();
                    return !q || 
                      (c.company_name || '').toLowerCase().includes(q) ||
                      (c.contact_person || '').toLowerCase().includes(q) ||
                      (c.phone || '').toLowerCase().includes(q) ||
                      (c.email || '').toLowerCase().includes(q);
                  }).length === 0 ? (
                    <div style={{ padding: '0.75rem', fontSize: '0.85rem', color: 'var(--foreground-muted)' }}>
                      No matching clients found
                    </div>
                  ) : (
                    clients.filter(c => {
                      const q = clientSearch.toLowerCase();
                      return !q || 
                        (c.company_name || '').toLowerCase().includes(q) ||
                        (c.contact_person || '').toLowerCase().includes(q) ||
                        (c.phone || '').toLowerCase().includes(q) ||
                        (c.email || '').toLowerCase().includes(q);
                    }).map(c => (
                      <div
                        key={c.id}
                        onClick={() => {
                          setSelectedClient(c);
                          setClientSearch(c.company_name);
                          setShowDropdown(false);
                        }}
                        style={{
                          padding: '0.625rem 0.75rem',
                          cursor: 'pointer',
                          fontSize: '0.85rem',
                          borderBottom: '1px solid #f1f5f9',
                          background: selectedClient?.id === c.id ? '#f1f5f9' : 'transparent',
                          transition: 'background 0.2s'
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                        onMouseLeave={e => e.currentTarget.style.background = selectedClient?.id === c.id ? '#f1f5f9' : 'transparent'}
                      >
                        <div style={{ fontWeight: 600, color: 'var(--foreground)' }}>{c.company_name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--foreground-muted)', display: 'flex', gap: '0.5rem', marginTop: '2px' }}>
                          <span>👤 {c.contact_person || 'N/A'}</span>
                          {c.phone && <span>📞 {c.phone}</span>}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
          <div className="form-group" style={{ flex: 1, minWidth: '120px' }}>
            <label className="form-label" style={{ fontSize: isBasicUser ? '1rem' : '0.875rem' }}>Quantity</label>
            <input
              type="number"
              value={quantity}
              onChange={e => setQuantity(Number(e.target.value))}
              autoComplete="off"
              min={1}
              max={type === 'OUTWARD' || type === 'TRANSFER' ? currentStock : 1000000}
              required
              style={{
                fontSize: isBasicUser ? '1.5rem' : '1rem',
                padding: isBasicUser ? '0.875rem 1rem' : '0.625rem 0.875rem',
                textAlign: 'center',
                fontWeight: 700,
              }}
            />
            {(type === 'OUTWARD' || type === 'TRANSFER') && currentStock > 0 && (
              <span className="form-hint">Max: {currentStock}</span>
            )}
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading || !selection.itemId || (type === 'OUTWARD' && !selectedClient)}
          style={{
            background: typeColor,
            color: 'white',
            padding: isBasicUser ? '1rem 1.5rem' : '0.75rem 1.25rem',
            borderRadius: 'var(--radius-sm)',
            fontSize: isBasicUser ? '1.1rem' : '0.875rem',
            fontWeight: 700,
            border: 'none',
            cursor: loading || !selection.itemId || (type === 'OUTWARD' && !selectedClient) ? 'not-allowed' : 'pointer',
            opacity: loading || !selection.itemId || (type === 'OUTWARD' && !selectedClient) ? 0.6 : 1,
            transition: 'var(--transition)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            width: '100%',
          }}
        >
          {loading ? '⏳ Processing...' : `${typeIcons[type]} Confirm ${type}`}
        </button>
      </div>
    </form>
  );
}
