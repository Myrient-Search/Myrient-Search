import { BrowserRouter, Route, Routes } from "react-router-dom";
import Home from "@/routes/Home";
import Emulators from "@/routes/Emulators";
import About from "./routes/About";
import GameOverview from "./routes/GameOverview";

function App() {
  const appName = import.meta.env.VITE_APPLICATION_NAME || "Myrient Search";

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home appName={appName} />} />
        <Route path="/emulators" element={<Emulators appName={appName} />} />
        <Route path="/about" element={<About appName={appName} />} />
        <Route path="/game/:id" element={<GameOverview appName={appName} />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
