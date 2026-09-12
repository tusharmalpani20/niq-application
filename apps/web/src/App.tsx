import { Navigate, Route, Routes } from "react-router-dom";
import { SignInPage } from "./pages/SignInPage";

export function App() {
  return (
    <Routes>
      <Route path="/sign-in" element={<SignInPage />} />
      <Route path="*" element={<Navigate replace to="/sign-in" />} />
    </Routes>
  );
}
