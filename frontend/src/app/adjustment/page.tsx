"use client";

import dynamic from 'next/dynamic';

const AdjustmentPageClient = dynamic(() => import('./AdjustmentPageClient'), { ssr: false });

export default function Page() {
  return <AdjustmentPageClient />;
}
