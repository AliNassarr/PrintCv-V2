"use client";

import React, { useEffect, useState } from "react";
import { Sparkles, Copy, Check, AlertTriangle, ExternalLink, Info, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface GenerationActionBarProps {
  onGenerate: () => Promise<void>;
  onCopyPrompt: () => Promise<void>;
  isGenerating: boolean;
  copied: boolean;
  errorMessage: string | null;
  retryAfterSeconds: number | null;
  missingInformationPrompt: string | null;
  disabled?: boolean;
}

const AI_CHAT_LINKS = [
  { name: "ChatGPT", url: "https://chatgpt.com/" },
  { name: "Claude", url: "https://claude.ai/new" },
  { name: "Gemini", url: "https://gemini.google.com/app" },
];

export function GenerationActionBar({
  onGenerate,
  onCopyPrompt,
  isGenerating,
  copied,
  errorMessage,
  retryAfterSeconds,
  missingInformationPrompt,
  disabled = false,
}: GenerationActionBarProps) {
  const [countdown, setCountdown] = useState<number | null>(retryAfterSeconds);

  useEffect(() => {
    setCountdown(retryAfterSeconds);
    if (!retryAfterSeconds || retryAfterSeconds <= 0) return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (!prev || prev <= 1) {
          clearInterval(timer);
          return null;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [retryAfterSeconds]);

  const isRateLimited = countdown !== null && countdown > 0;

  return (
    <div className="flex flex-col gap-3 rounded-card border border-edge bg-paper p-4">
      {/* Action Buttons Row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Primary Action: Generate with AI */}
          <Button
            variant="primary"
            onClick={onGenerate}
            disabled={disabled || isGenerating || isRateLimited}
            className="h-10 px-4 font-medium"
          >
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                Generating Bullets with AI...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" aria-hidden="true" />
                Generate with AI
              </>
            )}
          </Button>

          {/* Secondary Action: Offline Copy Prompt Fallback */}
          <Button
            variant="secondary"
            onClick={onCopyPrompt}
            disabled={isGenerating}
            className="h-10 px-3.5"
            aria-label="Copy prompt for external AI chat"
          >
            {copied ? (
              <>
                <Check className="mr-1.5 h-4 w-4 text-data" aria-hidden="true" />
                Copied Prompt
              </>
            ) : (
              <>
                <Copy className="mr-1.5 h-4 w-4" aria-hidden="true" />
                Copy Prompt
              </>
            )}
          </Button>
        </div>

        {/* AI Chat Quick Links for offline Copy Prompt workflow */}
        <div className="flex items-center gap-1.5 text-xs text-muted">
          <span>Or paste in:</span>
          {AI_CHAT_LINKS.map((link) => (
            <a
              key={link.name}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 rounded-control px-1.5 py-0.5 font-medium text-ink hover:bg-ground"
            >
              {link.name}
              <ExternalLink className="h-2.5 w-2.5 text-muted" aria-hidden="true" />
            </a>
          ))}
        </div>
      </div>

      {/* Countdown Alert for Rate Limiting */}
      {isRateLimited && (
        <div role="alert" className="flex items-start gap-2.5 rounded-control bg-raised p-3 text-app-sm text-ink">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden="true" />
          <div className="flex-1">
            <p className="font-medium">Generation rate limit reached</p>
            <p className="text-muted text-xs mt-0.5">
              You can retry in <span className="font-medium text-ink tabular-nums">{countdown}s</span>, or use the offline Copy Prompt button immediately.
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={onCopyPrompt}
            className="shrink-0 text-xs h-8 px-2.5"
          >
            {copied ? (
              <>
                <Check className="mr-1 h-3.5 w-3.5 text-data" aria-hidden="true" />
                Copied
              </>
            ) : (
              <>
                <Copy className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                Copy Prompt
              </>
            )}
          </Button>
        </div>
      )}

      {/* Error Message Alert */}
      {errorMessage && !isRateLimited && (
        <div role="alert" className="flex items-start gap-2.5 rounded-control bg-raised p-3 text-app-sm text-warn">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden="true" />
          <div className="flex-1">
            <p className="font-medium text-ink">{errorMessage}</p>
            <p className="text-muted text-xs mt-0.5">
              You can still click &quot;Copy Prompt&quot; to generate bullets in any external AI chat tool.
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={onCopyPrompt}
            className="shrink-0 text-xs h-8 px-2.5 text-ink"
          >
            {copied ? (
              <>
                <Check className="mr-1 h-3.5 w-3.5 text-data" aria-hidden="true" />
                Copied
              </>
            ) : (
              <>
                <Copy className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                Copy Prompt
              </>
            )}
          </Button>
        </div>
      )}

      {/* Insufficient Evidence Notice */}
      {missingInformationPrompt && (
        <div role="status" className="flex items-start gap-2 rounded-control bg-ground p-3 text-app-sm text-ink">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-ink" aria-hidden="true" />
          <div className="flex-1">
            <p className="font-medium">More technical details requested by AI:</p>
            <p className="text-muted mt-0.5">{missingInformationPrompt}</p>
          </div>
        </div>
      )}

      {/* Privacy Transparency Notice */}
      <p className="text-[12px] text-muted leading-tight">
        <span className="font-medium text-ink">Privacy Notice:</span> Your entered project answers, technical stack, and selected README sections are sent to Groq LPU inference solely to generate CV bullet points. No login passwords, session tokens, or private contact details are transmitted. Never submit confidential passwords, API keys, or private secrets.
      </p>
    </div>
  );
}
