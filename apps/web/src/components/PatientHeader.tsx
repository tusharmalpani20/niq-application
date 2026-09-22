import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { patientAgeLabel } from "../lib/patient-display";

/** Shared patient context for the record and its assessment workflow. */
export function PatientHeader({ patient, assessmentLabel, action, compact = false }: {
  patient: { reference: string; displayName: string; dateOfBirth: string | null; gender: string; homeFacility: { name: string } | null };
  assessmentLabel?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  const patientPath = `/patients/${encodeURIComponent(patient.reference)}`;
  const breadcrumbs = <nav className="breadcrumb" aria-label="Breadcrumb">
      <Link to="/patients">Patients</Link><span aria-hidden="true">/</span>
      {assessmentLabel ? <><Link to={patientPath}>{patient.reference}</Link><span aria-hidden="true">/</span><span aria-current="page">{assessmentLabel}</span></> : <span aria-current="page">{patient.reference}</span>}
    </nav>;
  if (compact) return <header className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 [&_.breadcrumb]:mb-0 [&_.breadcrumb]:flex-wrap">
    <h1 className="sr-only">{assessmentLabel} for {patient.displayName}</h1>
    {breadcrumbs}{action}
  </header>;
  return <>
    {breadcrumbs}
    <header className="patient-detail-header">
      <div className="patient-detail-summary">
        <div className="organization-title-row"><h1>{patient.displayName}</h1></div>
        <p>{patient.reference} · {patientAgeLabel(patient.dateOfBirth)} · {patient.gender[0]}{patient.gender.slice(1).toLowerCase()} · {patient.homeFacility?.name ?? "No facility"}</p>
      </div>
      {action}
    </header>
  </>;
}
