// Storage for the session id an LTI launch hands off (see
// functions/api/lti/launch.ts + src/pages/ltiBridge). Kept in localStorage
// rather than a cookie because the reader runs inside a Canvas iframe, where
// cookies set by this origin are third-party and unreliable under Safari ITP
// / Chrome's third-party-cookie phase-out. See LTI.md for the full rationale.
//
// NOTE: nothing reads this yet. The rest of the app still talks to Koodo's
// own backend (see CLAUDE.md's "client isn't wired up to this backend yet"),
// so once it is, the request layer should attach this as an
// `Authorization: Bearer <token>` header (functions/lib/session.ts already
// accepts that alongside the cookie) whenever it's present, falling back to
// cookie-based auth for the Google/Microsoft flows otherwise.
const LTI_SESSION_KEY = "btech_lti_session";

export const getLtiSessionToken = (): string | null => {
  try {
    return window.localStorage.getItem(LTI_SESSION_KEY);
  } catch {
    return null;
  }
};

export const setLtiSessionToken = (token: string): void => {
  try {
    window.localStorage.setItem(LTI_SESSION_KEY, token);
  } catch {
    // localStorage can throw in locked-down iframe/privacy-mode contexts;
    // there's nothing useful to do beyond letting the launch fail visibly.
  }
};
