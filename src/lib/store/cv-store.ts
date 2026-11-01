import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { useState, useEffect } from "react";
import type { HelperAnswer, HelperAnswers } from "@/lib/bullet-helper";
import { CV_STORE_KEY } from "@/lib/cv-constants";
import {
  CVData,
  EducationItem,
  EducationState,
  ExperienceItem,
  ProjectItem,
  CourseworkItem,
  ExtracurricularItem,
  SectionId,
  DEFAULT_SECTION_ORDER,
} from "@/types/resume";
import {
  IntraProfile,
  MAIN_EDUCATION_ID,
  createEmptyCV,
  createInitialCVFromIntra,
  educationStateForProfile,
  isLegacySampleProfile,
  isLegacySampleSlug,
  isLegacySampleRole,
  mergeIntraIntoCV,
  programForState,
  isDefaultProgram,
  removeGuessedLinks,
  removeLegacySampleData,
  renameLegacyMainEducation,
} from "@/lib/intra/cv-from-intra";

export type WizardStep = "LOGIN" | "SETUP" | "QUESTIONNAIRE" | "EDITOR";

export function normalizeLinkedIn(val: string): string {
  if (!val) return "";
  let cleaned = val.trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  while (/^linkedin\.com\/(in\/)?/i.test(cleaned)) {
    cleaned = cleaned.replace(/^linkedin\.com\/(in\/)?/i, "");
  }
  cleaned = cleaned.replace(/\/+$/, "").replace(/\?.*$/, "");
  return cleaned ? `linkedin.com/in/${cleaned}` : "";
}

