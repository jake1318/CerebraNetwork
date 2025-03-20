import React from "react";
import "./Chart.scss";

interface ChartProps {
  pair: {
    name: string;
    baseAsset: string;
    quoteAsset: string;
  };
}

const Chart: React.FC<ChartProps> = ({ pair }) => {
  return (
    <div className="trading-chart">
      <div className="chart-header">
        <h3>{pair.name} Chart</h3>
        <div className="chart-controls">
          <div className="timeframe-selector">
            <button className="active">5m</button>
            <button>15m</button>
            <button>1h</button>
            <button>4h</button>
            <button>1d</button>
            <button>1w</button>
          </div>
          <div className="chart-type-selector">
            <button className="active">Candles</button>
            <button>Line</button>
          </div>
        </div>
      </div>
      <div className="chart-content">
        {/* Placeholder for chart - would be replaced with a real chart library */}
        <div className="placeholder-chart">
          <div className="placeholder-candles">
            {Array.from({ length: 40 }).map((_, index) => (
              <div
                key={index}
                className={`candle ${index % 2 === 0 ? "up" : "down"}`}
                style={{
                  height: `${Math.random() * 150 + 50}px`,
                  left: `${index * 2.5}%`,
                }}
              >
                <div
                  className="wick"
                  style={{ height: `${Math.random() * 30 + 20}px` }}
                ></div>
              </div>
            ))}
          </div>
          <div className="chart-grid">
            {Array.from({ length: 5 }).map((_, index) => (
              <div
                key={index}
                className="grid-line horizontal"
                style={{ top: `${index * 25}%` }}
              ></div>
            ))}
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className="grid-line vertical"
                style={{ left: `${index * 20}%` }}
              ></div>
            ))}
          </div>
          <div className="price-axis">
            <div className="price-tick">$58,500</div>
            <div className="price-tick">$58,000</div>
            <div className="price-tick">$57,500</div>
            <div className="price-tick">$57,000</div>
            <div className="price-tick">$56,500</div>
          </div>
          <div className="time-axis">
            <div className="time-tick">09:00</div>
            <div className="time-tick">12:00</div>
            <div className="time-tick">15:00</div>
            <div className="time-tick">18:00</div>
            <div className="time-tick">21:00</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Chart;
