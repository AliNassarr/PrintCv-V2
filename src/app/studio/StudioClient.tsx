"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { useCVStore, useHasHydrated } from "@/lib/store/cv-store";
import { ReziStudioLayout } from "@/components/studio/ReziStudioLayout";
import { StudioLoading } from "@/components/studio/StudioLoading";
import { PrintableCV } from "@/components/templates/PrintableCV";
import { IntraProfile, projectsFromIntra } from "@/lib/intra/cv-from-intra";
import { authErrorMessage } from "@/lib/auth-errors";

export default function StudioClient() {
  const hasHydrated = useHasHydrated();

  const { setStudentProfile, setSelectedProjects } = useCVStore();

  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const loginHandledRef = useRef(false);

  // Adds the student's real 42 data to their draft. Fields they already filled in are kept.
  const importIntraUser = useCallback(
    (user: IntraProfile) => {
      setStudentProfile(user);

      const projects = projectsFromIntra(user);
      if (useCVStore.getState().selectedProjects.length === 0 && projects.length > 0) {
        setSelectedProjects(
          projects.map((p) => ({ name: p.name, slug: p.slug || "", date: p.date, is42Project: true }))
        );
      }
    },
    [setSelectedProjects, setStudentProfile]
  );

  // After "Log in with 42": the callback sends us back with a one-time code
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

    fetch(`/api/auth/session?code=${encodeURIComponent(loginCode)}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (data.authenticated && data.fresh && data.user) {
          importIntraUser(data.user);
        } else if (!data.authenticated) {
          setAuthError(authErrorMessage("failed"));
        } else {
          // Logged in, but the one-time code ran out before we used it
          setAuthError(authErrorMessage("expired"));
        }
      })
      .catch(() => setAuthError(authErrorMessage("failed")))
      .finally(() => {
        clearUrl();
        setAuthLoading(false);
      });
  }, [importIntraUser]);

  // The grey-bar shell until the saved draft is read
  if (!hasHydrated) return <StudioLoading />;

  // The 42 login is still running
  if (authLoading) return <StudioLoading mode="login" />;

  return (
    <>
      <ReziStudioLayout notice={authError} onCloseNotice={() => setAuthError(null)} />
      <PrintableCV />
    </>
  );
}
