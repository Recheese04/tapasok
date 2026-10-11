import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import type { MemberDetail, ManagedAnnouncement, ManagedEvent, OrgDocument, OrgFinance, OrgMember, OrgOverview, Announcement, AttendanceRecord, EventDetail, EventsPage, Fee, Home, Me, Notice, Organization, ScanResult, ScanSession } from "./types";

const BASE = (process.env.EXPO_PUBLIC_API_BASE_URL ?? "").replace(/\/+$/, "");
const TOKEN_KEY = "tapasok_token";
const TIMEOUT_MS = 20_000;

/** A failed request. `code` is the server's error code, or NETWORK / TIMEOUT / CONFIG when no answer came back. */
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
  get offline() { return this.code === "NETWORK" || this.code === "TIMEOUT"; }
}

// The token lives only in the device's secure storage (Keychain / Keystore) and in this variable, never in plain storage.
let memoryToken: string | null = null;
let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (fn: (() => void) | null) => { onUnauthorized = fn; };
export const secureGet = async (k: string) => (Platform.OS === "web" ? globalThis.localStorage?.getItem(k) ?? null : SecureStore.getItemAsync(k)); // web = developer preview only
export const secureSet = async (k: string, v: string) => (Platform.OS === "web" ? void globalThis.localStorage?.setItem(k, v) : SecureStore.setItemAsync(k, v));
export const secureDelete = async (k: string) => (Platform.OS === "web" ? void globalThis.localStorage?.removeItem(k) : SecureStore.deleteItemAsync(k));
export const loadToken = async () => (memoryToken = await secureGet(TOKEN_KEY));
export const saveToken = async (t: string) => { memoryToken = t; await secureSet(TOKEN_KEY, t); };
export const clearToken = async () => { memoryToken = null; await secureDelete(TOKEN_KEY); };

async function request<T>(method: string, path: string, body?: unknown, auth = true): Promise<T> {
  if (!BASE) throw new ApiError(0, "CONFIG", "The app is not configured. Set EXPO_PUBLIC_API_BASE_URL.");
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${BASE}/api/mobile${path}`, {
      method, signal: ctl.signal,
      headers: { "Content-Type": "application/json", ...(auth && memoryToken ? { Authorization: `Bearer ${memoryToken}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    throw (e as Error).name === "AbortError" ? new ApiError(0, "TIMEOUT", "The server took too long to respond.") : new ApiError(0, "NETWORK", "No connection. Check your internet and try again.");
  } finally { clearTimeout(timer); }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new ApiError(res.status, data?.error?.code ?? "ERROR", data?.error?.message ?? "Something went wrong.");
    if (res.status === 401 && auth) onUnauthorized?.();
    throw err;
  }
  return data as T;
}

const get = <T,>(p: string) => request<T>("GET", p);

export const api = {
  login: (email: string, password: string) => request<{ token: string; expiresAt: string }>("POST", "/login", { email, password }, false),
  logout: () => request<{ ok: true }>("POST", "/logout"),
  me: () => get<Me>("/me"),
  updateProfile: (p: { middleName?: string; contactNumber?: string; streetAddress?: string }) => request<Me>("PATCH", "/me", p),
  home: () => get<Home>("/home"),
  events: (when: "upcoming" | "past", page = 1) => get<EventsPage>(`/events?when=${when}&page=${page}`),
  event: (id: string) => get<EventDetail>(`/events/${id}`),
  scanSessions: () => get<{ sessions: ScanSession[] }>("/scan/sessions"),
  scan: (code: string, sessionId?: string) => request<ScanResult>("POST", "/scan", { code, sessionId }),
  attendance: () => get<{ records: AttendanceRecord[] }>("/attendance"),
  organizations: () => get<{ organizations: Organization[] }>("/organizations"),
  fees: () => get<{ fees: Fee[] }>("/fees"),
  notifications: () => get<{ notifications: Notice[] }>("/notifications"),
  markAllRead: () => request<{ ok: true }>("POST", "/notifications", { action: "read_all" }),
  announcements: () => get<{ announcements: Announcement[] }>("/announcements"),

  // Organization tools. The organization id is only a request; the server checks the caller's position in it on every call.
  orgOverview: (orgId: string) => get<OrgOverview>(`/org/${orgId}/overview`),
  orgFinance: (orgId: string) => get<OrgFinance>(`/org/${orgId}/finance`),
  decidePayment: (orgId: string, paymentId: string, decision: "approve" | "reject", reason?: string) => request<{ ok: true }>("POST", `/org/${orgId}/payments/${paymentId}`, { decision, reason }),
  recordPayment: (orgId: string, feeId: string, amount: string, method: "CASH" | "GCASH" | "BANK_TRANSFER" | "OTHER", reference?: string) =>
    request<{ ok: true; receiptCode: string }>("POST", `/org/${orgId}/fees/${feeId}/payments`, { amount, method, reference }),
  orgAnnouncements: (orgId: string) => get<{ announcements: ManagedAnnouncement[] }>(`/org/${orgId}/announcements`),
  postAnnouncement: (orgId: string, title: string, body: string, publish: boolean) => request<{ ok: true; id: string }>("POST", `/org/${orgId}/announcements`, { title, body, publish }),
  setAnnouncementStatus: (orgId: string, id: string, status: "PUBLISHED" | "DRAFT") => request<{ ok: true }>("POST", `/org/${orgId}/announcements/${id}`, { status }),
  orgEvents: (orgId: string) => get<{ events: ManagedEvent[] }>(`/org/${orgId}/events`),
  createEvent: (orgId: string, e: { title: string; venue: string; description?: string; startsAt: string; endsAt: string }) => request<{ ok: true; id: string }>("POST", `/org/${orgId}/events`, e),
  setEventStatus: (orgId: string, id: string, status: "DRAFT" | "PUBLISHED" | "CANCELLED") => request<{ ok: true }>("POST", `/org/${orgId}/events/${id}/status`, { status }),
  setSessionActive: (orgId: string, eventId: string, sessionId: string, active: boolean) => request<{ ok: true }>("POST", `/org/${orgId}/events/${eventId}/sessions/${sessionId}`, { active }),
  orgMembers: (orgId: string) => get<{ members: OrgMember[] }>(`/org/${orgId}/members`),
  orgMember: (orgId: string, userId: string) => get<MemberDetail>(`/org/${orgId}/members/${userId}`),
  orgDocuments: (orgId: string) => get<{ canManage: boolean; documents: OrgDocument[] }>(`/org/${orgId}/documents`),
};
