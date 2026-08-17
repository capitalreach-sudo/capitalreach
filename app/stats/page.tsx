import { permanentRedirect } from "next/navigation";

// /stats was a second, hourly-cached copy of the same aggregates the Data
// Centre publishes live. One page for platform numbers: /data.
export default function StatsPage() {
  permanentRedirect("/data");
}
