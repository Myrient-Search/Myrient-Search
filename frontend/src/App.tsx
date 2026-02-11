import { useState } from "react";
import reactLogo from "./assets/react.svg";
import viteLogo from "/vite.svg";

function App() {
  const [count, setCount] = useState(0);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        gap: "2rem",
      }}
    >
      <div
        className="card"
        style={{ display: "flex", gap: "2rem", alignItems: "center" }}
      >
        <a href="https://vite.dev" target="_blank">
          <img
            src={viteLogo}
            className="logo"
            alt="Vite logo"
            style={{
              width: "80px",
              height: "80px",
              border: "3px solid black",
              borderRadius: "50%",
              padding: "5px",
              background: "white",
            }}
          />
        </a>
        <a href="https://react.dev" target="_blank">
          <img
            src={reactLogo}
            className="logo react"
            alt="React logo"
            style={{
              width: "80px",
              height: "80px",
              border: "3px solid black",
              borderRadius: "50%",
              padding: "5px",
              background: "black",
            }}
          />
        </a>
      </div>

      <div className="card" style={{ textAlign: "center", maxWidth: "500px" }}>
        <h1 style={{ fontSize: "3rem", marginBottom: "1rem" }}>Vite + React</h1>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "1rem",
            alignItems: "center",
          }}
        >
          <button onClick={() => setCount((count) => count + 1)}>
            count is {count}
          </button>

          <p>
            Edit <code>src/App.tsx</code> to start building your app.
          </p>
        </div>
      </div>

      <div className="card" style={{ backgroundColor: "#FF5E5E" }}>
        <p style={{ margin: 0, fontWeight: "bold" }}>
          Strictly Functional. Boldly Ugly.
        </p>
      </div>
    </div>
  );
}

export default App;
