"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { emailOtp, signIn } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

type SignInProps = {
  callbackUrl?: string;
  variant?: "nav" | "page";
};

export function SignIn({ callbackUrl = "/", variant = "nav" }: SignInProps) {
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [githubError, setGithubError] = useState(false);
  const isPage = variant === "page";

  const resetEmailFlow = () => {
    setShowEmailForm(false);
    setEmail("");
    setOtp("");
    setOtpSent(false);
    setError("");
  };

  const returnToEmailStep = () => {
    setOtpSent(false);
    setOtp("");
    setError("");
  };

  const containerClassName = cn(
    "flex w-full min-w-0 flex-col gap-3",
    isPage && "rounded-2xl border bg-card px-4 py-5 shadow-sm sm:px-6 sm:py-6"
  );

  const stackedRowClassName =
    "flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:items-start";
  const actionGroupClassName =
    "flex w-full flex-col gap-2 sm:w-auto sm:flex-row";
  const choiceButtonClassName = cn("w-full sm:w-auto", isPage && "sm:flex-1");

  const handleGithubSignIn = async () => {
    setGithubError(false);
    try {
      const result = await signIn.social(
        {
          provider: "github",
          callbackURL: callbackUrl,
        },
        {
          onError: () => {
            setGithubError(true);
          },
        }
      );

      if (result?.error) {
        setGithubError(true);
      }
    } catch (_err) {
      setGithubError(true);
    }
  };

  const handleSendOTP = async () => {
    if (!email) {
      setError("Please enter your email");
      return;
    }

    setLoading(true);
    setError("");

    try {
      await emailOtp.sendVerificationOtp({
        email,
        type: "sign-in",
      });
      setOtpSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send code");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (!otp) {
      setError("Please enter the verification code");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const result = await signIn.emailOtp({
        email,
        otp,
      });

      if (result.error) {
        setError(result.error.message ?? "Invalid verification code");
      } else {
        // Redirect on successful sign-in
        window.location.href = callbackUrl;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to verify code");
    } finally {
      setLoading(false);
    }
  };

  if (showEmailForm) {
    return (
      <div className={containerClassName}>
        <div className={stackedRowClassName}>
          {!otpSent ? (
            <>
              <Input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                autoComplete="email"
                className={cn(
                  "w-full min-w-0",
                  isPage ? "sm:flex-1" : "sm:w-64"
                )}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    void handleSendOTP();
                  }
                }}
              />
              <div className={actionGroupClassName}>
                <Button
                  onClick={() => void handleSendOTP()}
                  disabled={loading}
                  className="w-full sm:w-auto"
                >
                  {loading ? "Sending..." : "Send code"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetEmailFlow}
                  disabled={loading}
                  className="w-full sm:w-auto"
                >
                  Cancel
                </Button>
              </div>
            </>
          ) : (
            <>
              <Input
                type="text"
                placeholder="Enter 6-digit code"
                value={otp}
                onChange={(e) =>
                  setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                disabled={loading}
                maxLength={6}
                autoComplete="one-time-code"
                inputMode="numeric"
                className={cn(
                  "w-full min-w-0",
                  isPage ? "sm:flex-1" : "sm:w-48",
                  "text-center tracking-[0.3em]"
                )}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    void handleVerifyOTP();
                  }
                }}
              />
              <div className={actionGroupClassName}>
                <Button
                  onClick={() => void handleVerifyOTP()}
                  disabled={loading}
                  className="w-full sm:w-auto"
                >
                  {loading ? "Verifying..." : "Verify"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={returnToEmailStep}
                  disabled={loading}
                  className="w-full sm:w-auto"
                >
                  Back
                </Button>
              </div>
            </>
          )}
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
    );
  }

  return (
    <div className={containerClassName}>
      <div className="flex w-full flex-col gap-2 sm:flex-row">
        <Button
          onClick={() => void handleGithubSignIn()}
          className={choiceButtonClassName}
        >
          <svg
            className="size-4"
            fill="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
              clipRule="evenodd"
            />
          </svg>
          GitHub
        </Button>

        <Button
          onClick={() => {
            setShowEmailForm(true);
            setGithubError(false);
          }}
          variant="outline"
          className={choiceButtonClassName}
        >
          Email
        </Button>
      </div>
      {githubError && (
        <p className="text-sm text-red-500">
          GitHub sign-in failed. Try using email instead.
        </p>
      )}
    </div>
  );
}