export function normalizeGitHub(val: string): string {
  if (!val) return "";
  let cleaned = val.trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  while (/^github\.com\//i.test(cleaned)) {
    cleaned = cleaned.replace(/^github\.com\//i, "");
  }
  cleaned = cleaned.replace(/\/+$/, "").replace(/\?.*$/, "");
  return cleaned ? `github.com/${cleaned}` : "";
}

export interface ParsedCVData {
  contact?: {
    fullName?: string;
    email?: string;
    phone?: string;
    linkedin?: string;
    github?: string;
  };
  fullName?: string;
  email?: string;
  phone?: string;
  linkedin?: string;
  github?: string;
  education?: Array<{
    institution: string;
    degree?: string;
    program?: string;
    location?: string;
    startDate?: string;
    endDate?: string;
  }>;
  previousUniversity?: {
    institution: string;
    degree?: string;
    startDate?: string;
    endDate?: string;
  } | null;
  experience?: Array<{
    company: string;
    role: string;
    location?: string;
    startDate?: string;
    endDate?: string;
    descriptionBullets?: string[];
    bulletPoints?: string[];
    rawNotes?: string;
  }>;
  workExperience?: Array<{
    company: string;
    role: string;
    location?: string;
    startDate?: string;
    endDate?: string;
    descriptionBullets?: string[];
    bulletPoints?: string[];
    rawNotes?: string;
  }>;
  skills?: {
    languages?: string[];
    developerTools?: string[];
    technologiesFrameworks?: string[];
    projectManagementTools?: string[];
  };
  customProjects?: Array<{
    name: string;
    slug?: string;
    techStack?: string;
    date?: string;
    summaryBullets?: string[];
    bulletPoints?: string[];
    rawNotes?: string;
  }>;
  extracurriculars?: Array<{
    organization: string;
    role: string;
    startDate?: string;
    endDate?: string;
    bulletPoints?: string[];
  }>;
  coursework?: string[];
}

interface CVStore {
  // Navigation
  currentStep: WizardStep;
  setCurrentStep: (step: WizardStep) => void;

  // Student Profile
  studentProfile: IntraProfile | null;
  setStudentProfile: (profile: IntraProfile | null) => void;

  // Wizard Setup Form State
  targetRole: string;
  setTargetRole: (role: string) => void;

  educationState: EducationState;
  setEducationState: (state: EducationState) => void;

  specializationTrack: string;
  setSpecializationTrack: (track: string) => void;

  showExperience: boolean;
  setShowExperience: (show: boolean) => void;

  styleDensity: "standard" | "compact";
  setStyleDensity: (density: "standard" | "compact") => void;

  showExtracurriculars: boolean;
  setShowExtracurriculars: (show: boolean) => void;

  selectedProjects: { name: string; slug: string; techStack?: string; date?: string; is42Project: boolean }[];
  toggleProjectSelection: (project: { name: string; slug: string; techStack?: string; date?: string; is42Project: boolean }) => void;
  setSelectedProjects: (projects: { name: string; slug: string; techStack?: string; date?: string; is42Project: boolean }[]) => void;
  customProjects: { name: string; slug: string; techStack?: string; date?: string; is42Project: boolean }[];
  addCustomProject: (project: { name: string; slug: string; techStack?: string; date?: string; is42Project: boolean }) => void;
  removeCustomProject: (slug: string) => void;
  restoreCustomProject: (project: { name: string; slug: string; techStack?: string; date?: string; is42Project: boolean }, index: number) => void;

  projectAnswers: Record<string, Record<string, any>>;
  setProjectAnswer: (projectSlug: string, questionId: string, answer: any) => void;

  selectedCampusRoles: string[];
  toggleCampusRole: (role: string) => void;
  campusRoleAnswers: Record<string, Record<string, any>>;
  setCampusRoleAnswer: (role: string, questionId: string, answer: any) => void;

  selectedCoursework: string[];
  toggleCoursework: (item: string) => void;

  // Active CV Data (Live Split-Screen Editor & Shared Store)
  cvData: CVData;
  setCVData: (data: CVData) => void;
  setSectionOrder: (order: SectionId[]) => void;
  moveSection: (fromIndex: number, toIndex: number) => void;
  updateContact: (contact: Partial<CVData["contact"]>) => void;
  updateSkills: (skills: Partial<CVData["skills"]>) => void;
  updateProjectBullet: (projectId: string, bulletIndex: number, text: string) => void;
  addProjectBullet: (projectId: string, text?: string) => void;
  removeProjectBullet: (projectId: string, bulletIndex: number) => void;
  addProjectToCV: (project?: Partial<ProjectItem>) => void;
  removeProjectFromCV: (projectId: string) => void;
  restoreProjectAt: (project: ProjectItem, index: number) => void;
  moveProject: (index: number, direction: "up" | "down") => void;
  reorderProjects: (fromIndex: number, toIndex: number) => void;
  swapProjects: (id1: string, id2: string) => void;

  // Experience Mutations
  addExperienceItem: (item?: Partial<ExperienceItem>) => void;
  updateExperienceItem: (id: string, patch: Partial<ExperienceItem>) => void;
  removeExperienceItem: (id: string) => void;
  restoreExperienceAt: (item: ExperienceItem, index: number) => void;
  moveExperience: (index: number, direction: "up" | "down") => void;
  reorderExperience: (fromIndex: number, toIndex: number) => void;

  // Education Mutations
  addEducationItem: (item?: Partial<EducationItem>) => void;
  updateEducationItem: (id: string, patch: Partial<EducationItem>) => void;
  removeEducationItem: (id: string) => void;

  // Coursework Mutations
  addCourseworkItem: (item?: Partial<CourseworkItem>) => void;
  updateCourseworkItem: (id: string, patch: Partial<CourseworkItem>) => void;
  removeCourseworkItem: (id: string) => void;

  // Extracurricular Mutations
  addExtracurricularItem: (item?: Partial<ExtracurricularItem>) => void;
  updateExtracurricularItem: (id: string, patch: Partial<ExtracurricularItem>) => void;
  removeExtracurricularItem: (id: string) => void;
  addExtracurricularBullet: (id: string, text?: string) => void;
  updateExtracurricularBullet: (id: string, bulletIndex: number, text: string) => void;
  removeExtracurricularBullet: (id: string, bulletIndex: number) => void;

  // Hydration & Fast-Fill from Uploaded Old CV
  hydrateFromParsedCV: (data: ParsedCVData) => void;
  fastFillFromOldCV: (parsed: any) => void;

  // Draft Persistence, Hydration & Reset
  hasHydrated: boolean;
  setHasHydrated: (val: boolean) => void;
  lastSavedTimestamp: number;
  setLastSavedTimestamp: (timestamp: number) => void;
  resetToDefaults: () => void;

  // Set once when an old draft had the built-in sample CV removed from it
  sampleDataRemovedNotice: boolean;
  dismissSampleDataRemovedNotice: () => void;

  // "Help me write" answers, per project / job / activity id
  helperAnswers: Record<string, HelperAnswers>;
  setHelperAnswer: (itemId: string, questionId: string, answer: HelperAnswer) => void;
}

const defaultCVData: CVData = createEmptyCV();

export { CV_STORE_KEY };
export const CV_STORE_VERSION = 2;

export const useCVStore = create<CVStore>()(
  persist(
    (set, get) => ({
      hasHydrated: false,
      setHasHydrated: (hasHydrated) => set({ hasHydrated }),
      lastSavedTimestamp: Date.now(),
      setLastSavedTimestamp: (lastSavedTimestamp) => set({ lastSavedTimestamp }),

      sampleDataRemovedNotice: false,
      dismissSampleDataRemovedNotice: () => set({ sampleDataRemovedNotice: false }),

      helperAnswers: {},
      setHelperAnswer: (itemId, questionId, answer) =>
        set((state) => ({
          lastSavedTimestamp: Date.now(),
          helperAnswers: {
            ...state.helperAnswers,
            [itemId]: { ...(state.helperAnswers[itemId] || {}), [questionId]: answer },
          },
        })),

      currentStep: "LOGIN",
      setCurrentStep: (step) => set({ currentStep: step, lastSavedTimestamp: Date.now() }),

      studentProfile: null,
      setStudentProfile: (profile) =>
        set((state) => {
          if (!profile) return { studentProfile: null, lastSavedTimestamp: Date.now() };

          // Fill only empty fields; never guess links or overwrite what the student typed
          const cvData = mergeIntraIntoCV(state.cvData, profile);
          return {
            studentProfile: profile,
            educationState: cvData.educationState,
            lastSavedTimestamp: Date.now(),
            cvData,
          };
        }),

      targetRole: "",
      setTargetRole: (role) => set({ targetRole: role, lastSavedTimestamp: Date.now() }),

      educationState: "STATE_A_CORE",
      setEducationState: (educationState) =>
        set((state) => ({
          educationState,
          lastSavedTimestamp: Date.now(),
          cvData: {
            ...state.cvData,
            educationState,
            education: state.cvData.education.map((e) =>
              e.id === MAIN_EDUCATION_ID
                ? {
                    ...e,
                    state: educationState,
                    // Keep a program the student wrote; swap only our own default text
                    program: isDefaultProgram(e.program) ? programForState(educationState) : e.program,
                  }
                : e
            ),
          },
        })),

      specializationTrack: "",
      setSpecializationTrack: (specializationTrack) =>
        set((state) => ({
          specializationTrack,
          lastSavedTimestamp: Date.now(),
          cvData: { ...state.cvData, specializationTrack },
        })),

      showExperience: false,
      setShowExperience: (showExperience) =>
        set((state) => ({
          showExperience,
          lastSavedTimestamp: Date.now(),
          cvData: { ...state.cvData, showExperience },
        })),

      styleDensity: "standard",
      setStyleDensity: (styleDensity) =>
        set((state) => ({
          styleDensity,
          lastSavedTimestamp: Date.now(),
          cvData: { ...state.cvData, styleDensity },
        })),

      showExtracurriculars: false,
      setShowExtracurriculars: (showExtracurriculars) =>
        set((state) => ({
          showExtracurriculars,
          lastSavedTimestamp: Date.now(),
          cvData: { ...state.cvData, showExtracurriculars },
        })),

      selectedProjects: [],
      toggleProjectSelection: (project) =>
        set((state) => {
          const exists = state.selectedProjects.some((p) => p.slug === project.slug);
          return {
            lastSavedTimestamp: Date.now(),
            selectedProjects: exists
              ? state.selectedProjects.filter((p) => p.slug !== project.slug)
              : [...state.selectedProjects, project],
          };
        }),
      setSelectedProjects: (selectedProjects) => set({ selectedProjects, lastSavedTimestamp: Date.now() }),

      customProjects: [],
      addCustomProject: (project) =>
        set((state) => {
          const exists = state.selectedProjects.some((p) => p.slug === project.slug);
          const nextCustom = [...state.customProjects.filter((p) => p.slug !== project.slug), project];
          const nextSelected = exists
            ? state.selectedProjects.map((p) => (p.slug === project.slug ? project : p))
            : [...state.selectedProjects, project];
          return {
            customProjects: nextCustom,
            selectedProjects: nextSelected,
            lastSavedTimestamp: Date.now(),
          };
        }),
      removeCustomProject: (slug) =>
        set((state) => ({
          customProjects: state.customProjects.filter((p) => p.slug !== slug),
          selectedProjects: state.selectedProjects.filter((p) => p.slug !== slug),
          lastSavedTimestamp: Date.now(),
        })),
      restoreCustomProject: (project, index) =>
        set((state) => {
          const list = [...state.customProjects.filter((p) => p.slug !== project.slug)];
          const clampedIndex = Math.min(Math.max(0, index), list.length);
          list.splice(clampedIndex, 0, project);
          const nextSelected = state.selectedProjects.some((p) => p.slug === project.slug)
            ? state.selectedProjects
            : [...state.selectedProjects, project];
          return {
            customProjects: list,
            selectedProjects: nextSelected,
            lastSavedTimestamp: Date.now(),
          };
        }),

      projectAnswers: {},
      setProjectAnswer: (projectSlug, questionId, answer) =>
        set((state) => ({
          lastSavedTimestamp: Date.now(),
          projectAnswers: {
            ...state.projectAnswers,
            [projectSlug]: {
              ...(state.projectAnswers[projectSlug] || {}),
              [questionId]: answer,
            },
          },
        })),

      selectedCampusRoles: [],
      toggleCampusRole: (role) =>
        set((state) => {
          const exists = state.selectedCampusRoles.includes(role);
          return {
            lastSavedTimestamp: Date.now(),
            selectedCampusRoles: exists
              ? state.selectedCampusRoles.filter((r) => r !== role)
              : [...state.selectedCampusRoles, role],
          };
        }),
      campusRoleAnswers: {},
      setCampusRoleAnswer: (role, questionId, answer) =>
        set((state) => ({
          lastSavedTimestamp: Date.now(),
          campusRoleAnswers: {
            ...state.campusRoleAnswers,
            [role]: {
              ...(state.campusRoleAnswers[role] || {}),
              [questionId]: answer,
            },
          },
        })),

      selectedCoursework: [],
      toggleCoursework: (item) =>
        set((state) => {
          const exists = state.selectedCoursework.includes(item);
          return {
            lastSavedTimestamp: Date.now(),
            selectedCoursework: exists
              ? state.selectedCoursework.filter((c) => c !== item)
              : [...state.selectedCoursework, item],
          };
        }),

      // Active CV Data
      cvData: defaultCVData,
      setCVData: (cvData) =>
        set({
          cvData: {
            ...cvData,
            sectionOrder:
              cvData.sectionOrder && cvData.sectionOrder.length > 0
                ? cvData.sectionOrder
                : [...DEFAULT_SECTION_ORDER],
          },
          lastSavedTimestamp: Date.now(),
        }),

      setSectionOrder: (order) =>
        set((state) => ({
          lastSavedTimestamp: Date.now(),
          cvData: {
            ...state.cvData,
            sectionOrder: order,
          },
        })),

      moveSection: (fromIndex, toIndex) =>
        set((state) => {
          const currentOrder =
            state.cvData.sectionOrder && state.cvData.sectionOrder.length > 0
              ? [...state.cvData.sectionOrder]
              : [...DEFAULT_SECTION_ORDER];
          if (
            fromIndex < 0 ||
            fromIndex >= currentOrder.length ||
            toIndex < 0 ||
            toIndex >= currentOrder.length ||
            fromIndex === toIndex
          ) {
            return state;
          }
          const [moved] = currentOrder.splice(fromIndex, 1);
          currentOrder.splice(toIndex, 0, moved);
          return {
            lastSavedTimestamp: Date.now(),
            cvData: {
              ...state.cvData,
              sectionOrder: currentOrder,
            },
          };
        }),

      updateContact: (contactPatch) =>
        set((state) => ({
          lastSavedTimestamp: Date.now(),
          cvData: {
            ...state.cvData,
            contact: { ...state.cvData.contact, ...contactPatch },
          },
        })),

      updateSkills: (skillsPatch) =>
        set((state) => ({
          lastSavedTimestamp: Date.now(),
          cvData: {
            ...state.cvData,
            skills: { ...state.cvData.skills, ...skillsPatch },
          },
        })),

      updateProjectBullet: (projectId, bulletIndex, text) =>
        set((state) => ({
          lastSavedTimestamp: Date.now(),
          cvData: {
            ...state.cvData,
            projects: state.cvData.projects.map((p) => {
              if (p.id === projectId) {
                const nextBullets = [...p.bulletPoints];
                nextBullets[bulletIndex] = text;
                return { ...p, bulletPoints: nextBullets };
              }
              return p;
            }),
          },
        })),

      addProjectBullet: (projectId, text = "") =>
        set((state) => ({
          lastSavedTimestamp: Date.now(),
          cvData: {
            ...state.cvData,
            projects: state.cvData.projects.map((p) => {
              if (p.id === projectId) {
                return { ...p, bulletPoints: [...p.bulletPoints, text] };
              }
              return p;
            }),
          },
        })),

      removeProjectBullet: (projectId, bulletIndex) =>
        set((state) => ({
          lastSavedTimestamp: Date.now(),
          cvData: {
            ...state.cvData,
            projects: state.cvData.projects.map((p) => {
              if (p.id === projectId) {
                return {
                  ...p,
                  bulletPoints: p.bulletPoints.filter((_, idx) => idx !== bulletIndex),
                };
              }
              return p;
            }),
          },
        })),

      addProjectToCV: (proj) =>
        set((state) => {
          const newProj: ProjectItem = {
            id: `proj-${Date.now()}`,
            name: proj?.name ?? "",
            slug: proj?.slug || `project-${Date.now()}`,
            is42Project: proj?.is42Project ?? false,
            techStack: proj?.techStack ?? "",
            date: proj?.date ?? "",
            bulletPoints: proj?.bulletPoints ?? [],
          };
          return {
            lastSavedTimestamp: Date.now(),
            cvData: {
              ...state.cvData,
              projects: [...state.cvData.projects, newProj],
            },
          };
        }),

      removeProjectFromCV: (projectId) =>
        set((state) => ({
          lastSavedTimestamp: Date.now(),
          cvData: {
            ...state.cvData,
            projects: state.cvData.projects.filter((p) => p.id !== projectId),
          },
        })),

      restoreProjectAt: (project, index) =>
        set((state) => {
          // A 42 project picked again while its Undo was still open would be a duplicate:
          // the restored one (with its lines) replaces it
          const sameSlug = (p: ProjectItem) => Boolean(project.slug) && p.slug === project.slug;
          const projects = state.cvData.projects.filter((p) => p.id !== project.id && !sameSlug(p));
          const clampedIndex = Math.min(Math.max(0, index), projects.length);
          projects.splice(clampedIndex, 0, project);
          return {
            lastSavedTimestamp: Date.now(),
            cvData: { ...state.cvData, projects },
          };
        }),

      moveProject: (index, direction) =>
        set((state) => {
          const projects = [...state.cvData.projects];
          const targetIndex = direction === "up" ? index - 1 : index + 1;
          if (targetIndex < 0 || targetIndex >= projects.length) return state;
          const temp = projects[index];
          projects[index] = projects[targetIndex];
          projects[targetIndex] = temp;
          return {
            lastSavedTimestamp: Date.now(),
            cvData: { ...state.cvData, projects },
          };
        }),

      reorderProjects: (fromIndex, toIndex) =>
        set((state) => {
          const projects = [...state.cvData.projects];
          if (
            fromIndex < 0 ||
            fromIndex >= projects.length ||
            toIndex < 0 ||
            toIndex >= projects.length ||
            fromIndex === toIndex
          ) {
            return state;
          }
          const [moved] = projects.splice(fromIndex, 1);
          projects.splice(toIndex, 0, moved);
          return {
            lastSavedTimestamp: Date.now(),
            cvData: { ...state.cvData, projects },
          };
        }),

      swapProjects: (id1, id2) =>
        set((state) => {
          const idx1 = state.cvData.projects.findIndex((p) => p.id === id1);
          const idx2 = state.cvData.projects.findIndex((p) => p.id === id2);
          if (idx1 === -1 || idx2 === -1 || idx1 === idx2) return state;
          const projects = [...state.cvData.projects];
          const temp = projects[idx1];
          projects[idx1] = projects[idx2];
          projects[idx2] = temp;
          return {
            lastSavedTimestamp: Date.now(),
            cvData: { ...state.cvData, projects },
          };
        }),

      // Experience Mutations
      addExperienceItem: (item) =>
        set((state) => {
          const newItem: ExperienceItem = {
            id: `exp-${Date.now()}`,
            company: item?.company || "",
            role: item?.role || "",
            location: item?.location || "",
            startDate: item?.startDate || "",
            endDate: item?.endDate ?? (item?.isCurrent === false ? "" : "Present"),
            isCurrent: item?.isCurrent ?? true,
            bulletPoints: item?.bulletPoints ?? [],
            rawNotes: item?.rawNotes ?? "",
          };
          return {
            showExperience: true,
            lastSavedTimestamp: Date.now(),
            cvData: {
              ...state.cvData,
              showExperience: true,
              experience: [...state.cvData.experience, newItem],
            },
          };
        }),

      updateExperienceItem: (id, patch) =>
        set((state) => ({
          lastSavedTimestamp: Date.now(),
          cvData: {
            ...state.cvData,
            experience: state.cvData.experience.map((exp) =>
              exp.id === id ? { ...exp, ...patch } : exp
            ),
          },
        })),

      removeExperienceItem: (id) =>
        set((state) => {
          const updated = state.cvData.experience.filter((exp) => exp.id !== id);
          return {
            showExperience: updated.length > 0,
            lastSavedTimestamp: Date.now(),
            cvData: {
              ...state.cvData,
              showExperience: updated.length > 0,
              experience: updated,
            },
          };
        }),

      restoreExperienceAt: (item, index) =>
        set((state) => {
          const experience = [...state.cvData.experience.filter((exp) => exp.id !== item.id)];
          const clampedIndex = Math.min(Math.max(0, index), experience.length);
          experience.splice(clampedIndex, 0, item);
          return {
            showExperience: true,
            lastSavedTimestamp: Date.now(),
            cvData: {
              ...state.cvData,
              showExperience: true,
              experience,
            },
          };
        }),

      moveExperience: (index, direction) =>
        set((state) => {
          const experience = [...state.cvData.experience];
          const targetIndex = direction === "up" ? index - 1 : index + 1;
          if (targetIndex < 0 || targetIndex >= experience.length) return state;
          const temp = experience[index];
          experience[index] = experience[targetIndex];
          experience[targetIndex] = temp;
          return {
            lastSavedTimestamp: Date.now(),
            cvData: { ...state.cvData, experience },
          };
        }),

      reorderExperience: (fromIndex, toIndex) =>
        set((state) => {
          const experience = [...state.cvData.experience];
          if (
            fromIndex < 0 ||
            fromIndex >= experience.length ||
            toIndex < 0 ||
            toIndex >= experience.length ||
            fromIndex === toIndex
          ) {
            return state;
          }
          const [moved] = experience.splice(fromIndex, 1);
          experience.splice(toIndex, 0, moved);
          return {
            lastSavedTimestamp: Date.now(),
            cvData: { ...state.cvData, experience },
          };
        }),

      // Education Mutations
      addEducationItem: (item) =>
        set((state) => {
          const newEdu: EducationItem = {
            id: `edu-${Date.now()}`,
            institution: item?.institution ?? "",
            program: item?.program ?? "",
            degree: item?.degree ?? "",
            startDate: item?.startDate ?? "",
            endDate: item?.endDate ?? "",
            isCurrent: item?.isCurrent ?? false,
            state: "STATE_A_CORE",
          };
          return {
            lastSavedTimestamp: Date.now(),
            cvData: {
              ...state.cvData,
              education: [...state.cvData.education, newEdu],
            },
          };
        }),

      updateEducationItem: (id, patch) =>
        set((state) => ({
          lastSavedTimestamp: Date.now(),
          cvData: {
            ...state.cvData,
            education: state.cvData.education.map((edu) =>
              edu.id === id ? { ...edu, ...patch } : edu
            ),
          },
        })),

      removeEducationItem: (id) =>
        set((state) => ({
          lastSavedTimestamp: Date.now(),
          cvData: {
            ...state.cvData,
            education: state.cvData.education.filter((edu) => edu.id !== id),
          },
        })),

      // Coursework Mutations
      addCourseworkItem: (item) =>
        set((state) => {
          const newItem: CourseworkItem = {
            id: `cw-${Date.now()}`,
            title: item?.title ?? "",
            date: item?.date ?? "",
            institution: item?.institution ?? "",
          };
          return {
            lastSavedTimestamp: Date.now(),
            cvData: {
              ...state.cvData,
              coursework: [...(state.cvData.coursework || []), newItem],
            },
          };
        }),

      updateCourseworkItem: (id, patch) =>
        set((state) => ({
          lastSavedTimestamp: Date.now(),
          cvData: {
            ...state.cvData,
            coursework: (state.cvData.coursework || []).map((cw) =>
              cw.id === id ? { ...cw, ...patch } : cw
            ),
          },
        })),

      removeCourseworkItem: (id) =>
        set((state) => ({
          lastSavedTimestamp: Date.now(),
          cvData: {
            ...state.cvData,
            coursework: (state.cvData.coursework || []).filter((cw) => cw.id !== id),
          },
        })),

      // Extracurricular Mutations
      addExtracurricularItem: (item) =>
        set((state) => {
          const newItem: ExtracurricularItem = {
            id: `ec-${Date.now()}`,
            organization: item?.organization ?? "",
            role: item?.role ?? "",
            startDate: item?.startDate ?? "",
            endDate: item?.endDate ?? (item?.isCurrent === false ? "" : "Present"),
            isCurrent: item?.isCurrent ?? true,
            bulletPoints: item?.bulletPoints ?? [],
          };
          return {
            showExtracurriculars: true,
            lastSavedTimestamp: Date.now(),
            cvData: {
              ...state.cvData,
              showExtracurriculars: true,
              extracurriculars: [...(state.cvData.extracurriculars || []), newItem],
            },
          };
        }),

      updateExtracurricularItem: (id, patch) =>
        set((state) => ({
          lastSavedTimestamp: Date.now(),
          cvData: {
            ...state.cvData,
            extracurriculars: (state.cvData.extracurriculars || []).map((ec) =>
              ec.id === id ? { ...ec, ...patch } : ec
            ),
          },
        })),

      removeExtracurricularItem: (id) =>
        set((state) => ({
          lastSavedTimestamp: Date.now(),
          cvData: {
            ...state.cvData,
            extracurriculars: (state.cvData.extracurriculars || []).filter((ec) => ec.id !== id),
          },
        })),

      addExtracurricularBullet: (id, text = "") =>
        set((state) => ({
          lastSavedTimestamp: Date.now(),
          cvData: {
            ...state.cvData,
            extracurriculars: (state.cvData.extracurriculars || []).map((ec) =>
              ec.id === id ? { ...ec, bulletPoints: [...ec.bulletPoints, text] } : ec
            ),
          },
        })),

      updateExtracurricularBullet: (id, bulletIndex, text) =>
        set((state) => ({
          lastSavedTimestamp: Date.now(),
          cvData: {
            ...state.cvData,
            extracurriculars: (state.cvData.extracurriculars || []).map((ec) => {
              if (ec.id !== id) return ec;
              const bullets = [...ec.bulletPoints];
              bullets[bulletIndex] = text;
              return { ...ec, bulletPoints: bullets };
            }),
          },
        })),

      removeExtracurricularBullet: (id, bulletIndex) =>
        set((state) => ({
          lastSavedTimestamp: Date.now(),
          cvData: {
            ...state.cvData,
            extracurriculars: (state.cvData.extracurriculars || []).map((ec) => {
              if (ec.id !== id) return ec;
              return {
                ...ec,
                bulletPoints: ec.bulletPoints.filter((_, i) => i !== bulletIndex),
              };
            }),
          },
        })),

      // Hydration & Fast-Fill from Old CV Upload
      hydrateFromParsedCV: (data: ParsedCVData) =>
        set((state) => {
          // 1. Contact details with sanitization
          const contactPatch: Partial<CVData["contact"]> = {};
          const name = data.contact?.fullName || data.fullName;
          const mail = data.contact?.email || data.email;
          const phone = data.contact?.phone || data.phone;
          const rawLi = data.contact?.linkedin || data.linkedin;
          const rawGh = data.contact?.github || data.github;

          if (name && name.trim()) contactPatch.fullName = name.trim();
          if (mail && mail.trim()) contactPatch.email = mail.trim();
          if (phone && phone.trim()) contactPatch.phoneNumber = phone.trim();
          if (rawLi && rawLi.trim()) contactPatch.linkedinUrl = normalizeLinkedIn(rawLi);
          if (rawGh && rawGh.trim()) contactPatch.githubUrl = normalizeGitHub(rawGh);

          // 2. Education: preserve primary entries and hydrate all prior university entries
          let updatedEducation = [...state.cvData.education];
          const primaryEntries = updatedEducation.filter((e) => e.id === MAIN_EDUCATION_ID);

          const incomingEduList =
            Array.isArray(data.education) && data.education.length > 0
              ? data.education
              : data.previousUniversity && data.previousUniversity.institution
              ? [data.previousUniversity]
              : [];

          const non42Entries: EducationItem[] = incomingEduList
            .filter((edu: any) => edu.institution && !/^(42|1337|19|codam|hive)\b/i.test(edu.institution.trim()))
            .map((edu: any, idx: number) => ({
              id: `edu-univ-${idx}-${Date.now()}`,
              institution: edu.institution,
              program: edu.degree || edu.program || "",
              degree: edu.degree || edu.program || "",
              startDate: edu.startDate || "",
              endDate: edu.endDate || "",
              isCurrent: edu.endDate?.toLowerCase().includes("present") ?? false,
              state: "STATE_A_CORE",
            }));

          if (non42Entries.length > 0) {
            updatedEducation = [...primaryEntries, ...non42Entries];
          }

          // 3. Work Experience: populate jobs and set showExperience = true
          const incomingExp =
            Array.isArray(data.experience) && data.experience.length > 0
              ? data.experience
              : Array.isArray(data.workExperience) && data.workExperience.length > 0
              ? data.workExperience
              : [];

          let hasExp = state.showExperience;
          let updatedExperience = [...state.cvData.experience];

          if (incomingExp.length > 0) {
            hasExp = true;
            updatedExperience = incomingExp.map((exp: any, i: number) => {
              const bullets =
                Array.isArray(exp.descriptionBullets) && exp.descriptionBullets.length > 0
                  ? exp.descriptionBullets
                  : Array.isArray(exp.bulletPoints) && exp.bulletPoints.length > 0
                  ? exp.bulletPoints
                  : exp.rawNotes
                  ? [exp.rawNotes]
                  : [];

              return {
                id: `exp-parsed-${i}-${Date.now()}`,
                company: exp.company || "",
                role: exp.role || "",
                location: exp.location || "",
                startDate: exp.startDate || "",
                endDate: exp.endDate || "",
                isCurrent: exp.endDate?.toLowerCase().includes("present") ?? false,
                bulletPoints: bullets,
                rawNotes: exp.rawNotes || bullets.join(". "),
              };
            });
          }

          // 4. Skills: merge and deduplicate into the template's 4 categories
          const updatedSkills = { ...state.cvData.skills };
          if (data.skills) {
            const mergeUnique = (existing: string[] = [], incoming: string[] = []) => {
              const seen = new Set<string>();
              const result: string[] = [];
              for (const item of [...existing, ...incoming]) {
                if (!item || !item.trim()) continue;
                const key = item.trim().toLowerCase();
                if (!seen.has(key)) {
                  seen.add(key);
                  result.push(item.trim());
                }
              }
              return result;
            };

            updatedSkills.languages = mergeUnique(state.cvData.skills.languages, data.skills.languages);
            updatedSkills.developerTools = mergeUnique(state.cvData.skills.developerTools, data.skills.developerTools);
            updatedSkills.technologiesFrameworks = mergeUnique(state.cvData.skills.technologiesFrameworks, data.skills.technologiesFrameworks);
            updatedSkills.projectManagementTools = mergeUnique(state.cvData.skills.projectManagementTools, data.skills.projectManagementTools);
          }

          // 5. Custom / Additional Personal Projects
          let updatedCustomProjects = [...state.customProjects];
          let updatedSelectedProjects = [...state.selectedProjects];
          const updatedProjectAnswers = { ...state.projectAnswers };

          if (Array.isArray(data.customProjects) && data.customProjects.length > 0) {
            for (const proj of data.customProjects) {
              if (!proj.name || !proj.name.trim()) continue;
              const slug = (proj.slug || proj.name)
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-|-$/g, "");

              const bullets =
                Array.isArray(proj.summaryBullets) && proj.summaryBullets.length > 0
                  ? proj.summaryBullets
                  : Array.isArray(proj.bulletPoints) && proj.bulletPoints.length > 0
                  ? proj.bulletPoints
                  : [];

              const newCustom = {
                name: proj.name.trim(),
                slug,
                techStack: proj.techStack?.trim() || "",
                date: proj.date?.trim() || "",
                is42Project: false,
              };

              updatedCustomProjects = [
                ...updatedCustomProjects.filter((p) => p.slug !== slug),
                newCustom,
              ];

              const existsInSelected = updatedSelectedProjects.some((sp) => sp.slug === slug);
              if (!existsInSelected) {
                updatedSelectedProjects.push(newCustom);
              }

              const note = proj.rawNotes || bullets.join(". ");

              updatedProjectAnswers[slug] = {
                ...(updatedProjectAnswers[slug] || {}),
                "personal-notes": note,
              };
            }
          }

          // 6. Extracurriculars & Coursework
          let updatedExtracurriculars = [...state.cvData.extracurriculars];
          if (Array.isArray(data.extracurriculars) && data.extracurriculars.length > 0) {
            const incomingExtra = data.extracurriculars.map((ex: any, idx: number) => ({
              id: `extra-parsed-${idx}-${Date.now()}`,
              organization: ex.organization || "",
              role: ex.role || "",
              startDate: ex.startDate || "",
              endDate: ex.endDate || "",
              isCurrent: ex.endDate?.toLowerCase().includes("present") ?? false,
              bulletPoints: ex.bulletPoints || [],
            }));
            updatedExtracurriculars = [...updatedExtracurriculars, ...incomingExtra];
          }

          let updatedCoursework = [...state.selectedCoursework];
          if (Array.isArray(data.coursework) && data.coursework.length > 0) {
            updatedCoursework = Array.from(new Set([...updatedCoursework, ...data.coursework]));
          }

          return {
            showExperience: hasExp,
            selectedProjects: updatedSelectedProjects,
            customProjects: updatedCustomProjects,
            projectAnswers: updatedProjectAnswers,
            selectedCoursework: updatedCoursework,
            lastSavedTimestamp: Date.now(),
            cvData: {
              ...state.cvData,
              showExperience: hasExp,
              contact: { ...state.cvData.contact, ...contactPatch },
              education: updatedEducation,
              experience: updatedExperience,
              skills: updatedSkills,
              extracurriculars: updatedExtracurriculars,
              coursework: updatedCoursework.map((cw, i) => ({
                id: `cw-${i}-${Date.now()}`,
                title: cw,
                date: "",
              })),
            },
          };
        }),

      fastFillFromOldCV: (parsed) => {
        useCVStore.getState().hydrateFromParsedCV(parsed);
      },

      resetToDefaults: () => {
        const profile = get().studentProfile;
        const initialCV = profile ? createInitialCVFromIntra(profile) : createEmptyCV();
        set({
          currentStep: profile ? "SETUP" : "LOGIN",
          targetRole: "",
          educationState: profile ? educationStateForProfile(profile) : "STATE_A_CORE",
          specializationTrack: "",
          showExperience: false,
          styleDensity: "standard",
          showExtracurriculars: false,
          selectedProjects: [],
          customProjects: [],
          projectAnswers: {},
          selectedCampusRoles: [],
          campusRoleAnswers: {},
          selectedCoursework: [],
          helperAnswers: {},
          cvData: initialCV,
          lastSavedTimestamp: Date.now(),
        });
        if (typeof window !== "undefined") {
          try {
            localStorage.removeItem(CV_STORE_KEY);
            
          } catch (e) {
            console.warn("Could not clear localStorage draft:", e);
          }
        }
      },
    }),
    {
      name: CV_STORE_KEY,
      version: CV_STORE_VERSION,
      // v0/v1 drafts were seeded with a real person's sample CV. Remove it once.
      migrate: (persisted: any, version) => {
        if (!persisted || version >= 2) return persisted;
        const next = { ...persisted };
        // Old API keys from the removed "bring your own key" feature
        delete next.userGeminiKey;
        delete next.userGroqKey;
        let removed = false;
        if (next.cvData) {
          const result = removeLegacySampleData(renameLegacyMainEducation(next.cvData));
          next.cvData = result.cv;
          removed = result.changed;
          // Keep the top-level switches in step with the cleaned CV
          next.showExperience = Boolean(result.cv.showExperience);
          next.showExtracurriculars = Boolean(result.cv.showExtracurriculars);
        }
        if (isLegacySampleProfile(next.studentProfile)) {
          next.studentProfile = null;
          removed = true;
        }
        if (next.cvData && next.studentProfile) {
          next.cvData = removeGuessedLinks(next.cvData, next.studentProfile.login);
          // Refill school, level and dates from the student's own 42 data
          if (removed) {
            next.cvData = mergeIntraIntoCV(next.cvData, next.studentProfile);
            next.educationState = next.cvData.educationState;
          }
        }
        // The old sample also pre-selected its own projects
        if (removed) next.selectedProjects = [];
        if (Array.isArray(next.selectedProjects)) {
          next.selectedProjects = next.selectedProjects.filter((p: any) => !isLegacySampleSlug(p?.slug));
        }
        if (Array.isArray(next.selectedCampusRoles)) {
          next.selectedCampusRoles = next.selectedCampusRoles.filter((r: string) => !isLegacySampleRole(r));
        }
        if (next.specializationTrack === "Advanced Software Architecture") next.specializationTrack = "";
        next.sampleDataRemovedNotice = removed;
        return next;
      },
      storage: createJSONStorage(() => ({
        getItem: (name: string) => {
          if (typeof window === "undefined") return null;
          try {
            return window.localStorage.getItem(name) ;
          } catch {
            return null;
          }
        },
        setItem: (name: string, value: string) => {
          if (typeof window === "undefined") return;
          try {
            window.localStorage.setItem(name, value);
          } catch {}
        },
        removeItem: (name: string) => {
          if (typeof window === "undefined") return;
          try {
            window.localStorage.removeItem(name);
          } catch {}
        },
      })),
      partialize: (state) => ({
        currentStep: state.currentStep,
        studentProfile: state.studentProfile,
        targetRole: state.targetRole,
        educationState: state.educationState,
        specializationTrack: state.specializationTrack,
        showExperience: state.showExperience,
        styleDensity: state.styleDensity,
        showExtracurriculars: state.showExtracurriculars,
        selectedProjects: state.selectedProjects,
        customProjects: state.customProjects,
        projectAnswers: state.projectAnswers,
        selectedCampusRoles: state.selectedCampusRoles,
        campusRoleAnswers: state.campusRoleAnswers,
        selectedCoursework: state.selectedCoursework,
        cvData: state.cvData,
        lastSavedTimestamp: state.lastSavedTimestamp,
        sampleDataRemovedNotice: state.sampleDataRemovedNotice,
        helperAnswers: state.helperAnswers,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          if (!state.cvData?.sectionOrder || state.cvData.sectionOrder.length === 0) {
            state.cvData = {
              ...state.cvData,
              sectionOrder: [...DEFAULT_SECTION_ORDER],
            };
          }
          state.setHasHydrated(true);
        }
      },
    }
  )
);

export function useHasHydrated() {
  const [hasHydrated, setHasHydrated] = useState(false);
  useEffect(() => {
    setHasHydrated(true);
  }, []);
  return hasHydrated;
}
