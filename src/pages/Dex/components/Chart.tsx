// src/pages/Dex/components/Chart.tsx
// Last Updated: 2025-06-24 22:24:48 UTC by jake1318

import React, { useEffect, useState, useRef } from "react";
import ReactApexChart from "react-apexcharts";
import { ApexOptions } from "apexcharts";
import { getCoinOhlcv, OhlcvPoint } from "../../../services/blockvisionService";
import "./Chart.scss";

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
}

interface ChartPoint {
  x: number;
  y: number;
}

interface CandlestickPoint {
  x: number;
  y: [number, number, number, number]; // open, high, low, close
}

// Interface for enhanced market data passed from parent
interface EnhancedMarketData {
  price: number;
  change24h: number;
  volume24h: number;
  high24h: number;
  low24h: number;
  marketCap: string;
  fdvUsd: string;
  circulating: string;
  totalSupply: string;
  isLoading: boolean;
  hasError: boolean;
}

const TIME_FRAMES: Record<string, string> = {
  "1m": "1m",
  "5m": "5m",
  "15m": "15m",
  "30m": "30m",
  "1h": "1h",
  "4h": "4h",
  "1d": "1d",
  "1Y": "1Y",
};

interface Props {
  pair: TradingPair;
  enhancedData?: EnhancedMarketData;
}

