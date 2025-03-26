// src/pages/Dex/components/Chart.tsx
import React, { useEffect, useRef, useState } from "react";
import { createChart, ColorType } from "lightweight-charts";
import { birdeyeService } from "../../../services/birdeyeService";
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

const TIME_FRAMES: Record<string, string> = {
  "1m": "1m",
  "5m": "5m",
  "15m": "15m",
  "30m": "30m",
  "1h": "1h", // We'll let birdeyeService normalize "1h" => "1H"
  "4h": "4h",
  "1d": "1d",
  "1w": "1w",
};

interface ChartProps {
  pair: TradingPair;
}

interface OHLCVData {
  time: number; // in seconds for lightweight-charts
  open?: number;
  high?: number;
  low?: number;
  close: number;
  volume?: number;
}

const Chart: React.FC<ChartProps> = ({ pair }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [chartData, setChartData] = useState<OHLCVData[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<string>("15m");
  const [chartType, setChartType] = useState<"candles" | "line">("candles");

  const chart = useRef<any>(null);
  const candleSeries = useRef<any>(null);
  const lineSeries = useRef<any>(null);

  const fetchChartData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const baseTokenAddress = pair.baseAddress;

      if (chartType === "line") {
        // get line chart data
        const response = await birdeyeService.getLineChartData(
          baseTokenAddress,
          timeframe
        );
        if (!response || !response.data) {
          throw new Error("No line chart data returned");
        }
        const items = response.data.items; // array of { unixTime, value }
        if (!Array.isArray(items)) {
          throw new Error("Invalid line chart data from Birdeye");
        }
        // transform to the format needed by a line series
        const formatted = items.map((item: any) => ({
          time: item.unixTime,
          close: Number(item.value),
        }));
        setChartData(formatted);
      } else {
        // get candlestick data
        const response = await birdeyeService.getCandlestickData(
          baseTokenAddress,
          timeframe
        );
        if (!response || !response.data) {
          throw new Error("No candlestick data returned");
        }
        const items = response.data.items; // array of { unixTime, open, high, low, close, volume }
        if (!Array.isArray(items)) {
          throw new Error("Invalid candlestick data from Birdeye");
        }
        // transform to the format needed by a candlestick series
        const formatted = items.map((item: any) => ({
          time: item.unixTime,
          open: Number(item.open),
          high: Number(item.high),
          low: Number(item.low),
          close: Number(item.close),
          volume: Number(item.volume || 0),
        }));
        setChartData(formatted);
      }
    } catch (err: any) {
      console.error("Error fetching chart data:", err);
      setError(err.message || "Failed to load chart data");
    } finally {
      setIsLoading(false);
    }
  };

  // Create chart or reset if chartType changes
  useEffect(() => {
    if (!chartContainerRef.current) return;

    if (chart.current) {
      chart.current.remove();
      chart.current = null;
    }

    const chartInstance = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: "rgba(5, 15, 30, 0)" },
        textColor: "rgba(255, 255, 255, 0.7)",
      },
      grid: {
        vertLines: { color: "rgba(255, 255, 255, 0.07)" },
        horzLines: { color: "rgba(255, 255, 255, 0.07)" },
      },
      timeScale: {
        borderColor: "rgba(255, 255, 255, 0.1)",
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: "rgba(255, 255, 255, 0.1)",
      },
      crosshair: {
        mode: 1,
        vertLine: {
          color: "rgba(0, 255, 255, 0.2)",
          width: 1,
          style: 3,
          labelBackgroundColor: "rgba(0, 255, 255, 0.6)",
        },
        horzLine: {
          color: "rgba(255, 0, 255, 0.2)",
          width: 1,
          style: 3,
          labelBackgroundColor: "rgba(255, 0, 255, 0.6)",
        },
      },
    });

    chart.current = chartInstance;

    if (chartType === "candles") {
      if (typeof chartInstance.addCandlestickSeries === "function") {
        candleSeries.current = chartInstance.addCandlestickSeries({
          upColor: "rgba(0, 255, 136, 0.8)",
          downColor: "rgba(255, 77, 109, 0.8)",
          borderVisible: false,
          wickUpColor: "rgba(0, 255, 136, 0.8)",
          wickDownColor: "rgba(255, 77, 109, 0.8)",
        });
      } else {
        console.error("addCandlestickSeries is not supported in this version.");
      }
    } else {
      if (typeof chartInstance.addLineSeries === "function") {
        lineSeries.current = chartInstance.addLineSeries({
          color: "rgba(0, 255, 255, 0.8)",
          lineWidth: 2,
        });
      } else {
        console.error("addLineSeries is not supported in this version.");
      }
    }

    return () => {
      if (chart.current) {
        chart.current.remove();
        chart.current = null;
      }
    };
  }, [chartType]);

  // Update series with new data
  useEffect(() => {
    if (!chart.current || chartData.length === 0) return;

    if (chartType === "candles" && candleSeries.current) {
      candleSeries.current.setData(chartData);
    } else if (chartType === "line" && lineSeries.current) {
      const lineData = chartData.map((item) => ({
        time: item.time,
        value: item.close,
      }));
      lineSeries.current.setData(lineData);
    }
    chart.current.timeScale().fitContent();
  }, [chartData]);

  // Fetch data whenever timeframe, chartType, or baseAddress changes
  useEffect(() => {
    fetchChartData();
  }, [timeframe, chartType, pair.baseAddress]);

  // Auto-refresh every 5s
  useEffect(() => {
    const interval = setInterval(fetchChartData, 5000);
    return () => clearInterval(interval);
  }, [timeframe, chartType, pair.baseAddress]);

  // Handle chart resizing
  const handleResize = () => {
    if (chartContainerRef.current && chart.current) {
      chart.current.applyOptions({
        width: chartContainerRef.current.clientWidth,
        height: chartContainerRef.current.clientHeight,
      });
    }
  };

  useEffect(() => {
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div className="trading-chart">
      <div className="chart-header">
        <h3>{pair.name} Chart</h3>
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
          <div className="chart-type-selector">
            <button
              className={chartType === "candles" ? "active" : ""}
              onClick={() => setChartType("candles")}
            >
              Candles
            </button>
            <button
              className={chartType === "line" ? "active" : ""}
              onClick={() => setChartType("line")}
            >
              Line
            </button>
          </div>
        </div>
      </div>

      <div className="chart-content">
        {isLoading && (
          <div className="chart-loading">Loading chart data...</div>
        )}
        {error && (
          <div className="chart-error">
            <p>Error loading chart: {error}</p>
            <button onClick={fetchChartData}>Retry</button>
          </div>
        )}
        <div ref={chartContainerRef} className="chart-container" />
        {chartData.length === 0 && !isLoading && !error && (
          <div className="chart-error">
            <p>No data available for {pair.name}</p>
            <button onClick={fetchChartData}>Retry</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Chart;
