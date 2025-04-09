import { useState, useEffect } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ChartOptions,
} from "chart.js";
import { Line } from "react-chartjs-2";
import { format } from "date-fns";
import { birdeyeService } from "../../services/birdeyeService";
import "./TokenChart.scss";

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

interface TokenChartProps {
  tokenAddress: string;
  resolution?: string; // '5m', '15m', '1h', '4h', '1d', etc.
  height?: number;
  width?: number;
  className?: string;
}

interface OHLCVData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const TokenChart = ({
  tokenAddress,
  resolution = "1d",
  height = 300,
  width = 600,
  className = "",
}: TokenChartProps) => {
  const [chartData, setChartData] = useState<OHLCVData[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [priceChange, setPriceChange] = useState<number>(0);
  const [timeFrame, setTimeFrame] = useState<string>(resolution);
  const [tokenMeta, setTokenMeta] = useState<any>(null);

  useEffect(() => {
    if (tokenAddress) {
      fetchChartData();
      fetchTokenMetadata();
    }
  }, [tokenAddress, timeFrame]);

  const fetchTokenMetadata = async () => {
    try {
      const response = await birdeyeService.getSingleTokenMetadata(
        tokenAddress
      );
      if (response && response.data) {
        setTokenMeta(response.data);
      }
    } catch (error) {
      console.error("Error fetching token metadata:", error);
    }
  };

  const fetchChartData = async () => {
    if (!tokenAddress) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await birdeyeService.getChartData(
        tokenAddress,
        timeFrame
      );

      if (response && response.data) {
        const formattedData = response.data.map((item: any) => ({
          time: item.time * 1000, // Convert to milliseconds
          open: parseFloat(item.open),
          high: parseFloat(item.high),
          low: parseFloat(item.low),
          close: parseFloat(item.close),
          volume: parseFloat(item.volume),
        }));

        setChartData(formattedData);

        // Calculate price change percentage
        if (formattedData.length >= 2) {
          const firstPrice = formattedData[0].close;
          const lastPrice = formattedData[formattedData.length - 1].close;
          const changePercent = ((lastPrice - firstPrice) / firstPrice) * 100;
          setPriceChange(changePercent);
        }
      }
    } catch (err) {
      console.error("Error fetching chart data:", err);
      setError("Failed to load chart data");
    } finally {
      setIsLoading(false);
    }
  };

  const handleTimeFrameChange = (newTimeFrame: string) => {
    setTimeFrame(newTimeFrame);
  };

  // Format price with proper decimals
  const formatPrice = (price: number): string => {
    if (price < 0.001) return price.toFixed(6);
    if (price < 1) return price.toFixed(4);
    if (price < 1000) return price.toFixed(2);
    return price.toLocaleString("en-US", { maximumFractionDigits: 2 });
  };

  // Format percentage
  const formatPercentage = (value: number): string => {
    return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
  };

  // Format date for x-axis
  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    if (timeFrame.includes("m") || timeFrame.includes("h")) {
      return format(date, "HH:mm");
    } else if (timeFrame.includes("d")) {
      return format(date, "MMM dd");
    } else {
      return format(date, "MMM yyyy");
    }
  };

  // Prepare Chart.js data
  const prepareChartData = () => {
    if (!chartData || chartData.length === 0) return null;

    return {
      labels: chartData.map((item) => formatDate(item.time)),
      datasets: [
        {
          label: tokenMeta?.symbol || "Price",
          data: chartData.map((item) => item.close),
          borderColor:
            priceChange >= 0
              ? "rgba(75, 192, 192, 1)"
              : "rgba(255, 99, 132, 1)",
          backgroundColor:
            priceChange >= 0
              ? "rgba(75, 192, 192, 0.2)"
              : "rgba(255, 99, 132, 0.2)",
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 5,
          pointHitRadius: 10,
          tension: 0.3,
          fill: true,
        },
      ],
    };
  };

  // Chart.js options
  const chartOptions: ChartOptions<"line"> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        mode: "index",
        intersect: false,
        callbacks: {
          label: function (context) {
            let label = context.dataset.label || "";
            if (label) {
              label += ": ";
            }
            if (context.parsed.y !== null) {
              label += "$" + formatPrice(context.parsed.y);
            }
            return label;
          },
          title: function (tooltipItems) {
            // Format the title (date) in the tooltip
            const item = tooltipItems[0];
            if (item && chartData[item.dataIndex]) {
              const date = new Date(chartData[item.dataIndex].time);
              return format(date, "PPpp"); // 'Mar 21, 2025, 9:28 PM'
            }
            return "";
          },
        },
      },
    },
    scales: {
      x: {
        grid: {
          display: false,
        },
        ticks: {
          maxRotation: 0,
          autoSkip: true,
          maxTicksLimit: 8,
        },
      },
      y: {
        position: "right",
        grid: {
          color: "rgba(200, 200, 200, 0.1)",
        },
        ticks: {
          callback: function (value) {
            return "$" + formatPrice(value as number);
          },
        },
      },
    },
    interaction: {
      mode: "index",
      intersect: false,
    },
    hover: {
      mode: "index",
      intersect: false,
    },
  };

  if (isLoading) {
    return (
      <div className={`token-chart-loading ${className}`}>
        Loading chart data...
      </div>
    );
  }

  if (error) {
    return <div className={`token-chart-error ${className}`}>{error}</div>;
  }

  if (chartData.length === 0) {
    return (
      <div className={`token-chart-no-data ${className}`}>
        No chart data available
      </div>
    );
  }

  // Get the latest price
  const latestPrice = chartData[chartData.length - 1]?.close || 0;
  const chartJsData = prepareChartData();

  return (
    <div className={`token-chart ${className}`}>
      <div className="chart-header">
        <div className="price-info">
          {tokenMeta && (
            <div className="token-meta">
              {tokenMeta.logo && (
                <img
                  src={tokenMeta.logo}
                  alt={tokenMeta.symbol}
                  className="token-logo"
                />
              )}
              <span className="token-name">
                {tokenMeta.name} ({tokenMeta.symbol})
              </span>
            </div>
          )}
          <span className="current-price">${formatPrice(latestPrice)}</span>
          <span
            className={`price-change ${
              priceChange >= 0 ? "positive" : "negative"
            }`}
          >
            {formatPercentage(priceChange)}
          </span>
        </div>

        <div className="time-frame-selector">
          <button
            className={timeFrame === "1h" ? "active" : ""}
            onClick={() => handleTimeFrameChange("1h")}
          >
            1H
          </button>
          <button
            className={timeFrame === "1d" ? "active" : ""}
            onClick={() => handleTimeFrameChange("1d")}
          >
            1D
          </button>
          <button
            className={timeFrame === "1w" ? "active" : ""}
            onClick={() => handleTimeFrameChange("1w")}
          >
            1W
          </button>
          <button
            className={timeFrame === "1M" ? "active" : ""}
            onClick={() => handleTimeFrameChange("1M")}
          >
            1M
          </button>
        </div>
      </div>

      <div className="chart-container" style={{ height, width }}>
        {chartJsData && <Line data={chartJsData} options={chartOptions} />}
      </div>
    </div>
  );
};

export default TokenChart;
