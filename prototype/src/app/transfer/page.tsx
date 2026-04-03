"use client";

import TransactionForm from "@/components/TransactionForm";
import { useInventoryData } from "@/lib/useInventoryData";

export default function TransferPage() {
  const { data, loading, error, refresh } = useInventoryData();

  let content;

  if (loading) {
    content = <div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>;
  } else if (error || !data) {
    content = <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--danger)' }}>Error loading data.</div>;
  } else {
    content = (
      <div>
        <h1 style={{ marginBottom: '2rem' }}>Stock Transfer</h1>
        <TransactionForm db={data} type="TRANSFER" refresh={refresh} />
      </div>
    );
  }

  return content;
}
