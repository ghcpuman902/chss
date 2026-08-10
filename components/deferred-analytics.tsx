"use client";

import dynamic from "next/dynamic";

/** Analytics after hydration — must not compete with LCP / INP. */
const Analytics = dynamic(
  () => import("@vercel/analytics/react").then((m) => m.Analytics),
  { ssr: false },
);

export const DeferredAnalytics = () => <Analytics />;
