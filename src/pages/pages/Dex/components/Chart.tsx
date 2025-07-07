// src/pages/Dex/components/Chart.tsx
// Last Updated: 2025-06-25 07:16:02 UTC by jake1318

import React, { useEffect, useState, useRef } from "react";
import ReactApexChart from "react-apexcharts";
import { ApexOptions } from "apexcharts";
import { getCoinOhlcv } from "../../../services/blockvisionService";
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
  logo?: string;
}

const TIME_FRAMES = {
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
  const [timeFrame, setTimeFrame] = useState<string>("15m");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [chartType, setChartType] = useState<"line" | "candlestick">(
    "candlestick"
  );
  const chartRef = useRef<HTMLDivElement>(null);

  // Base chart options
  const baseOptions: ApexOptions = {
    chart: {
      type: chartType,
      background: "transparent",
      toolbar: {
        show: false,
      },
      animations: {
        enabled: false,
      },
      fontFamily: "'Inter', 'Roboto', sans-serif",
    },
    grid: {
      borderColor: "rgba(70, 70, 80, 0.15)",
      strokeDashArray: 3,
      xaxis: {
        lines: {
          show: true,
        },
      },
      yaxis: {
        lines: {
          show: true,
        },
      },
    },
    tooltip: {
      enabled: true,
      theme: "dark",
      style: {
        fontSize: "12px",
        fontFamily: "'Inter', 'Roboto', sans-serif",
      },
      x: {
        format: "HH:mm dd MMM",
      },
    },
    xaxis: {
      type: "datetime",
      labels: {
        style: {
          colors: "#9CA3AF",
          fontSize: "11px",
        },
        datetimeUTC: false,
      },
      axisBorder: {
        show: false,
      },
      axisTicks: {
        show: false,
      },
    },
    yaxis: {
      labels: {
        style: {
          colors: "#9CA3AF",
          fontSize: "11px",
        },
        formatter: (value) => {
          return value.toFixed(value >= 1 ? 2 : 6);
        },
      },
    },
    responsive: [
      {
        breakpoint: 576,
        options: {
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
    stroke: {
      curve: "smooth",
      width: 2,
    },
    colors: ["#00c2ff"],
    fill: {
      type: "gradient",
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.15,
        opacityTo: 0.05,
        stops: [0, 100],
      },
    },
  };

  // Candlestick chart specific options
  const candlestickChartOptions: ApexOptions = {
    ...baseOptions,
    chart: {
      ...baseOptions.chart,
      type: "candlestick",
    },
    plotOptions: {
      candlestick: {
        colors: {
          upward: "#4caf50",
          downward: "#ff3b30",
        },
        wick: {
          useFillColor: true,
        },
      },
    },
  };

  // Function to transform API interval to chart interval
  const getApiInterval = (chartInterval: string) => {
    switch (chartInterval) {
      case "1m":
        return "1m";
      case "5m":
        return "5m";
      case "15m":
        return "15m";
      case "30m":
        return "30m";
      case "1h":
        return "1h";
      case "4h":
        return "4h";
      case "1d":
        return "1d";
      case "1Y":
        return "1w";
      default:
        return "15m";
    }
  };

  // Function to determine time range based on interval
  const getTimeRange = (interval: string) => {
    const now = Math.floor(Date.now() / 1000);

    switch (interval) {
      case "1m":
        return now - 60 * 60; // 1 hour
      case "5m":
        return now - 60 * 60 * 6; // 6 hours
      case "15m":
        return now - 60 * 60 * 12; // 12 hours
      case "30m":
        return now - 60 * 60 * 24; // 24 hours
      case "1h":
        return now - 60 * 60 * 24 * 3; // 3 days
      case "4h":
        return now - 60 * 60 * 24 * 7; // 7 days
      case "1d":
        return now - 60 * 60 * 24 * 30; // 30 days
      case "1Y":
        return now - 60 * 60 * 24 * 365; // 365 days
      default:
        return now - 60 * 60 * 12; // 12 hours
    }
  };

  // Fetch chart data
  const fetchChartData = async () => {
    if (!pair?.baseAddress) return;

    setLoading(true);
    setError(null);

    try {
      const apiInterval = getApiInterval(timeFrame);
      const fromTime = getTimeRange(timeFrame);

      const data = await getCoinOhlcv(
        pair.baseAddress,
        apiInterval as any,
        fromTime
      );

      if (!data || data.length === 0) {
        setError("No chart data available");
        setLineData([]);
        setCandlestickData([]);
        return;
      }

      // Format data for line chart
      const linePoints = data.map((point) => ({
        x: point.timestamp * 1000,
        y: point.close,
      }));

      // Format data for candlestick chart
      const candlePoints = data.map((point) => ({
        x: point.timestamp * 1000,
        y: [point.open, point.high, point.low, point.close],
      }));

      setLineData(linePoints);
      setCandlestickData(candlePoints);
    } catch (err) {
      console.error("Failed to fetch chart data:", err);
      setError("Failed to load chart data");
    } finally {
      setLoading(false);
    }
  };

  // Fetch data when pair or timeframe changes
  useEffect(() => {
    if (pair?.baseAddress) {
      fetchChartData();
    }
  }, [pair?.baseAddress, timeFrame]);

  return (
    <div className="chart-wrapper" ref={chartRef}>
      <div className="chart-controls">
        <div className="timeframe-buttons">
          {Object.keys(TIME_FRAMES).map((tf) => (
            <button
              key={tf}
              className={`timeframe-btn ${tf === timeFrame ? "active" : ""}`}
              onClick={() => setTimeFrame(tf)}
            >
              {tf}
            </button>
          ))}
        </div>

        <div className="chart-type-buttons">
          <button
            className={`chart-type-btn ${chartType === "line" ? "active" : ""}`}
            onClick={() => setChartType("line")}
          >
            Line
          </button>
          <button
            className={`chart-type-btn ${
              chartType === "candlestick" ? "active" : ""
            }`}
            onClick={() => setChartType("candlestick")}
          >
            Candles
          </button>
        </div>
      </div>

      <div className="chart-area">
        {loading && (
          <div className="chart-overlay">
            <div className="loading-indicator">Loading...</div>
          </div>
        )}

        {error && (
          <div className="chart-overlay">
            <div className="error-message">
              {error}
              <button onClick={fetchChartData} className="retry-btn">
                Retry
              </button>
            </div>
          </div>
        )}

        <ReactApexChart
          options={
            chartType === "line" ? lineChartOptions : candlestickChartOptions
          }
          series={
            chartType === "line"
              ? [{ name: "Price", data: lineData }]
              : [{ name: "Price", data: candlestickData }]
          }
          type={chartType}
          height="100%"
          width="100%"
        />
      </div>
    </div>
  );
};

export default Chart;
