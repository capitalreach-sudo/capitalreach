import type { LaunchStatus } from "@/lib/launchMode";

export type { LaunchStatus };

export async function fetchLaunchStatus(): Promise<LaunchStatus> {
  try {
    const res = await fetch("/api/launch-status", { next: { revalidate: 60 } });
    if (!res.ok) throw new Error("non-ok");
    return res.json();
  } catch {
    return { isLaunch: false, memberCount: 0, target: 100 };
  }
}
