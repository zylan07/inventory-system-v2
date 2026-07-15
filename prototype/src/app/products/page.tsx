"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import ProductsClient from "./ProductsClient";
import { useInventoryData } from "@/lib/useInventoryData";

export default function ProductsPage() {
  const { userRole } = useAuth();
  const router = useRouter();
  const { data, loading, error, refresh } = useInventoryData();

  useEffect(() => {
    if (userRole && userRole !== 'Admin') {
      router.push('/dashboard');
    }
  }, [userRole, router]);

  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>;
  }

  if (error || !data) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--danger)' }}>Error loading data.</div>;
  }

  if (!userRole || userRole !== 'Admin') {
    return null;
  }

  return <ProductsClient initialData={data} refresh={refresh} />;
}
