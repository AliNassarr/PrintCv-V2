// ==========================================
// CV TEMPLATE ENUMS & CONSTANTS
// ==========================================

export type EducationState = "STATE_A_CORE" | "STATE_B_SPECIALIZATION" | "STATE_C_ALUMNUS";

export interface ContactInfo {
  fullName: string;
  level: number | string;
  email: string;
  phoneNumber: string;
  githubUrl: string;
  linkedinUrl: string;
  location?: string;
}

export interface EducationItem {
  id: string;
  institution: string; // e.g., "42 Example" or "State University"
  program: string; // e.g., "Core Systems Curriculum - Software & Systems Engineering"
  degree?: string; // e.g., "Bachelor in Computer Science"
  level?: number | string;
  startDate: string; // e.g., "2024"
  endDate?: string; // e.g., "Present" or "2025"
  isCurrent: boolean;
  state: EducationState;
  specializationTrack?: string; // e.g., "Cybersecurity Track" (State B)
}

export interface ExperienceItem {
  id: string;
  company: string;
  role: string;
  location: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  bulletPoints: string[];
  rawNotes?: string;
}

export interface ProjectItem {
  id: string;
  name: string; // e.g., "Minishell"
  slug?: string;
  is42Project: boolean;
  techStack: string; // Comma-separated: "C, Unix System Calls, Process Management"
  date: string; // e.g., "January 2025"
  bulletPoints: string[];
}

// Strict 4 categories required by the CV template
export interface SkillsData {
  languages: string[]; // "C, C++, Java, Python, SQL"
  developerTools: string[]; // "VS Code, Android Studio, Apache NetBeans"
  technologiesFrameworks: string[]; // "Linux, GDB, Git, Bootstrap, Flask"
  projectManagementTools: string[]; // "GitHub, JIRA"
}

export interface CourseworkItem {
  id: string;
  title: string; // e.g., "Intensive Cybersecurity Bootcamp"
  date: string; // e.g., "May 2025"
  institution?: string;
}

export interface ExtracurricularItem {
  id: string;
  organization: string; // e.g., "Peer Mentorship & Campus Operations" or "Open Source Guild"
  role: string; // e.g., "Lead Peer Mentor" or "Secretary"
  startDate: string;
  endDate?: string;
  isCurrent: boolean;
  bulletPoints: string[];
}

export type SectionId = "education" | "experience" | "projects" | "skills" | "coursework" | "extracurriculars";

export const DEFAULT_SECTION_ORDER: SectionId[] = [
  "education",
  "experience",
  "projects",
  "skills",
  "coursework",
  "extracurriculars",
];

export interface CVData {
  id?: string;
  targetRole: string; // e.g., "Backend Developer", "Systems/C++ Engineer"
  contact: ContactInfo;
  educationState: EducationState;
  specializationTrack?: string;
  showExperience: boolean; // CRITICAL: when false, weight goes to Selected Projects
  education: EducationItem[];
  experience: ExperienceItem[];
  projects: ProjectItem[];
  skills: SkillsData;
  coursework: CourseworkItem[];
  extracurriculars: ExtracurricularItem[];
  styleDensity?: "standard" | "compact";
  showExtracurriculars?: boolean;
  sectionOrder?: SectionId[];
}
