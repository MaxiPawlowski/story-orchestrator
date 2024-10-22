import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

const rootContainer = document.getElementById("extensions_settings");
const rootElement = document.createElement("div");
rootContainer.appendChild(rootElement);

const root = ReactDOM.createRoot(rootElement);

setTimeout(() => {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}, 2000);
