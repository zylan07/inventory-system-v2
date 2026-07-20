"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ClientAnalyticsPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/clients');
  }, [router]);
  return null;
}
