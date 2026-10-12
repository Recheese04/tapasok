"use client";

import { useActionState, useState } from "react";
import { loginAction, type LoginState } from "./actions";

const initialState: LoginState = {};

const field = "flex min-h-12 w-full items-center gap-2.5 rounded-xl border bg-white px-3.5 focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/15";
const glyph = (d: string) => <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState(loginAction, initialState);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={formAction} noValidate className="flex flex-col gap-5">
      {next && <input type="hidden" name="next" value={next} />}
      {state.error && (
        <p role="alert" className="flex items-start gap-2.5 rounded-xl border border-danger/25 bg-danger/5 px-4 py-3 text-sm text-danger">
          <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 8v5m0 3v.01M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18Z" strokeLinecap="round" /></svg>
          {state.error}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-semibold">Email</label>
        <div className={`${field} ${state.fieldErrors?.email ? "border-danger" : "border-border"}`}>
          {glyph("M4 6.5h16v11H4v-11Zm0 .5 8 6 8-6")}
          <input
            id="email" name="email" type="email" autoComplete="email" required placeholder="you@bisu.edu.ph"
            aria-invalid={!!state.fieldErrors?.email} aria-describedby={state.fieldErrors?.email ? "email-error" : undefined}
            className="h-11 w-full bg-transparent text-[15px] outline-none placeholder:text-muted/70"
          />
        </div>
        {state.fieldErrors?.email && <p id="email-error" className="text-sm text-danger">{state.fieldErrors.email}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-semibold">Password</label>
        <div className={`${field} ${state.fieldErrors?.password ? "border-danger" : "border-border"}`}>
          {glyph("M7 11V8a5 5 0 0 1 10 0v3M5.5 11h13v9.5h-13V11Z")}
          <input
            id="password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required placeholder="Your password"
            aria-invalid={!!state.fieldErrors?.password} aria-describedby={state.fieldErrors?.password ? "password-error" : undefined}
            className="h-11 w-full bg-transparent text-[15px] outline-none placeholder:text-muted/70"
          />
          <button
            type="button" onClick={() => setShowPassword((v) => !v)} aria-pressed={showPassword} aria-label={showPassword ? "Hide password" : "Show password"}
            className="rounded-lg px-2 py-1 text-xs font-semibold text-muted hover:bg-primary-soft hover:text-primary"
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
        {state.fieldErrors?.password && <p id="password-error" className="text-sm text-danger">{state.fieldErrors.password}</p>}
      </div>

      <button
        type="submit" disabled={pending}
        className="mt-1 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-[15px] font-semibold text-primary-foreground shadow-[0_10px_30px_-10px_rgba(106,43,216,0.8)] hover:bg-primary-hover disabled:opacity-60"
      >
        {pending ? (
          <><svg viewBox="0 0 24 24" className="h-4 w-4 animate-spin" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".3" strokeWidth="3" /><path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>Signing in…</>
        ) : "Sign in"}
      </button>

      <div className="flex flex-col gap-2 rounded-2xl border border-border bg-[#faf9fd] p-4 text-sm text-muted">
        <p><span className="font-semibold text-foreground">New here?</span> Open the setup link your administrator sent you to choose a password.</p>
        <p><span className="font-semibold text-foreground">Forgot your password?</span> Ask your administrator for a new setup link.</p>
      </div>
    </form>
  );
}