const Chart: React.FC<Props> = ({ pair, enhancedData }) => {
  const [lineData, setLineData] = useState<ChartPoint[]>([]);
  const [candlestickData, setCandlestickData] = useState<CandlestickPoint[]>(
    []
  );
  const [tf, setTf] = useState<string>("15m");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [chartType, setChartType] = useState<"line" | "candlestick">("line");

  // Changed: Use chartPanelRef instead of chartContainerRef
  const chartPanelRef = useRef<HTMLDivElement | null>(null);
  const [chartHeight, setChartHeight] = useState(300);

  // Changed: Use window resize instead of ResizeObserver for height calculation
  useEffect(() => {
    /* helper reads the parent (.chart-panel) once */
    const update = () => {
      if (!chartPanelRef.current) return;
      // header ≈ 50 px + 12 px vertical padding (chart-header has 10)
      const available = chartPanelRef.current.clientHeight - 62;
      setChartHeight(Math.max(200, available)); // never below 200
    };

    update(); // run on mount
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Base chart options that apply to both chart types
  const baseOptions: ApexOptions = {
    chart: {
      background: "#0a0f1e",
      toolbar: { show: false },
      zoom: { enabled: false },
      height: chartHeight,
      fontFamily: "inherit",
      animations: {
        enabled: false, // Disable animations for better performance
      },
      redrawOnWindowResize: true, // Ensure chart redraws when window size changes
    },
    xaxis: {
      type: "datetime",
      labels: {
        style: { colors: "#ccc", fontSize: "12px" },
        datetimeUTC: false,
        datetimeFormatter: {
          year: "yyyy",
          month: "MMM 'yy",
          day: "dd MMM",
          hour: "HH:mm",
        },
      },
      axisBorder: {
        show: false,
      },
      axisTicks: {
        show: false,
      },
    },
    grid: {
      borderColor: "rgba(255,255,255,0.1)",
      strokeDashArray: 3,
      xaxis: { lines: { show: true } },
      yaxis: { lines: { show: true } },
      padding: { left: 10, right: 10 },
    },
    tooltip: {
      theme: "dark",
      x: { format: "dd MMM HH:mm" },
      fixed: {
        enabled: true,
        position: "topRight",
      },
    },
    responsive: [
      {
        breakpoint: 1000,
        options: {
          chart: {
            height: 250,
          },
          xaxis: {
            labels: {
              style: { fontSize: "10px" },
              rotate: -45,
              offsetY: 5,
            },
          },
          yaxis: {
            labels: {
              style: { fontSize: "10px" },
            },
          },
        },
      },
      {
        breakpoint: 600,
        options: {
          chart: {
            height: 200,
          },
          xaxis: {
            labels: {
              show: false,
            },
          },
        },
      },
    ],
  };

  // Line chart specific options
  const lineChartOptions: ApexOptions = {
    ...baseOptions,
    chart: {
      ...baseOptions.chart,
      type: "line",
    },
    yaxis: {
      labels: {
        style: { colors: "#ccc", fontSize: "12px" },
        formatter: (v) => v.toFixed(4),
      },
    },
    stroke: { curve: "smooth", width: 2, colors: ["#00c2ff"] },
  };

  // Candlestick chart specific options
  const candlestickChartOptions: ApexOptions = {
    ...baseOptions,
    chart: {
      ...baseOptions.chart,
      type: "candlestick",
    },
    yaxis: {
      labels: {
        style: { colors: "#ccc", fontSize: "12px" },
        formatter: (v) => v.toFixed(4),
      },
    },
    plotOptions: {
      candlestick: {
        colors: {
          upward: "#4bffb5",
          downward: "#ff4976",
        },
        wick: {
          useFillColor: true,
        },
      },
    },
  };

  const lineSeries = [{ name: "Price", data: lineData }];
  const candlestickSeries = [{ name: "Price", data: candlestickData }];

  const getIntervalAndRange = (t: string) => {
    const now = Math.floor(Date.now() / 1000);
    let type = t;
    let from = now - 6 * 3600;
    switch (t) {
      case "1m":
        from = now - 3600;
        break;
      case "5m":
        from = now - 3 * 3600;
        break;
      case "15m":
        from = now - 6 * 3600;
        break;
      case "30m":
        from = now - 12 * 3600;
        break;
      case "1h":
        type = "1H";
        from = now - 24 * 3600;
        break;
      case "4h":
        type = "4H";
        from = now - 7 * 24 * 3600;
        break;
      case "1d":
        type = "1D";
        from = now - 30 * 24 * 3600;
        break;
      case "1Y":
        type = "1D";
        from = now - 365 * 24 * 3600;
        break;
      default:
        type = "15m";
    }
    return { type, from };
  };

  // Function to fetch OHLCV data for candlestick chart
  const fetchOhlcvData = async () => {
    if (!pair?.baseAddress) return;

    setLoading(true);
    setErr(null);

    try {
      const { type, from } = getIntervalAndRange(tf);

      // Convert interval to API format
      let apiInterval: any = "1h";
      if (tf === "1m" || tf === "5m" || tf === "15m" || tf === "30m")
        apiInterval = tf;
      else if (tf === "1h") apiInterval = "1h";
      else if (tf === "4h") apiInterval = "4h";
      else if (tf === "1d") apiInterval = "1d";
      else if (tf === "1Y") apiInterval = "1w";

      console.log(
        `Fetching OHLCV data: token=${pair.baseAddress}, interval=${apiInterval}, from=${from}`
      );

      const data = await getCoinOhlcv(
        pair.baseAddress,
        apiInterval as any,
        from
      );
      console.log("OHLCV data loaded:", data);

      // Make sure we have data before mapping
      if (!data || !data.length) {
        console.warn("No OHLCV data received");
        setLineData([]);
        setCandlestickData([]);
        return;
      }

      // Format data for line chart
      const linePoints: ChartPoint[] = data.map((point) => ({
        x: point.timestamp * 1000, // convert to milliseconds
        y: point.close,
      }));

      // Format data for candlestick chart
      const candlePoints: CandlestickPoint[] = data.map((point) => ({
        x: point.timestamp * 1000, // convert to milliseconds
        y: [point.open, point.high, point.low, point.close],
      }));

      setLineData(linePoints);
      setCandlestickData(candlePoints);
    } catch (error) {
      console.error("Error fetching OHLCV data:", error);
      setErr("Failed to load chart data");
    } finally {
      setLoading(false);
    }
  };

  // Effect to fetch OHLCV data when pair or timeframe changes
  useEffect(() => {
    if (pair?.baseAddress) {
      fetchOhlcvData();
    }
  }, [pair?.baseAddress, tf]);

  return (
    <div className="trading-chart" ref={chartPanelRef}>
      <div className="chart-header">
        {/* Changed to only show baseAsset without /USDC */}
        <h3>{pair?.baseAsset || "Chart"}</h3>
        <div className="chart-controls">
          <div className="timeframe-selector">
            {Object.keys(TIME_FRAMES).map((key) => (
              <button
                key={key}
                className={tf === key ? "active" : ""}
                onClick={() => setTf(key)}
              >
                {key}
              </button>
            ))}
          </div>

          <div className="chart-type-toggle">
            <button
              className={`chart-type-btn ${
                chartType === "line" ? "active" : ""
              }`}
              onClick={() => setChartType("line")}
              title="Line Chart"
            >
              <i className="fas fa-chart-line"></i>
            </button>
            <button
              className={`chart-type-btn ${
                chartType === "candlestick" ? "active" : ""
              }`}
              onClick={() => setChartType("candlestick")}
              title="Candlestick Chart"
            >
              <i className="fas fa-chart-bar"></i>
            </button>
          </div>
        </div>
      </div>

      <div className="chart-content">
        {loading ? (
          <div className="chart-loading">
            <div className="spinner"></div>
            <p>Loading chart data...</p>
          </div>
        ) : err ? (
          <div className="chart-error">
            <p>{err}</p>
            <button onClick={fetchOhlcvData}>Retry</button>
          </div>
        ) : (
          <div className="chart-area">
            <ReactApexChart
              options={
                chartType === "line"
                  ? lineChartOptions
                  : candlestickChartOptions
              }
              series={chartType === "line" ? lineSeries : candlestickSeries}
              type={chartType}
              height="100%"
              width="100%"
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default Chart;
