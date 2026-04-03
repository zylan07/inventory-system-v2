"use client";

import AdjustmentClient from "./AdjustmentClient";
import { useInventoryData } from "@/lib/useInventoryData";

export default function AdjustmentPage() {
  const { data, loading, error, refresh } = useInventoryData();

  let content;

  if (loading) {
    content = <div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>;
  } else if (error || !data) {
    content = <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--danger)' }}>Error loading data.</div>;
  } else {
    content = (
      <div>
        <h1 style={{ marginBottom: '2rem' }}>Physical Stock Adjustment</h1>
        <AdjustmentClient db={data} refresh={refresh} />
      </div>
    );
  }

  return content;
}
