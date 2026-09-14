import { Navigate, Route, Routes } from "react-router-dom";
import { AuthenticatedShell } from "./components/AuthenticatedShell";
import { BrandingProvider } from "./lib/branding-context";
import { AcceptInvitePage } from "./pages/AcceptInvitePage";
import { AdminOrganizationsPage } from "./pages/AdminOrganizationsPage";
import { AdminAdministratorsPage } from "./pages/AdminAdministratorsPage";
import { AdminCreateOrganizationPage } from "./pages/AdminCreateOrganizationPage";
import { AdminOrganizationDetailPage } from "./pages/AdminOrganizationDetailPage";
import { AssessmentDetailPage, AssessmentsPage, StartAssessmentPage } from "./pages/AssessmentsPage";
import { BrandingPage } from "./pages/BrandingPage";
import { DashboardPage } from "./pages/DashboardPage";
import { FacilitiesPage } from "./pages/FacilitiesPage";
import { PatientDetailPage, PatientsPage, RegisterPatientPage } from "./pages/PatientsPage";
import { SignInPage } from "./pages/SignInPage";
import { ScoringConnectionPage } from "./pages/ScoringConnectionPage";
import { UsersPage } from "./pages/UsersPage";
import { VerifyMfaPage } from "./pages/VerifyMfaPage";

export function App() {
  return (
    <BrandingProvider>
      <Routes>
        <Route path="/sign-in" element={<SignInPage />} />
        <Route path="/verify" element={<VerifyMfaPage />} />
        <Route path="/invite/:token" element={<AcceptInvitePage />} />
        <Route element={<AuthenticatedShell area="platform" />}>
          <Route path="/admin" element={<Navigate replace to="/admin/organizations" />} />
          <Route path="/admin/organizations" element={<AdminOrganizationsPage />} />
          <Route path="/admin/organizations/new" element={<AdminCreateOrganizationPage />} />
          <Route path="/admin/organizations/:organizationSlug" element={<AdminOrganizationDetailPage />} />
          <Route path="/admin/administrators" element={<AdminAdministratorsPage />} />
        </Route>
        <Route element={<AuthenticatedShell area="organization" />}>
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
          <Route path="/settings/scoring" element={<ScoringConnectionPage />} />
        </Route>
        <Route path="*" element={<Navigate replace to="/" />} />
      </Routes>
    </BrandingProvider>
  );
}
