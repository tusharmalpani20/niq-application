import type {
  AcceptInvitation,
  BootstrapAdmin,
  CreateFacility,
  CreateInvitation,
  CreateOrganization,
  SignInRequest,
  UpdateFacility,
  UpdateOrganization,
  VerifyMfaRequest,
} from "@niq/application-contracts";

export type Principal = {
  userId: string;
  organizationId: string;
  membershipId: string;
  email: string;
  displayName: string;
  role: "ORGANIZATION_ADMIN" | "MEDICAL" | "SUPPORT";
  platformRole: "USER" | "NIQ_ADMIN";
};

export type RequestContext = { requestId: string; ipAddress?: string; userAgent?: string };
export type SessionResult = { token: string; expiresAt: Date; principal: Principal };
export type SignInResult =
  | { kind: "mfa_required"; challengeToken: string; expiresAt: Date }
  | { kind: "authenticated"; session: SessionResult };

export class ServiceError extends Error {
  constructor(
    readonly code:
      | "ACCOUNT_LOCKED"
      | "CONFLICT"
      | "FORBIDDEN"
      | "INVALID_CREDENTIALS"
      | "INVALID_OR_EXPIRED_TOKEN"
      | "NOT_FOUND"
      | "USER_LIMIT_REACHED",
    message: string,
  ) {
    super(message);
  }
}

export interface OtpDelivery {
  deliver(input: { email: string; otp: string; expiresAt: Date }): Promise<void>;
}

export interface ApplicationService {
  signIn(input: SignInRequest, context: RequestContext): Promise<SignInResult>;
  verifyMfa(input: VerifyMfaRequest, context: RequestContext): Promise<SessionResult>;
  authenticate(sessionToken: string): Promise<Principal | null>;
  signOut(sessionToken: string, context: RequestContext): Promise<void>;
  acceptInvitation(input: AcceptInvitation, context: RequestContext): Promise<Principal>;
  bootstrap(input: BootstrapAdmin, context: RequestContext): Promise<Principal>;
  createOrganization(actor: Principal, input: CreateOrganization, context: RequestContext): Promise<unknown>;
  listOrganizations(actor: Principal): Promise<unknown[]>;
  getOrganization(actor: Principal, organizationId: string): Promise<unknown>;
  updateOrganization(actor: Principal, organizationId: string, input: UpdateOrganization, context: RequestContext): Promise<unknown>;
  createFacility(actor: Principal, organizationId: string, input: CreateFacility, context: RequestContext): Promise<unknown>;
  listFacilities(actor: Principal, organizationId: string): Promise<unknown[]>;
  updateFacility(actor: Principal, organizationId: string, facilityId: string, input: UpdateFacility, context: RequestContext): Promise<unknown>;
  inviteUser(actor: Principal, organizationId: string, input: CreateInvitation, context: RequestContext): Promise<{ invitation: unknown; token: string }>;
  listUsers(actor: Principal, organizationId: string): Promise<unknown[]>;
  setUserActive(actor: Principal, organizationId: string, membershipId: string, active: boolean, context: RequestContext): Promise<unknown>;
}
