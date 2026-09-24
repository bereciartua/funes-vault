"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { type ReactNode, useRef, useState } from "react";

import { Button } from "../components/ui/button";
import { mcpJsonConfigFor } from "../lib/mcp-config";

type PublicHomeProps = {
  authForm: ReactNode;
  onSignIn: (options?: { focus?: boolean }) => void;
  showAuth?: boolean;
};

const workflowSteps = [
  [
    "Save memory",
    "Create or import durable context you want future assistants to remember."
  ],
  [
    "Classify sensitivity",
    "Rate each memory from public to secret — six levels that decide how deliberately it is shared."
  ],
  [
    "Approve clients",
    "Give each app narrow permissions by category, operation, and sensitivity."
  ],
  [
    "Audit disclosure",
    "See what was shared, who received it, and which permissions allowed it."
  ]
] as const;

const trustPoints = [
  [
    "User-controlled by default",
    "Inspectable memory with correction, export, and deletion built in — not bolted on."
  ],
  [
    "Least privilege for each client",
    "Apps request memory for a task; app permissions filter what actually leaves."
  ],
  [
    "Sensitive data is deliberate",
    "Choose which apps can read sensitive context and when they need your approval."
  ],
  [
    "Disclosure stays visible",
    "External sharing leaves an audit trail that explains who received what, and why."
  ],
  [
    "Model processing is disclosed",
    "When a third-party model provider is configured, the product says so — plainly."
  ]
] as const;

export function PublicHome({
  authForm,
  onSignIn,
  showAuth = false
}: PublicHomeProps) {
  const [authOpen, setAuthOpen] = useState(showAuth);
  const opener = useRef<HTMLElement | null>(null);
  const currentYear = new Date().getFullYear();
  function openAuthPanel() {
    opener.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    onSignIn({ focus: false });
    setAuthOpen(true);
  }

  return (
    <div className="public-home" id="top">
      <a className="skip-link" href="#public-main">
        Skip to content
      </a>
      <header className="public-nav">
        <a className="public-brand" href="#top" aria-label="Funes Vault home">
          funes<span>.</span>
        </a>
        <nav className="public-nav-links" aria-label="Public page sections">
          <a href="#how">How it works</a>
          <a href="#privacy">Privacy</a>
          <a href="#builders">For builders</a>
        </nav>
        <Dialog.Root
          open={authOpen}
          onOpenChange={(open) => {
            if (open) {
              opener.current =
                document.activeElement instanceof HTMLElement
                  ? document.activeElement
                  : null;
            }
            setAuthOpen(open);
            if (open) {
              onSignIn({ focus: false });
            }
          }}
        >
          <Dialog.Trigger asChild>
            <Button type="button" variant="secondary">
              Sign in
            </Button>
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="public-auth-overlay" />
            <Dialog.Content
              onCloseAutoFocus={(event) => {
                if (opener.current?.isConnected) {
                  event.preventDefault();
                  opener.current.focus();
                }
              }}
              className="public-auth-popover"
              aria-describedby={undefined}
            >
              <Dialog.Title className="visually-hidden">
                Account access
              </Dialog.Title>
              <Dialog.Close asChild>
                <Button
                  type="button"
                  variant="ghost"
                  className="public-auth-close"
                >
                  Close
                </Button>
              </Dialog.Close>
              {authForm}
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </header>

      <main id="public-main">
        <section className="public-hero" aria-labelledby="public-hero-title">
          <div className="public-hero-copy">
            <p className="eyebrow">A private memory layer for AI</p>
            <h1 id="public-hero-title">
              Your AI memory, <em>under your control.</em>
            </h1>
            <p className="public-lede">
              Keep durable context about yourself in one vault, then share only
              the relevant pieces with the assistants, agents, and tools you
              approve.
            </p>
            <div className="public-hero-actions">
              <Button type="button" onClick={openAuthPanel}>
                Create your vault
              </Button>
              <a href="#how">See how it works →</a>
            </div>
            <p className="public-hero-note">
              Web and mobile · text and voice · controlled memory sharing
            </p>
          </div>
          <DisclosurePreview />
        </section>

        <section
          className="public-section"
          id="how"
          aria-labelledby="how-title"
        >
          <p className="eyebrow">How it works</p>
          <h2 id="how-title">A small consent loop before memory leaves.</h2>
          <p className="public-section-lede">
            Nothing is shared by accident. Memory moves only through permissions
            you wrote, at sensitivities you chose, to clients you approved.
          </p>
          <div className="public-steps">
            {workflowSteps.map(([title, body], index) => (
              <article className="public-step" key={title}>
                <span>{index + 1}</span>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section
          className="public-section"
          id="privacy"
          aria-labelledby="privacy-title"
        >
          <p className="eyebrow">Privacy and trust</p>
          <h2 id="privacy-title">
            Built to answer the uncomfortable questions.
          </h2>
          <p className="public-section-lede">
            What does it know? Why does it know that? Who received it, and when?
            Can you revoke, correct, delete, or export it? The answer should
            always be one screen away.
          </p>
          <div className="public-pillars">
            {trustPoints.map(([title, body]) => (
              <article className="public-pillar" key={title}>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section
          className="public-section"
          id="builders"
          aria-labelledby="builders-title"
        >
          <p className="eyebrow">For builders</p>
          <div className="public-builders">
            <div>
              <h2 id="builders-title">
                A memory layer agents can ask politely.
              </h2>
              <p className="public-section-lede">
                Agents and apps request compact memory bundles over MCP or HTTP,
                under their app permissions. The vault answers with exactly what
                their permissions allow, with an audit entry for each
                disclosure.
              </p>
            </div>
            <pre className="public-code" aria-label="MCP configuration example">
              {mcpJsonConfigFor("https://vault.example.com/mcp")}
            </pre>
          </div>
        </section>
      </main>

      <footer className="public-footer">
        <span>
          <time dateTime={String(currentYear)}>{currentYear}</time> funes
          <span>.</span> — named after the man who remembered everything
        </span>
        <span>
          Your vault, across your devices · shares only what you allow
        </span>
      </footer>
    </div>
  );
}

function DisclosurePreview() {
  return (
    <aside
      className="disclosure-preview"
      aria-labelledby="disclosure-preview-title"
    >
      <div className="disclosure-preview-header">
        <p className="eyebrow">Disclosure preview</p>
        <p className="eyebrow">
          stated purpose: help with software development
        </p>
      </div>
      <h2 id="disclosure-preview-title">A coding agent asks for memory</h2>
      <div className="disclosure-request" aria-label="Requested context">
        <span>coding preferences</span>
        <span>project context</span>
        <span>personal context</span>
      </div>
      <div className="disclosure-decision" data-tone="brand">
        <i aria-hidden="true" />
        <p>
          <strong>Shared</strong> — coding preferences and project context, 4
          memories allowed by app permissions.
        </p>
      </div>
      <div className="disclosure-decision" data-tone="warn">
        <i aria-hidden="true" />
        <p>
          <strong>Held for you</strong> — one sensitive memory waits for your
          confirmation.
        </p>
      </div>
      <div className="disclosure-decision" data-tone="danger">
        <i aria-hidden="true" />
        <p>
          <strong>Denied</strong> — personal context is outside this
          agent&apos;s permissions.
        </p>
      </div>
      <p className="disclosure-preview-footer">
        Disclosures and approval decisions are recorded with who, what, and why.
      </p>
    </aside>
  );
}
