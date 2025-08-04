import React from "react";
import { useWalletContext } from "../../contexts/WalletContext";
import "./WalletDetails.scss";

const WalletDetails: React.FC = () => {
  const { walletState, formatBalance, formatUsd, coinPrices } =
    useWalletContext();
  const { balances, totalUsdValue, loading } = walletState;

  if (loading) {
    return (
      <div className="wallet-details loading">
        <div className="spinner"></div>
        <p>Loading wallet details...</p>
      </div>
    );
  }

  if (balances.length === 0) {
    return (
      <div className="wallet-details empty">
        <p>No tokens found in your wallet.</p>
      </div>
    );
  }

  return (
    <div className="wallet-details">
      <div className="wallet-details__header">
        <h3>Wallet Balance</h3>
        <div className="total-balance">
          {totalUsdValue !== null ? formatUsd(totalUsdValue) : "$0.00"}
        </div>
      </div>

      <div className="wallet-details__tokens">
        {balances.map((balance) => {
          const price = coinPrices[balance.coinType] || 0;
          const formattedBalance = formatBalance(
            balance.balance,
            balance.decimals
          );
          const numericBalance =
            Number(balance.balance) / Math.pow(10, balance.decimals);
          const tokenValue = numericBalance * price;

          return (
            <div key={balance.coinType} className="token-item">
              <div className="token-icon">
                {/* Replace with actual token icons if available */}
                <div className="placeholder-icon">{balance.symbol[0]}</div>
              </div>

              <div className="token-details">
                <div className="token-name">
                  <span className="symbol">{balance.symbol}</span>
                  <span className="full-name">{balance.name}</span>
                </div>

                <div className="token-balance">
                  <div className="amount">{formattedBalance}</div>
                  <div className="value">{formatUsd(tokenValue)}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default WalletDetails;
