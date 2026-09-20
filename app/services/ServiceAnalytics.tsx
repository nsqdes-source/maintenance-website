"use client";

import { useEffect } from "react";
import { trackFunnelEvent } from "@/lib/attribution";

export default function ServiceAnalytics({ service }: { service: string }) {
  useEffect(() => { trackFunnelEvent("view_service", { service }); }, [service]);
  return null;
}
