import ConnectButton from '@/components/pearls/connect-button';

export default function PearlsPage() {
  return (
    <div className="pearls-page">
      <header className="pearls-header">
        <h1><span className="gradient-text">Pearls</span> Tracker</h1>
        <ConnectButton />
      </header>
      <section className="pearls-content">
        <p className="pearls-subtitle">
          Track Pearl NFT holdings, payouts, and ROI across Polygon and Base.
        </p>
      </section>
    </div>
  );
}
