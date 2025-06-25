// src/pages/Dex/components/OrderForm.tsx
// Last Updated: 2025-06-24 19:29:32 UTC by jake1318

import React, { useState, useEffect } from "react";
import { useWallet } from "@suiet/wallet-kit";
import "./OrderForm.scss";

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

interface OrderFormProps {
  pair: TradingPair;
  orderType: "buy" | "sell";
  setOrderType: (type: "buy" | "sell") => void;
  orderMode: "limit" | "market";
  setOrderMode: (mode: "limit" | "market") => void;
}

const OrderForm: React.FC<OrderFormProps> = ({
  pair,
  orderType,
  setOrderType,
  orderMode,
  setOrderMode,
}) => {
  const { connected } = useWallet();
  const [price, setPrice] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [total, setTotal] = useState<number>(0);
  const [availableBalance, setAvailableBalance] = useState<number>(4.5168);

  // Update price when pair changes
  useEffect(() => {
    if (pair) {
      setPrice(pair.price.toString());
    }
  }, [pair]);

  // Calculate total when price or amount changes
  useEffect(() => {
    const priceValue = parseFloat(price) || 0;
    const amountValue = parseFloat(amount) || 0;
    setTotal(priceValue * amountValue);
  }, [price, amount]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Implement order submission logic here
    console.log(`Submitted ${orderType} order:`, {
      pair: pair.name,
      mode: orderMode,
      price: parseFloat(price),
      amount: parseFloat(amount),
      total,
    });
  };

  const setAmountPercentage = (percentage: number) => {
    if (orderType === "buy") {
      const maxAmount = availableBalance / (parseFloat(price) || 1);
      setAmount((maxAmount * (percentage / 100)).toFixed(4));
    } else {
      // For sell orders, we'd use available token balance
      // For demo, we'll use a placeholder value
      const maxTokenAmount = 100;
      setAmount((maxTokenAmount * (percentage / 100)).toFixed(4));
    }
  };

  return (
    <form className="order-form" onSubmit={handleSubmit}>
      {/* Buy/Sell Tabs */}
      <div className="order-tabs">
        <button
          type="button"
          className={`buy ${orderType === "buy" ? "active" : ""}`}
          onClick={() => setOrderType("buy")}
        >
          Buy {pair.baseAsset}
        </button>
        <button
          type="button"
          className={`sell ${orderType === "sell" ? "active" : ""}`}
          onClick={() => setOrderType("sell")}
        >
          Sell {pair.baseAsset}
        </button>
      </div>

      {/* Limit/Market Tabs */}
      <div className="order-mode-tabs">
        <button
          type="button"
          className={`${orderMode === "limit" ? "active" : ""}`}
          onClick={() => setOrderMode("limit")}
        >
          Limit
        </button>
        <button
          type="button"
          className={`${orderMode === "market" ? "active" : ""}`}
          onClick={() => setOrderMode("market")}
        >
          Market
        </button>
      </div>

      {/* Price Input - Only shown for limit orders */}
      {orderMode === "limit" && (
        <div className="form-field">
          <label>Price ({pair.quoteAsset})</label>
          <input
            type="text"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="0.00"
          />
        </div>
      )}

      {/* Amount Input */}
      <div className="form-field">
        <label>Amount ({pair.baseAsset})</label>
        <input
          type="text"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={`Amount in ${pair.baseAsset}`}
        />
      </div>

      {/* Available Balance */}
      <div className="available-balance">
        Available: {availableBalance} {pair.quoteAsset}
      </div>

      {/* Amount Percentage Buttons */}
      <div className="amount-percentages">
        <button type="button" onClick={() => setAmountPercentage(25)}>
          25%
        </button>
        <button type="button" onClick={() => setAmountPercentage(50)}>
          50%
        </button>
        <button type="button" onClick={() => setAmountPercentage(75)}>
          75%
        </button>
        <button type="button" onClick={() => setAmountPercentage(100)}>
          100%
        </button>
      </div>

      {/* Total */}
      <div className="total-section">
        <span className="total-label">Total {pair.quoteAsset}</span>
        <span className="total-amount">{total.toFixed(6)}</span>
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        className={`submit-button ${orderType}`}
        disabled={!connected || !amount || parseFloat(amount) <= 0}
      >
        {connected
          ? `${orderType === "buy" ? "Buy" : "Sell"} ${pair.baseAsset}`
          : "Connect Wallet"}
      </button>
    </form>
  );
};

export default OrderForm;
