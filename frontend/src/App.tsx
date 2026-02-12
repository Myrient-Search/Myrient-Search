import { BrowserRouter, Route, Routes } from "react-router-dom";
import Home from "@/routes/Home";

function App() {
  const appName = import.meta.env.VITE_APPLICATION_NAME || "Myrient Search";

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home appName={appName} />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
