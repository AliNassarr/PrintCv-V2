import { create } from "zustand";
import { useState, useEffect } from "react";
import type { HelperAnswer, HelperAnswers } from "@/lib/bullet-helper";
import { CV_STORE_KEY, CV_STORE_VERSION } from "@/lib/cv-constants";
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
  SkillsData,
} from "@/types/resume";
import { removeEmDashes, parseSkillsCommaList } from "@/lib/sanitizer";
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
import { DraftRecord, DraftSnapshot, DraftOwner, ownerMatches, StyleDensity, OwnerBoundPendingWork } from "@/lib/draft-types";
import type { DraftSessionController } from "@/lib/draft-session";

export type { StyleDensity };
export { parseSkillsCommaList, CV_STORE_KEY, CV_STORE_VERSION };

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

export type SaveStatus = "saved" | "saving" | "conflict" | "error" | "memory";

export interface CVStoreState {
  currentStep: WizardStep;
  setCurrentStep: (step: WizardStep) => void;

  studentProfile: IntraProfile | null;
  setStudentProfile: (profile: IntraProfile | null) => void;

  targetRole: string;
  setTargetRole: (role: string) => void;

  educationState: EducationState;
  setEducationState: (state: EducationState) => void;

  specializationTrack: string;
  setSpecializationTrack: (track: string) => void;

  showExperience: boolean;
  setShowExperience: (show: boolean) => void;

  styleDensity: StyleDensity;
  setStyleDensity: (density: StyleDensity) => void;

  showExtracurriculars: boolean;
  setShowExtracurriculars: (show: boolean) => void;

  selectedProjects: Array<{ name: string; slug: string; techStack?: string; date?: string; is42Project: boolean }>;
  toggleProjectSelection: (project: { name: string; slug: string; techStack?: string; date?: string; is42Project: boolean }) => void;
  setSelectedProjects: (projects: Array<{ name: string; slug: string; techStack?: string; date?: string; is42Project: boolean }>) => void;
  addProjectToCV: (project?: Partial<ProjectItem>) => void;
  removeProjectFromCV: (projectIdOrSlug: string) => void;
  moveProject: (index: number, direction: "up" | "down") => void;
  reorderProjects: (fromIndex: number, toIndex: number) => void;
  swapProjects: (id1: string, id2: string) => void;
  restoreProjectAt: (item: ProjectItem, index: number) => void;

  customProjects: Array<{ name: string; slug: string; techStack?: string; date?: string; is42Project: boolean }>;
  addCustomProject: (project: { name: string; slug?: string; techStack?: string; date?: string; is42Project?: boolean }) => void;
  removeCustomProject: (slug: string) => void;
  restoreCustomProject?: (project: { name: string; slug: string; techStack?: string; date?: string; is42Project: boolean }, index: number) => void;

  projectAnswers: Record<string, Record<string, any>>;
  setProjectAnswer: (projectSlug: string, questionId: string, answer: any) => void;

  selectedCampusRoles: string[];
  toggleCampusRole: (role: string) => void;

  campusRoleAnswers: Record<string, Record<string, any>>;
  setCampusRoleAnswer: (role: string, questionId: string, answer: any) => void;

  selectedCoursework: string[];
  toggleCoursework: (subject: string) => void;

  helperAnswers: Record<string, HelperAnswers>;
  setHelperAnswer: (itemId: string, questionId: string, answer: HelperAnswer) => void;

  lastDeletedBullet: { projectId: string; index: number; text: string } | null;

  cvData: CVData;
  setCVData: (data: CVData) => void;
  setSectionOrder: (order: SectionId[]) => void;
  moveSection: (fromIndex: number, toIndex: number) => void;
  updateSectionOrder: (fromIndex: number, toIndex: number) => void;

  updateContact: (contact: Partial<CVData["contact"]>) => void;
  updateTargetRole: (role: string) => void;
  updateSkills: (skills: Partial<SkillsData>) => void;
  updateSkillCategory: (category: keyof SkillsData, rawOrList: string | string[]) => void;

  updateProject: (id: string, patch: Partial<ProjectItem>) => void;
  updateProjectBullet: (projectId: string, bulletIndex: number, text: string) => void;
  addProjectBullet: (projectId: string, text?: string) => void;
  removeProjectBullet: (projectId: string, bulletIndex: number) => void;
  restoreProjectBullet: (projectId: string, index: number, text: string) => void;
  undoLastBulletDeletion: () => boolean;

  addExperienceItem: (item?: Partial<ExperienceItem>) => void;
  updateExperienceItem: (id: string, patch: Partial<ExperienceItem>) => void;
  removeExperienceItem: (id: string) => void;
  restoreExperienceAt: (item: ExperienceItem, index: number) => void;
  moveExperience: (index: number, direction: "up" | "down") => void;
  reorderExperience: (fromIndex: number, toIndex: number) => void;

