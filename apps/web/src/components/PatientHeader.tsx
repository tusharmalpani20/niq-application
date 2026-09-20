import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { patientAgeLabel } from "../lib/patient-display";

/** Shared patient context for the record and its assessment workflow. */
export function PatientHeader({ patient, assessmentLabel, action }: {
  patient: { reference: string; displayName: string; dateOfBirth: string | null; gender: string; homeFacility: { name: string } | null };
  assessmentLabel?: string;
  action?: ReactNode;
}) {
  const patientPath = `/patients/${encodeURIComponent(patient.reference)}`;
  return <>
    <nav className="breadcrumb" aria-label="Breadcrumb">
      <Link to="/patients">Patients</Link><span aria-hidden="true">/</span>
      {assessmentLabel ? <><Link to={patientPath}>{patient.reference}</Link><span aria-hidden="true">/</span><span aria-current="page">{assessmentLabel}</span></> : <span aria-current="page">{patient.reference}</span>}
    </nav>
    <header className="patient-detail-header">
      <div className="patient-detail-summary">
        <div className="organization-title-row"><h1>{patient.displayName}</h1></div>
        <p>{patient.reference} · {patientAgeLabel(patient.dateOfBirth)} · {patient.gender[0]}{patient.gender.slice(1).toLowerCase()} · {patient.homeFacility?.name ?? "No facility"}</p>
      </div>
      {action}
    </header>
  </>;
}
