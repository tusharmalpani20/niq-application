import type { Facility } from "@niq/application-contracts";

export const facilityUrl = (facility: Pick<Facility, "code">) => `/facilities/${encodeURIComponent(facility.code.toLowerCase())}`;
