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

interface ChartPoint {
  x: number;
  y: number;
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
}

const Chart: React.FC<Props> = ({ pair }) => {
  const [data, setData] = useState<ChartPoint[]>([]);
  const [tf, setTf] = useState<string>("15m");
  const [err, setErr] = useState<string | null>(null);

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
        style: { colors: "#ccc", fontSize: "12px" },
      },
    },
    yaxis: {
      labels: {
        style: { colors: "#ccc", fontSize: "12px" },
        formatter: (v) => v.toFixed(4),
      },
    },
    grid: {
      borderColor: "rgba(255,255,255,0.2)",
      xaxis: { lines: { show: true } },
      yaxis: { lines: { show: true } },
    },
    stroke: { curve: "smooth", width: 2 },
    tooltip: { theme: "dark", x: { format: "dd MMM HH:mm" } },
  };

  const series = [{ name: "Price", data }];

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
    }
    return { type, from, to: now };
  };

  const fetchData = async () => {
    setErr(null);
    try {
      const { type, from, to } = getIntervalAndRange(tf);
      const apiKey = "22430f5885a74d3b97e7cbd01c2140aa";
      const url = new URL("https://public-api.birdeye.so/defi/history_price");
      url.searchParams.set("address", pair.baseAddress);
      url.searchParams.set("address_type", "token");
      url.searchParams.set("type", type);
      url.searchParams.set("time_from", String(from));
      url.searchParams.set("time_to", String(to));

      const resp = await fetch(url.toString(), {
        headers: {
          accept: "application/json",
          "x-chain": "sui",
          "X-API-KEY": apiKey,
        },
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      if (!json.success || !json.data?.items) throw new Error("No data");
      setData(
        json.data.items.map((it: any) => ({
          x: it.unixTime * 1000,
          y: Number(it.value),
        }))
      );
    } catch (e: any) {
      setErr(e.message || "Failed to load");
    }
  };

  useEffect(() => {
    fetchData();
  }, [tf, pair.baseAddress]);

  useEffect(() => {
    const iv = setInterval(fetchData, 5000);
    return () => clearInterval(iv);
  }, [tf, pair.baseAddress]);

  return (
    <div className="trading-chart">
      <div className="chart-header">
        <h3>{pair.name} Price Chart</h3>
        <div className="chart-controls">
          <div className="timeframe-selector">
            {Object.keys(TIME_FRAMES).map((lbl) => (
              <button
                key={lbl}
                className={tf === lbl ? "active" : ""}
                onClick={() => setTf(lbl)}
              >
                {lbl}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="chart-content">
        {err && (
          <div className="chart-error">
            <p>Error: {err}</p>
            <button onClick={fetchData}>Retry</button>
          </div>
        )}
        {!err && data.length === 0 && (
          <div className="chart-error">
            <p>No data available</p>
            <button onClick={fetchData}>Retry</button>
          </div>
        )}
        {data.length > 0 && (
          <div className="chart-area">
            <ReactApexChart
              options={options}
              series={series}
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
