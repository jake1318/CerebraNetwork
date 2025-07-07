// src/pages/Swap/components/DcaModal.tsx
import React, { useState, useEffect } from "react";
import { useWallet } from "@suiet/wallet-kit";
import { TransactionBlock } from "@mysten/sui";
import TokenSelector, {
  TokenData,
} from "../../../components/TokenSelector/TokenSelector";
import classes from "./DcaModal.module.scss";
import "./DcaModalOverrides.scss";

// ────────────────────────────────────────────────────────────────────────────────
// on-chain constants (mainnet only)
const DCA_PACKAGE_ID =
  "0x3f4b3c3c6f5e2d8a1b7c9f0e6d4a2c1b0a9e8d7cf6b5a4c3d2e1f0a9b8c7d6e";
const DCA_MODULE = "dca";
const PLACE_DCA_FN = "place_dca_order";
// ────────────────────────────────────────────────────────────────────────────────

const INTERVALS = [
  { label: "15 min", ms: 15 * 60 * 1000 },
  { label: "1 h", ms: 60 * 60 * 1000 },
  { label: "4 h", ms: 4 * 60 * 60 * 1000 },
  { label: "1 day", ms: 24 * 60 * 60 * 1000 },
  { label: "1 week", ms: 7 * 24 * 60 * 60 * 1000 },
];

export interface DcaModalProps {
  open: boolean;
  onClose: () => void;
  defaultPay?: TokenData | null;
  defaultTarget?: TokenData | null;
}

