// src/App.tsx
// Last Updated: 2025-05-16 23:07:49 by jake1318

import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { SuiProvider } from "./providers/SuiProvider";
import { WalletProvider } from "./contexts/WalletContext";
import { BirdeyeProvider } from "./contexts/BirdeyeContext";
import Navbar from "./components/Navbar/Navbar";
import Footer from "./components/Footer/Footer";
import Home from "./pages/Home/Home";
import Swap from "./pages/Swap/Swap";
import SearchPage from "./pages/SearchPage/SearchPage";
import Dex from "./pages/Dex/Dex";
import Pools from "./pages/PoolsPage/Pools";
import Positions from "./pages/PoolsPage/Positions";
import Portfolio from "./pages/Portfolio/Portfolio";
import LendingPage from "./pages/Lending/LendingPage";
import PerpetualPage from "./pages/Perpetual/PerpetualPage";
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
            <Route path="/search" element={<SearchPage />} />
            <Route path="/swap" element={<Swap />} />
            <Route path="/pools" element={<Pools />} />
            <Route path="/positions" element={<Positions />} />
            <Route path="/portfolio" element={<Portfolio />} />
            <Route path="/dex" element={<Dex />} />
            <Route path="/lending" element={<LendingPage />} />
            <Route path="/perpetual" element={<PerpetualPage />} />
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
        <BirdeyeProvider>
          <AppContent />
        </BirdeyeProvider>
      </WalletProvider>
    </SuiProvider>
  );
}

export default App;
