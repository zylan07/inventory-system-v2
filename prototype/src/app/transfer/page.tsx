"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import TransactionForm from "@/components/TransactionForm";
import { useInventoryData } from "@/lib/useInventoryData";

export default function TransferPage() {
  const { userRole } = useAuth();
  const router = useRouter();
  const { data, loading, errors, refresh } = useInventoryData({ products: true, warehouses: true, stock: true });

  useEffect(() => {
    if (userRole && userRole === 'Basic User') {
      router.push('/outward');
    }
  }, [userRole, router]);

  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>;
  }

  const hasError = errors.products || errors.stock;
  if (hasError) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--danger)' }}>
        {errors.products || errors.stock || "Error loading transfer page data."}
      </div>
    );
  }

  if (!userRole || userRole === 'Basic User') {
    return null;
  }

  const db = {
    items: data.stock || [],
    warehouses: data.warehouses || [],
    transactions: []
  };

  return (
    <div>
      <h1 style={{ marginBottom: '2rem' }}>Stock Transfer</h1>
      <TransactionForm db={db} type="TRANSFER" refresh={refresh} />
    </div>
  );
}
