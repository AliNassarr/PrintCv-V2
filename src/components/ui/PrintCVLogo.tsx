import React from "react";

export function PrintCVLogo({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {/* Precision Geometric Document & Offset Print Crosshair Mark */}
      <rect x="4" y="3" width="16" height="18" rx="2" strokeWidth="2" />
      <path d="M8 8h8" strokeWidth="2" />
      <path d="M8 12h8" strokeWidth="2" />
      <path d="M8 16h5" strokeWidth="2" />
      <circle cx="17.5" cy="16.5" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}
