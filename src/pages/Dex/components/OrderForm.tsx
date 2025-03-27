import React, { useEffect, useState } from "react";
import { placeLimitOrder } from "@7kprotocol/sdk-ts";
import blockvisionService from "../../../services/blockvisionService";

// Map supported token symbols to their full Sui coinType strings
const COIN_TYPE_MAP: Record<string, string> = {
  CETUS:
    "0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS",
  SUI: "0x2::sui::SUI",
  DEEP: "0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP",
  ETH: "0xd0e89b2af5e4910726fbcd8b8dd37bb79b29e5f83f7491bca830e94f7f226d29::eth::ETH",
  WBTC: "0xaafb102dd0902f5055cadecd687fb5b71ca82ef0e0285d90afde828ec58ca96b::btc::BTC",
  NAVX: "0xa99b8952d4f7d947ea77fe0ecdcc9e5fc0bcab2841d6e2a5aa00c3044e5544b5::navx::NAVX",
  SCA: "0x7016aae72cfc67f2fadf55769c0a7dd54291a583b63051a5ed71081cce836ac6::sca::SCA",
  WSOL: "0xb7844e289a8410e50fb3ca48d69eb9cf29e27d223ef90353fe1bd8e27ff8f3f8::coin::COIN",
  WBNB: "0xb848cce11ef3a8f62eccea6eb5b35a12c4c2b1ee1af7755d02d7bd6218e8226f::coin::COIN",
  APT: "0x3a5143bb1196e3bcdfab6203d1683ae29edd26294fc8bfeafe4aaa9d2704df37::coin::COIN",
};

interface OrderFormProps {
  baseAsset: string; // e.g. "SUI"
  quoteAsset: string; // e.g. "CETUS"
  orderType: "buy" | "sell"; // "buy" for buying baseAsset, "sell" for selling baseAsset
  walletAddress: string; // user's Sui address
}

