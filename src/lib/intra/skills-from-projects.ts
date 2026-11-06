// Infers verified technical skills supported strictly by reliable evidence
// from the student's validated 42 projects (e.g. C for libc/minishell, C++ for webserv/cpp).
// Never assumes tools not required by the curriculum. Preserves user-customized skills.

import type { SkillsData } from "@/types/resume";

export interface ProjectEvidence {
  slug: string;
  name?: string;
  validated?: boolean;
}

/**
 * Checks if the student's skills data has any manually entered or existing items.
 */
export function hasExistingSkills(skills?: Partial<SkillsData> | null): boolean {
  if (!skills) return false;
  return Boolean(
    (skills.languages && skills.languages.length > 0) ||
    (skills.developerTools && skills.developerTools.length > 0) ||
    (skills.technologiesFrameworks && skills.technologiesFrameworks.length > 0) ||
    (skills.projectManagementTools && skills.projectManagementTools.length > 0)
  );
}

/**
 * Derives verified baseline skills from validated 42 projects.
 * Only includes skills with direct, unassailable evidence from passed curriculum requirements.
 */
export function deriveVerifiedSkillsFromProjects(projects: ProjectEvidence[]): SkillsData {
  const languages = new Set<string>();
  const developerTools = new Set<string>();
  const technologiesFrameworks = new Set<string>();
  const projectManagementTools = new Set<string>();

  const slugs = new Set(
    projects
      .filter((p) => p.validated !== false)
      .map((p) => (p.slug || p.name || "").toLowerCase().replace(/^42cursus[-_]?/, ""))
  );

  // Any validated 42 project requires Git submission to Vogsphere
  if (slugs.size > 0) {
    developerTools.add("Git");
  }

  // C Core Curriculum projects strictly compiled with gcc/clang and Make
  const cProjects = [
    "libft", "ft_printf", "get_next_line", "born2beroot", "push_swap",
    "pipex", "minitalk", "so_long", "fdf", "fract-ol", "philosophers",
    "minishell", "cub3d", "minirt",
  ];
  const hasCProject = cProjects.some((slug) => slugs.has(slug));
  if (hasCProject) {
    languages.add("C");
    developerTools.add("Make");
  }

  // C++ Curriculum (Orthodox Canonical Form, C++98)
  const cppProjects = ["cpp-modules", "webserv", "ft_irc"];
  const hasCppProject = cppProjects.some((slug) => slugs.has(slug) || Array.from(slugs).some((s) => s.startsWith("cpp-module")));
  if (hasCppProject) {
    languages.add("C++");
  }

  // Shell scripting required in Minishell / Born2beRoot
  if (slugs.has("minishell") || slugs.has("born2beroot")) {
    languages.add("Bash");
  }

  // Operating system / environment fundamentals
  if (slugs.has("born2beroot") || slugs.has("minishell") || slugs.has("pipex") || slugs.has("inception")) {
    technologiesFrameworks.add("Linux");
  }

  // POSIX multithreading
  if (slugs.has("philosophers")) {
    technologiesFrameworks.add("POSIX Threads");
  }

  // Multi-container virtualization
  if (slugs.has("inception")) {
    technologiesFrameworks.add("Docker");
    technologiesFrameworks.add("Docker Compose");
  }

  // Full-Stack web application
  if (slugs.has("ft_transcendence") || slugs.has("transcendence")) {
    languages.add("TypeScript");
    technologiesFrameworks.add("Docker");
  }

  return {
    languages: Array.from(languages),
    developerTools: Array.from(developerTools),
    technologiesFrameworks: Array.from(technologiesFrameworks),
    projectManagementTools: Array.from(projectManagementTools),
  };
}

/**
 * Safely merges verified skills into a CV without overwriting any existing skills.
 */
export function safelyMergeSkills(existingSkills: SkillsData | undefined, verifiedSkills: SkillsData): SkillsData {
  if (hasExistingSkills(existingSkills)) {
    return {
      languages: existingSkills?.languages || [],
      developerTools: existingSkills?.developerTools || [],
      technologiesFrameworks: existingSkills?.technologiesFrameworks || [],
      projectManagementTools: existingSkills?.projectManagementTools || [],
    };
  }

  return verifiedSkills;
}
