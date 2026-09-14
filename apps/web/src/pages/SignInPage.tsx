import { signInRequestSchema } from "@niq/application-contracts";
import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Input } from "@/components/ui/input";
import { CircleAlert, Eye, EyeOff } from "lucide-react";
import { ApiRequestError, signIn } from "../lib/api";
import { authenticatedLandingPath } from "../lib/auth-routing";

export function SignInPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const navigate = useNavigate();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    const data = new FormData(event.currentTarget);
    const request = signInRequestSchema.safeParse({ email: String(data.get("email")), password: String(data.get("password")) });
    if (!request.success) {
      const emailInvalid = request.error.issues.some((issue) => issue.path[0] === "email");
      const passwordInvalid = request.error.issues.some((issue) => issue.path[0] === "password");
      setFieldErrors({
        email: emailInvalid ? "Enter a valid email address." : undefined,
        password: passwordInvalid ? "Enter a password with at least 8 characters." : undefined,
      });
      return;
    }
    setFieldErrors({});
    setIsSubmitting(true);

    try {
      const result = await signIn(request.data);
      if (result.nextStep === "MFA_REQUIRED") navigate("/verify", { state: { ...result, email: request.data.email } });
      else navigate(authenticatedLandingPath(result.user));
    } catch (error) {
      setMessage(error instanceof ApiRequestError ? error.message : "Sign in is temporarily unavailable. Please try again later.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="sign-in-shell">
      <section className="welcome-panel" aria-labelledby="welcome-heading">
        <div className="brand-lockup" role="img" aria-label="NIQ">
          <span className="brand-mark">N</span>
        </div>
        <div className="welcome-copy">
          <p className="eyebrow">NIQ · Clinical nutrition intelligence</p>
          <h1 id="welcome-heading">Clearer assessment.<br />More thoughtful care.</h1>
          <p>One secure workspace for oncology nutrition assessment, review and follow-up.</p>
        </div>
      </section>

      <section className="form-panel" aria-labelledby="sign-in-heading">
        <div className="form-container">
          <h2 id="sign-in-heading">Welcome back</h2>

          <form className="sign-in-form" noValidate onSubmit={handleSubmit}>
            <FieldGroup>
              <Field className="text-foreground" data-invalid={fieldErrors.email ? true : undefined}><FieldLabel htmlFor="email">Email</FieldLabel><Input className="h-12" id="email" name="email" type="email" autoComplete="username" required placeholder="name@example.com" aria-invalid={fieldErrors.email ? true : undefined} onChange={() => { setFieldErrors((current) => ({ ...current, email: undefined })); setMessage(null); }} />{fieldErrors.email && <FieldError>{fieldErrors.email}</FieldError>}</Field>
              <Field className="text-foreground" data-invalid={fieldErrors.password ? true : undefined}><FieldLabel htmlFor="password">Password</FieldLabel><InputGroup className="h-12 overflow-hidden" aria-invalid={fieldErrors.password ? true : undefined}><InputGroupInput id="password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" minLength={8} required aria-invalid={fieldErrors.password ? true : undefined} onChange={() => { setFieldErrors((current) => ({ ...current, password: undefined })); setMessage(null); }} /><InputGroupAddon align="inline-end" className="mr-0! self-stretch border-l bg-accent p-0"><InputGroupButton className="m-0! h-full w-11 rounded-none border-0 bg-clip-border text-primary hover:bg-secondary" aria-label={showPassword ? "Hide password" : "Show password"} aria-controls="password" aria-pressed={showPassword} onPress={() => setShowPassword((visible) => !visible)} size="icon-sm">{showPassword ? <EyeOff /> : <Eye />}</InputGroupButton></InputGroupAddon></InputGroup>{fieldErrors.password && <FieldError>{fieldErrors.password}</FieldError>}<div className="flex justify-end"><Button className="px-0" type="button" variant="link" size="sm" isDisabled>Forgot password?</Button></div></Field>
            </FieldGroup>
            {message && <Alert variant="destructive"><CircleAlert aria-hidden="true" /><AlertDescription>{message}</AlertDescription></Alert>}
            <Button className="h-12 w-full text-base" type="submit" isDisabled={isSubmitting}>
              {isSubmitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <p className="support-copy">Need access? Contact your organization administrator.</p>
        </div>
      </section>
    </main>
  );
}
