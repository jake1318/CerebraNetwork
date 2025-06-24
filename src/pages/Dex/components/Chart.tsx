// src/pages/Dex/components/Chart.tsx
// Last Updated: 2025-06-24 03:48:46 UTC by jake1318

import React, { useEffect, useState } from "react";
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

  // Base chart options that apply to both chart types
  const baseOptions: ApexOptions = {
    chart: {
      background: "#0a0f1e",
      toolbar: { show: false },
      zoom: { enabled: false },
    },
    xaxis: {
      type: "datetime",
      labels: {
        style: { colors: "#ccc", fontSize: "12px" },
      },
    },
    grid: {
      borderColor: "rgba(255,255,255,0.2)",
      xaxis: { lines: { show: true } },
      yaxis: { lines: { show: true } },
    },
    tooltip: { theme: "dark", x: { format: "dd MMM HH:mm" } },
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
      if (type === "1m" || type === "5m" || type === "15m" || type === "30m")
        apiInterval = type;
      else if (type === "1H" || type === "4H") apiInterval = type.toLowerCase();
      else if (type === "1D") apiInterval = "1d";

      const data = await getCoinOhlcv(
        pair.baseAddress,
        apiInterval as any,
        from
      );
      console.log("OHLCV data loaded:", data);

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
    <div className="trading-chart">
      <div className="chart-header">
        <h3>{pair?.name || "Chart"}</h3>
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
