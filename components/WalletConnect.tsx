import { ConnectButton, useWallet } from "@suiet/wallet-kit";

export default function WalletConnect() {
  const { connected, account } = useWallet();

  return (
    <div className="wallet-connect">
      {connected ? (
        <div className="wallet-connected">
          <span>
            Connected: {account?.address?.slice(0, 6)}...
            {account?.address?.slice(-4)}
          </span>
          <ConnectButton />
        </div>
      ) : (
        <div className="wallet-disconnected">
          <ConnectButton>Connect Wallet</ConnectButton>
        </div>
      )}
    </div>
  );
}
