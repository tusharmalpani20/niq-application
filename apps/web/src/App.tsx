import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { BrandingProvider } from "./lib/branding-context";
import { AcceptInvitePage } from "./pages/AcceptInvitePage";
import { AssessmentDetailPage, AssessmentsPage, StartAssessmentPage } from "./pages/AssessmentsPage";
import { BrandingPage } from "./pages/BrandingPage";
import { DashboardPage } from "./pages/DashboardPage";
import { FacilitiesPage } from "./pages/FacilitiesPage";
import { PatientDetailPage, PatientsPage, RegisterPatientPage } from "./pages/PatientsPage";
import { SignInPage } from "./pages/SignInPage";
import { UsersPage } from "./pages/UsersPage";
import { VerifyMfaPage } from "./pages/VerifyMfaPage";

export function App() {
  return (
    <BrandingProvider>
      <Routes>
        <Route path="/sign-in" element={<SignInPage />} />
        <Route path="/verify" element={<VerifyMfaPage />} />
        <Route path="/invite/:token" element={<AcceptInvitePage />} />
        <Route element={<AppShell />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/facilities" element={<FacilitiesPage />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/patients" element={<PatientsPage />} />
          <Route path="/patients/new" element={<RegisterPatientPage />} />
          <Route path="/patients/:patientId" element={<PatientDetailPage />} />
          <Route path="/assessments" element={<AssessmentsPage />} />
          <Route path="/assessments/new" element={<StartAssessmentPage />} />
          <Route path="/assessments/:assessmentId" element={<AssessmentDetailPage />} />
          <Route path="/settings/branding" element={<BrandingPage />} />
        </Route>
        <Route path="*" element={<Navigate replace to="/" />} />
      </Routes>
    </BrandingProvider>
  );
}
