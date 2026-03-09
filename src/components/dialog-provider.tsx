"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";

type DialogOptions = {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
};

type DialogState =
  | {
      type: "alert";
      message: string;
      options: DialogOptions;
      resolve: () => void;
    }
  | {
      type: "confirm";
      message: string;
      options: DialogOptions;
      resolve: (value: boolean) => void;
    };

type DialogContextValue = {
  alert: (message: string, options?: DialogOptions) => Promise<void>;
  confirm: (message: string, options?: DialogOptions) => Promise<boolean>;
};

const DialogContext = createContext<DialogContextValue | null>(null);

export function useDialog() {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error("useDialog must be used within DialogProvider");
  return ctx;
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<DialogState | null>(null);

  const showAlert = useCallback(
    (message: string, options: DialogOptions = {}) => {
      return new Promise<void>((resolve) => {
        setDialog({
          type: "alert",
          message,
          options,
          resolve: () => resolve(),
        });
      });
    },
    []
  );

  const showConfirm = useCallback(
    (message: string, options: DialogOptions = {}) => {
      return new Promise<boolean>((resolve) => {
        setDialog({
          type: "confirm",
          message,
          options,
          resolve,
        });
      });
    },
    []
  );

  const handleClose = useCallback(() => {
    if (!dialog) return;
    if (dialog.type === "alert") {
      dialog.resolve();
    } else {
      dialog.resolve(false);
    }
    setDialog(null);
  }, [dialog]);

  const handleConfirm = useCallback(() => {
    if (!dialog) return;
    if (dialog.type === "alert") {
      dialog.resolve();
    } else {
      dialog.resolve(true);
    }
    setDialog(null);
  }, [dialog]);

  return (
    <DialogContext.Provider value={{ alert: showAlert, confirm: showConfirm }}>
      {children}
      <Dialog open={dialog !== null} onClose={handleClose}>
        {dialog && (
          <>
            {dialog.options.title && (
              <h2 className="text-xl font-bold mb-4">{dialog.options.title}</h2>
            )}
            <p className="mb-6">{dialog.message}</p>
            <div className="flex gap-2 justify-end">
              {dialog.type === "confirm" && (
                <Button variant="secondary" onClick={handleClose}>
                  {dialog.options.cancelLabel ?? "Cancel"}
                </Button>
              )}
              <Button
                variant={dialog.options.variant ?? "default"}
                onClick={handleConfirm}
                data-autofocus
              >
                {dialog.options.confirmLabel ?? "OK"}
              </Button>
            </div>
          </>
        )}
      </Dialog>
    </DialogContext.Provider>
  );
}
