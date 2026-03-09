import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./force-landscape.css";
import "./styles.css";
import "./lobby-mobile.css";
import "./mobile-optimizations.css";
import "./lobby-compact.css";
import "./lobby-enhanced.css";
import "./room-enhanced.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);

