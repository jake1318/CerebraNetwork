// src/hooks/useTokenMeta.ts
// Created: 2025-07-09 23:13:24 UTC by jake1318

import { useEffect, useState } from "react";
import { resolveTokenMeta } from "../services/tokenMetaService";

export function useTokenMeta(typeTag?: string, hardDefault = 9) {
  const [meta, setMeta] = useState<{
    decimals: number;
    symbol?: string;
    name?: string;
    logoUri?: string;
  }>({
    decimals: hardDefault,
  });

  useEffect(() => {
    if (!typeTag) return;
    resolveTokenMeta(typeTag).then(setMeta).catch(console.error);
  }, [typeTag]);

  return meta; // { decimals, symbol, name, logoUri }
}
