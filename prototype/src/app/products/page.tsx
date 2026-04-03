"use client";

import ProductsClient from "./ProductsClient";
import { useInventoryData } from "@/lib/useInventoryData";

export default function ProductsPage() {
  const { data, loading, error, refresh } = useInventoryData();

  let content;

  if (loading) {
    content = <div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>;
  } else if (error || !data) {
    content = <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--danger)' }}>Error loading data.</div>;
  } else {
    content = <ProductsClient initialData={data} refresh={refresh} />;
  }

  return content;
}
