"use client";

import DashboardClient from "./DashboardClient";
import { useInventoryData } from "@/lib/useInventoryData";

export default function DashboardPage() {
  const { data, loading, error } = useInventoryData();

  let content;

  if (loading) {
    content = <div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>;
  } else if (error || !data) {
    content = <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--danger)' }}>Error loading data.</div>;
  } else {
    content = <DashboardClient initialData={data} />;
  }

  return content;
}
