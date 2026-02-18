'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface ModalContract {
  id: string;
  name: string;
}

interface CollectionModalProps {
  walletAddress: string;
  contracts: ModalContract[];
  title: string;
  displayName: string;
  onClose: () => void;
}

interface TokenMeta {
  token_id: string;
  name: string;
}

interface TokenBalance {
  [tokenId: string]: number;
}

interface ContractTokens {
  contractName: string;
  tokens: { token_id: string; name: string; owned: boolean }[];
  ownedCount: number;
  total: number;
}

export default function CollectionModal({
  walletAddress,
  contracts,
  title,
  displayName,
  onClose,
}: CollectionModalProps) {
  const [sections, setSections] = useState<ContractTokens[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch data on mount
  useEffect(() => {
    async function fetchData() {
      const supabase = createClient();

      const contractSections = await Promise.all(
        contracts.map(async (contract) => {
          const [metaRes, receivedRes, sentRes] = await Promise.all([
            supabase
              .from('token_metadata')
              .select('token_id, name')
              .eq('contract_id', contract.id)
              .order('token_id'),
            supabase
              .from('nft_transfers')
              .select('token_id, quantity')
              .eq('to_address', walletAddress)
              .eq('contract_id', contract.id),
            supabase
              .from('nft_transfers')
              .select('token_id, quantity')
              .eq('from_address', walletAddress)
              .eq('contract_id', contract.id),
          ]);

          const meta: TokenMeta[] = metaRes.data ?? [];

          // Compute net balance per token_id
          const balance: TokenBalance = {};

          for (const row of receivedRes.data ?? []) {
            balance[row.token_id] = (balance[row.token_id] ?? 0) + (row.quantity ?? 1);
          }
          for (const row of sentRes.data ?? []) {
            balance[row.token_id] = (balance[row.token_id] ?? 0) - (row.quantity ?? 1);
          }

          const ownedSet = new Set<string>(
            Object.entries(balance)
              .filter(([, qty]) => qty > 0)
              .map(([tokenId]) => tokenId)
          );

          const tokens = meta.map((t) => ({
            token_id: t.token_id,
            name: t.name,
            owned: ownedSet.has(t.token_id),
          }));

          return {
            contractName: contract.name,
            tokens,
            ownedCount: tokens.filter((t) => t.owned).length,
            total: tokens.length,
          };
        })
      );

      setSections(contractSections);
      setLoading(false);
    }

    fetchData();
  }, [walletAddress, contracts]);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Prevent body scroll when open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const grandOwnedCount = sections.reduce((sum, s) => sum + s.ownedCount, 0);
  const grandTotal = sections.reduce((sum, s) => sum + s.total, 0);
  const grandPct = grandTotal > 0 ? Math.round((grandOwnedCount / grandTotal) * 100) : 0;

  const isSingle = contracts.length === 1;

  return (
    <div
      className="pearls-modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${title} collection`}
    >
      <div
        className="pearls-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="pearls-modal-header">
          <div>
            <h3>{title}</h3>
            <p>{displayName}</p>
          </div>
          <button
            className="pearls-modal-close"
            onClick={onClose}
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        {loading ? (
          <div className="pearls-modal-loading">Loading tokens…</div>
        ) : isSingle ? (
          <div className="pearls-modal-grid">
            {sections[0]?.tokens.map((token) => (
              <div
                key={token.token_id}
                className={`pearls-modal-token ${token.owned ? 'owned' : 'missing'}`}
              >
                <span className="pearls-modal-check">{token.owned ? '✓' : '✗'}</span>
                <span>{token.name}</span>
              </div>
            ))}
          </div>
        ) : (
          <div>
            {sections.map((section) => (
              <div key={section.contractName}>
                <div className="pearls-modal-section-header">{section.contractName}</div>
                <div className="pearls-modal-grid">
                  {section.tokens.map((token) => (
                    <div
                      key={token.token_id}
                      className={`pearls-modal-token ${token.owned ? 'owned' : 'missing'}`}
                    >
                      <span className="pearls-modal-check">{token.owned ? '✓' : '✗'}</span>
                      <span>{token.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        {!loading && (
          <div className="pearls-modal-footer">
            {grandOwnedCount} of {grandTotal} collected ({grandPct}%)
          </div>
        )}
      </div>
    </div>
  );
}
