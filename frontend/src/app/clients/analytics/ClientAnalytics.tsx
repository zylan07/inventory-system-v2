"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ClientAnalytics() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/clients');
  }, [router]);
  return null;
}
