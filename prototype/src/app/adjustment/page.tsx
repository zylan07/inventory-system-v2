"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import AdjustmentClient from "./AdjustmentClient";
import { useInventoryData } from "@/lib/useInventoryData";

export default function AdjustmentPage() {
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

  return (
    <div>
      <h1 style={{ marginBottom: '2rem' }}>Physical Stock Adjustment</h1>
      <AdjustmentClient db={data} refresh={refresh} />
    </div>
  );
}
