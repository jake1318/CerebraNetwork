// src/pages/Dex/components/Chart.tsx

import React, { useEffect, useState } from "react";
import ReactApexChart from "react-apexcharts";
import { ApexOptions } from "apexcharts";
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

// The data points for ApexCharts
interface ChartPoint {
  x: number;
  y: number;
}

// Updated to remove "1w" and "1M"
const TIME_FRAMES: Record<string, string> = {
  "1m": "1m",
  "5m": "5m",
  "15m": "15m",
  "30m": "30m",
  "1h": "1h",
  "4h": "4h",
  "1d": "1d",
  "1Y": "1Y", // 1 Year
};

interface ChartProps {
  pair: TradingPair;
}

const Chart: React.FC<ChartProps> = ({ pair }) => {
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [timeframe, setTimeframe] = useState<string>("15m");
  const [error, setError] = useState<string | null>(null);

  // ApexCharts options (unchanged)
  const options: ApexOptions = {
    chart: {
      type: "line",
      background: "#0a0f1e",
      toolbar: { show: false },
      zoom: { enabled: false },
    },
    xaxis: {
      type: "datetime",
      labels: {
        style: {
          colors: "#ccc",
          fontSize: "12px",
        },
      },
    },
    yaxis: {
      labels: {
        style: {
          colors: "#ccc",
          fontSize: "12px",
        },
        formatter: (val) => val.toFixed(4),
      },
    },
    grid: {
      borderColor: "rgba(255,255,255,0.2)",
      strokeDashArray: 0,
      xaxis: { lines: { show: true } },
      yaxis: { lines: { show: true } },
    },
    stroke: {
      curve: "smooth",
      width: 2,
    },
    tooltip: {
      theme: "dark",
      x: {
        format: "dd MMM HH:mm",
      },
    },
  };

  // The single line series for ApexCharts
  const series = [
    {
      name: "Price",
      data: chartData,
    },
  ];

  // Convert UI timeframe labels to Birdeye-supported intervals + define time range
  const getIntervalAndRange = (tf: string) => {
    const nowSec = Math.floor(Date.now() / 1000);
    let type = tf;
    let timeFromSec = nowSec - 6 * 3600; // default range: last 6 hours

    switch (tf) {
      // Short intervals (minutes) use lowercase in Birdeye
      case "1m":
        type = "1m";
        timeFromSec = nowSec - 1 * 3600; // last 1 hour
        break;
      case "5m":
        type = "5m";
        timeFromSec = nowSec - 3 * 3600; // last 3 hours
        break;
      case "15m":
        type = "15m";
        timeFromSec = nowSec - 6 * 3600; // last 6 hours
        break;
      case "30m":
        type = "30m";
        timeFromSec = nowSec - 12 * 3600; // last 12 hours
        break;

      // Hourly or longer intervals must be uppercase in Birdeye
      case "1h":
        type = "1H";
        timeFromSec = nowSec - 24 * 3600; // last 24 hours
        break;
      case "4h":
        type = "4H";
        timeFromSec = nowSec - 7 * 24 * 3600; // last 7 days
        break;
      case "1d":
        type = "1D";
        timeFromSec = nowSec - 30 * 24 * 3600; // last 30 days
        break;

      case "1Y":
        // For 1 year chart, let's use daily data
        type = "1D";
        timeFromSec = nowSec - 365 * 24 * 3600; // 1 year
        break;

      default:
        // fallback
        type = "15m";
        timeFromSec = nowSec - 6 * 3600;
        break;
    }

    return { type, timeFromSec, timeToSec: nowSec };
  };

  // Main fetch logic
  const fetchChartData = async () => {
    try {
      setError(null);

      const { type, timeFromSec, timeToSec } = getIntervalAndRange(timeframe);

      // Inline fetch to the Birdeye API
      const apiKey = "22430f5885a74d3b97e7cbd01c2140aa";
      const url = new URL("https://public-api.birdeye.so/defi/history_price");
      url.searchParams.set("address", pair.baseAddress);
      url.searchParams.set("address_type", "token");
      url.searchParams.set("type", type);
      url.searchParams.set("time_from", String(timeFromSec));
      url.searchParams.set("time_to", String(timeToSec));

      const resp = await fetch(url.toString(), {
        method: "GET",
        headers: {
          accept: "application/json",
          "x-chain": "sui",
          "X-API-KEY": apiKey,
        },
      });

      if (!resp.ok) {
        throw new Error(`HTTP error: ${resp.status}`);
      }

      const data = await resp.json();
      if (!data?.success || !data.data?.items) {
        throw new Error("No chart data returned");
      }

      const items = data.data.items;
      if (!Array.isArray(items)) {
        throw new Error("Invalid chart data from Birdeye");
      }

      // Convert each item => { x, y }
      const newData = items.map((item: any) => ({
        x: item.unixTime * 1000,
        y: Number(item.value),
      }));
      setChartData(newData);
    } catch (err: any) {
      console.error("Error fetching chart data:", err);
      setError(err.message || "Failed to load chart data");
    }
  };

  // Fetch on timeframe/pair changes
  useEffect(() => {
    fetchChartData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeframe, pair.baseAddress]);

  // Auto-refresh every 5s
  useEffect(() => {
    const interval = setInterval(fetchChartData, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeframe, pair.baseAddress]);

  return (
    <div className="trading-chart">
      <div className="chart-header">
        <h3>{pair.name} Price Chart</h3>
        <div className="chart-controls">
          <div className="timeframe-selector">
            {Object.entries(TIME_FRAMES).map(([label, value]) => (
              <button
                key={label}
                className={timeframe === value ? "active" : ""}
                onClick={() => setTimeframe(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="chart-content">
        {error && (
          <div className="chart-error">
            <p>Error loading chart: {error}</p>
            <button onClick={fetchChartData}>Retry</button>
          </div>
        )}
        {!error && chartData.length === 0 && (
          <div className="chart-error">
            <p>No data available for {pair.name}</p>
            <button onClick={fetchChartData}>Retry</button>
          </div>
        )}
        {chartData.length > 0 && (
          <div className="chart-area">
            <ReactApexChart
              options={options}
              series={[{ name: "Price", data: chartData }]}
              type="line"
              height={320}
              width="100%"
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default Chart;