export default function DcaModal({
  open,
  onClose,
  defaultPay,
  defaultTarget,
}: DcaModalProps) {
  const { signAndExecuteTransactionBlock, account } = useWallet();

  const [payToken, setPayToken] = useState<TokenData | null>(
    defaultPay || null
  );
  const [targetToken, setTargetToken] = useState<TokenData | null>(
    defaultTarget || null
  );
  const [showSelector, setShowSelector] = useState<"pay" | "target" | null>(
    null
  );

  const [payAmountEach, setPayAmountEach] = useState(""); // human units
  const [numOrders, setNumOrders] = useState("4");
  const [intervalIdx, setIntervalIdx] = useState(3); // default 1 day
  const [minRate, setMinRate] = useState(""); // optional
  const [maxRate, setMaxRate] = useState(""); // optional
  const [slippage, setSlippage] = useState("1"); // % value

  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");

  // On open, prefill tokens if provided
  useEffect(() => {
    if (!open) return;
    if (defaultPay && !payToken) setPayToken(defaultPay);
    if (defaultTarget && !targetToken) setTargetToken(defaultTarget);
  }, [open, defaultPay, defaultTarget]);

  const disabled =
    !payToken || !targetToken || !payAmountEach || !numOrders || processing;

  // Helpers to convert inputs
  const toScaled = (value: string, decimals: number) =>
    BigInt(Math.floor(parseFloat(value) * 10 ** decimals));
  const computeRate = (val: string) => {
    if (!val || !payToken || !targetToken) return BigInt(0);
    const raw = parseFloat(val);
    const diff = targetToken.decimals - payToken.decimals;
    return BigInt(Math.floor(raw * 10 ** diff * 10 ** 12));
  };

  // Open the shared TokenSelector
  const openTokenSelector = (type: "pay" | "target") => {
    setShowSelector(type);
  };
  const handleTokenSelect = (tok: TokenData) => {
    if (showSelector === "pay") setPayToken(tok);
    if (showSelector === "target") setTargetToken(tok);
    setShowSelector(null);
  };

  // The main submit handler now builds and submits a Move call manually
  const handleSubmit = async () => {
    if (!account?.address || !signAndExecuteTransactionBlock || disabled)
      return;

    try {
      setProcessing(true);
      setError("");

      // prepare all values
      const payCoinAmountEach = toScaled(payAmountEach, payToken!.decimals);
      const numOrdersValue = BigInt(parseInt(numOrders, 10));
      const intervalValue = BigInt(INTERVALS[intervalIdx].ms);
      const minRateValue = minRate ? computeRate(minRate) : BigInt(0);
      const maxRateValue = maxRate ? computeRate(maxRate) : BigInt(0);
      const slippageValue = BigInt(Math.floor(parseFloat(slippage) * 100)); // bps

      // build the transaction block
      const tx = new TransactionBlock();
      // split out the payment coins from gas
      const [coins] = tx.splitCoins(tx.gas, [tx.pure(payCoinAmountEach)]);

      tx.moveCall({
        target: `${DCA_PACKAGE_ID}::${DCA_MODULE}::${PLACE_DCA_FN}`,
        typeArguments: [payToken!.address, targetToken!.address],
        arguments: [
          coins,
          tx.pure(intervalValue),
          tx.pure(numOrdersValue),
          tx.pure(minRateValue),
          tx.pure(maxRateValue),
          tx.pure(slippageValue),
        ],
      });

      // sign & execute
      await signAndExecuteTransactionBlock({ transactionBlock: tx });
      onClose();
    } catch (e: any) {
      console.error("DCA order failed", e);
      setError(e.message || "Failed to create DCA order");
    } finally {
      setProcessing(false);
    }
  };

  if (!open) return null;
  return (
    <>
      <div className={classes.backdrop} onClick={onClose} />
      <div className={classes.modal}>
        <h2>Create DCA Order</h2>
        <p className={classes.subtitle}>
          Dollar-Cost Average your trades over time
        </p>

        {/* token pickers */}
        <div className={classes.tokenRow}>
          <button onClick={() => openTokenSelector("pay")}>
            {payToken ? (
              <div className={classes.tokenButton}>
                <img
                  src={payToken.logo}
                  alt={payToken.symbol}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
                <span>{payToken.symbol}</span>
              </div>
            ) : (
              "Pay Token"
            )}
          </button>
          →
          <button onClick={() => openTokenSelector("target")}>
            {targetToken ? (
              <div className={classes.tokenButton}>
                <img
                  src={targetToken.logo}
                  alt={targetToken.symbol}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
                <span>{targetToken.symbol}</span>
              </div>
            ) : (
              "Target Token"
            )}
          </button>
        </div>

        {/* parameters */}
        <label>
          Amount per order
          <input
            type="number"
            min={0}
            value={payAmountEach}
            onChange={(e) => setPayAmountEach(e.target.value)}
            placeholder="e.g. 25"
          />
          {payToken && (
            <span className={classes.tokenLabel}>{payToken.symbol}</span>
          )}
        </label>

        <label>
          Number of orders
          <input
            type="number"
            min={1}
            value={numOrders}
            onChange={(e) => setNumOrders(e.target.value)}
          />
        </label>

        <label>
          Interval
          <select
            value={intervalIdx}
            onChange={(e) => setIntervalIdx(parseInt(e.target.value, 10))}
          >
            {INTERVALS.map((opt, i) => (
              <option key={i} value={i}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <div className={classes.rateSection}>
          <label>
            Min rate (opt)
            <input
              type="number"
              min={0}
              value={minRate}
              onChange={(e) => setMinRate(e.target.value)}
              placeholder="target / pay"
            />
            {payToken && targetToken && (
              <span className={classes.rateLabel}>
                {targetToken.symbol}/{payToken.symbol}
              </span>
            )}
          </label>
          <label>
            Max rate (opt)
            <input
              type="number"
              min={0}
              value={maxRate}
              onChange={(e) => setMaxRate(e.target.value)}
              placeholder="target / pay"
            />
            {payToken && targetToken && (
              <span className={classes.rateLabel}>
                {targetToken.symbol}/{payToken.symbol}
              </span>
            )}
          </label>
        </div>

        <label>
          Slippage tolerance
          <div className={classes.slippageRow}>
            <input
              type="number"
              min={0}
              step={0.1}
              value={slippage}
              onChange={(e) => setSlippage(e.target.value)}
            />
            <span className={classes.percentLabel}>%</span>
          </div>
        </label>

        {error && <div className={classes.error}>{error}</div>}

        <div className={classes.buttonRow}>
          <button
            className={classes.cancelButton}
            onClick={onClose}
            disabled={processing}
          >
            Cancel
          </button>
          <button
            className={classes.submitButton}
            onClick={handleSubmit}
            disabled={disabled}
          >
            {processing ? "Creating..." : "Create DCA Order"}
          </button>
        </div>
      </div>

      {/* Token selector overlay */}
      <div className="token-selector-wrapper">
        {showSelector && (
          <TokenSelector
            isOpen
            onClose={() => setShowSelector(null)}
            onSelect={handleTokenSelect}
            excludeAddresses={
              showSelector === "pay" && targetToken
                ? [targetToken.address]
                : showSelector === "target" && payToken
                ? [payToken.address]
                : []
            }
          />
        )}
      </div>
    </>
  );
}
