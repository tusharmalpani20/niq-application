import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiRequestError, signIn } from "../lib/api";

export function SignInPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const navigate = useNavigate();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setIsSubmitting(true);
    const data = new FormData(event.currentTarget);

    try {
      const result = await signIn({ email: String(data.get("email")), password: String(data.get("password")) });
      if (result.nextStep === "MFA_REQUIRED") navigate("/verify", { state: { challengeToken: result.challengeToken, email: String(data.get("email")) } });
      else navigate("/");
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

          <form className="sign-in-form" onSubmit={handleSubmit} noValidate>
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" autoComplete="username" required placeholder="name@example.com" />

            <div className="password-row">
              <label htmlFor="password">Password</label>
              <button type="button" className="text-button" disabled title="Password recovery is not configured yet">Forgot password?</button>
            </div>
            <input id="password" name="password" type="password" autoComplete="current-password" required />

            {message && <div className="form-message" role="alert">{message}</div>}

            <button className="submit-button" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Signing in…" : "Sign in securely"}
            </button>
          </form>

          <p className="support-copy">Need access? Contact your organization administrator.</p>
        </div>
      </section>
    </main>
  );
}
