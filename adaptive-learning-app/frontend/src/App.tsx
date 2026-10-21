import { BrowserRouter, Routes, Route } from "react-router-dom";
import "./App.css";

import WelcomePage from "./pages/WelcomePage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import LearnerDashboard from "./pages/LearnerDashboard";
import ModeSelectorPage from "./pages/ModeSelectorPage";
import DiagnosticPage from "./pages/DiagnosticPage";
import ResultsPage from "./pages/ResultsPage";

/**
 * App — root component with React Router.
 *
 * Routes:
 *   /                  → WelcomePage        (Stage 1)
 *   /login             → LoginPage          (Stage 2)
 *   /register          → RegisterPage       (Stage 2)
 *   /dashboard         → LearnerDashboard   (Stage 2 shell, Stage 5 content)
 *   /mode-select       → ModeSelectorPage   (Stage 5, Step D)
 *   /diagnostic        → DiagnosticPage     (Stage 5, Step E)
 *   /result/:sessionId → ResultsPage        (Stage 5, Step E)
 */
function App() {
  return (
    <BrowserRouter>
      <div className="app-root">
        <Routes>
          <Route path="/" element={<WelcomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/dashboard" element={<LearnerDashboard />} />
          <Route path="/mode-select" element={<ModeSelectorPage />} />
          <Route path="/diagnostic" element={<DiagnosticPage />} />
          <Route path="/result/:sessionId" element={<ResultsPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
