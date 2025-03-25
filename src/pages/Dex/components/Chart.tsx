import React, { useEffect, useRef, useState } from "react";
import { createChart, ColorType } from "lightweight-charts";
import { birdeyeService } from "../../../services/birdeyeService";
import "./Chart.scss";

const TOKEN_ADDRESSES: Record<string, string> = {
  SUI: "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI",
  USDC: "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
  BTC: "0x027792d9fed7f9844eb4839566001bb6f6cb4804f66aa2da6fe1ee242d896881::coin::COIN",
  ETH: "0xaf8cd5edc19c4512f4259f0bee101a40d41ebed738ade5874359610ef8eeced5::coin::COIN",
};

const TIME_FRAMES: Record<string, string> = {
  "1m": "1m",
  "5m": "5m",
  "15m": "15m",
  "30m": "30m",
  "1h": "1h",
  "4h": "4h",
  "1d": "1d",
  "1w": "1w",
};

interface ChartProps {
  pair: {
    name: string;
    baseAsset: string;
    quoteAsset: string;
  };
}

interface OHLCVData {
  time: number;
  open?: number;
  high?: number;
  low?: number;
  close: number;
  volume?: number;
}

const Chart: React.FC<ChartProps> = ({ pair }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [chartData, setChartData] = useState<OHLCVData[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
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
      const tokenAddress = TOKEN_ADDRESSES[pair.baseAsset];
      if (!tokenAddress) {
        throw new Error(`Token address not found for ${pair.baseAsset}`);
      }

      if (chartType === "line") {
        const response = await birdeyeService.getLineChartData(
          tokenAddress,
          timeframe
        );
        if (!response?.data?.items) throw new Error("Invalid line chart data");

        const formatted = response.data.items.map((item: any) => ({
          time: item.unixTime,
          close: item.value,
        }));
        setChartData(formatted);
      } else {
        const response = await birdeyeService.getCandlestickData(
          tokenAddress,
          timeframe
        );
        if (!response?.data) throw new Error("Invalid candlestick data");

        const formatted = response.data.map((item: any) => ({
          time: item.timestamp / 1000,
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

  // Chart creation and series setup when chartType changes.
  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Remove existing chart instance if any.
    if (chart.current) {
      chart.current.remove();
      chart.current = null;
    }

    const chartInstance = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: "rgba(5, 15, 30, 0.0)" },
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

    // Create series based on the chart type.
    if (chartType === "candles") {
      // Ensure the method exists (requires recent lightweight-charts version)
      if (typeof chart.current.addCandlestickSeries === "function") {
        candleSeries.current = chart.current.addCandlestickSeries({
          upColor: "rgba(0, 255, 136, 0.8)",
          downColor: "rgba(255, 77, 109, 0.8)",
          borderVisible: false,
          wickUpColor: "rgba(0, 255, 136, 0.8)",
          wickDownColor: "rgba(255, 77, 109, 0.8)",
        });
      } else {
        console.error(
          "addCandlestickSeries is not a function on chart instance."
        );
      }
    } else {
      lineSeries.current = chart.current.addLineSeries({
        color: "rgba(0, 255, 255, 0.8)",
        lineWidth: 2,
      });
    }

    return () => {
      window.removeEventListener("resize", handleResize);
      if (chart.current) {
        chart.current.remove();
        chart.current = null;
      }
    };
  }, [chartType]);

  // Update the series data when chartData changes.
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

  // Fetch data when timeframe, asset, or chart type changes.
  useEffect(() => {
    fetchChartData();
  }, [timeframe, pair.baseAsset, chartType]);

  // Auto-refresh every 5 seconds.
  useEffect(() => {
    const interval = setInterval(fetchChartData, 5000);
    return () => clearInterval(interval);
  }, [timeframe, pair.baseAsset, chartType]);

  // Resize handling.
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
            {Object.entries(TIME_FRAMES).map(([key, value]) => (
              <button
                key={key}
                className={timeframe === value ? "active" : ""}
                onClick={() => setTimeframe(value)}
              >
                {key}
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
