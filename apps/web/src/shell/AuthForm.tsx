"use client";
import { forwardRef } from "react";

import { FeedbackMessages } from "../components/ui/feedback-messages";

type AuthFormProps = {
  loginUrl: string;
  error: string | null;
  onDemoLogin?: () => void;
  isDemoLoading?: boolean;
};

export const AuthForm = forwardRef<HTMLAnchorElement, AuthFormProps>(
  ({ loginUrl, error, onDemoLogin, isDemoLoading }, ref) => (
    <section className="public-auth-card" aria-labelledby="auth-entry-title">
      <p className="eyebrow">Account access</p>
      <h2 id="auth-entry-title">Sign in</h2>
      <p>Use your Google account to open your vault or create one.</p>
      <FeedbackMessages error={error} />
      <a className="google-sign-in" href={loginUrl} ref={ref}>
        Continue with Google
      </a>
      {onDemoLogin ? (
        <button
          type="button"
          className="demo-sign-in"
          onClick={onDemoLogin}
          disabled={isDemoLoading}
        >
          {isDemoLoading ? "Opening demo vault…" : "Use demo account"}
        </button>
      ) : null}
    </section>
  )
);
AuthForm.displayName = "AuthForm";
