"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { actionButton, actionDanger, primaryButton, secondaryButton, dangerButton } from "./ui";

// One modal system for the whole app, built on the native <dialog> element: it renders in the browser's top layer (so it is
// never clipped by a parent or hidden behind the sidebar), traps focus, closes on Escape and restores focus afterwards.
//
//   <Dialog>        controlled dialog (title, description, scrollable body, footer with Cancel / Save).
//   <ModalButton>   a button that opens a Dialog holding server-rendered children (a form, usually).
//   <ModalFrame>    a Dialog driven by the URL (?edit=<id>): the page loads the data and authorizes on the server.
//   useConfirm()    promise-based confirmation dialog used by ConfirmButton and destructive actions.

// ---- Confirmation dialogs ------------------------------------------------------------------------------------------

type ConfirmOptions = { title?: string; message: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean };
type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/** Mounted once in the dashboard frame. */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  const confirm = useCallback<ConfirmFn>((opts) => new Promise<boolean>((resolve) => setState({ ...opts, resolve })), []);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (state && !d.open) d.showModal();
    if (!state && d.open) d.close();
  }, [state]);

  const settle = (ok: boolean) => {
    state?.resolve(ok);
    setState(null);
  };

  return (
    <ConfirmContext value={confirm}>
      {children}
      <dialog
        ref={ref}
        aria-labelledby={titleId}
        onCancel={(e) => { e.preventDefault(); settle(false); }}
        onClick={(e) => { if (e.target === ref.current) settle(false); }}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-border bg-surface p-0 text-foreground shadow-2xl backdrop:bg-black/40"
      >
        {state && (
          <div className="flex flex-col gap-4 p-6">
            <h2 id={titleId} className="text-lg font-semibold">{state.title ?? "Are you sure?"}</h2>
            <p className="text-sm text-muted">{state.message}</p>
            <div className="flex justify-end gap-2">
              <button type="button" autoFocus onClick={() => settle(false)} className={secondaryButton}>{state.cancelLabel ?? "Go back"}</button>
              <button type="button" onClick={() => settle(true)} className={state.danger ? "inline-flex items-center justify-center rounded-xl bg-danger px-4 py-2 text-sm font-medium text-white shadow-sm hover:opacity-90" : primaryButton}>
                {state.confirmLabel ?? "Confirm"}
              </button>
            </div>
          </div>
        )}
      </dialog>
    </ConfirmContext>
  );
}

/** Falls back to the browser prompt outside the provider (public pages), so a confirmation is never skipped. */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  return ctx ?? (async (o) => window.confirm(o.message));
}

/** For forms that submit a server action: asks first, then submits. `onSubmit={confirmSubmit({ message })}` */
export function useConfirmSubmit() {
  const confirm = useConfirm();
  const skip = useRef(false);
  return (opts: ConfirmOptions) => (e: React.FormEvent<HTMLFormElement>) => {
    if (skip.current) { skip.current = false; return; }
    e.preventDefault();
    const form = e.currentTarget;
    void confirm(opts).then((ok) => { if (ok) { skip.current = true; form.requestSubmit(); } });
  };
}

// ---- Dialog -------------------------------------------------------------------------------------------------------

const SIZES = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl", xl: "max-w-5xl" } as const;
export type ModalSize = keyof typeof SIZES;

type ModalContextValue = { requestClose: () => void; close: () => void };
const ModalContext = createContext<ModalContextValue | null>(null);
/** Lets content inside a Dialog close it (with the unsaved-changes guard). */
export const useModal = () => useContext(ModalContext);

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  size?: ModalSize;
  /** Label of the closing button. Use "Close" for read-only dialogs. */
  closeLabel?: string;
  children: React.ReactNode;
};

type Mirror = { label: string; disabled: boolean; formId: string; name?: string; value?: string };

