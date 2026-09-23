import { apiEnv } from "../config.js";
import { sessionCookieName, sessionDurationMs } from "./auth.constants.js";

type CookieResponse = {
  cookie: (
    name: string,
    value: string,
    options: Record<string, unknown>
  ) => void;
  clearCookie: (name: string, options: Record<string, unknown>) => void;
};

export function cookieSecure() {
  return (
    apiEnv().NODE_ENV === "production" ||
    new URL(apiEnv().APP_URL).protocol === "https:"
  );
}

export function setSessionCookie(response: CookieResponse, token: string) {
  response.cookie(sessionCookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecure(),
    path: "/",
    maxAge: sessionDurationMs
  });
}

export function clearSessionCookie(response: CookieResponse) {
  response.clearCookie(sessionCookieName, {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecure(),
    path: "/"
  });
}

export function readCookie(cookieHeader: string | undefined, name: string) {
  if (!cookieHeader) {
    return null;
  }

  const cookies = cookieHeader.split(";").map((cookie) => cookie.trim());
  const prefix = `${name}=`;
  const match = cookies.find((cookie) => cookie.startsWith(prefix));

  if (!match) {
    return null;
  }
  try {
    return decodeURIComponent(match.slice(prefix.length));
  } catch {
    return null;
  }
}
