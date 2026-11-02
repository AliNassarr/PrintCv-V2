// Made-up students for the landing page. Never imported by the editor or the store.
import type { CVData, ProjectItem } from "@/types/resume";
import { DEFAULT_SECTION_ORDER } from "@/types/resume";
import { MAIN_EDUCATION_ID } from "@/lib/cv-constants";
import { SAMPLE_LINES } from "@/lib/sample-lines";

const project = (id: string, name: string, techStack: string, date: string, lines: readonly string[]): ProjectItem =>
  ({ id, name, slug: name.toLowerCase(), is42Project: true, techStack, date, bulletPoints: [...lines] });

const base = (fullName: string, email: string, phone: string, role: string, projects: ProjectItem[], skills: CVData["skills"]): CVData => ({
  targetRole: role,
  contact: { fullName, level: "", email, phoneNumber: phone, githubUrl: "", linkedinUrl: "", location: "" },
  educationState: "STATE_A_CORE",
  showExperience: false,
  education: [{ id: MAIN_EDUCATION_ID, institution: "42", program: "Common core", startDate: "2024", endDate: "Present", isCurrent: true, state: "STATE_A_CORE" }],
  experience: [],
  projects,
  skills,
  coursework: [],
  extracurriculars: [],
  styleDensity: "standard",
  showExtracurriculars: false,
  sectionOrder: [...DEFAULT_SECTION_ORDER],
});

export const SAMPLE_CVS: CVData[] = [
  base("Noa Ferrant", "noa.ferrant@example.org", "+1 555 0100", "Systems Developer", [
    project("s1-minishell", "minishell", "C, Unix processes", "March 2025", SAMPLE_LINES.noa.minishell),
    project("s1-philo", "philosophers", "C, threads", "January 2025", SAMPLE_LINES.noa.philosophers),
  ], { languages: ["C", "Bash"], developerTools: ["Git", "Valgrind", "GDB"], technologiesFrameworks: ["POSIX threads"], projectManagementTools: [] }),
  base("Kiran Osei-Lund", "kiran.osei-lund@example.org", "+1 555 0101", "Backend Developer", [
    project("s2-webserv", "webserv", "C++, sockets, HTTP", "June 2025", SAMPLE_LINES.kiran.webserv),
    project("s2-cub3d", "cub3d", "C, MiniLibX", "February 2025", SAMPLE_LINES.kiran.cub3d),
  ], { languages: ["C++", "C"], developerTools: ["Git", "siege", "Make"], technologiesFrameworks: ["HTTP"], projectManagementTools: [] }),
  base("Mara Velisek", "mara.velisek@example.org", "+1 555 0102", "Full-Stack Developer", [
    project("s3-transcendence", "ft_transcendence", "TypeScript, WebSockets, Docker", "September 2025", SAMPLE_LINES.mara.ft_transcendence),
    project("s3-inception", "inception", "Docker, NGINX, MariaDB", "May 2025", SAMPLE_LINES.mara.inception),
  ], { languages: ["TypeScript", "SQL"], developerTools: ["Git", "Docker"], technologiesFrameworks: ["NGINX", "MariaDB"], projectManagementTools: ["GitHub"] }),
];

// The full demo on the landing page (hero, the PDF tab and the score card): a made-up student at level 7.84
// with every part of the template filled in, a part-time job before 42 and volunteer work during it. The lines
// were written in plain, everyday English and checked by hand.
const L = SAMPLE_LINES.ines;
export const DEMO_CV: CVData = {
  ...base("Ines Varga", "ines.varga@example.org", "+1 555 0103", "Junior Software Developer", [
    project("d-ft-irc", "ft_irc", "C++, sockets, poll()", "June 2026", L.ft_irc),
    project("d-minirt", "miniRT", "C, MiniLibX", "November 2025", L.miniRT),
    project("d-push-swap", "push_swap", "C", "March 2025", L.push_swap),
  ], {
    languages: ["C", "C++", "Python", "Bash", "SQL"],
    developerTools: ["Git", "Make", "GDB", "VS Code"],
    technologiesFrameworks: ["Linux", "Docker", "TCP sockets", "MiniLibX"],
    projectManagementTools: ["GitHub Projects", "Trello"],
  }),
  contact: { fullName: "Ines Varga", level: "7.84", email: "ines.varga@example.org", phoneNumber: "+1 555 0103", githubUrl: "", linkedinUrl: "", location: "" },
  showExperience: true,
  styleDensity: "compact",
  education: [
    { id: MAIN_EDUCATION_ID, institution: "42", program: "Common core", startDate: "2024", endDate: "Present", isCurrent: true, state: "STATE_A_CORE" },
    { id: "d-school", institution: "Riverside High School", program: "", degree: "High school diploma, science track", startDate: "2019", endDate: "2022", isCurrent: false, state: "STATE_A_CORE" },
  ],
  experience: [
    { id: "d-repairs", company: "Brightwell Phone Repair", role: "Repair technician, part-time", location: "", startDate: "2022", endDate: "2024", isCurrent: false, bulletPoints: [...L.repairs] },
  ],
  coursework: [
    { id: "d-sql", title: "SQL and database basics, free online course", date: "2024" },
    { id: "d-docker", title: "Docker basics, campus workshop", date: "2025" },
  ],
  extracurriculars: [
    { id: "d-piscine", organization: "42 Piscine", role: "Volunteer helper", startDate: "2025", endDate: "", isCurrent: true, bulletPoints: [...L.piscine] },
  ],
  showExtracurriculars: true,
};