  addEducationItem: (item?: Partial<EducationItem>) => void;
  updateEducationItem: (id: string, patch: Partial<EducationItem>) => void;
  removeEducationItem: (id: string) => void;

  addCourseworkItem: (item?: Partial<CourseworkItem>) => void;
  updateCourseworkItem: (id: string, patch: Partial<CourseworkItem>) => void;
  removeCourseworkItem: (id: string) => void;

  addExtracurricularItem: (item?: Partial<ExtracurricularItem>) => void;
  updateExtracurricularItem: (id: string, patch: Partial<ExtracurricularItem>) => void;
  removeExtracurricularItem: (id: string) => void;
  addExtracurricularBullet: (id: string, text?: string) => void;
  updateExtracurricularBullet: (id: string, bulletIndex: number, text: string) => void;
  removeExtracurricularBullet: (id: string, bulletIndex: number) => void;

  hydrateFromParsedCV: (data: ParsedCVData) => void;
  fastFillFromOldCV: (data: ParsedCVData) => void;

  lastSavedTimestamp: number;
  sampleDataRemovedNotice: boolean;
  dismissSampleDataRemovedNotice: () => void;

  saveStatus: SaveStatus;
  setSaveStatus: (status: SaveStatus) => void;

  hasHydrated: boolean;
  setHasHydrated: (hydrated: boolean) => void;

  hydrateFromDraftRecord: (record: DraftRecord) => void;
  extractSnapshot: () => DraftSnapshot;
  resetToDefaults: () => void;
  cancelPendingAutosave: () => void;
}

let mutationCounter = 0;
export function bumpTimestamp(): number {
  const now = Date.now();
  mutationCounter = Math.max(now, mutationCounter + 1);
  return mutationCounter;
}

