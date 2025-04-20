import React, { useState, useRef, useEffect } from "react";
import axios from "axios";
import "./SearchPage.scss";

const Search: React.FC = () => {
  // State for search and results
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any>({
    aiAnswer: "",
    videos: [],
    webResults: [],
  });
  const [loading, setLoading] = useState(false);

  // Pagination state
  const [videoPage, setVideoPage] = useState(1);
  const [webPage, setWebPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState({ videos: false, web: false });
  const videosPerPage = 12;
  const webResultsPerPage = 10;

  // For carousel functionality
  const carouselRef = useRef<HTMLDivElement>(null);
  const [scrollPosition, setScrollPosition] = useState(0);
  const [maxScroll, setMaxScroll] = useState(0);

  // Update scroll position indicator
  useEffect(() => {
    if (!carouselRef.current) return;

    const updateScrollIndicator = () => {
      if (!carouselRef.current) return;

      const { scrollLeft, scrollWidth, clientWidth } = carouselRef.current;
      const maxScrollValue = scrollWidth - clientWidth;
      setMaxScroll(maxScrollValue);

      // Calculate scroll percentage (0 to 100)
      const scrollPercent =
        maxScrollValue === 0 ? 0 : (scrollLeft / maxScrollValue) * 100;
      setScrollPosition(scrollPercent);
    };

    // Initial update
    updateScrollIndicator();

    // Add scroll event listener
    const carousel = carouselRef.current;
    carousel.addEventListener("scroll", updateScrollIndicator);

    // Resize observer to recalculate when container dimensions change
    const resizeObserver = new ResizeObserver(updateScrollIndicator);
    resizeObserver.observe(carousel);

    return () => {
      carousel.removeEventListener("scroll", updateScrollIndicator);
      resizeObserver.disconnect();
    };
  }, [results.videos]);

  const handleSearch = async () => {
    if (!query) return;
    setLoading(true);
    // Reset pagination when starting a new search
    setVideoPage(1);
    setWebPage(1);

    try {
      const res = await axios.get(`/api/search?q=${encodeURIComponent(query)}`);
      console.log("API Response:", res.data);
      setResults(res.data);
    } catch (error) {
      console.error("Error fetching search results", error);
      setResults({
        aiAnswer: "Sorry, an error occurred while fetching results.",
        videos: [],
        webResults: [],
      });
    }
    setLoading(false);
  };

  const loadMoreVideos = async () => {
    if (loadingMore.videos) return;
    setLoadingMore((prev) => ({ ...prev, videos: true }));

    try {
      const nextPage = videoPage + 1;
      const res = await axios.get(
        `/api/search?q=${encodeURIComponent(query)}&videoPage=${nextPage}`
      );

      if (res.data.videos && res.data.videos.length > 0) {
        setResults((prev) => ({
          ...prev,
          videos: [...prev.videos, ...res.data.videos],
        }));
        setVideoPage(nextPage);
      }
    } catch (error) {
      console.error("Error loading more videos", error);
    }

    setLoadingMore((prev) => ({ ...prev, videos: false }));
  };

  const loadMoreWebResults = async () => {
    if (loadingMore.web) return;
    setLoadingMore((prev) => ({ ...prev, web: true }));

    try {
      const nextPage = webPage + 1;
      const res = await axios.get(
        `/api/search?q=${encodeURIComponent(query)}&webPage=${nextPage}`
      );

      if (res.data.webResults && res.data.webResults.length > 0) {
        setResults((prev) => ({
          ...prev,
          webResults: [...prev.webResults, ...res.data.webResults],
        }));
        setWebPage(nextPage);
      }
    } catch (error) {
      console.error("Error loading more web results", error);
    }

    setLoadingMore((prev) => ({ ...prev, web: false }));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  // Scroll carousel by a specific amount
  const scrollCarousel = (direction: "left" | "right") => {
    if (carouselRef.current) {
      const scrollAmount = 320; // Width of a card + margin
      const currentScroll = carouselRef.current.scrollLeft;

      carouselRef.current.scrollTo({
        left:
          direction === "left"
            ? currentScroll - scrollAmount
            : currentScroll + scrollAmount,
        behavior: "smooth",
      });
    }
  };

  // Scroll carousel to a specific position using the progress bar
  const handleProgressBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!carouselRef.current || maxScroll === 0) return;

    // Get click position relative to the progress bar
    const rect = e.currentTarget.getBoundingClientRect();
    const clickPositionX = e.clientX - rect.left;
    const progressBarWidth = rect.width;

    // Calculate the target scroll position
    const targetScrollPercent = clickPositionX / progressBarWidth;
    const targetScrollPosition = maxScroll * targetScrollPercent;

    // Scroll to the target position
    carouselRef.current.scrollTo({
      left: targetScrollPosition,
      behavior: "smooth",
    });
  };

  // Extract domain from URL for display
  const extractDomain = (url: string) => {
    try {
      const domain = new URL(url);
      return domain.hostname.replace("www.", "");
    } catch {
      return "";
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
            {results.aiAnswer && (
              <div className="result-card">
                <div className="result-header">
                  <h2>AI</h2>
                </div>
                <div className="result-content">
                  {typeof results.aiAnswer === "string"
                    ? results.aiAnswer.split("\n").map((line, i) => (
                        <React.Fragment key={i}>
                          {line}
                          {i < results.aiAnswer.split("\n").length - 1 && (
                            <br />
                          )}
                        </React.Fragment>
                      ))
                    : results.aiAnswer}
                </div>
              </div>
            )}

            {results.videos && results.videos.length > 0 && (
              <div className="result-card video-result-card">
                <div className="result-header">
                  <h2>Video Resources</h2>
                </div>

                {/* Carousel Navigation */}
                <div className="carousel-controls">
                  <button
                    className="carousel-button carousel-prev"
                    onClick={() => scrollCarousel("left")}
                    aria-label="Previous videos"
                  >
                    <span>&#10094;</span>
                  </button>
                  <button
                    className="carousel-button carousel-next"
                    onClick={() => scrollCarousel("right")}
                    aria-label="Next videos"
                  >
                    <span>&#10095;</span>
                  </button>
                </div>

                {/* Video Carousel */}
                <div className="video-carousel-container">
                  <div className="video-carousel" ref={carouselRef}>
                    {results.videos.map((video: any, index: number) => (
                      <div
                        key={`${video.videoId}-${index}`}
                        className="video-card"
                      >
                        <a
                          href={`https://youtu.be/${video.videoId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <div className="thumbnail-container">
                            <img src={video.thumbnail} alt={video.title} />
                            <div className="play-icon">
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 24 24"
                                fill="currentColor"
                              >
                                <path d="M8 5v14l11-7z" />
                              </svg>
                            </div>
                          </div>
                          <h3>{video.title}</h3>
                        </a>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Interactive Progress Bar */}
                <div className="carousel-progress">
                  <div
                    className="progress-bar"
                    onClick={handleProgressBarClick}
                    title="Drag to navigate videos"
                  >
                    <div
                      className="progress-indicator"
                      style={{ width: `${scrollPosition}%` }}
                    ></div>
                    <div
                      className="progress-handle"
                      style={{ left: `${scrollPosition}%` }}
                    ></div>
                  </div>
                  <div className="progress-text">
                    {results.videos.length} videos
                  </div>
                </div>

                {/* Load More Videos Button */}
                <div className="load-more-container">
                  <button
                    className="load-more-button"
                    onClick={loadMoreVideos}
                    disabled={loadingMore.videos}
                  >
                    {loadingMore.videos ? (
                      <>
                        <span className="loading-dot"></span>
                        <span className="loading-dot"></span>
                        <span className="loading-dot"></span>
                      </>
                    ) : (
                      "Load More Videos"
                    )}
                  </button>
                </div>
              </div>
            )}

            {results.webResults && results.webResults.length > 0 && (
              <div className="result-card">
                <div className="result-header">
                  <h2>Web Resources</h2>
                </div>
                <div className="web-results-container">
                  {results.webResults.map((result: any, index: number) => (
                    <div
                      key={`${result.url}-${index}`}
                      className="web-link-card"
                    >
                      <div className="web-link-header">
                        <a
                          href={result.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {result.title}
                        </a>
                        <span className="website-domain">
                          {extractDomain(result.url)}
                        </span>
                      </div>
                      <p>{result.snippet}</p>
                    </div>
                  ))}
                </div>

                {/* Load More Web Results Button */}
                <div className="load-more-container">
                  <button
                    className="load-more-button"
                    onClick={loadMoreWebResults}
                    disabled={loadingMore.web}
                  >
                    {loadingMore.web ? (
                      <>
                        <span className="loading-dot"></span>
                        <span className="loading-dot"></span>
                        <span className="loading-dot"></span>
                      </>
                    ) : (
                      "Load More Results"
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Search;
