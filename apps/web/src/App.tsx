import { lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AuthenticatedShell } from "./components/AuthenticatedShell";
import { BrandingProvider } from "./lib/branding-context";
import { AcceptInvitePage } from "./pages/AcceptInvitePage";
import { DashboardPage } from "./pages/DashboardPage";
import { ByocSetupPage } from "./pages/ByocSetupPage";
import { SignInPage } from "./pages/SignInPage";
import { VerifyMfaPage } from "./pages/VerifyMfaPage";

const AdminOrganizationsPage = lazy(() => import("./pages/AdminOrganizationsPage").then(module => ({ default: module.AdminOrganizationsPage })));
const AdminAdministratorsPage = lazy(() => import("./pages/AdminAdministratorsPage").then(module => ({ default: module.AdminAdministratorsPage })));
const AdminCreateOrganizationPage = lazy(() => import("./pages/AdminCreateOrganizationPage").then(module => ({ default: module.AdminCreateOrganizationPage })));
const AdminOrganizationDetailPage = lazy(() => import("./pages/AdminOrganizationDetailPage").then(module => ({ default: module.AdminOrganizationDetailPage })));
const AssessmentsPage = lazy(() => import("./pages/AssessmentsPage").then(module => ({ default: module.AssessmentsPage })));
const StartAssessmentPage = lazy(() => import("./features/assessments/StartAssessmentPage").then(module => ({ default: module.StartAssessmentPage })));
const AssessmentEditorPage = lazy(() => import("./features/assessments/AssessmentEditorPage").then(module => ({ default: module.AssessmentEditorPage })));
const GeneratedReportPage = lazy(() => import("./features/assessments/GeneratedReportPage").then(module => ({ default: module.GeneratedReportPage })));
const BrandingPage = lazy(() => import("./pages/BrandingPage").then(module => ({ default: module.BrandingPage })));
const FacilitiesPage = lazy(() => import("./pages/FacilitiesPage").then(module => ({ default: module.FacilitiesPage })));
const FacilityDetailPage = lazy(() => import("./pages/FacilityDetailPage").then(module => ({ default: module.FacilityDetailPage })));
const PatientsPage = lazy(() => import("./pages/PatientsPage").then(module => ({ default: module.PatientsPage })));
const RegisterPatientPage = lazy(() => import("./pages/PatientsPage").then(module => ({ default: module.RegisterPatientPage })));
const PatientDetailPage = lazy(() => import("./pages/PatientsPage").then(module => ({ default: module.PatientDetailPage })));
const ScoringConnectionPage = lazy(() => import("./pages/ScoringConnectionPage").then(module => ({ default: module.ScoringConnectionPage })));
const UsersPage = lazy(() => import("./pages/UsersPage").then(module => ({ default: module.UsersPage })));

export function App() {
  return (
    <BrandingProvider>
      <Routes>
        <Route path="/setup" element={<ByocSetupPage />} />
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
          <Route path="/facilities/:facilityId" element={<FacilityDetailPage />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/patients" element={<PatientsPage />} />
          <Route path="/patients/new" element={<RegisterPatientPage />} />
          <Route path="/patients/:patientLocator" element={<PatientDetailPage />} />
          <Route path="/assessments" element={<AssessmentsPage />} />
          <Route path="/assessments/new" element={<StartAssessmentPage />} />
          <Route path="/assessments/:assessmentId" element={<AssessmentEditorPage />} />
          <Route path="/assessments/:assessmentId/generated-report" element={<GeneratedReportPage />} />
          <Route path="/settings/branding" element={<BrandingPage />} />
          <Route path="/settings/scoring" element={<ScoringConnectionPage />} />
        </Route>
        <Route path="*" element={<Navigate replace to="/" />} />
      </Routes>
    </BrandingProvider>
  );
}
