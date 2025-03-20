import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { SuiProvider } from "./providers/SuiProvider";
import { WalletProvider } from "./contexts/WalletContext";
import { DeepBookProvider } from "./contexts/DeepBookContext"; // Import DeepBookProvider
import Navbar from "./components/Navbar/Navbar";
import Footer from "./components/Footer/Footer";
import Home from "./pages/Home/Home";
import Swap from "./pages/Swap/Swap";
import SearchPage from "./pages/SearchPage/SearchPage";
import Pools from "./pages/PoolsPage/Pools";
import Dex from "./pages/Dex/Dex";
import AdvancedTrading from "./pages/AdvancedTrading/AdvancedTrading"; // Import AdvancedTrading page
import "./App.scss";

function AppContent() {
  return (
    <Router>
      <div className="app-container">
        {/* Background visual elements */}
        <div className="bg-grid"></div>
        <div className="bg-glow glow-1"></div>
        <div className="bg-glow glow-2"></div>

        <Navbar />
        <main>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/swap" element={<Swap />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/pools" element={<Pools />} />
            <Route path="/dex" element={<Dex />} />
            <Route path="/trading" element={<AdvancedTrading />} />{" "}
            {/* Add AdvancedTrading route */}
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
        <DeepBookProvider>
          {" "}
          {/* Wrap with DeepBookProvider */}
          <AppContent />
        </DeepBookProvider>
      </WalletProvider>
    </SuiProvider>
  );
}

export default App;
