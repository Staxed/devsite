export default function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell">
      <div className="shell-glow" aria-hidden="true" />
      <div className="content">{children}</div>
    </div>
  );
}
