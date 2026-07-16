"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import ReportsClient from "./ReportsClient";
import { useInventoryData } from "@/lib/useInventoryData";

export default function ReportsPage() {
  const { userRole } = useAuth();
  const router = useRouter();
  const { data, loading, errors } = useInventoryData({ transactions: true, products: true });

  useEffect(() => {
    if (userRole && userRole === 'Basic User') {
      router.push('/outward');
    }
  }, [userRole, router]);

  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>;
  }

  const hasError = errors.transactions || errors.products;
  if (hasError) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--danger)' }}>
        {errors.transactions || errors.products || "Error loading reports data."}
      </div>
    );
  }

  if (!userRole || userRole === 'Basic User') {
    return null;
  }

  const db = {
    items: data.products || [],
    warehouses: [],
    transactions: data.transactions || []
  };

  return <ReportsClient initialData={db} />;
}
