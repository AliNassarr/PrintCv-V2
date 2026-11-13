"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useCVStore, bindStoreToSession } from "@/lib/store/cv-store";
import { ReziStudioLayout } from "@/components/studio/ReziStudioLayout";
import { StudioLoading } from "@/components/studio/StudioLoading";
import { StudioWelcome } from "@/components/studio/StudioWelcome";
import { DraftOwnershipDialog } from "@/components/studio/DraftOwnershipDialog";
import { PrintableCV } from "@/components/templates/PrintableCV";
import { authErrorMessage } from "@/lib/auth-errors";
import { getSessionController } from "@/lib/draft-session";
import { readDraftRecord, recordChoice, getChoices, listKnownDrafts, sourceFingerprint } from "@/lib/draft-repository";
import { ControllerState, DraftRecord, DraftSnapshot, hasSubstantiveWork, isValidIntraProfile, ownerMatches, ownerToKey } from "@/lib/draft-types";
import { Button } from "@/components/ui/Button";
import { downloadSavedDraft } from "@/lib/draft-rescue";

export default function StudioClient() {
  const [controllerState, setControllerState] = useState<ControllerState>({ state: "BOOTSTRAPPING" });
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [reviewRecord, setReviewRecord] = useState<DraftRecord | null>(null);
  const loginHandledRef = useRef(false);
  const controller = getSessionController();

  if (typeof window !== "undefined") {
    (window as any).__PRINTCV_CONTROLLER__ = controller;
  }

  // Bind Zustand store to session controller
  useEffect(() => {
    const unbind = bindStoreToSession(controller);
    return () => unbind();
  }, [controller]);

  // Subscribe to controller state changes
  useEffect(() => {
    const unsubscribe = controller.subscribe({
      onStateChange: (state) => {
        setControllerState(state);
      },
    });
    return () => unsubscribe();
  }, [controller]);

  // Handle BFCache pageshow and visibility changes
  useEffect(() => {
    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        controller.reconcileSession();
      }
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        controller.reconcileSession();
      }
    };

    window.addEventListener("pageshow", handlePageShow);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("pageshow", handlePageShow);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [controller]);

  // Bootstrap session controller once on mount
  useEffect(() => {
    controller.bootstrap();
  }, [controller]);

  // Handle ?login= code or ?error= after 42 OAuth callback
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const errorCode = params.get("error");
    const loginCode = params.get("login");
    const clearUrl = () => window.history.replaceState({}, document.title, window.location.pathname);

    if (errorCode) {
      setAuthError(authErrorMessage(errorCode));
      clearUrl();
    }

    if (!loginCode || loginHandledRef.current) return;
    loginHandledRef.current = true;
    setAuthLoading(true);

    const startGen = controller.getGeneration();
    const abortCtrl = new AbortController();

    fetch(`/api/auth/session?code=${encodeURIComponent(loginCode)}`, {
      cache: "no-store",
      signal: abortCtrl.signal,
    })
      .then((res) => res.json())
      .then(async (data) => {
        if (controller.getGeneration() !== startGen) return;
        const currentAuth = controller.getAuthState();
        if (currentAuth.status === "authenticated" && currentAuth.user.id !== data.user?.id) {
          return;
        }
        if (data.authenticated && data.fresh && data.user) {
          if (isValidIntraProfile(data.user)) {
            if (controller.getGeneration() !== startGen) return;
            await controller.activateAccountOwner(data.user, true);
          } else {
            setAuthError("Invalid profile received from server.");
          }
        } else if (!data.authenticated) {
          setAuthError(authErrorMessage("failed"));
        } else {
          setAuthError(authErrorMessage("expired"));
        }
      })
      .catch((err) => {
        if (err?.name !== "AbortError") {
          setAuthError(authErrorMessage("failed"));
        }
      })
      .finally(() => {
        clearUrl();
        setAuthLoading(false);
      });

    return () => {
      abortCtrl.abort();
    };
  }, [controller]);

  const handleContinueGuest = useCallback(() => {
    controller.activateGuestOwner(false);
  }, [controller]);

  const handleReviewDraft = useCallback((key: string) => {
    const record = readDraftRecord(key);
    if (record) {
      setReviewRecord(key.includes(":legacy:") ? { ...record, provenance: { ...record.provenance, legacyFingerprint: `legacy:${key.split(":legacy:")[1]}` } } : record);
    }
  }, []);

  const handleKeepSeparate = useCallback(() => {
    if (!reviewRecord) return;
    const owner = controller.getCurrentOwner();
    if (owner.kind === "account") {
      recordChoice(owner.studentId, sourceFingerprint(reviewRecord), "keep-separate");
      if (reviewRecord.owner.kind === "guest") {
        recordChoice(owner.studentId, "guest", "keep-separate");
      }
    }
    setReviewRecord(null);
    setAvailableReviews((prev) =>
      prev.filter((r) => !r.key.includes(sourceFingerprint(reviewRecord).replace(/^legacy:/, "")) && !(reviewRecord.owner.kind === "guest" && r.key.endsWith(":guest")))
    );
  }, [reviewRecord, controller]);

  const handleConfirmCopy = useCallback(async () => {
    if (!reviewRecord) return;
    // Capture the complete source before guest activation or any other await.
    const copiedSnapshot = structuredClone(reviewRecord);
    if (controller.getCurrentOwner().kind === "unassigned") {
      const activation = controller.activateGuestOwner(false);
      const activationGeneration = controller.getGeneration();
      await activation;
      if (controller.getGeneration() !== activationGeneration || controller.getCurrentOwner().kind !== "guest") {
        return { success: false, error: "ABORTED_AUTH_OR_TARGET_CHANGED" };
      }
    }
    const generation = controller.getGeneration();
    const result = await controller.executeCopy(copiedSnapshot, sourceFingerprint(copiedSnapshot));
    if (!result.success) {
      // Expected stale commands are explicit aborts, never successful former-owner writes.
      if (result.error === "ABORTED_AUTH_OR_TARGET_CHANGED") return result;
      if (controller.getGeneration() === generation) alert(result.error || "Failed to copy draft.");
      return result;
    }
    if (controller.getGeneration() !== generation) return result;
    if (result.warning) alert("Your draft was copied, but the review preference could not be saved.");
    setReviewRecord(null);
    setAvailableReviews(prev => prev.filter(r =>
      !r.key.includes(sourceFingerprint(copiedSnapshot).replace(/^legacy:/, "")) &&
      !(copiedSnapshot.owner.kind === "guest" && r.key.endsWith(":guest"))));
    return result;
  }, [reviewRecord, controller]);

  const [availableReviews, setAvailableReviews] = useState<Array<{ key: string; label: string }>>([]);

  useEffect(() => {
    try {
      const known = listKnownDrafts();
      const reviews: Array<{ key: string; label: string }> = [];
      const currentOwner = controller.getCurrentOwner();
      const choices = currentOwner.kind === "account" ? getChoices(currentOwner.studentId) : null;

      if (known.legacy && known.legacy.length > 0) {
        const legacyHash = known.legacy[0].hash;
        const legacyId = `legacy:${legacyHash}`;
        if (!choices?.choices?.[legacyId]) {
          reviews.push({
            key: `printcv_drafts_v1:legacy:${legacyHash}`,
            label: "saved legacy draft",
          });
        }
      }
      if (known.guest && currentOwner.kind === "account" && hasSubstantiveWork(known.guest.snapshot)) {
        const guestId = known.guest.draftId;
        if (!choices?.choices?.[guestId] && !choices?.choices?.["guest"]) {
          reviews.push({
            key: "printcv_drafts_v1:guest",
            label: "guest draft from this browser",
          });
        }
      }
      setAvailableReviews(reviews);
    } catch {}
  }, [controllerState, controller]);

  // State: Bootstrapping / Login in flight
  if (controllerState.state === "BOOTSTRAPPING" || authLoading) {
    return <StudioLoading mode={authLoading ? "login" : undefined} />;
  }

  // State: Transitioning / Logout in flight (gate rendered data immediately)
  if (controllerState.state === "TRANSITIONING" || controllerState.state === "LOGOUT_PENDING") {
    return <StudioLoading />;
  }

  // State: Recovery blocked (Locks missing / failed / timeout)
  if (controllerState.state === "RECOVERY_BLOCKED") {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-ground p-4">
        <div className="w-full max-w-[500px] rounded-sheet border border-edge bg-paper p-8 shadow-card">
          <h1 className="text-app-title font-semibold text-ink">Action Required</h1>
          <p className="mt-3 text-app text-muted">{controllerState.message}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button variant="primary" onClick={() => controller.bootstrap()}>
              Try Again
            </Button>
            <Button variant="secondary" onClick={() => controller.activateGuestOwner(true)}>
              Continue as Guest (Memory Only)
            </Button>
            <Button variant="secondary" onClick={downloadSavedDraft}>
              Download Saved Draft
            </Button>
          </div>
        </div>
      </main>
    );
  }

  // State: Session unknown (Network error)
  if (controllerState.state === "SESSION_UNKNOWN") {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-ground p-4">
        <div className="w-full max-w-[500px] rounded-sheet border border-edge bg-paper p-8 shadow-card">
          <h1 className="text-app-title font-semibold text-ink">Session Verification</h1>
          <p className="mt-3 text-app text-muted">
            {controllerState.message || "Could not verify your login status."}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button variant="primary" onClick={() => controller.reconcileSession()}>
              Retry
            </Button>
            <Button variant="secondary" onClick={handleContinueGuest}>
              Continue as Guest
            </Button>
          </div>
        </div>
      </main>
    );
  }

  // State: Welcome
  if (controllerState.state === "WELCOME") {
    return (
      <>
        <StudioWelcome
          notice={controllerState.notice || authError}
          onContinueGuest={handleContinueGuest}
          onReviewDraft={handleReviewDraft}
        />
        {reviewRecord && (
          <DraftOwnershipDialog
            isOpen={Boolean(reviewRecord)}
            sourceRecord={reviewRecord}
            targetHasSubstantiveWork={hasSubstantiveWork(useCVStore.getState().extractSnapshot())}
            onClose={() => setReviewRecord(null)}
            onKeepSeparate={handleKeepSeparate}
            onConfirmCopy={handleConfirmCopy}
          />
        )}
      </>
    );
  }

  // State: Active Editor (Guest or Account)
  return (
    <>
      {availableReviews.length > 0 && !reviewRecord && (
        <aside
          role="region"
          aria-label="Available previous draft banner"
          className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-app-sm flex items-center justify-between text-amber-900"
        >
          <span>Found previous {availableReviews.map((r) => r.label).join(" and ")}. Review and copy it into this session?</span>
          <div className="flex gap-2">
            {availableReviews.map((rev) => (
              <Button
                key={rev.key}
                size="sm"
                variant="secondary"
                onClick={() => handleReviewDraft(rev.key)}
              >
                Review {rev.label.includes("legacy") ? "Legacy" : "Guest"} Draft
              </Button>
            ))}
          </div>
        </aside>
      )}
      <ReziStudioLayout notice={authError} onCloseNotice={() => setAuthError(null)} />
      <PrintableCV />
      {reviewRecord && (
        <DraftOwnershipDialog
          isOpen={Boolean(reviewRecord)}
          sourceRecord={reviewRecord}
          targetHasSubstantiveWork={hasSubstantiveWork(useCVStore.getState().extractSnapshot())}
          onClose={() => setReviewRecord(null)}
          onKeepSeparate={handleKeepSeparate}
          onConfirmCopy={handleConfirmCopy}
        />
      )}
    </>
  );
}
