import { useState } from "react";
import { ApplicationLogo } from "./ApplicationLogo";

type BrandMarksProps = {
  className?: string;
  organizationLogoUrl?: string | null;
  organizationName?: string;
};

export function BrandMarks({ className = "", organizationLogoUrl = null, organizationName = "Organization" }: BrandMarksProps) {
  const [failed, setFailed] = useState(false);
  const showOrganizationLogo = Boolean(organizationLogoUrl && !failed);

  return <span className={`brand-marks ${showOrganizationLogo ? "brand-marks-organization" : ""} ${className}`} role="img" aria-label={showOrganizationLogo ? `${organizationName} logo` : "NIQ and EIOMS Knowledge Partner"}>
    {showOrganizationLogo
      ? <img src={organizationLogoUrl!} alt="" className="brand-marks-organization-logo" onError={() => setFailed(true)} />
      : <>
        <ApplicationLogo className="brand-marks-application-logo" decorative />
        <span className="brand-marks-partner">
          <img src="/eioms-logo.png" alt="" className="brand-marks-partner-logo" />
          <span>Knowledge Partner</span>
        </span>
      </>}
  </span>;
}
