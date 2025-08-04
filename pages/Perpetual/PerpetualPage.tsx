// src/pages/Perpetual/PerpetualPage.tsx
// Updated to use Apex Charts
// Last Updated: 2025-05-08 18:33:13 UTC by jake1318

import React, { useState, useEffect } from "react";
import { useWallet } from "@suiet/wallet-kit";
import { formatDollars, formatPercentage } from "../../utils/formatters";
import TokenIcon from "../../components/TokenIcon";
import ReactApexChart from "react-apexcharts";
import { ApexOptions } from "apexcharts";
import "../../styles/pages/Perpetual/PerpetualPage.scss";

// Types for perpetual markets and user positions
interface PerpetualMarket {
  id: string;
  a;
  pair: string;
  baseToken: string;
  quoteToken: string;
  baseTokenSymbol: string;
  quoteTokenSymbol: string;
  baseTokenLogo: string;
  quoteTokenLogo: string;
  price: number;
  change24h: number;
  volume24h: number;
  openInterest: number;
  fundingRate: number;
  maxLeverage: number;
}

interface UserPosition {
  id: string;
  marketId: string;
  pair: string;
  baseToken: string;
  quoteToken: string;
  baseTokenSymbol: string;
  quoteTokenSymbol: string;
  baseTokenLogo: string;
  quoteTokenLogo: string;
  positionType: "long" | "short";
  leverage: number;
  size: number; // position size in USD
  margin: number; // collateral in USD
  entryPrice: number;
  markPrice: number;
  liquidationPrice: number;
  unrealizedPnl: number;
  unrealizedPnlPercentage: number;
  fees: number;
}

interface OrderType {
  value: string;
  label: string;
}

interface TradeForm {
  marketId: string;
  orderType: string;
  positionType: "long" | "short";
  leverage: number;
  amount: string;
  price?: string;
  slippage: number;
}

