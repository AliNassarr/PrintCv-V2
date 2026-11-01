"use client";

import React, { forwardRef, useRef, useEffect, useState } from "react";
import { CVData } from "@/types/resume";
import { CVSheet, PRINTABLE_BUDGET_PX, type HeightBudget, type TemplateSectionId } from "./CVSheet";

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

    const [isInternalOverflow, setIsInternalOverflow] = useState(false);

    // Measure the CV height as it changes, to know if it fits on 1 page
    useEffect(() => {
      if (!innerContentRef.current) return;

      const calculateBudget = () => {
        if (!innerContentRef.current) return;
        const height = innerContentRef.current.scrollHeight;
        const percentage = Math.round((height / PRINTABLE_BUDGET_PX) * 100);
        const isOverflow = height > PRINTABLE_BUDGET_PX;
        setIsInternalOverflow(isOverflow);

        if (onHeightBudgetChangeRef.current) {
          onHeightBudgetChangeRef.current({
            height,
            printableBudget: PRINTABLE_BUDGET_PX,
            percentage,
            isOverflow,
          });
        }
      };

      calculateBudget();

      const observer = new ResizeObserver(() => {
        calculateBudget();
      });

      observer.observe(innerContentRef.current);
      return () => observer.disconnect();
    }, [data]);

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
