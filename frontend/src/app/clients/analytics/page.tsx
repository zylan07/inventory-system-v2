"use client";

import dynamic from 'next/dynamic';

const ClientAnalytics = dynamic(() => import('./ClientAnalytics'), { ssr: false });

export default function ClientAnalyticsPage() {
  return <ClientAnalytics />;
}
