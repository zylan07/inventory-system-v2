"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import DashboardClient from "./DashboardClient";
import { useInventoryData } from "@/lib/useInventoryData";

export default function DashboardPage() {
  const { userRole } = useAuth();
  const router = useRouter();
  const { data, loading, error } = useInventoryData();

  useEffect(() => {
    if (userRole && userRole === 'Basic User') {
      router.push('/outward');
    }
  }, [userRole, router]);

  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>;
  }

  if (error || !data) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--danger)' }}>Error loading data.</div>;
  }

  if (!userRole || userRole === 'Basic User') {
    return null;
  }

  return <DashboardClient initialData={data} />;
}
