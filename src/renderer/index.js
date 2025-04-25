import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

// Get the root element
const container = document.getElementById("root");

// Create a root
const root = createRoot(container);

// Initial render
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Handle Hot Module Replacement (HMR)
if (module.hot) {
  module.hot.accept("./App", () => {
    const NextApp = require("./App").default;
    root.render(
      <React.StrictMode>
        <NextApp />
      </React.StrictMode>
    );
  });
}

// Error handling
window.addEventListener("error", (error) => {
  console.error("Global error:", error);
});

// Prevent default browser refresh on form submission
document.addEventListener("submit", (e) => {
  e.preventDefault();
});
