"use client";

import { useAuth } from '@/components/AuthProvider';
import { InventoryDb } from '@/lib/db';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import ProductSelector, { ProductSelection } from '@/components/ProductSelector';
import { apiFetch } from '@/lib/apiFetch';
import { useToast } from '@/components/ToastProvider';

const EMPTY_SELECTION: ProductSelection = { group: '', product: '', model: '', itemId: '' };

const ADJUSTMENT_REASONS = [
  { value: 'damage', label: '⚠️ Damage / Write-off' },
  { value: 'correction', label: '✏️ Data Correction' },
  { value: 'return', label: '↩️ Customer Return' },
  { value: 'expiry', label: '🗓️ Expiry / Obsolete' },
  { value: 'found', label: '🔍 Found / Unrecorded Stock' },
  { value: 'theft', label: '🔒 Theft / Loss' },
  { value: 'audit', label: '📋 Physical Audit' },
  { value: 'other', label: '📝 Other' },
];

export default function AdjustmentClient({ db, refresh }: { db: InventoryDb; refresh: () => void }) {
  const { userRole } = useAuth();
  const router = useRouter();
  const [selection, setSelection] = useState<ProductSelection>(EMPTY_SELECTION);
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [adjustmentType, setAdjustmentType] = useState<'ADD' | 'SUBTRACT'>('ADD');
  const [quantity, setQuantity] = useState<number>(1);
  const [reason, setReason] = useState('correction');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  const currentItem = db.items.find(i => i.id === selection.itemId);
  const currentStock = currentItem && selectedWarehouse ? currentItem.stock[selectedWarehouse] || 0 : 0;
  const warehouseStocks = currentItem
    ? db.warehouses.map(w => ({ id: w.id, name: w.name, qty: currentItem.stock[w.id] || 0 }))
    : [];

  const totalItemStock = currentItem
    ? Object.values(currentItem.stock).reduce((a, b) => a + b, 0)
    : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selection.itemId) { showToast('Please select a product/model.', 'error'); return; }
    if (!selectedWarehouse) { showToast('Please select a warehouse.', 'error'); return; }
    setLoading(true);
    
    try {
      const payload = {
        type: 'ADJUSTMENT',
        product_id: parseInt(selection.itemId),
        quantity,
        warehouse_id: selectedWarehouse,
        adjustmentType: adjustmentType,
        narration: `[ADJUSTMENT - ${adjustmentType} - ${reason}] ${notes.trim()}`.trim(),
      };

      const res = await apiFetch('/transactions', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || 'Failed to process adjustment');
      }

      if (refresh) refresh();

      const action = adjustmentType === 'ADD' ? 'added to' : 'deducted from';
      showToast(`${quantity} units ${action} stock successfully!`, 'success');
      setSelection(EMPTY_SELECTION);
      setQuantity(1);
      setSelectedWarehouse('');
      setNotes('');
      setReason('correction');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Adjustment failed';
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const projectedStock = adjustmentType === 'ADD'
    ? currentStock + quantity
    : Math.max(0, currentStock - quantity);
  const canSubmit = selection.itemId && selectedWarehouse && quantity > 0;

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: '640px', margin: '0 auto' }}>
      {/* Header Banner */}
      <div style={{
        background: 'linear-gradient(135deg, #7c3aed18, #7c3aed08)',
        border: '1.5px solid #7c3aed30',
        borderRadius: 'var(--radius)',
        padding: '1rem 1.25rem',
        marginBottom: '1.25rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem'
      }}>
        <span style={{ fontSize: '1.5rem' }}>⚖️</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: '1rem', color: '#7c3aed' }}>
            Physical Stock Adjustment
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--foreground-muted)' }}>
            Admin only — All adjustments are logged with reason &amp; notes
          </div>
        </div>
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {/* Product Selector */}
        <div className="form-group">
          <label className="form-label">Product / Model Selection</label>
          <ProductSelector db={db} value={selection} onChange={setSelection} />
        </div>

        <hr className="divider" />

        {/* Warehouse */}
        <div className="form-group">
          <label className="form-label">Warehouse</label>
          <select
            value={selectedWarehouse}
            onChange={e => setSelectedWarehouse(e.target.value)}
            required
          >
            <option value="">Select Warehouse...</option>
            {db.warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>

        {/* Stock info */}
        {currentItem && (
          <div style={{
            background: 'var(--secondary)',
            borderRadius: 'var(--radius-sm)',
            padding: '1rem',
            border: '1px solid var(--border)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--foreground-muted)', textTransform: 'uppercase' }}>
                Warehouse Stock
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
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              {warehouseStocks.map(ws => (
                <div key={ws.id} style={{
                  background: 'white',
                  border: `2px solid ${ws.id === selectedWarehouse ? '#7c3aed' : 'var(--border)'}`,
                  borderRadius: 'var(--radius-sm)',
                  padding: '0.5rem 0.75rem',
                  minWidth: '80px',
                  textAlign: 'center',
                }}>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: ws.qty < 10 ? 'var(--danger)' : 'var(--foreground)' }}>{ws.qty}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--foreground-muted)' }}>{ws.name}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Adjustment Type Toggle */}
        <div className="form-group">
          <label className="form-label">Adjustment Type</label>
          <div className="toggle-group">
            <button
              type="button"
              className={`toggle-btn ${adjustmentType === 'ADD' ? 'active-add' : ''}`}
              onClick={() => setAdjustmentType('ADD')}
            >
              + Add Stock
            </button>
            <button
              type="button"
              className={`toggle-btn ${adjustmentType === 'SUBTRACT' ? 'active-subtract' : ''}`}
              onClick={() => setAdjustmentType('SUBTRACT')}
            >
              − Subtract Stock
            </button>
          </div>
        </div>

        {/* Quantity */}
        <div className="form-group">
          <label className="form-label">
            Quantity to {adjustmentType === 'ADD' ? 'Add' : 'Subtract'}
          </label>
          <input
            type="number"
            value={quantity}
            onChange={e => setQuantity(Math.abs(Number(e.target.value)))}
            min={1}
            max={adjustmentType === 'SUBTRACT' ? currentStock : 1000000}
            required
            style={{ textAlign: 'center', fontWeight: 700, fontSize: '1.25rem', padding: '0.75rem' }}
          />
          {adjustmentType === 'SUBTRACT' && currentStock > 0 && (
            <span className="form-hint">Max subtractable: {currentStock}</span>
          )}
        </div>

        {/* Preview */}
        {currentItem && selectedWarehouse && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            background: adjustmentType === 'ADD' ? 'var(--success-light)' : 'var(--danger-light)',
            border: `1.5px solid ${adjustmentType === 'ADD' ? '#a7f3d0' : '#fecaca'}`,
            borderRadius: 'var(--radius-sm)',
            padding: '0.875rem',
          }}>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--foreground-muted)', textTransform: 'uppercase' }}>Current</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{currentStock}</div>
            </div>
            <div style={{ fontSize: '1.5rem', color: adjustmentType === 'ADD' ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }}>
              {adjustmentType === 'ADD' ? '+' : '−'}{quantity}
            </div>
            <div style={{ fontSize: '1.25rem', color: 'var(--foreground-muted)' }}>→</div>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--foreground-muted)', textTransform: 'uppercase' }}>After</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: adjustmentType === 'ADD' ? 'var(--success)' : 'var(--danger)' }}>
                {projectedStock}
              </div>
            </div>
          </div>
        )}

        <hr className="divider" />

        {/* Reason */}
        <div className="form-group">
          <label className="form-label">Reason for Adjustment</label>
          <select value={reason} onChange={e => setReason(e.target.value)} required>
            {ADJUSTMENT_REASONS.map(r => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>

        {/* Notes */}
        <div className="form-group">
          <label className="form-label">Notes / Narration <span style={{ color: 'var(--foreground-muted)', fontWeight: 400 }}>(optional)</span></label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Describe the reason in detail (e.g. 'Found 5 units during audit of shelf B3')"
            rows={3}
          />
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading || !canSubmit}
          style={{
            background: adjustmentType === 'ADD' ? 'var(--success)' : 'var(--danger)',
            color: 'white',
            padding: '0.875rem 1.5rem',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.9rem',
            fontWeight: 700,
            border: 'none',
            cursor: loading || !canSubmit ? 'not-allowed' : 'pointer',
            opacity: loading || !canSubmit ? 0.6 : 1,
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
          }}
        >
          {loading
            ? '⏳ Processing...'
            : `${adjustmentType === 'ADD' ? '➕ Add' : '➖ Subtract'} ${quantity} units`}
        </button>
      </div>
    </form>
  );
}
