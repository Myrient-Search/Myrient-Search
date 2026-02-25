import { BrowserRouter, Route, Routes } from "react-router-dom";
import { useState, useEffect } from "react";
import Home from "@/routes/Home";
import Emulators from "@/routes/Emulators";
import About from "./routes/About";
import GameOverview from "./routes/GameOverview";
import Admin from "./routes/Admin";
import Emulator from "./routes/Emulator";
import Settings from "./routes/Settings";

function App() {
  const [appName, setAppName] = useState("");

  useEffect(() => {
    fetch("/api/config")
      .then((res) => res.json())
      .then((data) => {
        if (data.appName) {
          setAppName(data.appName);
        }
      })
      .catch((err) => console.error("Failed to fetch config:", err));
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home appName={appName} />} />
        <Route path="/emulators" element={<Emulators appName={appName} />} />
        <Route path="/about" element={<About appName={appName} />} />
        <Route path="/settings" element={<Settings appName={appName} />} />
        <Route path="/game/:id" element={<GameOverview appName={appName} />} />
        <Route path="/play/:id" element={<Emulator appName={appName} />} />
        <Route path="/admin" element={<Admin appName={appName} />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
