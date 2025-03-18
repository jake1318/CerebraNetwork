import { useWallet } from "@suiet/wallet-kit";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { SuiProvider } from "./providers/SuiProvider";
import { WalletProvider } from "./contexts/WalletContext";
import Navbar from "./components/Navbar/Navbar";
import Footer from "./components/Footer/Footer";
import Home from "./pages/Home/Home";
import SwapForm from "./components/SwapForm";
import "./App.scss";

function SwapContent() {
  const { connected } = useWallet();

  return (
    <div className="swap-container">
      {connected ? (
        <SwapForm />
      ) : (
        <div className="connect-prompt">
          Please connect your wallet to use the app
        </div>
      )}
    </div>
  );
}

function AppContent() {
  return (
    <Router>
      <div className="app-container">
        <Navbar />
        <main>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/swap" element={<SwapContent />} />
          </Routes>
        </main>
        <Footer />
      </div>
    </Router>
  );
}

function App() {
  return (
    <SuiProvider>
      <WalletProvider>
        <AppContent />
      </WalletProvider>
    </SuiProvider>
  );
}

export default App;
