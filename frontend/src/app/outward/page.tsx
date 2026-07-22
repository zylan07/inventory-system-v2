"use client";

import TransactionForm from "@/components/TransactionForm";
import { useInventoryData } from "@/lib/useInventoryData";

export default function OutwardPage() {
  const { data, loading, errors, refresh } = useInventoryData({ products: true, warehouses: true, stock: true });

  let content;

  if (loading) {
    content = <div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>;
  } else if (errors.products || errors.stock) {
    content = (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--danger)' }}>
        {errors.products || errors.stock}
      </div>
    );
  } else {
    const db = {
      items: data.stock || [],
      warehouses: data.warehouses || [],
      transactions: []
    };
    content = (
      <div>
        <h1 style={{ marginBottom: '2rem' }}>Outward Stock</h1>
        <TransactionForm db={db} type="OUTWARD" refresh={refresh} />
      </div>
    );
  }

  return content;
}
