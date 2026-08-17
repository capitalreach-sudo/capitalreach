import { redirect } from "next/navigation";

// The comparison tool lives inside the browse page (the tray persists in
// localStorage). /compare opens it directly when listings are selected.
export default function ComparePage() {
  redirect("/startups?compare=1");
}
