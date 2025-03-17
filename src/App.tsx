import { useWallet } from "@suiet/wallet-kit";
import { SuiProvider } from "./providers/SuiProvider";
import SwapForm from "./components/SwapForm";
import WalletConnect from "./components/WalletConnect";
import "./App.css";

function AppContent() {
  const { connected } = useWallet();

  return (
    <div className="app-container">
      <header>
        <h1>7K DeFi App</h1>
        <WalletConnect />
      </header>
      <main>
        {connected ? (
          <SwapForm />
        ) : (
          <div className="connect-prompt">
            Please connect your wallet to use the app
          </div>
        )}
      </main>
      <footer>
        <p>Powered by 7K Protocol on Sui Blockchain</p>
      </footer>
    </div>
  );
}

function App() {
  return (
    <SuiProvider>
      <AppContent />
    </SuiProvider>
  );
}

export default App;
