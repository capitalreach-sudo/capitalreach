export function PrintHeader({ title }: { title: string }) {
  return (
    <div className="print-only print-header">
      <span>CapitalReach — Private Capital Marketplace</span>
      <span>{title}</span>
      <span>{new Date().toLocaleDateString("en-GB")}</span>
    </div>
  );
}
