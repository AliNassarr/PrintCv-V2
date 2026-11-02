"use client";

import React, { forwardRef, useRef, useEffect, useState, useCallback } from "react";
import { CVData } from "@/types/resume";
import { CVSheet, getPrintableBudgetPx, type HeightBudget, type TemplateSectionId } from "./CVSheet";

export type { HeightBudget, TemplateSectionId } from "./CVSheet";

interface CleanTemplateProps {
  data: CVData;
  scale?: number;
  onHeightBudgetChange?: (budget: HeightBudget) => void;
  onSectionClick?: (section: TemplateSectionId) => void;
  forceOverflowIndicator?: boolean;
  nameAs?: "h1" | "p";
  dataUi?: boolean;
}

// Client wrapper around CVSheet: measures the CV height to know if it fits on 1 page.
export const CleanTemplate = forwardRef<HTMLDivElement, CleanTemplateProps>(
  ({ data, scale = 1, onHeightBudgetChange, onSectionClick, forceOverflowIndicator, nameAs, dataUi }, ref) => {
    const innerContentRef = useRef<HTMLDivElement>(null);
    const onHeightBudgetChangeRef = useRef(onHeightBudgetChange);
    onHeightBudgetChangeRef.current = onHeightBudgetChange;
    const styleDensityRef = useRef(data.styleDensity);
    styleDensityRef.current = data.styleDensity;

    const [isInternalOverflow, setIsInternalOverflow] = useState(false);
    const lastHeightRef = useRef<number>(-1);

    const calculateBudget = useCallback(() => {
      if (!innerContentRef.current) return;
      const budgetPx = getPrintableBudgetPx(styleDensityRef.current);
      const height = innerContentRef.current.scrollHeight;
      if (height === lastHeightRef.current) return;
      lastHeightRef.current = height;

      const percentage = Math.round((height / budgetPx) * 100);
      const isOverflow = height > budgetPx;
      setIsInternalOverflow(isOverflow);

      if (onHeightBudgetChangeRef.current) {
        onHeightBudgetChangeRef.current({
          height,
          printableBudget: budgetPx,
          percentage,
          isOverflow,
        });
      }
    }, []);

    // Stable observer: observe once, debounce layout measurements with requestAnimationFrame
    useEffect(() => {
      const el = innerContentRef.current;
      if (!el || typeof ResizeObserver === "undefined") return;

      let rafId = 0;
      const scheduleCalculate = () => {
        cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(calculateBudget);
      };

      scheduleCalculate();

      const observer = new ResizeObserver(scheduleCalculate);
      observer.observe(el);

      return () => {
        cancelAnimationFrame(rafId);
        observer.disconnect();
      };
    }, [calculateBudget]);

    // When data changes, schedule a rAF measurement
    useEffect(() => {
      const rafId = requestAnimationFrame(calculateBudget);
      return () => cancelAnimationFrame(rafId);
    }, [data, calculateBudget]);

    const isOverflow = forceOverflowIndicator ?? isInternalOverflow;

    return (
      <CVSheet
        data={data}
        scale={scale}
        isOverflow={isOverflow}
        onSectionClick={onSectionClick}
        nameAs={nameAs}
        dataUi={dataUi}
        sheetRef={ref}
        contentRef={innerContentRef}
      />
    );
  }
);

CleanTemplate.displayName = "CleanTemplate";
