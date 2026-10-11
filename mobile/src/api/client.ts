import * as SecureStore from "expo-secure-store";
import type { Announcement, AttendanceRecord, EventDetail, EventsPage, Fee, Home, Me, Notice, Organization, ScanResult, ScanSession } from "./types";

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
export const loadToken = async () => (memoryToken = await SecureStore.getItemAsync(TOKEN_KEY));
export const saveToken = async (t: string) => { memoryToken = t; await SecureStore.setItemAsync(TOKEN_KEY, t); };
export const clearToken = async () => { memoryToken = null; await SecureStore.deleteItemAsync(TOKEN_KEY); };

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
};
