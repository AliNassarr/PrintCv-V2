"use client";

import React, { useRef, useState, useCallback } from "react";
import { UploadCloud, FileText, Trash2, RefreshCw, AlertTriangle, CheckCircle, ChevronDown, ChevronUp, Info } from "lucide-react";
import { validateReadmeFile, extractReadmeSections, ReadmeParseResult } from "@/lib/readme-parser";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { cx } from "@/lib/cx";

export interface ReadmeFileSummary {
  name: string;
  size: number;
}

interface ReadmeUploadZoneProps {
  currentFile: ReadmeFileSummary | null;
  parsedResult: ReadmeParseResult | null;
  onFileLoaded: (fileInfo: ReadmeFileSummary, rawText: string, parseResult: ReadmeParseResult) => void;
  onFileRemoved: () => void;
  disabled?: boolean;
}

export function ReadmeUploadZone({
  currentFile,
  parsedResult,
  onFileLoaded,
  onFileRemoved,
  disabled = false,
}: ReadmeUploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showExcerptPreview, setShowExcerptPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(
    (file: File) => {
      setErrorMessage(null);
      const validation = validateReadmeFile({ name: file.name, size: file.size });
      if (!validation.valid) {
        setErrorMessage(validation.error || "Invalid file.");
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const rawText = String(e.target?.result || "");
          const parseResult = extractReadmeSections(rawText);
          onFileLoaded({ name: file.name, size: file.size }, rawText, parseResult);
        } catch {
          setErrorMessage("Failed to read file content. Please try another file.");
        }
      };
      reader.onerror = () => {
        setErrorMessage("File reading encountered an error.");
      };
      reader.readAsText(file);
    },
    [onFileLoaded]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (disabled) return;

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  };

  const handleSelectClick = () => {
    if (fileInputRef.current && !disabled) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  return (
    <div className="flex flex-col gap-3">
      <input
        ref={fileInputRef}
        type="file"
        accept=".md,.markdown,.txt"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={handleFileInputChange}
        disabled={disabled}
      />

      {!currentFile ? (
        <div
          data-testid="readme-dropzone"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={handleSelectClick}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handleSelectClick();
            }
          }}
          tabIndex={disabled ? -1 : 0}
          role="button"
          aria-label="Upload project README (optional). Drag & drop .md or .txt file here, or click to browse (max 512 KB)."
          className={cx(
            "flex flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed p-4 text-center transition-colors duration-150 sm:p-5",
            isDragging
              ? "border-ink bg-raised"
              : "border-control bg-paper hover:border-ink hover:bg-ground cursor-pointer",
            disabled && "opacity-60 cursor-not-allowed"
          )}
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-ground text-ink">
            <UploadCloud className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <p className="text-app font-medium text-ink">
              Upload project README <span className="font-normal text-muted">(optional)</span>
            </p>
            <p className="text-app-sm text-muted">
              Drag & drop .md or .txt file here, or click to browse (max 512 KB)
            </p>
          </div>
        </div>
      ) : (
        <div data-testid="readme-summary" className="flex flex-col gap-2 rounded-card border border-edge bg-paper p-3.5 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-raised text-ink">
                <FileText className="h-4 w-4" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-app font-medium text-ink">{currentFile.name}</p>
                <p className="text-app-sm text-muted">
                  {formatFileSize(currentFile.size)}
                  {parsedResult && ` • ${parsedResult.totalOriginalWords.toLocaleString()} words`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleSelectClick}
                disabled={disabled}
                className="h-8 px-2.5 text-app-sm"
              >
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                Replace
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onFileRemoved}
                disabled={disabled}
                className="h-8 px-2.5 text-app-sm text-warn hover:bg-ground"
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                Remove
              </Button>
            </div>
          </div>

          {parsedResult && (
            <div className="mt-1 flex flex-col gap-2 border-t border-rule pt-2.5">
              <div className="flex flex-wrap items-center gap-1.5 text-app-sm">
                <span className="font-medium text-ink">Extracted context:</span>
                {parsedResult.includedSections.length > 0 ? (
                  parsedResult.includedSections.map((sec) => (
                    <Pill key={sec} tone="positive">
                      {sec}
                    </Pill>
                  ))
                ) : (
                  <Pill tone="neutral">Overview</Pill>
                )}
                {parsedResult.omittedSections.length > 0 && (
                  <span className="ml-auto text-app-sm text-muted">
                    Omitted: {parsedResult.omittedSections.slice(0, 3).join(", ")}
                    {parsedResult.omittedSections.length > 3 && "..."}
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => setShowExcerptPreview((v) => !v)}
                className="flex items-center gap-1 text-app-sm font-medium text-ink hover:underline self-start"
              >
                {showExcerptPreview ? (
                  <>
                    <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                    Hide extracted prompt preview
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                    Preview extracted prompt text ({parsedResult.extractedWords.toLocaleString()} words)
                  </>
                )}
              </button>

              {showExcerptPreview && (
                <div className="rounded-control bg-ground p-3 text-app-sm">
                  <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted">
                    Technical Excerpt to be Sent to Groq:
                  </p>
                  <pre className="max-h-36 overflow-y-auto whitespace-pre-wrap font-mono text-xs text-ink leading-relaxed">
                    {parsedResult.excerpt}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {errorMessage && (
        <div role="alert" className="flex items-start gap-2 rounded-control bg-raised p-2.5 text-app-sm text-warn">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{errorMessage}</span>
        </div>
      )}

      <p className="flex items-center gap-1.5 text-[12px] text-muted">
        <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>
          README text is parsed locally in your browser. Only the technical excerpt is sent to AI. It is never saved to your CV.
        </span>
      </p>
    </div>
  );
}