const OrderForm: React.FC<OrderFormProps> = ({
  baseAsset,
  quoteAsset,
  orderType,
  walletAddress,
}) => {
  // State for fetched balances: symbol -> { balance (raw string), decimals (number) }
  const [balances, setBalances] = useState<
    Record<string, { balance: string; decimals: number }>
  >({});
  // State for order kind selection (limit or market)
  const [orderKind, setOrderKind] = useState<"limit" | "market">("limit");
  // Form inputs for price and amount
  const [price, setPrice] = useState<string>("");
  const [amount, setAmount] = useState<string>("");

  // Determine which token is being spent (pay) and which is received (target)
  const payAssetSymbol = orderType === "buy" ? quoteAsset : baseAsset;
  const targetAssetSymbol = orderType === "buy" ? baseAsset : quoteAsset;
  const payCoinType = COIN_TYPE_MAP[payAssetSymbol];
  const targetCoinType = COIN_TYPE_MAP[targetAssetSymbol];

  // Compute the available balance (in human-readable units) of the asset being spent
  const payAssetBalanceInfo = balances[payAssetSymbol];
  let payAssetBalanceNum = 0;
  if (payAssetBalanceInfo) {
    const { balance, decimals } = payAssetBalanceInfo;
    payAssetBalanceNum = Number(balance) / Math.pow(10, decimals);
  }

  // Fetch token balances using the blockvisionService
  const fetchBalances = async (address: string) => {
    if (!address) return;
    try {
      const resp = await blockvisionService.getAccountCoins(address);
      // The API returns an object where result contains a coins array.
      const result = resp.data;
      const coinsList = result.coins ?? [];
      const newBalances: Record<string, { balance: string; decimals: number }> =
        {};
      if (Array.isArray(coinsList)) {
        for (const coin of coinsList) {
          if (coin.symbol && coin.balance && coin.decimals !== undefined) {
            newBalances[coin.symbol] = {
              balance: coin.balance,
              decimals: coin.decimals,
            };
          }
        }
      }
      // Ensure supported tokens are present, defaulting to 0 if not found
      [baseAsset, quoteAsset].forEach((sym) => {
        if (!newBalances[sym]) {
          newBalances[sym] = { balance: "0", decimals: 9 };
        }
      });
      setBalances(newBalances);
    } catch (error) {
      console.error("Failed to fetch balances:", error);
    }
  };

  // Fetch balances whenever the wallet address changes
  useEffect(() => {
    if (walletAddress) {
      fetchBalances(walletAddress);
    }
  }, [walletAddress]);

  // Handler for clicking percentage buttons to fill the amount
  const handlePercentage = (percent: number) => {
    if (!payAssetBalanceInfo) return;
    const { balance: rawBalance, decimals } = payAssetBalanceInfo;
    const totalPayBalance = Number(rawBalance) / Math.pow(10, decimals);
    if (totalPayBalance <= 0) return;
    let newAmount = 0;
    if (orderType === "buy") {
      const spendAmount = totalPayBalance * (percent / 100);
      const priceNum = parseFloat(price);
      if (!priceNum || priceNum <= 0) return;
      newAmount = spendAmount / priceNum;
    } else {
      newAmount = totalPayBalance * (percent / 100);
    }
    setAmount(newAmount.toString());
  };

  // Form submission handler
  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (orderKind === "market") {
      alert("Market orders are handled via the swap page.");
      return;
    }
    const priceNum = parseFloat(price);
    const amountNum = parseFloat(amount);
    if (
      !walletAddress ||
      !payCoinType ||
      !targetCoinType ||
      !priceNum ||
      !amountNum
    ) {
      console.error("Missing required fields for placing limit order");
      return;
    }
    try {
      const payDecimals = balances[payAssetSymbol]?.decimals ?? 0;
      const targetDecimals = balances[targetAssetSymbol]?.decimals ?? 0;
      let payAmountRaw: bigint;
      let rate: bigint;
      if (orderType === "buy") {
        const quoteAmount = priceNum * amountNum;
        payAmountRaw = BigInt(
          Math.floor(quoteAmount * Math.pow(10, payDecimals))
        );
        const targetPerPay = priceNum > 0 ? 1 / priceNum : 0;
        rate = BigInt(
          Math.floor(
            targetPerPay * Math.pow(10, targetDecimals - payDecimals) * 1e12
          )
        );
      } else {
        payAmountRaw = BigInt(
          Math.floor(amountNum * Math.pow(10, payDecimals))
        );
        rate = BigInt(
          Math.floor(
            priceNum * Math.pow(10, targetDecimals - payDecimals) * 1e12
          )
        );
      }
      const expireTs = BigInt(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const slippage = BigInt(100);
      const tx = await placeLimitOrder({
        accountAddress: walletAddress,
        payCoinType,
        targetCoinType,
        expireTs,
        payCoinAmount: payAmountRaw,
        rate,
        slippage,
        devInspect: false,
      });
      console.log("Limit order placed. Transaction:", tx);
      fetchBalances(walletAddress);
      setAmount("");
    } catch (err) {
      console.error("Failed to place limit order:", err);
    }
  };

  return (
    <form className="order-form" onSubmit={handleSubmitOrder}>
      <h3>{orderType === "buy" ? `Buy ${baseAsset}` : `Sell ${baseAsset}`}</h3>

      {/* Order kind selection: Limit or Market */}
      <div className="order-kind-toggle">
        <label>
          Order Type:
          <select
            value={orderKind}
            onChange={(e) => setOrderKind(e.target.value as "limit" | "market")}
          >
            <option value="limit">Limit</option>
            <option value="market">Market</option>
          </select>
        </label>
      </div>

      {/* Limit order inputs */}
      {orderKind === "limit" && (
        <>
          <div className="form-row">
            <label>
              Price ({quoteAsset} per {baseAsset}):
              <input
                type="number"
                step="any"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder={`Price in ${quoteAsset}`}
              />
            </label>
          </div>
          <div className="form-row">
            <label>
              Amount ({baseAsset}):
              <input
                type="number"
                step="any"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={`Amount in ${baseAsset}`}
              />
            </label>
            <div className="available-balance">
              Available: {payAssetBalanceNum.toFixed(4)} {payAssetSymbol}
            </div>
            <div className="percent-buttons">
              {[25, 50, 75, 100].map((pct) => (
                <button
                  type="button"
                  key={pct}
                  onClick={() => handlePercentage(pct)}
                >
                  {pct}%
                </button>
              ))}
            </div>
          </div>
          <div className="form-row">
            <label>Total ({quoteAsset}): </label>
            <span>
              {price && amount
                ? (parseFloat(price) * parseFloat(amount)).toFixed(6)
                : "0"}
            </span>
          </div>
        </>
      )}

      {/* Market order notice */}
      {orderKind === "market" && (
        <div className="market-notice">
          <em>Market orders are handled via the swap page.</em>
        </div>
      )}

      {/* Submit button */}
      <button type="submit" disabled={!walletAddress}>
        {orderKind === "limit" ? "Place Limit Order" : "Market Order"}
      </button>
    </form>
  );
};

export default OrderForm;
