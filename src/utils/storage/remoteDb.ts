// The web-mode backend for DatabaseService's record storage (book list,
// bookmarks, notes, highlights, etc.) - talks to functions/api/db/[dbName].ts,
// which mirrors this exact contract (whole-array GET/PUT, dbName-scoped
// DELETE) by design. This is what makes a signed-in account's library
// actually belong to that account, rather than being trapped in whichever
// one browser happened to create it.
//
// Falls back to localforage (this browser only, no account) whenever
// there's no valid session (401) or the request fails outright - Koodo
// Reader has always let you use the reader signed out (login only ever
// added cloud sync in the upstream product), so an unauthenticated visitor
// still needs their data to go *somewhere* rather than silently vanishing
// into a 401 response. Signing in later doesn't retroactively migrate
// anything stored this way; it just means new writes from that point on
// go to the real backend instead.
//
// Auth: same-origin requests already carry the session cookie automatically
// (Google/Microsoft/Access logins all set one - see functions/lib/session.ts).
// The Authorization header below is only for the LTI case, where the session
// id lives in localStorage instead of a cookie because Canvas embeds this
// app in an iframe (see ltiSession.ts's own top comment) - attached whenever
// present, alongside the cookie, per LTI.md's own note on what step 2 needs.
import localforage from "localforage";
import { getLtiSessionToken } from "./ltiSession";

function authHeaders(): HeadersInit {
  const token = getLtiSessionToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function fetchRemoteRecords(dbName: string): Promise<any[]> {
  try {
    const response = await fetch(`/api/db/${encodeURIComponent(dbName)}`, {
      headers: authHeaders(),
    });
    if (response.status === 401) {
      return (await localforage.getItem(dbName)) || [];
    }
    if (!response.ok) return [];
    return await response.json();
  } catch (error) {
    console.error(`Failed to load "${dbName}" from the server:`, error);
    return (await localforage.getItem(dbName)) || [];
  }
}

export async function saveRemoteRecords(dbName: string, records: any[]): Promise<void> {
  try {
    const response = await fetch(`/api/db/${encodeURIComponent(dbName)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(records),
    });
    if (response.status === 401) {
      await localforage.setItem(dbName, records);
    }
  } catch (error) {
    console.error(`Failed to save "${dbName}" to the server:`, error);
    await localforage.setItem(dbName, records);
  }
}

export async function deleteRemoteRecords(dbName: string): Promise<void> {
  try {
    const response = await fetch(`/api/db/${encodeURIComponent(dbName)}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    if (response.status === 401) {
      await localforage.removeItem(dbName);
    }
  } catch (error) {
    console.error(`Failed to delete "${dbName}" on the server:`, error);
    await localforage.removeItem(dbName);
  }
}
