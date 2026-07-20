export function PrintHeader({ title, tagline }: { title: string; tagline: string }) {
  return (
    <div className="print-only print-header">
      <span>{tagline}</span>
      <span>{title}</span>
      <span>{new Date().toLocaleDateString("en-GB")}</span>
    </div>
  );
}
