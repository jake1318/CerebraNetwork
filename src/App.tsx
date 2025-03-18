import { useWallet } from "@suiet/wallet-kit";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { SuiProvider } from "./providers/SuiProvider";
import { WalletProvider } from "./contexts/WalletContext";
import Navbar from "./components/Navbar/Navbar";
import Footer from "./components/Footer/Footer";
import Home from "./pages/Home/Home";
import Swap from "./pages/Swap/Swap";
import SearchPage from "./pages/SearchPage/SearchPage"; // Add SearchPage import
import "./App.scss";

function AppContent() {
  return (
    <Router>
      <div className="app-container">
        <Navbar />
        <main>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/swap" element={<Swap />} />
            <Route path="/search" element={<SearchPage />} />{" "}
            {/* Add SearchPage route */}
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
