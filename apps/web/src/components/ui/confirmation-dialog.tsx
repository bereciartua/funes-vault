"use client";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState
} from "react";

import { Button } from "./button";

type ConfirmationTone = "default" | "danger";

type ConfirmationOptions = {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: ConfirmationTone;
};

type ConfirmationRequest = ConfirmationOptions & {};

function useConfirmation() {
  const [request, setRequest] = useState<ConfirmationRequest | null>(null);
  const resolverRef = useRef<((confirmed: boolean) => void) | null>(null);

  const close = useCallback((confirmed: boolean) => {
    resolverRef.current?.(confirmed);
    resolverRef.current = null;
    setRequest(null);
  }, []);

  const confirm = useCallback((options: ConfirmationOptions) => {
    resolverRef.current?.(false);

    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setRequest({
        cancelLabel: "Cancel",
        tone: "default",
        ...options
      });
    });
  }, []);

  useEffect(() => {
    return () => {
      resolverRef.current?.(false);
    };
  }, []);

  const confirmationDialog = (
    <AlertDialog.Root
      open={request !== null}
      onOpenChange={(open) => {
        if (!open && request) {
          close(false);
        }
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="ui-alert-dialog-overlay" />
        {request ? (
          <AlertDialog.Content className="ui-alert-dialog-content">
            <AlertDialog.Title className="ui-alert-dialog-title">
              {request.title}
            </AlertDialog.Title>
            <AlertDialog.Description className="ui-alert-dialog-description">
              {request.body}
            </AlertDialog.Description>
            <div className="ui-alert-dialog-actions">
              <AlertDialog.Cancel asChild>
                <Button type="button" variant="secondary">
                  {request.cancelLabel}
                </Button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <Button
                  type="button"
                  variant={request.tone === "danger" ? "danger" : "primary"}
                  onClick={() => close(true)}
                >
                  {request.confirmLabel}
                </Button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        ) : null}
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );

  return { confirm, confirmationDialog };
}

const ConfirmationContext = createContext<
  ReturnType<typeof useConfirmation>["confirm"] | null
>(null);
export function ConfirmationProvider({ children }: { children: ReactNode }) {
  const { confirm, confirmationDialog } = useConfirmation();

  return (
    <ConfirmationContext.Provider value={confirm}>
      {children}
      {confirmationDialog}
    </ConfirmationContext.Provider>
  );
}
export function useConfirm() {
  const confirm = useContext(ConfirmationContext);
  if (!confirm) {
    throw new Error("useConfirm requires ConfirmationProvider");
  }

  return confirm;
}
