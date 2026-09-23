"use client";
import { useEffect, useState } from "react";

import { Button } from "../../../components/ui/button";
import { FeedbackMessages } from "../../../components/ui/feedback-messages";

type InstallPrompt = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function InstallApp() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)");
    const check = () =>
      setInstalled(
        standalone.matches ||
          (navigator as Navigator & { standalone?: boolean }).standalone ===
            true
      );
    const offer = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPrompt);
    };
    const complete = () => {
      setInstalled(true);
      setPrompt(null);
    };
    check();
    standalone.addEventListener("change", check);
    window.addEventListener("beforeinstallprompt", offer);
    window.addEventListener("appinstalled", complete);

    return () => {
      standalone.removeEventListener("change", check);
      window.removeEventListener("beforeinstallprompt", offer);
      window.removeEventListener("appinstalled", complete);
    };
  }, []);
  async function install() {
    if (!prompt) {
      return;
    }
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === "accepted") {
        setInstalled(true);
      }
    } catch {
      setError("Use your browser’s install or Add to Home Screen option.");
    }
    setPrompt(null);
  }

  return (
    <section className="install-app" aria-label="Install Funes on your phone">
      <h3>Funes on your phone</h3>
      {installed ? (
        <p>You’re using the installed app.</p>
      ) : (
        <>
          <p>
            Open this website on your phone and sign in to access the same
            memories and conversations.
          </p>
          <p>
            In Safari, use the Share menu and choose Add to Home Screen. In
            other supported browsers, look for Install app or Add to Home Screen
            in the browser menu.
          </p>
          {prompt ? (
            <Button type="button" onClick={() => void install()}>
              Install Funes
            </Button>
          ) : null}
        </>
      )}
      <p className="muted">
        Text and voice chat connect to your server. Offline text captures stay
        on this device until they sync.
      </p>
      <FeedbackMessages error={error} />
    </section>
  );
}
