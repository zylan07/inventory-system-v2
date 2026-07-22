"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import AdjustmentClient from "./AdjustmentClient";
import { useInventoryData } from "@/lib/useInventoryData";

export default function AdjustmentPage() {
  const { userRole } = useAuth();
  const router = useRouter();
  const { data, loading, errors, refresh } = useInventoryData({ products: true, warehouses: true, stock: true });

  useEffect(() => {
    if (userRole && userRole !== 'Admin') {
      router.push('/dashboard');
    }
  }, [userRole, router]);

  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>;
  }

  const hasError = errors.products || errors.stock;
  if (hasError) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--danger)' }}>
        {errors.products || errors.stock || "Error loading adjustment page data."}
      </div>
    );
  }

  if (!userRole || userRole !== 'Admin') {
    return null;
  }

  const db = {
    items: data.stock || [],
    warehouses: data.warehouses || [],
    transactions: []
  };

  return (
    <div>
      <h1 style={{ marginBottom: '2rem' }}>Physical Stock Adjustment</h1>
      <AdjustmentClient db={db} refresh={refresh} />
    </div>
  );
}
