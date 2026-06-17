"use client";

import { useEffect, useState } from "react";
import type { LaunchStatus } from "@/lib/launchMode";

const DEFAULT: LaunchStatus = { isLaunch: false, memberCount: 0, target: 100 };

export function useLaunchMode(): LaunchStatus & { loading: boolean } {
  const [status, setStatus]   = useState<LaunchStatus>(DEFAULT);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/launch-status")
      .then(r => r.ok ? r.json() : DEFAULT)
      .then((data: LaunchStatus) => setStatus(data))
      .catch(() => setStatus(DEFAULT))
      .finally(() => setLoading(false));
  }, []);

  return { ...status, loading };
}
