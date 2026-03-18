'use client';

import dynamic from 'next/dynamic';

const HeliosStatusBar = dynamic(
  () => import('./HeliosStatusBar'),
  { ssr: false },
);

export function HeliosLoader() {
  return <HeliosStatusBar />;
}
