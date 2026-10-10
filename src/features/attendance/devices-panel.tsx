"use client";

import { useActionState, useState } from "react";
import { Field, inputClass, Notice, primaryButton, secondaryButton } from "@/components/shared/ui";
import { registerDeviceAction, type DeviceState } from "./device-actions";

export function RegisterDeviceForm({ organizations }: { organizations: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<DeviceState, FormData>(registerDeviceAction, {});
  const [copied, setCopied] = useState(false);
  return (
    <form action={action} className="grid max-w-xl gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card sm:grid-cols-2">
      <h3 className="font-medium sm:col-span-2">Register an RFID terminal</h3>
      {state.error && <div className="sm:col-span-2"><Notice kind="error">{state.error}</Notice></div>}
      {state.key && (
        <div className="flex flex-col gap-2 rounded-lg border border-warning px-3 py-2 sm:col-span-2">
          <p className="text-sm">Device key (shown once, store it on the terminal only):</p>
          <code className="break-all text-xs">{state.key}</code>
          <button type="button" className={`${secondaryButton} self-start`} onClick={async () => { try { await navigator.clipboard.writeText(state.key!); setCopied(true); } catch { setCopied(false); } }}>{copied ? "Copied" : "Copy key"}</button>
        </div>
      )}
      <Field id="dev-org" label="Organization"><select id="dev-org" name="organizationId" required className={inputClass}>{organizations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></Field>
      <Field id="dev-name" label="Device name"><input id="dev-name" name="name" required placeholder="Gate terminal 1" className={inputClass} /></Field>
      <button type="submit" disabled={pending} className={`${primaryButton} self-start`}>{pending ? "Registering…" : "Register device"}</button>
    </form>
  );
}
