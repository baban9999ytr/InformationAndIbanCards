import React, { Component } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { LanguageProvider } from "./i18n.jsx";
import "./style.css";

class AppErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Application render failed:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="app-error-fallback" role="alert">
          <h1>Something went wrong</h1>
          <p>The page could not be displayed. Reload to try again.</p>
          <button type="button" onClick={() => window.location.reload()}>Reload page</button>
        </main>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <LanguageProvider>
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    </LanguageProvider>
  </React.StrictMode>,
);
