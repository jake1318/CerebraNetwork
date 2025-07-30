// src/components/portfolio/MarketNews.tsx
// Last Updated: 2025-07-12 22:00:01 UTC by jake1318

import React, { useState } from "react";
import { useFinanceNews } from "../../hooks/useFinanceNews";
import "./MarketNews.scss";

interface MarketNewsProps {
  defaultQuery?: string;
}

const MarketNews: React.FC<MarketNewsProps> = ({ defaultQuery = "" }) => {
  const [activeQuery, setActiveQuery] = useState<string>(defaultQuery);
  const { data, isLoading, error, refetch } = useFinanceNews(activeQuery);

  // Predefined categories for quick filtering
  const categories = [
    { id: "crypto", label: "Crypto", query: "CRYPTO" },
    { id: "sui", label: "SUI", query: "SUI" },
    { id: "bitcoin", label: "Bitcoin", query: "BTC-USD" },
    { id: "stocks", label: "Stocks", query: "STOCK" },
    { id: "markets", label: "Markets", query: "MARKET" },
  ];

  // Simplified date formatter that just returns the existing date string
  // SerpAPI already provides nicely formatted relative dates like "1 day ago"
  const formatDate = (dateString: string): string => {
    if (!dateString) return "Recent";

    // Simply return the already-formatted date from the API
    return dateString;
  };

  const handleRefresh = () => {
    refetch();
  };

  const handleCategoryChange = (query: string) => {
    setActiveQuery(query);
  };

  return (
    <div className="market-news">
      <div className="news-header">
        <h2>Market News</h2>
        <div className="news-controls">
          <div className="category-filters">
            {categories.map((category) => (
              <button
                key={category.id}
                className={`category-button ${
                  activeQuery === category.query ? "active" : ""
                }`}
                onClick={() => handleCategoryChange(category.query)}
              >
                {category.label}
              </button>
            ))}
          </div>
          <button className="refresh-button" onClick={handleRefresh}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"></path>
            </svg>
            Refresh
          </button>
        </div>
      </div>

      <div className="news-content">
        {isLoading && (
          <div className="loading-state">
            <div className="loading-spinner"></div>
            <p>Loading market news...</p>
          </div>
        )}

        {error && (
          <div className="error-state">
            <p>Failed to load news data. Please try again later.</p>
            <button onClick={handleRefresh}>Retry</button>
          </div>
        )}

        {!isLoading && !error && data?.news && (
          <>
            <p className="results-info">
              Showing {data.news.length} results for{" "}
              {data.query || "latest financial news"}
            </p>

            <div className="news-list">
              {data.news.map((newsItem: any, index: number) => (
                <a
                  key={index}
                  className="news-item"
                  href={newsItem.link}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {newsItem.thumbnail && (
                    <div className="news-thumbnail">
                      <img src={newsItem.thumbnail} alt={newsItem.title} />
                    </div>
                  )}

                  <div className="news-details">
                    <h3 className="news-title">{newsItem.title}</h3>
                    <div className="news-meta">
                      <span className="news-source">{newsItem.source}</span>
                      <span className="news-date">
                        {formatDate(newsItem.date)}
                      </span>
                    </div>
                    {newsItem.snippet && (
                      <p className="news-snippet">{newsItem.snippet}</p>
                    )}
                  </div>
                </a>
              ))}
            </div>
          </>
        )}

        {!isLoading && !error && (!data?.news || data.news.length === 0) && (
          <div className="empty-state">
            <p>No news found for the selected category.</p>
            <button onClick={() => handleCategoryChange("CRYPTO")}>
              View Crypto News
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default MarketNews;
