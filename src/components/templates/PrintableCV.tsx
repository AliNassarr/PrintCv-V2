"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useCVStore } from "@/lib/store/cv-store";
import { CleanTemplate } from "./CleanTemplate";

// A full-size copy of the CV that only shows up when printing.
// It sits directly in <body>, so the print CSS can hide the whole app
// and keep just this sheet, at real A4 size with no zoom.
export function PrintableCV() {
  const cvData = useCVStore((s) => s.cvData);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Use the student's name as the default PDF file name.
  useEffect(() => {
    let savedTitle = "";
    const before = () => {
      savedTitle = document.title;
      const name = cvData.contact.fullName?.trim();
      if (name) document.title = `${name} CV`;
    };
    const after = () => {
      if (savedTitle) document.title = savedTitle;
    };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, [cvData.contact.fullName]);

  if (!mounted) return null;

  return createPortal(
    <div className="print-root" aria-hidden="true">
      <CleanTemplate data={cvData} />
    </div>,
    document.body
  );
}
