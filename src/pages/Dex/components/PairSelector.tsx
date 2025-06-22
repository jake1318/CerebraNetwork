import React, { useState, useEffect, useRef, useCallback } from "react";
import "./PairSelector.scss";

export interface TradingPair {
  id: string;
  name: string;
  baseAsset: string;
  quoteAsset: string;
  price: number;
  change24h: number;
}

interface PairSelectorProps {
  pairs: TradingPair[];
  selectedPair: TradingPair;
  onSelectPair: (pair: TradingPair) => void;
}

const INITIAL_DISPLAY_COUNT = 9;
const LOAD_MORE_COUNT = 5;

const PairSelector: React.FC<PairSelectorProps> = ({
  pairs,
  selectedPair,
  onSelectPair,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [showFavorites, setShowFavorites] = useState(false);
  const [displayCount, setDisplayCount] = useState(INITIAL_DISPLAY_COUNT);
  const [isLoading, setIsLoading] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const [favorites, setFavorites] = useState<string[]>(() => {
    const saved = localStorage.getItem("favoritePairs");
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem("favoritePairs", JSON.stringify(favorites));
  }, [favorites]);

  const toggleFavorite = (symbol: string) => {
    setFavorites((prev) =>
      prev.includes(symbol)
        ? prev.filter((s) => s !== symbol)
        : [...prev, symbol]
    );
  };

  const filtered = pairs.filter((p) => {
    if (
      searchTerm &&
      !p.baseAsset.toLowerCase().includes(searchTerm.toLowerCase())
    ) {
      return false;
    }
    if (showFavorites && !favorites.includes(p.name)) {
      return false;
    }
    return true;
  });

  const handleScroll = useCallback(() => {
    if (!listRef.current || isLoading) return;
    const { scrollTop, scrollHeight, clientHeight } = listRef.current;
    if (
      scrollTop + clientHeight >= scrollHeight - 50 &&
      displayCount < filtered.length
    ) {
      setIsLoading(true);
      setTimeout(() => {
        setDisplayCount((prev) =>
          Math.min(prev + LOAD_MORE_COUNT, filtered.length)
        );
        setIsLoading(false);
      }, 300);
    }
  }, [filtered.length, isLoading, displayCount]);

  useEffect(() => {
    const el = listRef.current;
    if (el) {
      el.addEventListener("scroll", handleScroll);
      return () => el.removeEventListener("scroll", handleScroll);
    }
  }, [handleScroll]);

  useEffect(() => {
    setDisplayCount(INITIAL_DISPLAY_COUNT);
  }, [searchTerm, showFavorites]);

  const displayedPairs = filtered.slice(0, displayCount);
  const hasMoreToLoad = displayCount < filtered.length;

  return (
    <div className="pair-selector">
      <div className="search-bar">
        <input
          type="text"
          placeholder="Search pairs..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="filter-bar">
        <button
          className={!showFavorites ? "active" : ""}
          onClick={() => setShowFavorites(false)}
        >
          All
        </button>
        <button
          className={showFavorites ? "active" : ""}
          onClick={() => setShowFavorites(true)}
        >
          Favorites
        </button>
      </div>

      <div className="pair-list-container">
        <div className="pair-list" ref={listRef}>
          {displayedPairs.map((p) => {
            const symbol = p.name;
            const isActive = selectedPair.id === p.id;
            const positive = p.change24h > 0;
            const changeClass = positive
              ? "positive"
              : p.change24h < 0
              ? "negative"
              : "neutral";

            return (
              <div
                key={p.id}
                className={`pair-item ${isActive ? "active" : ""}`}
                onClick={() => onSelectPair(p)}
              >
                <div className="pair-info">
                  <span
                    className={`star ${
                      favorites.includes(symbol) ? "favorite" : ""
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavorite(symbol);
                    }}
                  >
                    {favorites.includes(symbol) ? "★" : "☆"}
                  </span>
                  <span className="pair-symbol">{p.baseAsset}</span>
                </div>
                <div className="pair-stats">
                  <span className="pair-price">{p.price.toFixed(4)}</span>
                  <span className={`pair-change ${changeClass}`}>
                    {positive ? "+" : ""}
                    {p.change24h.toFixed(2)}%
                  </span>
                </div>
              </div>
            );
          })}

          {isLoading && hasMoreToLoad && (
            <div className="loading-indicator">Loading more…</div>
          )}
          {!displayedPairs.length && !isLoading && (
            <div className="no-results">No pairs found</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PairSelector;
