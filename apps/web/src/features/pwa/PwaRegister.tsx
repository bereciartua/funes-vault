"use client";
import { useEffect } from "react";

type ServiceWorkerEnvironment = {
  hasServiceWorker: boolean;
  isSecureContext: boolean;
  nodeEnv?: string;
};

// The service worker only makes sense on the real installable origin:
// production build over HTTPS (or localhost, which counts as secure).
// In dev it would cache unhashed build assets and fight hot reload.
export function shouldRegisterServiceWorker({
  hasServiceWorker,
  isSecureContext,
  nodeEnv
}: ServiceWorkerEnvironment) {
  return hasServiceWorker && isSecureContext && nodeEnv === "production";
}

async function clearStaleServiceWorker() {
  await Promise.all([
    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) =>
        Promise.all(
          registrations
            .filter(
              (registration) => registration.scope === `${location.origin}/`
            )
            .map((registration) => registration.unregister())
        )
      ),
    "caches" in window
      ? caches
          .keys()
          .then((keys) =>
            Promise.all(
              keys
                .filter((key) => key.startsWith("funes-"))
                .map((key) => caches.delete(key))
            )
          )
      : Promise.resolve()
  ]);
}

export function PwaRegister() {
  useEffect(() => {
    if (
      !shouldRegisterServiceWorker({
        hasServiceWorker: "serviceWorker" in navigator,
        isSecureContext: window.isSecureContext,
        nodeEnv: process.env.NODE_ENV
      })
    ) {
      if ("serviceWorker" in navigator) {
        void clearStaleServiceWorker();
      }

      return;
    }

    navigator.serviceWorker
      .register(`/sw.js?v=${process.env.NEXT_PUBLIC_BUILD_ID}`, { scope: "/" })
      .catch(() => {
        // Registration failures degrade to a plain web app; nothing to surface.
      });
  }, []);

  return null;
}
