import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import RegisterPage from "./pages/RegisterPage";
import AdminPage from "./pages/AdminPage";
import PaymentPage from "./pages/PaymentPage";
import SurveyPage from "./pages/SurveyPage";
import "./styles.css";
import { EventProvider } from "./lib/event";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <EventProvider><BrowserRouter>
      <Routes>
        <Route path="/" element={<RegisterPage />} />
        <Route path="/zahlung" element={<PaymentPage />} />
        <Route path="/umfrage" element={<SurveyPage />} />
        <Route path="/login" element={<AdminPage />} />
        <Route path="/dashboard" element={<AdminPage />} />
        {/* Old URL */}
        <Route path="/admin" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter></EventProvider>
  </StrictMode>,
);
