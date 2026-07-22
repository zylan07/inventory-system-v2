"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import DashboardClient from "./DashboardClient";
import { useInventoryData } from "@/lib/useInventoryData";

export default function DashboardPage() {
  const { userRole } = useAuth();
  const router = useRouter();
  const { data, loading, errors } = useInventoryData({ stock: true, transactions: true, warehouses: true });

  useEffect(() => {
    if (userRole && userRole === 'Basic User') {
      router.push('/outward');
    }
  }, [userRole, router]);

  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>;
  }

  const hasError = errors.stock || errors.transactions;
  if (hasError) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--danger)' }}>
        {errors.stock || errors.transactions || "Error loading dashboard data."}
      </div>
    );
  }

  if (!userRole || userRole === 'Basic User') {
    return null;
  }

  const db = {
    items: data.stock || [],
    warehouses: data.warehouses || [],
    transactions: data.transactions || []
  };

  return <DashboardClient initialData={db} />;
}