export function Dialog({ open, onClose, title, description, size = "md", closeLabel = "Cancel", children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const dirty = useRef(false);
  const closing = useRef(false);
  const confirm = useConfirm();
  const router = useRouter();
  const titleId = useId();
  const descId = useId();
  const formBase = useId();
  const [mirror, setMirror] = useState<Mirror | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) { dirty.current = false; closing.current = false; setSaved(false); d.showModal(); }
    if (!open && d.open) d.close();
  }, [open]);

  const requestClose = useCallback(async () => {
    if (dirty.current && !(await confirm({ title: "Discard changes?", message: "You have unsaved changes. If you close now they will be lost.", confirmLabel: "Discard changes", cancelLabel: "Keep editing", danger: true }))) return;
    onClose();
  }, [confirm, onClose]);

  // The form inside the body keeps its own submit button (it owns loading state and validation). The footer shows a copy of
  // that button, so Save / Cancel are always visible at the bottom while a long form scrolls. When the action succeeds
  // (a success notice appears) the list behind the dialog is refreshed and the dialog closes by itself.
  useEffect(() => {
    if (!open) return;
    const body = bodyRef.current;
    if (!body) return;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const sync = () => {
      const form = body.querySelector("form");
      const buttons = form ? Array.from(form.querySelectorAll<HTMLButtonElement>('button[type="submit"]')) : [];
      const btn = buttons[buttons.length - 1];
      if (form && btn) {
        // getAttribute, not form.id: a form with an input named "id" would return that input instead of its id attribute.
        let formId = form.getAttribute("id");
        if (!formId) { formId = `${formBase}-form`; form.setAttribute("id", formId); }
        btn.style.display = "none";
        const label = btn.textContent ?? "Save";
        setMirror((m) => (m && m.label === label && m.disabled === btn.disabled && m.formId === formId ? m : { label, disabled: btn.disabled, formId: formId!, name: btn.name || undefined, value: btn.value || undefined }));
      } else {
        setMirror(null);
      }
      // A success notice means the action worked. Content marked data-keep-open (a one-time setup link, an import report)
      // must stay readable, so the dialog then waits for the person to close it.
      const ok = body.querySelector('[data-notice="success"]');
      setSaved(!!ok);
      if (body.querySelector("[data-keep-open]")) dirty.current = false; // a result is on screen: nothing left to lose
      if (ok) {
        dirty.current = false;
        if (!closing.current && !body.querySelector("[data-keep-open]")) {
          closing.current = true;
          ok.scrollIntoView({ block: "nearest" });
          timer = setTimeout(() => { router.refresh(); onClose(); }, 900);
        }
      }
    };

    sync();
    const obs = new MutationObserver(sync);
    obs.observe(body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["disabled"] });
    return () => { obs.disconnect(); if (timer) clearTimeout(timer); };
  }, [open, formBase, onClose, router]);

  return (
    <ModalContext value={{ requestClose: () => void requestClose(), close: onClose }}>
      <dialog
        ref={ref}
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        onCancel={(e) => { e.preventDefault(); void requestClose(); }}
        onClick={(e) => { if (e.target === ref.current) void requestClose(); }}
        onClose={() => { if (open) onClose(); }}
        className={`m-auto max-h-[90vh] open:flex w-[calc(100%-1.5rem)] ${SIZES[size]} flex-col overflow-hidden rounded-2xl border border-border bg-surface p-0 text-foreground shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-[2px] sm:w-[calc(100%-3rem)]`}
      >
        {open && (
          <>
            <header className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
              <div className="min-w-0">
                <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
                {description && <p id={descId} className="mt-0.5 text-sm text-muted">{description}</p>}
              </div>
              <button type="button" onClick={() => void requestClose()} aria-label="Close dialog" className="rounded-lg p-1.5 text-muted hover:bg-sidebar hover:text-foreground">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
              </button>
            </header>
            <div ref={bodyRef} onInput={() => { dirty.current = true; }} className="flex-1 overflow-y-auto px-6 py-5 [&_form]:max-w-none [&_form]:border-0 [&_form]:bg-transparent [&_form]:p-0 [&_form]:shadow-none [&_form>h2:first-child]:hidden [&_form>h3:first-child]:hidden">
              {children}
            </div>
            <footer className="flex items-center justify-end gap-2 border-t border-border bg-sidebar/40 px-6 py-3">
              <button type="button" onClick={() => void requestClose()} className={secondaryButton}>{saved ? "Close" : closeLabel}</button>
              {mirror && (
                <button type="submit" form={mirror.formId} name={mirror.name} value={mirror.value} disabled={mirror.disabled} className={primaryButton}>{mirror.label}</button>
              )}
            </footer>
          </>
        )}
      </dialog>
    </ModalContext>
  );
}

// ---- Trigger button + dialog (data already on the page) ---------------------------------------------------------------

const TRIGGER = {
  primary: primaryButton,
  secondary: secondaryButton,
  danger: dangerButton,
  link: "text-sm font-medium text-primary hover:underline",
  action: actionButton,
  actionDanger,
} as const;

export function ModalButton({
  label, title, description, size, variant = "secondary", closeLabel, children,
}: { label: React.ReactNode; title: string; description?: string; size?: ModalSize; variant?: keyof typeof TRIGGER; closeLabel?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  // Whatever happened inside (a saved form, a generated code), the page behind shows the current data once the dialog is gone.
  const close = useCallback(() => { setOpen(false); router.refresh(); }, [router]);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={TRIGGER[variant]} aria-haspopup="dialog">{label}</button>
      <Dialog open={open} onClose={close} title={title} description={description} size={size} closeLabel={closeLabel}>
        {open && children}
      </Dialog>
    </>
  );
}

// ---- URL-driven dialog (data loaded and authorized on the server) -----------------------------------------------------

/** Rendered by a page when a query parameter such as ?edit=<id> is present. Closing navigates to `closeHref`. */
export function ModalFrame({ title, description, size, closeLabel, closeHref, children }: { title: string; description?: string; size?: ModalSize; closeLabel?: string; closeHref: string; children: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const close = useCallback(() => {
    setOpen(false);
    router.replace(closeHref, { scroll: false });
  }, [router, closeHref]);
  return (
    <Dialog open={open} onClose={close} title={title} description={description} size={size} closeLabel={closeLabel}>
      {children}
    </Dialog>
  );
}
