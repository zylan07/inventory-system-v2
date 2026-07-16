"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import StockClient from "./StockClient";
import { useInventoryData } from "@/lib/useInventoryData";

export default function StockPage() {
  const { userRole } = useAuth();
  const router = useRouter();
  const { data, loading, errors } = useInventoryData({ stock: true, warehouses: true });

  useEffect(() => {
    if (userRole && userRole === 'Basic User') {
      router.push('/outward');
    }
  }, [userRole, router]);

  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>;
  }

  if (errors.stock) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--danger)' }}>
        {errors.stock}
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

  return <StockClient initialData={db} />;
}
