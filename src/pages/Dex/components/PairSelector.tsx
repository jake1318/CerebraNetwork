// src/pages/Dex/components/PairSelector.tsx
// Last Updated: 2025-06-25 06:18:30 UTC by jake1318

import React, { useState, useEffect } from "react";
import "./PairSelector.scss";

interface TradingPair {
  id: string;
  name: string;
  baseAsset: string;
  quoteAsset: string;
  price: number;
  change24h: number;
  volume24h: number;
  high24h: number;
  low24h: number;
  baseAddress: string;
  quoteAddress: string;
  logo?: string;
}

interface PairSelectorProps {
  pairs: TradingPair[];
  selectedPair: TradingPair | null;
  onSelectPair: (pair: TradingPair) => void;
}

const PairSelector: React.FC<PairSelectorProps> = ({
  pairs,
  selectedPair,
  onSelectPair,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortMethod, setSortMethod] = useState<"name" | "volume" | "change">(
    "volume"
  );
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const filteredPairs = pairs
    .filter(
      (pair) =>
        pair.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        pair.baseAsset.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      let comparison = 0;

      if (sortMethod === "name") {
        comparison = a.baseAsset.localeCompare(b.baseAsset);
      } else if (sortMethod === "volume") {
        comparison = a.volume24h - b.volume24h;
      } else if (sortMethod === "change") {
        comparison = a.change24h - b.change24h;
      }

      return sortDirection === "asc" ? comparison : -comparison;
    });

  const formatVolume = (volume: number) => {
    if (!volume || volume === 0) return "$0";

    if (volume >= 1000000) {
      return `$${(volume / 1000000).toFixed(2)}M`;
    }

    if (volume >= 1000) {
      return `$${(volume / 1000).toFixed(2)}K`;
    }

    return `$${volume.toFixed(2)}`;
  };

  const toggleSort = (method: "name" | "volume" | "change") => {
    if (sortMethod === method) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortMethod(method);
      setSortDirection("desc");
    }
  };

  return (
    <div className="pair-selector-container">
      <div className="pair-search">
        <input
          type="text"
          placeholder="Search pairs..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="pair-list-header">
        <div
          className={`column name ${sortMethod === "name" ? "sorted" : ""} ${
            sortMethod === "name" ? sortDirection : ""
          }`}
          onClick={() => toggleSort("name")}
        >
          Pair
        </div>
        <div
          className={`column price ${sortMethod === "price" ? "sorted" : ""} ${
            sortMethod === "price" ? sortDirection : ""
          }`}
          onClick={() => toggleSort("price")}
        >
          Price
        </div>
        <div
          className={`column change ${
            sortMethod === "change" ? "sorted" : ""
          } ${sortMethod === "change" ? sortDirection : ""}`}
          onClick={() => toggleSort("change")}
        >
          24h
        </div>
        <div
          className={`column volume ${
            sortMethod === "volume" ? "sorted" : ""
          } ${sortMethod === "volume" ? sortDirection : ""}`}
          onClick={() => toggleSort("volume")}
        >
          Volume
        </div>
      </div>

      <div className="pair-list">
        {filteredPairs.map((pair) => (
          <div
            key={pair.id}
            className={`pair-item ${
              selectedPair?.id === pair.id ? "selected" : ""
            }`}
            onClick={() => onSelectPair(pair)}
          >
            <div className="pair-name">
              {pair.logo && (
                <img
                  src={pair.logo}
                  alt={pair.baseAsset}
                  className="pair-logo"
                />
              )}
              <span>{pair.baseAsset}</span>
            </div>
            <div className="pair-price">
              ${pair.price.toFixed(pair.price < 1 ? 6 : 4)}
            </div>
            <div
              className={`pair-change ${
                pair.change24h >= 0 ? "positive" : "negative"
              }`}
            >
              {pair.change24h >= 0 ? "+" : ""}
              {pair.change24h.toFixed(2)}%
            </div>
            <div className="pair-volume">{formatVolume(pair.volume24h)}</div>
          </div>
        ))}

        {filteredPairs.length === 0 && (
          <div className="no-pairs">No pairs match your search</div>
        )}
      </div>
    </div>
  );
};

export default PairSelector;
