import { BrowserRouter, Route, Routes } from "react-router-dom";
import Home from "@/routes/Home";
import Emulators from "@/routes/Emulators";

function App() {
  const appName = import.meta.env.VITE_APPLICATION_NAME || "Myrient Search";

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home appName={appName} />} />
        <Route path="/emulators" element={<Emulators appName={appName} />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
