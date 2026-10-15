import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import type { DecidedJoinRequest, JoinableOrg, LiveData, MyJoinRequest, PendingJoinRequest, OrgExpenses, MemberDetail, ManagedAnnouncement, ManagedEvent, OrgDocument, OrgFinance, OrgMember, OrgOverview, Announcement, AttendanceRecord, EventDetail, EventsPage, Fee, Home, Me, Notice, Organization, ScanResult, ScanSession } from "./types";

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

/**
 * Uploads the signed-in person's own profile picture (multipart), reporting progress 0-100. The server takes the account from
 * the token only, validates and re-encodes the picture.
 */
export function uploadOwnPhoto(file: { uri: string; mimeType: string; name: string }, onProgress: (pct: number) => void): Promise<{ ok: true; version: number }> {
  return new Promise((resolve, reject) => {
    if (!BASE) return reject(new ApiError(0, "CONFIG", "The app is not configured."));
    const body = new FormData();
    body.append("photo", { uri: file.uri, type: file.mimeType, name: file.name } as unknown as Blob);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${BASE}/api/mobile/me/photo`);
    if (memoryToken) xhr.setRequestHeader("Authorization", `Bearer ${memoryToken}`);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => {
      let res: { ok?: boolean; version?: number; error?: { code?: string; message?: string } } = {};
      try { res = JSON.parse(xhr.responseText); } catch { /* not JSON */ }
      if (xhr.status === 200 && res.ok) resolve({ ok: true, version: res.version ?? 1 });
      else reject(new ApiError(xhr.status, res.error?.code ?? "ERROR", res.error?.message ?? "The picture could not be saved. Try again."));
    };
    xhr.onerror = () => reject(new ApiError(0, "NETWORK", "Could not reach Tapasok. Check your connection."));
    xhr.send(body);
  });
}

/** An image source for a private, signed-in image (e.g. a member's photo): the URL plus the Bearer header. */
export const authedImage = (path: string) => ({ uri: `${BASE}/api/mobile${path}`, headers: memoryToken ? { Authorization: `Bearer ${memoryToken}` } : undefined });

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
  joinOptions: () => get<{ organizations: JoinableOrg[]; requests: MyJoinRequest[] }>("/join"),
  requestToJoin: (organizationId: string, message?: string) => request<{ ok: true }>("POST", "/join", { organizationId, message }),
  cancelJoinRequest: (id: string) => request<{ ok: true }>("POST", `/join/${id}`, {}),
  notifications: () => get<{ notifications: Notice[] }>("/notifications"),
  markAllRead: () => request<{ ok: true }>("POST", "/notifications", { action: "read_all" }),
  markRead: (id: string) => request<{ ok: true }>("POST", "/notifications", { action: "read", id }),
  clearNotification: (id: string) => request<{ ok: true }>("POST", "/notifications", { action: "clear", id }),
  clearAllNotifications: () => request<{ ok: true }>("POST", "/notifications", { action: "clear_all" }),
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
  orgJoinRequests: (orgId: string) => get<{ pending: PendingJoinRequest[]; decided: DecidedJoinRequest[] }>(`/org/${orgId}/join-requests`),
  decideJoinRequest: (orgId: string, id: string, decision: "approve" | "reject", note?: string) => request<{ ok: true }>("POST", `/org/${orgId}/join-requests/${id}`, { decision, note }),
  orgMember: (orgId: string, userId: string) => get<MemberDetail>(`/org/${orgId}/members/${userId}`),
  orgExpenses: (orgId: string, status?: "PENDING" | "APPROVED") => get<OrgExpenses>(`/org/${orgId}/expenses${status ? `?status=${status}` : ""}`),
  recordExpense: (orgId: string, e: { type: "EXPENSE" | "INCOME"; title: string; amount: string; category: string; occurredOn: string; purpose: string; notes?: string; requestId: string }) =>
    request<{ ok: true; id: string; duplicate: boolean }>("POST", `/org/${orgId}/expenses`, e),
  decideExpense: (orgId: string, id: string, action: "approve" | "reject" | "cancel" | "reverse", reason?: string) =>
    request<{ ok: true; available?: string }>("POST", `/org/${orgId}/expenses/${id}`, { action, reason }),
  removeOwnPhoto: () => request<{ ok: true }>("DELETE", "/me/photo"),
  liveSession: (orgId: string, sessionId: string) => get<LiveData>(`/org/${orgId}/sessions/${sessionId}/live`),
  orgDocuments: (orgId: string) => get<{ canManage: boolean; documents: OrgDocument[] }>(`/org/${orgId}/documents`),
};
