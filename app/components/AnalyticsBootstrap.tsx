"use client";

import { useEffect } from "react";
import { initializeAttribution } from "@/lib/attribution";

export default function AnalyticsBootstrap() {
  useEffect(() => { initializeAttribution(); }, []);
  return null;
}
