"use client";

import { useActionState, useState } from "react";
import { loginAction, type LoginState } from "./actions";

const initialState: LoginState = {};

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState(loginAction, initialState);
  const [showPassword, setShowPassword] = useState(false);
  const inputClass = "w-full rounded-lg border border-border px-3 py-2 text-sm";

  return (
    <form action={formAction} noValidate className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-card">
      <h1 className="mb-1 text-2xl font-semibold text-primary">Tapasok</h1>
      <p className="mb-6 text-sm text-muted">Sign in to continue.</p>

      {next && <input type="hidden" name="next" value={next} />}
      {state.error && (
        <p role="alert" className="mb-4 rounded-lg border border-danger px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}

      <label htmlFor="email" className="mb-1 block text-sm font-medium">Email</label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        required
        aria-invalid={!!state.fieldErrors?.email}
        aria-describedby={state.fieldErrors?.email ? "email-error" : undefined}
        className={inputClass}
      />
      {state.fieldErrors?.email && (
        <p id="email-error" className="mt-1 text-sm text-danger">{state.fieldErrors.email}</p>
      )}

      <label htmlFor="password" className="mb-1 mt-4 block text-sm font-medium">Password</label>
      <div className="relative">
        <input
          id="password"
          name="password"
          type={showPassword ? "text" : "password"}
          autoComplete="current-password"
          required
          aria-invalid={!!state.fieldErrors?.password}
          aria-describedby={state.fieldErrors?.password ? "password-error" : undefined}
          className={`${inputClass} pr-16`}
        />
        <button
          type="button"
          onClick={() => setShowPassword((v) => !v)}
          aria-pressed={showPassword}
          className="absolute inset-y-0 right-2 px-2 text-xs text-muted hover:text-foreground"
        >
          {showPassword ? "Hide" : "Show"}
        </button>
      </div>
      {state.fieldErrors?.password && (
        <p id="password-error" className="mt-1 text-sm text-danger">{state.fieldErrors.password}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-6 w-full rounded-xl bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary-hover disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