export function generateUniqueId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// Synchronous reducer evaluation is transient; only the coordinator retains working data.
let actionEvaluation: { state: CVStoreState } | null = null;
export const useCVStore = create<CVStoreState>((rawSet, rawGet) => {
  const get = () => actionEvaluation?.state ?? rawGet();
  const set: typeof rawSet = (update, replace) => {
    if (actionEvaluation) {
      const patch = typeof update === "function" ? update(actionEvaluation.state) : update;
      actionEvaluation.state = replace ? patch as CVStoreState : { ...actionEvaluation.state, ...patch };
    } else rawSet(update, replace);
  };
  return ({
  currentStep: "LOGIN",
  setCurrentStep: (step) => set({ currentStep: step, lastSavedTimestamp: bumpTimestamp() }),

  studentProfile: null,
  setStudentProfile: (profile) =>
    set((state) => {
      if (!profile) {
        return { studentProfile: null, lastSavedTimestamp: bumpTimestamp() };
      }
      const initialCV = mergeIntraIntoCV(state.cvData, profile);
      const nextEducationState = educationStateForProfile(profile);
      return {
        studentProfile: profile,
        educationState: nextEducationState,
        cvData: initialCV,
        lastSavedTimestamp: bumpTimestamp(),
      };
    }),

  targetRole: "",
  setTargetRole: (role) => set((state) => ({ targetRole: role, cvData: { ...state.cvData, targetRole: role }, lastSavedTimestamp: bumpTimestamp() })),

  educationState: "STATE_A_CORE",
  setEducationState: (eduState) =>
    set((state) => {
      const nextCV = { ...state.cvData };
      const mainEdu = nextCV.education.find((e) => e.id === MAIN_EDUCATION_ID);
      if (mainEdu) {
        if (isDefaultProgram(mainEdu.program || mainEdu.degree)) {
          const nextProgram = programForState(eduState);
          mainEdu.program = nextProgram;
          mainEdu.degree = nextProgram;
        }
        mainEdu.state = eduState;
      }
      return {
        educationState: eduState,
        cvData: nextCV,
        lastSavedTimestamp: bumpTimestamp(),
      };
    }),

  specializationTrack: "",
  setSpecializationTrack: (track) => set({ specializationTrack: track, lastSavedTimestamp: bumpTimestamp() }),

  showExperience: false,
  setShowExperience: (show) =>
    set((state) => ({
      showExperience: show,
      cvData: { ...state.cvData, showExperience: show },
      lastSavedTimestamp: bumpTimestamp(),
    })),

  styleDensity: "standard",
  setStyleDensity: (density) => set({ styleDensity: density, lastSavedTimestamp: bumpTimestamp() }),

  showExtracurriculars: false,
  setShowExtracurriculars: (show) =>
    set((state) => ({
      showExtracurriculars: show,
      cvData: { ...state.cvData, showExtracurriculars: show },
      lastSavedTimestamp: bumpTimestamp(),
    })),

  selectedProjects: [],
  setSelectedProjects: (projects) =>
    set((state) => {
      const existingProjects = state.cvData.projects;
      const newProjects: ProjectItem[] = projects.map((p) => {
        const found = existingProjects.find((ep) => ep.slug === p.slug);
        if (found) return found;
        return {
          id: generateUniqueId("proj"),
          name: p.name,
          slug: p.slug,
          date: p.date || "",
          techStack: "",
          bulletPoints: [],
          is42Project: p.is42Project ?? true,
        };
      });
      return {
        selectedProjects: projects,
        lastSavedTimestamp: bumpTimestamp(),
        cvData: { ...state.cvData, projects: newProjects },
      };
    }),

  toggleProjectSelection: (project) =>
    set((state) => {
      const exists = state.selectedProjects.some((p) => p.slug === project.slug);
      return {
        lastSavedTimestamp: bumpTimestamp(),
        selectedProjects: exists
          ? state.selectedProjects.filter((p) => p.slug !== project.slug)
          : [...state.selectedProjects, project],
      };
    }),

  addProjectToCV: (proj) =>
    set((state) => {
      const name = proj?.name ?? "";
      const slug = proj?.slug || generateUniqueId("project");
      const existsInSelected = state.selectedProjects.some((p) => p.slug === slug);
      const nextSelected = existsInSelected
        ? state.selectedProjects
        : [
            ...state.selectedProjects,
            {
              name,
              slug,
              date: proj?.date || "",
              techStack: proj?.techStack || "",
              is42Project: proj?.is42Project ?? true,
            },
          ];
      const existsInCV = state.cvData.projects.some((p) => p.slug && p.slug === slug);
      if (existsInCV) {
        return { selectedProjects: nextSelected, lastSavedTimestamp: bumpTimestamp() };
      }
      const newProjectItem: ProjectItem = {
        id: proj?.id || generateUniqueId("proj"),
        name,
        slug,
        date: proj?.date || "",
        techStack: proj?.techStack || "",
        bulletPoints: proj?.bulletPoints || [],
        is42Project: proj?.is42Project ?? true,
      };
      return {
        selectedProjects: nextSelected,
        lastSavedTimestamp: bumpTimestamp(),
        cvData: {
          ...state.cvData,
          projects: [...state.cvData.projects, newProjectItem],
        },
      };
    }),

  removeProjectFromCV: (projectIdOrSlug) =>
    set((state) => {
      const updatedProjects = state.cvData.projects.filter(
        (p) => p.id !== projectIdOrSlug && p.slug !== projectIdOrSlug
      );
      const updatedSelected = state.selectedProjects.filter(
        (p) => p.slug !== projectIdOrSlug && !state.cvData.projects.some((cp) => cp.id === projectIdOrSlug && cp.slug === p.slug)
      );
      return {
        selectedProjects: updatedSelected,
        lastSavedTimestamp: bumpTimestamp(),
        cvData: { ...state.cvData, projects: updatedProjects },
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
        lastSavedTimestamp: bumpTimestamp(),
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
        lastSavedTimestamp: bumpTimestamp(),
        cvData: { ...state.cvData, projects },
      };
    }),

  reorderProjects: (fromIndex, toIndex) =>
    set((state) => {
      const projects = [...state.cvData.projects];
      if (fromIndex < 0 || fromIndex >= projects.length || toIndex < 0 || toIndex >= projects.length || fromIndex === toIndex) {
        return state;
      }
      const [moved] = projects.splice(fromIndex, 1);
      projects.splice(toIndex, 0, moved);
      return {
        lastSavedTimestamp: bumpTimestamp(),
        cvData: { ...state.cvData, projects },
      };
    }),

  restoreProjectAt: (item, index) =>
    set((state) => {
      const projects = [...state.cvData.projects.filter((p) => p.id !== item.id && (!item.slug || p.slug !== item.slug))];
      const clampedIndex = Math.min(Math.max(0, index), projects.length);
      projects.splice(clampedIndex, 0, item);
      const slug = item.slug || item.id;
      const existsInSelected = state.selectedProjects.some((p) => p.slug === slug);
      const nextSelected = existsInSelected
        ? state.selectedProjects
        : [
            ...state.selectedProjects,
            {
              name: item.name,
              slug,
              date: item.date || "",
              techStack: item.techStack || "",
              is42Project: item.is42Project ?? false,
            },
          ];
      return {
        selectedProjects: nextSelected,
        lastSavedTimestamp: bumpTimestamp(),
        cvData: { ...state.cvData, projects },
      };
    }),

  customProjects: [],
  addCustomProject: (project) =>
    set((state) => {
      const slug = project.slug || project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || generateUniqueId("custom");
      const newCustom: { name: string; slug: string; techStack: string; date: string; is42Project: boolean } = {
        name: project.name,
        slug,
        techStack: project.techStack || "",
        date: project.date || "",
        is42Project: false,
      };
      const updatedCustom = [...state.customProjects.filter((p) => p.slug !== slug), newCustom];
      const updatedSelected = [...state.selectedProjects.filter((p) => p.slug !== slug), newCustom];
      const newCVProject: ProjectItem = {
        id: generateUniqueId("custom-proj"),
        name: project.name,
        slug,
        techStack: project.techStack || "",
        date: project.date || "",
        bulletPoints: [],
        is42Project: false,
      };
      return {
        customProjects: updatedCustom,
        selectedProjects: updatedSelected,
        lastSavedTimestamp: bumpTimestamp(),
        cvData: {
          ...state.cvData,
          projects: [...state.cvData.projects.filter((p) => p.slug !== slug), newCVProject],
        },
      };
    }),

  removeCustomProject: (slug) =>
    set((state) => ({
      customProjects: state.customProjects.filter((p) => p.slug !== slug),
      selectedProjects: state.selectedProjects.filter((p) => p.slug !== slug),
      lastSavedTimestamp: bumpTimestamp(),
      cvData: {
        ...state.cvData,
        projects: state.cvData.projects.filter((p) => p.slug !== slug),
      },
    })),

  projectAnswers: {},
  setProjectAnswer: (projectSlug, questionId, answer) =>
    set((state) => ({
      lastSavedTimestamp: bumpTimestamp(),
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
      const nextRoles = exists
        ? state.selectedCampusRoles.filter((r) => r !== role)
        : [...state.selectedCampusRoles, role];
      return {
        selectedCampusRoles: nextRoles,
        lastSavedTimestamp: bumpTimestamp(),
      };
    }),

  campusRoleAnswers: {},
  setCampusRoleAnswer: (role, questionId, answer) =>
    set((state) => ({
      lastSavedTimestamp: bumpTimestamp(),
      campusRoleAnswers: {
        ...state.campusRoleAnswers,
        [role]: {
          ...(state.campusRoleAnswers[role] || {}),
          [questionId]: answer,
        },
      },
    })),

  selectedCoursework: [],
  toggleCoursework: (subject) =>
    set((state) => {
      const exists = state.selectedCoursework.includes(subject);
      const nextSubjects = exists
        ? state.selectedCoursework.filter((s) => s !== subject)
        : [...state.selectedCoursework, subject];
      const courseworkItems: CourseworkItem[] = nextSubjects.map((s, i) => ({
        id: `cw-${i}-${Date.now()}`,
        title: s,
        date: "",
      }));
      return {
        selectedCoursework: nextSubjects,
        lastSavedTimestamp: bumpTimestamp(),
        cvData: { ...state.cvData, coursework: courseworkItems },
      };
    }),

  helperAnswers: {},
  setHelperAnswer: (itemId, questionId, answer) =>
    set((state) => ({
      lastSavedTimestamp: bumpTimestamp(),
      helperAnswers: {
        ...state.helperAnswers,
        [itemId]: {
          ...(state.helperAnswers[itemId] || {}),
          [questionId]: answer,
        },
      },
    })),

  lastDeletedBullet: null,

  cvData: createEmptyCV(),
  setCVData: (data) =>
    set((state) => ({
      lastSavedTimestamp: bumpTimestamp(),
      targetRole: data.targetRole,
      showExperience: data.showExperience ?? state.showExperience,
      showExtracurriculars: data.showExtracurriculars ?? state.showExtracurriculars,
      cvData: data,
    })),

  setSectionOrder: (order) =>
    set((state) => ({
      lastSavedTimestamp: bumpTimestamp(),
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
        lastSavedTimestamp: bumpTimestamp(),
        cvData: {
          ...state.cvData,
          sectionOrder: currentOrder,
        },
      };
    }),

  updateSectionOrder: (fromIndex, toIndex) =>
    set((state) => {
      const currentOrder =
        state.cvData.sectionOrder && state.cvData.sectionOrder.length > 0
          ? [...state.cvData.sectionOrder]
          : [...DEFAULT_SECTION_ORDER];
      if (fromIndex < 0 || fromIndex >= currentOrder.length || toIndex < 0 || toIndex >= currentOrder.length || fromIndex === toIndex) {
        return state;
      }
      const [moved] = currentOrder.splice(fromIndex, 1);
      currentOrder.splice(toIndex, 0, moved);
      return {
        lastSavedTimestamp: bumpTimestamp(),
        cvData: { ...state.cvData, sectionOrder: currentOrder },
      };
    }),

  updateContact: (contactPatch) =>
    set((state) => {
      const safePatch = { ...contactPatch };
      if ("level" in safePatch && (safePatch.level === "" || safePatch.level === undefined)) {
        safePatch.level = state.cvData.contact.level;
      }
      return {
        lastSavedTimestamp: bumpTimestamp(),
        cvData: {
          ...state.cvData,
          contact: { ...state.cvData.contact, ...safePatch },
        },
      };
    }),

  updateTargetRole: (role) =>
    set((state) => {
      const cleanRole = removeEmDashes(role || "").trim();
      return {
        targetRole: cleanRole,
        lastSavedTimestamp: bumpTimestamp(),
        cvData: {
          ...state.cvData,
          targetRole: cleanRole,
        },
      };
    }),

  updateSkills: (skillsPatch) =>
    set((state) => ({
      lastSavedTimestamp: bumpTimestamp(),
      cvData: {
        ...state.cvData,
        skills: { ...state.cvData.skills, ...skillsPatch },
      },
    })),

  updateSkillCategory: (category, rawOrList) =>
    set((state) => {
      const list = Array.isArray(rawOrList) ? rawOrList : parseSkillsCommaList(rawOrList);
      return {
        lastSavedTimestamp: bumpTimestamp(),
        cvData: {
          ...state.cvData,
          skills: {
            ...state.cvData.skills,
            [category]: list,
          },
        },
      };
    }),

  updateProject: (id, patch) =>
    set((state) => ({
      lastSavedTimestamp: bumpTimestamp(),
      cvData: {
        ...state.cvData,
        projects: state.cvData.projects.map((proj) => (proj.id === id ? { ...proj, ...patch } : proj)),
      },
    })),

  updateProjectBullet: (projectId, bulletIndex, text) =>
    set((state) => ({
      lastSavedTimestamp: bumpTimestamp(),
      cvData: {
        ...state.cvData,
        projects: state.cvData.projects.map((p) => {
          if (p.id === projectId) {
            const nextBullets = [...(p.bulletPoints || [])];
            if (bulletIndex >= 0 && bulletIndex < nextBullets.length) {
              nextBullets[bulletIndex] = text;
            } else if (bulletIndex === nextBullets.length) {
              nextBullets.push(text);
            }
            return { ...p, bulletPoints: nextBullets };
          }
          return p;
        }),
      },
    })),

  addProjectBullet: (projectId, text = "") =>
    set((state) => ({
      lastSavedTimestamp: bumpTimestamp(),
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
    set((state) => {
      const proj = state.cvData.projects.find((p) => p.id === projectId);
      const deletedText = proj?.bulletPoints[bulletIndex] || "";
      return {
        lastSavedTimestamp: bumpTimestamp(),
        lastDeletedBullet: deletedText ? { projectId, index: bulletIndex, text: deletedText } : state.lastDeletedBullet,
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
      };
    }),

  restoreProjectBullet: (projectId, index, text) =>
    set((state) => ({
      lastSavedTimestamp: bumpTimestamp(),
      cvData: {
        ...state.cvData,
        projects: state.cvData.projects.map((p) => {
          if (p.id === projectId) {
            const nextBullets = [...p.bulletPoints];
            const clampedIndex = Math.min(Math.max(0, index), nextBullets.length);
            nextBullets.splice(clampedIndex, 0, text);
            return { ...p, bulletPoints: nextBullets };
          }
          return p;
        }),
      },
    })),

  undoLastBulletDeletion: () => {
    const deleted = get().lastDeletedBullet;
    if (!deleted) return false;
    get().restoreProjectBullet(deleted.projectId, deleted.index, deleted.text);
    set({ lastDeletedBullet: null });
    return true;
  },

  addExperienceItem: (item) =>
    set((state) => {
      const newItem: ExperienceItem = {
        id: item?.id || generateUniqueId("exp"),
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
        lastSavedTimestamp: bumpTimestamp(),
        cvData: {
          ...state.cvData,
          showExperience: true,
          experience: [...state.cvData.experience, newItem],
        },
      };
    }),

  updateExperienceItem: (id, patch) =>
    set((state) => ({
      lastSavedTimestamp: bumpTimestamp(),
      cvData: {
        ...state.cvData,
        experience: state.cvData.experience.map((exp) => (exp.id === id ? { ...exp, ...patch } : exp)),
      },
    })),

  removeExperienceItem: (id) =>
    set((state) => {
      const updated = state.cvData.experience.filter((exp) => exp.id !== id);
      return {
        showExperience: updated.length > 0,
        lastSavedTimestamp: bumpTimestamp(),
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
        lastSavedTimestamp: bumpTimestamp(),
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
        lastSavedTimestamp: bumpTimestamp(),
        cvData: { ...state.cvData, experience },
      };
    }),

  reorderExperience: (fromIndex, toIndex) =>
    set((state) => {
      const experience = [...state.cvData.experience];
      if (fromIndex < 0 || fromIndex >= experience.length || toIndex < 0 || toIndex >= experience.length || fromIndex === toIndex) {
        return state;
      }
      const [moved] = experience.splice(fromIndex, 1);
      experience.splice(toIndex, 0, moved);
      return {
        lastSavedTimestamp: bumpTimestamp(),
        cvData: { ...state.cvData, experience },
      };
    }),

  addEducationItem: (item) =>
    set((state) => {
      const newEdu: EducationItem = {
        id: item?.id || generateUniqueId("edu"),
        institution: item?.institution ?? "",
        program: item?.program ?? "",
        degree: item?.degree ?? "",
        startDate: item?.startDate ?? "",
        endDate: item?.endDate ?? "",
        isCurrent: item?.isCurrent ?? false,
        state: "STATE_A_CORE",
      };
      return {
        lastSavedTimestamp: bumpTimestamp(),
        cvData: {
          ...state.cvData,
          education: [...state.cvData.education, newEdu],
        },
      };
    }),

  updateEducationItem: (id, patch) =>
    set((state) => ({
      lastSavedTimestamp: bumpTimestamp(),
      cvData: {
        ...state.cvData,
        education: state.cvData.education.map((edu) => {
          if (edu.id !== id) return edu;
          const nextPatch = { ...patch };
          if (nextPatch.program !== undefined && nextPatch.degree === undefined) {
            nextPatch.degree = nextPatch.program;
          }
          if (edu.id === MAIN_EDUCATION_ID) {
            if (!("level" in patch)) {
              nextPatch.level = edu.level;
            }
            if (typeof nextPatch.institution === "string") {
              nextPatch.institution = nextPatch.institution.replace(/\s*[–—-]\s*Level\s+\d+(\.\d+)?$/i, "").trim();
            }
          }
          return { ...edu, ...nextPatch };
        }),
      },
    })),

  removeEducationItem: (id) =>
    set((state) => {
      if (id === MAIN_EDUCATION_ID) return state;
      return {
        lastSavedTimestamp: bumpTimestamp(),
        cvData: {
          ...state.cvData,
          education: state.cvData.education.filter((edu) => edu.id !== id),
        },
      };
    }),

  addCourseworkItem: (item) =>
    set((state) => {
      const newItem: CourseworkItem = {
        id: item?.id || generateUniqueId("cw"),
        title: item?.title ?? "",
        date: item?.date ?? "",
        institution: item?.institution ?? "",
      };
      return {
        lastSavedTimestamp: bumpTimestamp(),
        cvData: {
          ...state.cvData,
          coursework: [...(state.cvData.coursework || []), newItem],
        },
      };
    }),

  updateCourseworkItem: (id, patch) =>
    set((state) => ({
      lastSavedTimestamp: bumpTimestamp(),
      cvData: {
        ...state.cvData,
        coursework: (state.cvData.coursework || []).map((cw) => (cw.id === id ? { ...cw, ...patch } : cw)),
      },
    })),

  removeCourseworkItem: (id) =>
    set((state) => ({
      lastSavedTimestamp: bumpTimestamp(),
      cvData: {
        ...state.cvData,
        coursework: (state.cvData.coursework || []).filter((cw) => cw.id !== id),
      },
    })),

  addExtracurricularItem: (item) =>
    set((state) => {
      const newItem: ExtracurricularItem = {
        id: item?.id || generateUniqueId("ec"),
        organization: item?.organization ?? "",
        role: item?.role ?? "",
        startDate: item?.startDate ?? "",
        endDate: item?.endDate ?? "",
        isCurrent: item?.isCurrent ?? false,
        bulletPoints: item?.bulletPoints ?? [],
      };
      return {
        showExtracurriculars: true,
        lastSavedTimestamp: bumpTimestamp(),
        cvData: {
          ...state.cvData,
          showExtracurriculars: true,
          extracurriculars: [...state.cvData.extracurriculars, newItem],
        },
      };
    }),

  updateExtracurricularItem: (id, patch) =>
    set((state) => ({
      lastSavedTimestamp: bumpTimestamp(),
      cvData: {
        ...state.cvData,
        extracurriculars: state.cvData.extracurriculars.map((ex) => (ex.id === id ? { ...ex, ...patch } : ex)),
      },
    })),

  removeExtracurricularItem: (id) =>
    set((state) => {
      const updated = state.cvData.extracurriculars.filter((ex) => ex.id !== id);
      return {
        showExtracurriculars: updated.length > 0,
        lastSavedTimestamp: bumpTimestamp(),
        cvData: {
          ...state.cvData,
          showExtracurriculars: updated.length > 0,
          extracurriculars: updated,
        },
      };
    }),

  addExtracurricularBullet: (id, text = "") =>
    set((state) => ({
      lastSavedTimestamp: bumpTimestamp(),
      cvData: {
        ...state.cvData,
        extracurriculars: (state.cvData.extracurriculars || []).map((ec) =>
          ec.id === id ? { ...ec, bulletPoints: [...ec.bulletPoints, text] } : ec
        ),
      },
    })),

  updateExtracurricularBullet: (id, bulletIndex, text) =>
    set((state) => ({
      lastSavedTimestamp: bumpTimestamp(),
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
      lastSavedTimestamp: bumpTimestamp(),
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

  hydrateFromParsedCV: (data: ParsedCVData) =>
    set((state) => {
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

      let updatedEducation = [...state.cvData.education];
      const primaryEntries = updatedEducation.filter((edu) => edu.id === MAIN_EDUCATION_ID || /^(42|1337|19|codam|hive)\b/i.test(edu.institution.trim()));
      const incomingEduList = Array.isArray(data.education) && data.education.length > 0 ? data.education : data.previousUniversity && data.previousUniversity.institution ? [data.previousUniversity] : [];
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

      const incomingExp = Array.isArray(data.experience) && data.experience.length > 0 ? data.experience : Array.isArray(data.workExperience) && data.workExperience.length > 0 ? data.workExperience : [];
      let hasExp = state.showExperience;
      let updatedExperience = [...state.cvData.experience];
      if (incomingExp.length > 0) {
        hasExp = true;
        updatedExperience = incomingExp.map((exp: any, i: number) => {
          const bullets = Array.isArray(exp.descriptionBullets) && exp.descriptionBullets.length > 0 ? exp.descriptionBullets : Array.isArray(exp.bulletPoints) && exp.bulletPoints.length > 0 ? exp.bulletPoints : exp.rawNotes ? [exp.rawNotes] : [];
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

      let updatedCustomProjects = [...state.customProjects];
      let updatedSelectedProjects = [...state.selectedProjects];
      const updatedProjectAnswers = { ...state.projectAnswers };

      if (Array.isArray(data.customProjects) && data.customProjects.length > 0) {
        for (const proj of data.customProjects) {
          if (!proj.name || !proj.name.trim()) continue;
          const slug = (proj.slug || proj.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
          const bullets = Array.isArray(proj.summaryBullets) && proj.summaryBullets.length > 0 ? proj.summaryBullets : Array.isArray(proj.bulletPoints) && proj.bulletPoints.length > 0 ? proj.bulletPoints : [];
          const newCustom = {
            name: proj.name.trim(),
            slug,
            techStack: proj.techStack?.trim() || "",
            date: proj.date?.trim() || "",
            is42Project: false,
          };
          updatedCustomProjects = [...updatedCustomProjects.filter((p) => p.slug !== slug), newCustom];
          const existsInSelected = updatedSelectedProjects.some((sp) => sp.slug === slug);
          if (!existsInSelected) updatedSelectedProjects.push(newCustom);
          const note = proj.rawNotes || bullets.join(". ");
          updatedProjectAnswers[slug] = { ...(updatedProjectAnswers[slug] || {}), "personal-notes": note };
        }
      }

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
        lastSavedTimestamp: bumpTimestamp(),
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

  lastSavedTimestamp: bumpTimestamp(),
  sampleDataRemovedNotice: false,
  dismissSampleDataRemovedNotice: () => set({ sampleDataRemovedNotice: false }),

  saveStatus: "saved",
  setSaveStatus: (status) => set({ saveStatus: status }),

  hasHydrated: true,
  setHasHydrated: (hydrated) => set({ hasHydrated: hydrated }),

  hydrateFromDraftRecord: (record) => {
    isHydratingFromRecord = true;
    try {
      const snap = record.snapshot;
      set({
        currentStep: (snap.currentStep as WizardStep) || "SETUP",
        studentProfile: snap.studentProfile ? { ...snap.studentProfile, validatedProjects: snap.studentProfile.validatedProjects ?? [] } : null,
        targetRole: snap.targetRole ?? snap.cvData?.targetRole ?? "",
        educationState: snap.educationState || "STATE_A_CORE",
        specializationTrack: snap.specializationTrack || "",
        showExperience: Boolean(snap.showExperience),
        styleDensity: snap.styleDensity || "standard",
        showExtracurriculars: Boolean(snap.showExtracurriculars),
        selectedProjects: snap.selectedProjects || [],
        customProjects: snap.customProjects || [],
        projectAnswers: snap.projectAnswers || {},
        selectedCampusRoles: snap.selectedCampusRoles || [],
        campusRoleAnswers: snap.campusRoleAnswers || {},
        selectedCoursework: snap.selectedCoursework || [],
        helperAnswers: snap.helperAnswers || {},
        lastDeletedBullet: null,
        cvData: snap.cvData
          ? {
              ...snap.cvData,
              targetRole: snap.targetRole ?? snap.cvData.targetRole,
              sectionOrder: snap.cvData.sectionOrder?.length ? snap.cvData.sectionOrder : [...DEFAULT_SECTION_ORDER],
            }
          : createEmptyCV(),
        lastSavedTimestamp: snap.lastSavedTimestamp || bumpTimestamp(),
        sampleDataRemovedNotice: Boolean(snap.sampleDataRemovedNotice),
        hasHydrated: true,
        saveStatus: "saved",
      });
      cancelPendingAutosave();
    } finally {
      isHydratingFromRecord = false;
    }
  },

  cancelPendingAutosave: () => {
    cancelPendingAutosave();
  },

  extractSnapshot: () => {
    const s = get();
    return {
      currentStep: s.currentStep,
      studentProfile: s.studentProfile,
      targetRole: s.targetRole,
      educationState: s.educationState,
      specializationTrack: s.specializationTrack,
      showExperience: s.showExperience,
      styleDensity: s.styleDensity,
      showExtracurriculars: s.showExtracurriculars,
      selectedProjects: s.selectedProjects,
      customProjects: s.customProjects,
      projectAnswers: s.projectAnswers,
      selectedCampusRoles: s.selectedCampusRoles,
      campusRoleAnswers: s.campusRoleAnswers,
      selectedCoursework: s.selectedCoursework,
      cvData: s.cvData,
      lastSavedTimestamp: s.lastSavedTimestamp,
      sampleDataRemovedNotice: s.sampleDataRemovedNotice,
      helperAnswers: s.helperAnswers,
    };
  },

  resetToDefaults: () => {
    isHydratingFromRecord = true;
    try {
      set({
        currentStep: "LOGIN",
        studentProfile: null,
        targetRole: "",
        educationState: "STATE_A_CORE",
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
        lastDeletedBullet: null,
        cvData: createEmptyCV(),
        lastSavedTimestamp: bumpTimestamp(),
        sampleDataRemovedNotice: false,
        hasHydrated: true,
        saveStatus: "saved",
      });
      cancelPendingAutosave();
    } finally {
      isHydratingFromRecord = false;
    }
  },
  });
});

let isHydratingFromRecord = false;

if (typeof window !== "undefined") {
  (window as any).__PRINTCV_STORE__ = useCVStore;
}

export function useHasHydrated() {
  const [hasHydrated, setHasHydrated] = useState(false);
  useEffect(() => {
    setHasHydrated(true);
  }, []);
  return hasHydrated;
}

/** Accepted edits belong to the coordinator; canceling an adapter cannot discard them. */
export function cancelPendingAutosave(): void {}

export function bindStoreToSession(controller: DraftSessionController): () => void {
  const rawActions = new Map<string, (...args: any[]) => any>();
  const controls = new Set(["extractSnapshot", "hydrateFromDraftRecord", "resetToDefaults", "cancelPendingAutosave", "setSaveStatus", "setHasHydrated"]);
  for (const [name, value] of Object.entries(useCVStore.getInitialState())) {
    if (typeof value === "function" && !controls.has(name)) rawActions.set(name, value);
  }
  let scopeKey: string | null = null;
  // Undo is transient intent, never a draft snapshot or a persistence writer.
  // Keep it private across rendering clears and separate across owner/draft/lineage.
  const undoByLineage = new Map<string, CVStoreState["lastDeletedBullet"]>();
  const undoFor = (key: string) => {
    const value = undoByLineage.get(key);
    return value ? { ...value } : null;
  };
  const bindActions = () => {
    const scope = controller.captureActionScope();
    if (!scope || scope.key === scopeKey) return;
    scopeKey = scope.key;
    const bound: Record<string, any> = {};
    for (const [name, action] of rawActions) {
      bound[name] = (...args: any[]) => {
        if (actionEvaluation) return action(...args); // nested action keeps the original scope
        let value: any;
        const accepted = scope.apply(snapshot => {
          const context = { state: { ...useCVStore.getInitialState(), ...snapshot,
            lastDeletedBullet: undoFor(scope.lineageKey) } as CVStoreState };
          actionEvaluation = context;
          try {
            value = action(...args);
            if (value === false) return null; // no undo intent means no accepted replacement
            const next = useCVStore.getInitialState().extractSnapshot();
            if (scope.owner.kind !== "account" || !next.studentProfile || next.studentProfile.id === scope.owner.studentId) {
              // Publish transient intent before coordinator notifications, so a
              // reentrant action observes the deletion/undo it follows.
              const deleted = context.state.lastDeletedBullet;
              undoByLineage.set(scope.lineageKey, deleted ? { ...deleted } : null);
            }
            return next;
          } finally { actionEvaluation = null; }
        });
        if (!accepted) return false; // explicit foreign-owner rejection, no recovery under another owner
        if (scope.canProject() && controller.captureActionScope()?.lineageKey === scope.lineageKey) {
          useCVStore.setState({ lastDeletedBullet: undoFor(scope.lineageKey) });
        }
        return value;
      };
    }
    useCVStore.setState(bound);
  };
  const unsubController = controller.subscribe({
    onStateChange: state => {
      bindActions();
      if (["TRANSITIONING", "SESSION_UNKNOWN", "LOGOUT_PENDING", "WELCOME", "BOOTSTRAPPING"].includes(state.state)) useCVStore.getState().resetToDefaults();
      if (state.state === "RECOVERY_BLOCKED") useCVStore.getState().setSaveStatus("error");
    },
    onDraftChange: record => {
      const scope = controller.captureActionScope();
      const transient = record && scope ? undoFor(scope.lineageKey) : null;
      bindActions();
      if (record) {
        useCVStore.getState().hydrateFromDraftRecord(record);
        useCVStore.setState({ lastDeletedBullet: transient });
      } else { useCVStore.getState().resetToDefaults(); }
    },
    onSaveStatusChange: status => useCVStore.getState().setSaveStatus(status),
  });
  return () => {
    unsubController();
    undoByLineage.clear();
    useCVStore.setState(Object.fromEntries(rawActions));
  };
}
