import type { ScoreSection } from "@/lib/cv-score";

export type StudioSection = ScoreSection;

// Menu order, labels and page titles. Icons stay in the component.
export const STUDIO_SECTIONS: { id: StudioSection; label: string }[] = [
  { id: "CONTACT", label: "Your details" },
  { id: "EXPERIENCE", label: "Work experience" },
  { id: "PROJECTS", label: "Projects" },
  { id: "EDUCATION", label: "Education" },
  { id: "SKILLS", label: "Skills" },
  { id: "ACTIVITIES", label: "Courses and activities" },
];

export const sectionLabel = (id: StudioSection) => STUDIO_SECTIONS.find((s) => s.id === id)!.label;
