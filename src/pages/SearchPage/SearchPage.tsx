import React, { useState } from "react";
import axios from "axios";
import "./SearchPage.scss"; // Update the import to match the file name case

const Search: React.FC = () => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    if (!query) return;
    setLoading(true);
    try {
      const res = await axios.get(`/api/search?q=${encodeURIComponent(query)}`);
      setResults(res.data);
    } catch (error) {
      console.error("Error fetching search results", error);
    }
    setLoading(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  return (
    <div className="search-page">
      <div className="container">
        <div className="search-form">
          <div className="input-group">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter search term"
              className="search-input"
            />
            <button onClick={handleSearch} className="search-button">
              {loading ? "Searching..." : "Search"}
            </button>
          </div>
        </div>

        {loading && (
          <div className="loading">
            <div className="loading-spinner"></div>
            <div className="loading-text">Searching...</div>
          </div>
        )}

        {results && (
          <div className="search-results">
            <div className="result-card">
              <div className="result-header">
                <h2>AI Answer</h2>
              </div>
              <div className="result-content">{results.aiAnswer}</div>
            </div>

            <div className="result-card">
              <div className="result-header">
                <h2>YouTube Videos</h2>
              </div>
              <div className="video-grid">
                {results.videos.map((video: any) => (
                  <div key={video.videoId} className="video-card">
                    <a
                      href={`https://youtu.be/${video.videoId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <h3>{video.title}</h3>
                      <img src={video.thumbnail} alt={video.title} />
                    </a>
                  </div>
                ))}
              </div>
            </div>

            <div className="result-card">
              <div className="result-header">
                <h2>Web Results</h2>
              </div>
              {results.webResults.map((result: any) => (
                <div key={result.url} className="web-link-card">
                  <a
                    href={result.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {result.title}
                  </a>
                  <p>{result.snippet}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <footer className="footer">© 2025 Cerebra Network</footer>
      </div>
    </div>
  );
};

export default Search;
