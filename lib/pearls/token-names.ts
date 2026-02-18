import type { TokenMetadata } from './types';

/** Lookup key: "contract_id:token_id" → name */
export type TokenNameMap = Record<string, string>;

export function buildTokenNameMap(metadata: TokenMetadata[]): TokenNameMap {
  const map: TokenNameMap = {};
  for (const tm of metadata) {
    map[`${tm.contract_id}:${tm.token_id}`] = tm.name;
  }
  return map;
}