const PerpetualPage: React.FC = () => {
  const { account, connected } = useWallet();
  const [loading, setLoading] = useState<boolean>(true);
  const [markets, setMarkets] = useState<PerpetualMarket[]>([]);
  const [userPositions, setUserPositions] = useState<UserPosition[]>([]);
  const [activeTab, setActiveTab] = useState<"trade" | "markets" | "positions">(
    "trade"
  );
  const [selectedMarket, setSelectedMarket] = useState<PerpetualMarket | null>(
    null
  );
  const [tradeForm, setTradeForm] = useState<TradeForm>({
    marketId: "",
    orderType: "market",
    positionType: "long",
    leverage: 5,
    amount: "",
    slippage: 0.5,
  });

  const [chartLoaded, setChartLoaded] = useState<boolean>(false);
  const [chartData, setChartData] = useState<any[]>([]);
  const orderTypes: OrderType[] = [
    { value: "market", label: "Market" },
    { value: "limit", label: "Limit" },
    { value: "stop", label: "Stop" },
  ];

  useEffect(() => {
    loadData();
  }, [connected, account?.address]);

  // Handle tab changes
  const handleTabChange = (tab: "trade" | "markets" | "positions") => {
    // Set the active tab
    setActiveTab(tab);
  };

  // Generate chart data when selected market changes
  useEffect(() => {
    if (selectedMarket) {
      // Generate mock price data for chart
      generateMockChartData();
      setChartLoaded(true);
    }
  }, [selectedMarket]);

  // Generate mock OHLC data for the chart
  const generateMockChartData = () => {
    if (!selectedMarket) return;

    const basePrice = selectedMarket.price;
    const volatility = 0.05; // 5% price volatility
    const data = [];
    const now = new Date();

    // Generate 30 days of price data
    for (let i = 30; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(now.getDate() - i);
      const timestamp = date.getTime();

      // Calculate random price movement
      const changePercent = (Math.random() - 0.5) * volatility;
      const open = basePrice * (1 + (Math.random() - 0.5) * volatility);
      const close = open * (1 + changePercent);
      const high = Math.max(open, close) * (1 + Math.random() * 0.02);
      const low = Math.min(open, close) * (1 - Math.random() * 0.02);

      data.push({
        x: timestamp,
        y: [open, high, low, close].map((price) =>
          parseFloat(price.toFixed(4))
        ),
      });
    }

    setChartData(data);
  };

  // Chart options for Apex Charts
  const chartOptions: ApexOptions = {
    chart: {
      type: "candlestick",
      height: 400,
      toolbar: {
        show: true,
        tools: {
          download: false,
          selection: true,
          zoom: true,
          zoomin: true,
          zoomout: true,
          pan: true,
          reset: true,
        },
      },
      background: "transparent",
      animations: {
        enabled: true,
        easing: "easeinout",
        dynamicAnimation: {
          speed: 350,
        },
      },
    },
    xaxis: {
      type: "datetime",
      labels: {
        style: {
          colors: "rgba(255, 255, 255, 0.7)",
        },
      },
      axisBorder: {
        show: false,
      },
      axisTicks: {
        show: false,
      },
    },
    yaxis: {
      tooltip: {
        enabled: true,
      },
      labels: {
        style: {
          colors: "rgba(255, 255, 255, 0.7)",
        },
        formatter: function (val) {
          return val.toFixed(2);
        },
      },
    },
    grid: {
      borderColor: "rgba(255, 255, 255, 0.05)",
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
      theme: "dark",
      x: {
        format: "MMM dd, yyyy",
      },
    },
    plotOptions: {
      candlestick: {
        colors: {
          upward: "#10F0B0", // Green for upward candles
          downward: "#FF5A5A", // Red for downward candles
        },
        wick: {
          useFillColor: true,
        },
      },
    },
    theme: {
      mode: "dark",
      palette: "palette1",
    },
  };

  // Mock data loading function
  const loadData = async () => {
    setLoading(true);

    try {
      // Simulating API call wait time
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Mock markets data
      const mockMarkets: PerpetualMarket[] = [
        {
          id: "sui-usdc",
          pair: "SUI-USDC",
          baseToken: "0x2::sui::SUI",
          quoteToken:
            "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN",
          baseTokenSymbol: "SUI",
          quoteTokenSymbol: "USDC",
          baseTokenLogo:
            "https://coin-images.coingecko.com/coins/images/26375/small/sui-ocean-square.png?1727791290",
          quoteTokenLogo:
            "https://assets.coingecko.com/coins/images/6319/thumb/USD_Coin_icon.png",
          price: 1.43,
          change24h: 5.2,
          volume24h: 12500000,
          openInterest: 4200000,
          fundingRate: 0.0012,
          maxLeverage: 20,
        },
        {
          id: "eth-usdc",
          pair: "ETH-USDC",
          baseToken:
            "0xaf8cd5edc19c4512f4259f0bee101a40d41ebed738ade5874359610ef8eeced5::coin::COIN",
          quoteToken:
            "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN",
          baseTokenSymbol: "ETH",
          quoteTokenSymbol: "USDC",
          baseTokenLogo:
            "https://assets.coingecko.com/coins/images/279/small/ethereum.png?1595348880",
          quoteTokenLogo:
            "https://assets.coingecko.com/coins/images/6319/thumb/USD_Coin_icon.png",
          price: 3282.47,
          change24h: -1.8,
          volume24h: 28750000,
          openInterest: 12500000,
          fundingRate: -0.0008,
          maxLeverage: 20,
        },
        {
          id: "btc-usdc",
          pair: "BTC-USDC",
          baseToken:
            "0x027792d9fed7f9844eb4839566001bb6f6cb4804f66aa2da6fe1ee242d896881::coin::COIN",
          quoteToken:
            "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN",
          baseTokenSymbol: "BTC",
          quoteTokenSymbol: "USDC",
          baseTokenLogo:
            "https://assets.coingecko.com/coins/images/1/small/bitcoin.png?1547033579",
          quoteTokenLogo:
            "https://assets.coingecko.com/coins/images/6319/thumb/USD_Coin_icon.png",
          price: 62581.25,
          change24h: 2.3,
          volume24h: 42500000,
          openInterest: 18500000,
          fundingRate: 0.0015,
          maxLeverage: 20,
        },
        {
          id: "cetus-usdc",
          pair: "CETUS-USDC",
          baseToken:
            "0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS",
          quoteToken:
            "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN",
          baseTokenSymbol: "CETUS",
          quoteTokenSymbol: "USDC",
          baseTokenLogo: "https://icons.llama.fi/cetus.png",
          quoteTokenLogo:
            "https://assets.coingecko.com/coins/images/6319/thumb/USD_Coin_icon.png",
          price: 0.0324,
          change24h: 12.5,
          volume24h: 3750000,
          openInterest: 1250000,
          fundingRate: 0.0024,
          maxLeverage: 15,
        },
        {
          id: "sol-usdc",
          pair: "SOL-USDC",
          baseToken:
            "0xb7844e289a8410e50fb3ca48d69eb9cf29e27d223ef90353fe1bd8e27ff8f3f8::coin::COIN",
          quoteToken:
            "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN",
          baseTokenSymbol: "SOL",
          quoteTokenSymbol: "USDC",
          baseTokenLogo:
            "https://assets.coingecko.com/coins/images/4128/small/solana.png?1640133422",
          quoteTokenLogo:
            "https://assets.coingecko.com/coins/images/6319/thumb/USD_Coin_icon.png",
          price: 144.26,
          change24h: 1.4,
          volume24h: 18200000,
          openInterest: 7500000,
          fundingRate: 0.0005,
          maxLeverage: 20,
        },
      ];

      setMarkets(mockMarkets);
      // Set first market as selected by default
      setSelectedMarket(mockMarkets[0]);
      setTradeForm((prev) => ({ ...prev, marketId: mockMarkets[0].id }));

      // If user is connected, load mock positions
      if (connected && account?.address) {
        const mockPositions: UserPosition[] = [
          {
            id: "pos-1",
            marketId: "sui-usdc",
            pair: "SUI-USDC",
            baseToken: "0x2::sui::SUI",
            quoteToken:
              "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN",
            baseTokenSymbol: "SUI",
            quoteTokenSymbol: "USDC",
            baseTokenLogo:
              "https://coin-images.coingecko.com/coins/images/26375/small/sui-ocean-square.png?1727791290",
            quoteTokenLogo:
              "https://assets.coingecko.com/coins/images/6319/thumb/USD_Coin_icon.png",
            positionType: "long",
            leverage: 10,
            size: 8500,
            margin: 850,
            entryPrice: 1.32,
            markPrice: 1.43,
            liquidationPrice: 1.08,
            unrealizedPnl: 697.73,
            unrealizedPnlPercentage: 8.21,
            fees: 25.5,
          },
          {
            id: "pos-2",
            marketId: "eth-usdc",
            pair: "ETH-USDC",
            baseToken:
              "0xaf8cd5edc19c4512f4259f0bee101a40d41ebed738ade5874359610ef8eeced5::coin::COIN",
            quoteToken:
              "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN",
            baseTokenSymbol: "ETH",
            quoteTokenSymbol: "USDC",
            baseTokenLogo:
              "https://assets.coingecko.com/coins/images/279/small/ethereum.png?1595348880",
            quoteTokenLogo:
              "https://assets.coingecko.com/coins/images/6319/thumb/USD_Coin_icon.png",
            positionType: "short",
            leverage: 5,
            size: 3250,
            margin: 650,
            entryPrice: 3350.25,
            markPrice: 3282.47,
            liquidationPrice: 3685.27,
            unrealizedPnl: 122.36,
            unrealizedPnlPercentage: 3.77,
            fees: 18.25,
          },
        ];

        setUserPositions(mockPositions);
      }
    } catch (error) {
      console.error("Error loading perpetual markets data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleMarketChange = (marketId: string) => {
    // Reset chart state
    setChartLoaded(false);

    // Find and set the selected market
    const market = markets.find((m) => m.id === marketId);
    if (market) {
      setSelectedMarket(market);
      setTradeForm((prev) => ({ ...prev, marketId: market.id }));
    }
  };

  const handleFormChange = (field: keyof TradeForm, value: any) => {
    setTradeForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmitTrade = (e: React.FormEvent) => {
    e.preventDefault();
    if (!connected || !selectedMarket) return;

    // Here you would call the actual trading API
    console.log("Submitting trade order:", tradeForm);

    // Mock successful trade
    alert(
      `${
        tradeForm.positionType === "long" ? "Buy" : "Sell"
      } order submitted successfully!`
    );
  };

  const renderMarketSelector = () => {
    if (markets.length === 0) return null;

    return (
      <div className="market-selector">
        <select
          value={selectedMarket?.id || ""}
          onChange={(e) => handleMarketChange(e.target.value)}
          className="market-select"
        >
          {markets.map((market) => (
            <option key={market.id} value={market.id}>
              {market.pair}
            </option>
          ))}
        </select>
      </div>
    );
  };

  const renderMarketInfo = () => {
    if (!selectedMarket) return null;

    return (
      <div className="market-info">
        <div className="market-header">
          <div className="market-title">
            <div className="market-pair">
              <TokenIcon
                token={{
                  symbol: selectedMarket.baseTokenSymbol,
                  name: selectedMarket.baseTokenSymbol,
                  address: selectedMarket.baseToken,
                }}
                metadata={{
                  logo_uri: selectedMarket.baseTokenLogo,
                  logoUrl: selectedMarket.baseTokenLogo,
                  logoURI: selectedMarket.baseTokenLogo,
                  logo: selectedMarket.baseTokenLogo,
                  address: selectedMarket.baseToken,
                }}
                size="small"
              />
              <span>{selectedMarket.pair}</span>
            </div>
            <div className="market-price">
              <div className="price-value">
                ${selectedMarket.price.toLocaleString()}
              </div>
              <div
                className={`price-change ${
                  selectedMarket.change24h >= 0 ? "positive" : "negative"
                }`}
              >
                {selectedMarket.change24h >= 0 ? "+" : ""}
                {selectedMarket.change24h.toFixed(2)}%
              </div>
            </div>
          </div>
        </div>

        <div className="market-stats">
          <div className="stat-item">
            <span className="stat-label">24h Volume</span>
            <span className="stat-value">
              {formatDollars(selectedMarket.volume24h)}
            </span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Open Interest</span>
            <span className="stat-value">
              {formatDollars(selectedMarket.openInterest)}
            </span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Funding Rate</span>
            <span className="stat-value">
              {selectedMarket.fundingRate >= 0 ? "+" : ""}
              {formatPercentage(selectedMarket.fundingRate * 100)}%
            </span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Max Leverage</span>
            <span className="stat-value">{selectedMarket.maxLeverage}x</span>
          </div>
        </div>
      </div>
    );
  };

  const renderTradingForm = () => {
    if (!selectedMarket) return null;

    return (
      <form className="trading-form" onSubmit={handleSubmitTrade}>
        <div className="form-section">
          <label className="form-label">Order Type</label>
          <div className="order-type-buttons">
            {orderTypes.map((type) => (
              <button
                key={type.value}
                type="button"
                className={`order-type-btn ${
                  tradeForm.orderType === type.value ? "active" : ""
                }`}
                onClick={() => handleFormChange("orderType", type.value)}
              >
                {type.label}
              </button>
            ))}
          </div>
        </div>

        <div className="form-section">
          <label className="form-label">Position</label>
          <div className="position-type-buttons">
            <button
              type="button"
              className={`position-type-btn long ${
                tradeForm.positionType === "long" ? "active" : ""
              }`}
              onClick={() => handleFormChange("positionType", "long")}
            >
              Long
            </button>
            <button
              type="button"
              className={`position-type-btn short ${
                tradeForm.positionType === "short" ? "active" : ""
              }`}
              onClick={() => handleFormChange("positionType", "short")}
            >
              Short
            </button>
          </div>
        </div>

        <div className="form-section">
          <label className="form-label">Amount (USDC)</label>
          <div className="amount-input-wrapper">
            <input
              type="text"
              value={tradeForm.amount}
              onChange={(e) =>
                handleFormChange(
                  "amount",
                  e.target.value.replace(/[^\d.]/g, "")
                )
              }
              placeholder="Enter amount"
              className="amount-input"
            />
            <div className="amount-buttons">
              <button
                type="button"
                className="amount-preset-btn"
                onClick={() => handleFormChange("amount", "100")}
              >
                $100
              </button>
              <button
                type="button"
                className="amount-preset-btn"
                onClick={() => handleFormChange("amount", "500")}
              >
                $500
              </button>
              <button
                type="button"
                className="amount-preset-btn"
                onClick={() => handleFormChange("amount", "1000")}
              >
                $1000
              </button>
            </div>
          </div>
        </div>

        {tradeForm.orderType !== "market" && (
          <div className="form-section">
            <label className="form-label">Price</label>
            <input
              type="text"
              value={tradeForm.price || ""}
              onChange={(e) =>
                handleFormChange("price", e.target.value.replace(/[^\d.]/g, ""))
              }
              placeholder={`Market Price: $${selectedMarket.price}`}
              className="price-input"
            />
          </div>
        )}

        <div className="form-section">
          <label className="form-label">Leverage: {tradeForm.leverage}x</label>
          <div className="leverage-slider-container">
            <input
              type="range"
              min="1"
              max={selectedMarket.maxLeverage}
              value={tradeForm.leverage}
              onChange={(e) =>
                handleFormChange("leverage", parseInt(e.target.value))
              }
              className="leverage-slider"
              style={
                {
                  "--value":
                    (tradeForm.leverage / selectedMarket.maxLeverage) * 100 +
                    "%",
                } as React.CSSProperties
              }
            />
            <div className="leverage-marks">
              <span>1x</span>
              <span>{Math.floor(selectedMarket.maxLeverage / 2)}x</span>
              <span>{selectedMarket.maxLeverage}x</span>
            </div>
          </div>
        </div>

        <div className="form-section order-summary">
          <div className="summary-row">
            <span className="summary-label">Size</span>
            <span className="summary-value">
              {tradeForm.amount
                ? formatDollars(
                    parseFloat(tradeForm.amount) * tradeForm.leverage
                  )
                : "$0.00"}
            </span>
          </div>
          <div className="summary-row">
            <span className="summary-label">Margin</span>
            <span className="summary-value">
              {tradeForm.amount
                ? formatDollars(parseFloat(tradeForm.amount))
                : "$0.00"}
            </span>
          </div>
          <div className="summary-row">
            <span className="summary-label">Est. Liquidation Price</span>
            <span className="summary-value">
              {tradeForm.amount && parseFloat(tradeForm.amount) > 0
                ? "$" +
                  (tradeForm.positionType === "long"
                    ? (
                        selectedMarket.price *
                        (1 - 0.9 / tradeForm.leverage)
                      ).toFixed(2)
                    : (
                        selectedMarket.price *
                        (1 + 0.9 / tradeForm.leverage)
                      ).toFixed(2))
                : "--"}
            </span>
          </div>
        </div>

        <button
          type="submit"
          className={`trade-submit-btn ${
            tradeForm.positionType === "long" ? "long" : "short"
          }`}
          disabled={
            !connected || !tradeForm.amount || parseFloat(tradeForm.amount) <= 0
          }
        >
          {tradeForm.positionType === "long" ? "Buy / Long" : "Sell / Short"}
        </button>
      </form>
    );
  };

  const renderUserPositions = () => {
    if (!connected) {
      return (
        <div className="connect-wallet-prompt">
          <div className="empty-state">
            <div className="empty-icon">🔐</div>
            <h3>Wallet Not Connected</h3>
            <p>Connect your wallet to view your positions and start trading.</p>
          </div>
        </div>
      );
    }

    if (userPositions.length === 0) {
      return (
        <div className="empty-positions">
          <div className="empty-state">
            <div className="empty-icon">📊</div>
            <h3>No Open Positions</h3>
            <p>You don't have any open perpetual positions yet.</p>
          </div>
        </div>
      );
    }

    return (
      <div className="user-positions">
        <h3>Your Positions</h3>
        <div className="positions-table">
          <table>
            <thead>
              <tr>
                <th>Market</th>
                <th className="align-center">Type</th>
                <th className="align-right">Size</th>
                <th className="align-right">Entry Price</th>
                <th className="align-right">Mark Price</th>
                <th className="align-right">Liq. Price</th>
                <th className="align-right">PnL</th>
                <th className="actions-column">Actions</th>
              </tr>
            </thead>
            <tbody>
              {userPositions.map((position) => (
                <tr key={position.id} className="position-row">
                  <td className="market-cell">
                    <div className="market-info">
                      <TokenIcon
                        token={{
                          symbol: position.baseTokenSymbol,
                          name: position.baseTokenSymbol,
                          address: position.baseToken,
                        }}
                        metadata={{
                          logo_uri: position.baseTokenLogo,
                          logoUrl: position.baseTokenLogo,
                          logoURI: position.baseTokenLogo,
                          logo: position.baseTokenLogo,
                          address: position.baseToken,
                        }}
                        size="small"
                      />
                      <span>{position.pair}</span>
                    </div>
                  </td>
                  <td className="position-type-cell align-center">
                    <span className={`position-badge ${position.positionType}`}>
                      {position.positionType === "long" ? "Long" : "Short"}{" "}
                      {position.leverage}x
                    </span>
                  </td>
                  <td className="align-right">
                    {formatDollars(position.size)}
                  </td>
                  <td className="align-right">
                    $
                    {position.entryPrice.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </td>
                  <td className="align-right">
                    $
                    {position.markPrice.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </td>
                  <td className="align-right">
                    $
                    {position.liquidationPrice.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </td>
                  <td
                    className={`pnl-cell align-right ${
                      position.unrealizedPnl >= 0 ? "positive" : "negative"
                    }`}
                  >
                    {position.unrealizedPnl >= 0 ? "+" : ""}
                    {formatDollars(position.unrealizedPnl)} (
                    {position.unrealizedPnl >= 0 ? "+" : ""}
                    {position.unrealizedPnlPercentage.toFixed(2)}%)
                  </td>
                  <td className="actions-cell">
                    <div className="position-actions">
                      <button className="btn btn--secondary btn--sm">
                        Add
                      </button>
                      <button className="btn btn--primary btn--sm">
                        Close
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderMarketsTable = () => {
    return (
      <div className="markets-table-container">
        <table>
          <thead>
            <tr>
              <th>Market</th>
              <th className="align-right">Price</th>
              <th className="align-right">24h Change</th>
              <th className="align-right">24h Volume</th>
              <th className="align-right">Open Interest</th>
              <th className="align-center">Funding Rate</th>
              <th className="align-right">Max Leverage</th>
              <th className="actions-column">Actions</th>
            </tr>
          </thead>
          <tbody>
            {markets.map((market) => (
              <tr key={market.id} className="market-row">
                <td className="market-cell">
                  <div className="market-info">
                    <TokenIcon
                      token={{
                        symbol: market.baseTokenSymbol,
                        name: market.baseTokenSymbol,
                        address: market.baseToken,
                      }}
                      metadata={{
                        logo_uri: market.baseTokenLogo,
                        logoUrl: market.baseTokenLogo,
                        logoURI: market.baseTokenLogo,
                        logo: market.baseTokenLogo,
                        address: market.baseToken,
                      }}
                      size="small"
                    />
                    <span>{market.pair}</span>
                  </div>
                </td>
                <td className="align-right">
                  $
                  {market.price.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </td>
                <td
                  className={`align-right ${
                    market.change24h >= 0 ? "positive" : "negative"
                  }`}
                >
                  {market.change24h >= 0 ? "+" : ""}
                  {market.change24h.toFixed(2)}%
                </td>
                <td className="align-right">
                  {formatDollars(market.volume24h)}
                </td>
                <td className="align-right">
                  {formatDollars(market.openInterest)}
                </td>
                <td
                  className={`align-center ${
                    market.fundingRate >= 0 ? "positive" : "negative"
                  }`}
                >
                  {market.fundingRate >= 0 ? "+" : ""}
                  {formatPercentage(market.fundingRate * 100)}%
                </td>
                <td className="align-right">{market.maxLeverage}x</td>
                <td className="actions-cell">
                  <div className="market-actions">
                    <button
                      className="btn btn--primary btn--sm"
                      onClick={() => {
                        setSelectedMarket(market);
                        setTradeForm((prev) => ({
                          ...prev,
                          marketId: market.id,
                        }));
                        handleTabChange("trade");
                      }}
                    >
                      Trade
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  // Render chart using ApexCharts
  const renderChart = () => {
    return (
      <div className="chart-wrapper">
        {!chartLoaded ? (
          <div className="chart-loading">
            <div className="spinner"></div>
            <div className="loading-text">Loading chart...</div>
          </div>
        ) : (
          <ReactApexChart
            options={chartOptions}
            series={[{ data: chartData }]}
            type="candlestick"
            height={400}
          />
        )}
      </div>
    );
  };

  return (
    <div className="perpetual-page">
      <div className="content-container">
        <div className="page-header">
          <div className="page-title">
            <h1>Perpetual Futures</h1>
            <p className="subtitle">Trade crypto with up to 20x leverage</p>
          </div>
        </div>

        {/* Tab navigation */}
        <div className="tabs-navigation">
          <button
            className={`tab-button ${activeTab === "trade" ? "active" : ""}`}
            onClick={() => handleTabChange("trade")}
          >
            Trade
          </button>
          <button
            className={`tab-button ${activeTab === "markets" ? "active" : ""}`}
            onClick={() => handleTabChange("markets")}
          >
            Markets
          </button>
          <button
            className={`tab-button ${
              activeTab === "positions" ? "active" : ""
            }`}
            onClick={() => handleTabChange("positions")}
          >
            Positions {userPositions.length > 0 && `(${userPositions.length})`}
          </button>
        </div>

        {loading ? (
          <div className="loading-state">
            <div className="spinner"></div>
            <div className="loading-text">Loading markets data...</div>
          </div>
        ) : (
          <>
            {activeTab === "trade" && (
              <div className="trading-layout">
                <div className="chart-container">
                  {renderMarketSelector()}
                  {renderMarketInfo()}
                  {/* Use ApexCharts instead of canvas */}
                  {renderChart()}
                </div>

                <div className="trading-sidebar">{renderTradingForm()}</div>

                <div className="positions-section">{renderUserPositions()}</div>
              </div>
            )}

            {activeTab === "markets" && renderMarketsTable()}

            {activeTab === "positions" && (
              <div className="positions-container">{renderUserPositions()}</div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default PerpetualPage;
