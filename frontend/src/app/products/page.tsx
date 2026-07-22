"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import ProductsClient from "./ProductsClient";
import { useInventoryData } from "@/lib/useInventoryData";

export default function ProductsPage() {
  const { userRole } = useAuth();
  const router = useRouter();
  const { data, loading, errors, refresh } = useInventoryData({ products: true });

  useEffect(() => {
    if (userRole && userRole !== 'Admin') {
      router.push('/dashboard');
    }
  }, [userRole, router]);

  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>;
  }

  if (errors.products) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--danger)' }}>
        {errors.products}
      </div>
    );
  }

  if (!userRole || userRole !== 'Admin') {
    return null;
  }

  const db = {
    items: data.products || [],
    warehouses: [],
    transactions: []
  };

  return <ProductsClient initialData={db} refresh={refresh} />;
}
