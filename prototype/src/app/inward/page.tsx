"use client";

import TransactionForm from "@/components/TransactionForm";
import { useInventoryData } from "@/lib/useInventoryData";

export default function InwardPage() {
  const { data, loading, error, refresh } = useInventoryData();

  let content;

  if (loading) {
    content = <div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>;
  } else if (error || !data) {
    content = <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--danger)' }}>Error loading data.</div>;
  } else {
    content = (
      <div>
        <h1 style={{ marginBottom: '2rem' }}>Inward Stock</h1>
        <TransactionForm db={data} type="INWARD" refresh={refresh} />
      </div>
    );
  }

  return content;
}
