"use client";

import { useState, useTransition } from "react";
import { ModalButton, useModal } from "@/components/shared/modal";
import { Field, inputClass, Notice, primaryButton } from "@/components/shared/ui";
import { changeMemberRoleAction } from "./actions";

/** Changing a position ends the old assignment and starts a new one (history is kept). The server checks who may assign which position. */
export function ChangePositionButton({ organizationId, membershipId, name, role, roles }: { organizationId: string; membershipId: string; name: string; role: string; roles: { value: string; label: string }[] }) {
  return (
    <ModalButton label="Change position" variant="action" title="Change position" description={name} size="sm">
      <ChangePositionForm organizationId={organizationId} membershipId={membershipId} role={role} roles={roles} />
    </ModalButton>
  );
}

function ChangePositionForm({ organizationId, membershipId, role, roles }: { organizationId: string; membershipId: string; role: string; roles: { value: string; label: string }[] }) {
  const modal = useModal();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setError(null);
        start(async () => {
          try {
            await changeMemberRoleAction(fd);
            modal?.close();
          } catch {
            setError("You are not allowed to make that change.");
          }
        });
      }}
    >
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="membershipId" value={membershipId} />
      {error && <Notice kind="error">{error}</Notice>}
      <Field id={`pos-${membershipId}`} label="Position" hint="Permissions come from the position and apply only in this organization.">
        <select id={`pos-${membershipId}`} name="role" defaultValue={role} className={inputClass}>{roles.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</select>
      </Field>
      <button type="submit" disabled={pending} className={primaryButton}>{pending ? "Saving…" : "Save position"}</button>
    </form>
  );
}
