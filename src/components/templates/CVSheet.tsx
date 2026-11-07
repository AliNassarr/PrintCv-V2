// The printed CV itself: pure markup with no hooks and no browser code, so it can render on the
// server (landing page) as well as inside CleanTemplate (studio preview and PrintableCV).
import React from "react";
import { CVData, DEFAULT_SECTION_ORDER } from "@/types/resume";
import { removeEmDashes } from "@/lib/sanitizer";
import { MAIN_EDUCATION_ID } from "@/lib/cv-constants";
import {
  DR_WISSAM_DEFAULT_HEADLINE,
  DR_WISSAM_SKILL_LABELS,
  formatSpecializationTrack,
  format42Level,
  format42LevelLabel,
  formatCVSubtitle,
} from "@/lib/template-constants";

const hasText = (value: unknown): boolean =>
  value !== undefined && value !== null && String(value).trim() !== "";

// Drops blank bullets so an all-empty list renders nothing.
const nonEmptyBullets = (bullets?: string[]): string[] =>
  (bullets || []).filter((bullet) => Boolean(bullet && bullet.trim()));

// "start – end", or just the part that exists. Never shows a lone "Present".
const formatDateRange = (start?: string, end?: string, isCurrent?: boolean): string => {
  const s = start?.trim() || "";
  const e = end?.trim() || (isCurrent ? "Present" : "");
  if (s && e) return `${s} – ${e}`;
  if (s) return s;
  return e && e.toLowerCase() !== "present" ? e : "";
};

export interface HeightBudget {
  height: number;
  printableBudget: number;
  percentage: number;
  isOverflow: boolean;
}

export type TemplateSectionId =
  | "contact"
  | "education"
  | "experience"
  | "projects"
  | "skills"
  | "coursework"
  | "extracurriculars";


// 1027px printable A4 vertical budget at 96 DPI
export const PRINTABLE_BUDGET_PX = 1027;

export interface EditableFieldDescriptor {
  id: string;
  value: string;
  type?: "text" | "textarea" | "date" | "comma-list" | "email" | "tel" | "action";
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
  meta?: Record<string, unknown>;
}

export interface CVSheetProps {
  data: CVData;
  scale?: number;
  isOverflow?: boolean;
  onSectionClick?: (id: TemplateSectionId) => void;
  nameAs?: "h1" | "p";      // "p" on the landing page and in the studio preview; PrintableCV keeps "h1"
  dataUi?: boolean;          // marks the sheet as a product fragment for the taste inspector
  sheetRef?: React.Ref<HTMLDivElement>;
  contentRef?: React.Ref<HTMLDivElement>;
  renderField?: (desc: EditableFieldDescriptor, defaultNode: React.ReactNode) => React.ReactNode;
}

export function CVSheet({
  data,
  scale = 1,
  isOverflow = false,
  onSectionClick,
  nameAs,
  dataUi,
  sheetRef,
  contentRef,
  renderField,
}: CVSheetProps) {
  const {
    contact,
    educationState,
    specializationTrack,
    showExperience,
    education,
    experience,
    projects,
    skills,
    coursework,
    extracurriculars,
    showExtracurriculars,
  } = data;

  const isCompact = data.styleDensity === "compact";

  const NameTag = nameAs ?? "h1";

  const fontPrimary = "'Calibri', 'Arial', sans-serif";

  const mainEducation = education?.find((e) => e.id === MAIN_EDUCATION_ID);
  const otherEducation = (education || []).filter((e) => e.id !== MAIN_EDUCATION_ID);
  const rawLevel = format42Level(contact.level) ? contact.level : mainEducation?.level;
  const levelLabel = format42LevelLabel(rawLevel);
  const subtitle = formatCVSubtitle(data.targetRole, rawLevel);

  const stripProtocol = (url?: string) => (url || "").trim().replace(/^https?:\/\//, "");

  type ContactItem = {
    key: string;
    text: string;
    isLink?: boolean;
    icon?: "github" | "linkedin";
  };

  const rawContactItems: (ContactItem | null)[] = [
    stripProtocol(contact.githubUrl)
      ? { key: "github", text: stripProtocol(contact.githubUrl), isLink: true, icon: "github" }
      : null,
    stripProtocol(contact.linkedinUrl)
      ? { key: "linkedin", text: stripProtocol(contact.linkedinUrl), isLink: true, icon: "linkedin" }
      : null,
    contact.email?.trim()
      ? { key: "email", text: contact.email.trim() }
      : null,
    contact.phoneNumber?.trim()
      ? { key: "phone", text: contact.phoneNumber.trim() }
      : null,
  ];

  const contactItems: ContactItem[] = renderField
    ? [
        { key: "github", text: stripProtocol(contact.githubUrl), isLink: true, icon: "github" },
        { key: "linkedin", text: stripProtocol(contact.linkedinUrl), isLink: true, icon: "linkedin" },
        { key: "email", text: contact.email?.trim() || "" },
        { key: "phone", text: contact.phoneNumber?.trim() || "" },
      ]
    : rawContactItems.filter(
        (item): item is ContactItem => item !== null && item.text !== ""
      );

  const renderEducation = () => {
    if (!mainEducation && otherEducation.length === 0) return null;
    const mainTitle = mainEducation
      ? [mainEducation.institution?.trim(), levelLabel].filter(Boolean).join(" – ")
      : "";
    const isAlumnus = educationState === "STATE_C_ALUMNUS" || mainEducation?.state === "STATE_C_ALUMNUS";
    const mainDates = mainEducation
      ? isAlumnus
        ? (mainEducation.endDate?.trim() || mainEducation.startDate?.trim() || "")
        : formatDateRange(mainEducation.startDate, mainEducation.endDate, mainEducation.isCurrent)
      : "";
    const mainProgram = mainEducation?.program?.trim() || "";
    const track = specializationTrack?.trim() || "";
    return (
    <section
      key="education"
      onClick={onSectionClick ? () => onSectionClick("education") : undefined}
      className={`group relative ${isCompact ? "mb-2" : "mb-3"} ${
        onSectionClick
          ? "cursor-pointer hover:outline hover:outline-1 hover:outline-ink hover:bg-raised rounded transition-all print:cursor-default print:outline-none print:bg-transparent"
          : ""
      }`}
    >
      {onSectionClick && (
        <span className="absolute top-0 right-1 hidden group-hover:inline-flex group-focus-within:inline-flex text-[12px] font-medium font-sans bg-ink text-paper px-1.5 py-0.5 rounded-control pointer-events-none print:hidden">
          Click to edit
        </span>
      )}

      <div
        className={`font-bold uppercase tracking-wider text-gray-900 border-b border-gray-800 pb-0.5 ${
          isCompact ? "mb-1" : "mb-1.5"
        }`}
        style={{ fontSize: isCompact ? "10pt" : "10.5pt" }}
      >
        Education
      </div>

      {/* Main school entry (id "edu-main"), program line comes from the entry itself */}
      {mainEducation && (
        <div className={isCompact ? "mb-1.5" : "mb-2"}>
          {(mainTitle || mainDates) && (
            <div className="flex justify-between items-baseline">
              <span className="font-bold text-gray-900" style={{ fontSize: isCompact ? "9.5pt" : "10pt" }}>
                {renderField ? (
                  <>
                    {renderField(
                      {
                        id: `education.${mainEducation.id}.institution`,
                        value: mainEducation.institution?.trim() || "",
                        placeholder: "42 Abu Dhabi",
                        meta: { eduId: mainEducation.id, field: "institution", ariaLabel: "Edit Institution" },
                      },
                      mainEducation.institution?.trim() || "42 Abu Dhabi"
                    )}
                    {levelLabel && <span> – {levelLabel}</span>}
                  </>
                ) : (
                  mainTitle
                )}
              </span>
              {mainDates && (
                <span className="text-gray-800 italic" style={{ fontSize: isCompact ? "9pt" : "9.5pt" }}>
                  {renderField
                    ? renderField(
                        {
                          id: `education.${mainEducation.id}.dates`,
                          value: mainDates,
                          placeholder: "Dates",
                          meta: { eduId: mainEducation.id, field: "dates", ariaLabel: "Edit Attendance Dates" },
                        },
                        mainDates
                      )
                    : mainDates}
                </span>
              )}
            </div>
          )}

          {educationState === "STATE_A_CORE" ? (
            mainProgram && (
              <div className="text-gray-800" style={{ fontSize: isCompact ? "9pt" : "9.5pt" }}>
                <span>
                  {renderField
                    ? renderField(
                        {
                          id: `education.${mainEducation.id}.program`,
                          value: mainProgram,
                          placeholder: "Core Curriculum Program",
                          meta: { eduId: mainEducation.id, field: "program", ariaLabel: "Edit Program" },
                        },
                        mainProgram
                      )
                    : mainProgram}
                </span>
              </div>
            )
          ) : (
            (mainProgram || track) && (
              <div className="text-gray-800" style={{ fontSize: isCompact ? "9pt" : "9.5pt" }}>
                {mainProgram && (
                  <div>
                    {renderField
                      ? renderField(
                          {
                            id: `education.${mainEducation.id}.program`,
                            value: mainProgram,
                            placeholder: "Program",
                            meta: { eduId: mainEducation.id, field: "program", ariaLabel: "Edit Program" },
                          },
                          mainProgram
                        )
                      : mainProgram}
                  </div>
                )}
                {track && <div>{formatSpecializationTrack(track)}</div>}
              </div>
            )
          )}
        </div>
      )}

      {/* Other education entries */}
      {otherEducation.map((edu) => {
        const dates = formatDateRange(edu.startDate, edu.endDate, edu.isCurrent);
        const detail = edu.degree?.trim() || edu.program?.trim() || "";
        return (
          <div key={edu.id} className={isCompact ? "mb-1.5" : "mb-2"}>
            {(edu.institution?.trim() || dates) && (
              <div className="flex justify-between items-baseline">
                <span className="font-bold text-gray-900" style={{ fontSize: isCompact ? "9.5pt" : "10pt" }}>
                  {renderField
                    ? renderField(
                        {
                          id: `education.${edu.id}.institution`,
                          value: edu.institution?.trim() || "",
                          placeholder: "University Name",
                          meta: { eduId: edu.id, field: "institution", ariaLabel: "Edit Institution" },
                        },
                        edu.institution
                      )
                    : edu.institution}
                </span>
                {dates && (
                  <span className="text-gray-800 italic" style={{ fontSize: isCompact ? "9pt" : "9.5pt" }}>
                    {renderField
                      ? renderField(
                          {
                            id: `education.${edu.id}.dates`,
                            value: dates,
                            placeholder: "Dates",
                            meta: { eduId: edu.id, field: "dates", ariaLabel: "Edit Dates" },
                          },
                          dates
                        )
                      : dates}
                  </span>
                )}
              </div>
            )}
            {detail && (
              <div className="text-gray-800" style={{ fontSize: isCompact ? "9pt" : "9.5pt" }}>
                {renderField
                  ? renderField(
                      {
                        id: `education.${edu.id}.program`,
                        value: detail,
                        placeholder: "Degree / Program",
                        meta: { eduId: edu.id, field: "program", ariaLabel: "Edit Program" },
                      },
                      detail
                    )
                  : detail}
              </div>
            )}
          </div>
        );
      })}
    </section>
    );
  };

  const renderExperience = () => {
    const hasExperience = Boolean(experience && experience.length > 0);
    if (!showExperience || (!hasExperience && !renderField)) return null;

    return (
      <section
        key="experience"
        onClick={onSectionClick ? () => onSectionClick("experience") : undefined}
        className={`group relative ${isCompact ? "mb-2" : "mb-3"} ${
          onSectionClick
            ? "cursor-pointer hover:outline hover:outline-1 hover:outline-ink hover:bg-raised rounded transition-all print:cursor-default print:outline-none print:bg-transparent"
            : ""
        }`}
      >
        {onSectionClick && (
          <span className="absolute top-0 right-1 hidden group-hover:inline-flex group-focus-within:inline-flex text-[12px] font-medium font-sans bg-ink text-paper px-1.5 py-0.5 rounded-control pointer-events-none print:hidden">
            Click to edit
          </span>
        )}

        <div
          className={`font-bold uppercase tracking-wider text-gray-900 border-b border-gray-800 pb-0.5 ${
            isCompact ? "mb-1" : "mb-1.5"
          }`}
          style={{ fontSize: isCompact ? "10pt" : "10.5pt" }}
        >
          Experience
        </div>

        {!hasExperience && renderField && (
          <div className="py-2">
            {renderField(
              {
                id: "experience.add-first",
                value: "",
                type: "action",
                placeholder: "+ Add position",
                meta: { section: "experience", action: "addExperience" },
              },
              null
            )}
          </div>
        )}

        {hasExperience &&
          (experience || []).map((exp) => {
            const dates = formatDateRange(exp.startDate, exp.endDate, exp.isCurrent);
            const expBullets = nonEmptyBullets(exp.bulletPoints);
            return (
              <div key={exp.id} className={isCompact ? "mb-2" : "mb-2.5"}>
                <div className="flex justify-between items-baseline">
                  <span className="font-bold text-gray-900" style={{ fontSize: isCompact ? "9.5pt" : "10pt" }}>
                    {exp.company}
                  </span>
                  {dates && (
                    <span className="text-gray-800 italic" style={{ fontSize: isCompact ? "9pt" : "9.5pt" }}>
                      {dates}
                    </span>
                  )}
                </div>
                {(exp.role || exp.location) && (
                  <div className="flex justify-between items-baseline mb-0.5">
                    <span className="italic text-gray-800" style={{ fontSize: isCompact ? "9pt" : "9.5pt" }}>
                      {exp.role}
                    </span>
                    {exp.location && (
                      <span className="italic text-gray-600" style={{ fontSize: isCompact ? "8.5pt" : "9pt" }}>
                        {exp.location}
                      </span>
                    )}
                  </div>
                )}
                {expBullets.length > 0 && (
                  <ul
                    className={isCompact ? "list-disc ml-4 space-y-0 text-gray-800" : "list-disc ml-5 space-y-0.5 text-gray-800"}
                    style={{ fontSize: isCompact ? "9pt" : "9.5pt" }}
                  >
                    {expBullets.map((bullet, idx) => (
                      <li key={idx} className="leading-snug">
                        {removeEmDashes(bullet)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}

        {hasExperience && renderField && (
          <div className="mt-1.5 pt-1 border-t border-dashed border-gray-200">
            {renderField(
              {
                id: "experience.add-another",
                value: "",
                type: "action",
                placeholder: "+ Add position",
                meta: { section: "experience", action: "addExperience" },
              },
              null
            )}
          </div>
        )}
      </section>
    );
  };

  const renderProjects = () => {
    const hasProjects = Boolean(projects && projects.length > 0);
    if (!hasProjects && !renderField) return null;

    return (
      <section
        key="projects"
        onClick={onSectionClick ? () => onSectionClick("projects") : undefined}
        className={`group relative ${isCompact ? "mb-2" : "mb-3"} ${
          onSectionClick
            ? "cursor-pointer hover:outline hover:outline-1 hover:outline-ink hover:bg-raised rounded transition-all print:cursor-default print:outline-none print:bg-transparent"
            : ""
        }`}
      >
        {onSectionClick && (
          <span className="absolute top-0 right-1 hidden group-hover:inline-flex group-focus-within:inline-flex text-[12px] font-medium font-sans bg-ink text-paper px-1.5 py-0.5 rounded-control pointer-events-none print:hidden">
            Click to edit
          </span>
        )}

        <div
          className={`font-bold uppercase tracking-wider text-gray-900 border-b border-gray-800 pb-0.5 ${
            isCompact ? "mb-1" : "mb-1.5"
          }`}
          style={{ fontSize: isCompact ? "10pt" : "10.5pt" }}
        >
          Selected Projects
        </div>

        {!hasProjects && renderField && (
          <div className="py-2">
            {renderField(
              {
                id: "projects.add-first",
                value: "",
                type: "action",
                placeholder: "+ Add your first project",
                meta: { section: "projects", action: "addProject" },
              },
              null
            )}
          </div>
        )}

        {hasProjects &&
          (projects || []).map((proj) => {
            const cleanTitle = proj.name.includes("|") ? proj.name.split("|")[0].trim() : proj.name;
            const cleanStack =
              proj.name.includes("|") && (!proj.techStack || proj.techStack === "C")
                ? proj.name.split("|").slice(1).join("|").trim()
                : proj.techStack;

            const allBullets = proj.bulletPoints || [];
            const nonBlankBullets = nonEmptyBullets(proj.bulletPoints);
            const bulletsToIterate = renderField ? allBullets : nonBlankBullets;

            return (
              <div key={proj.id} className={isCompact ? "mb-1.5" : "mb-2"}>
                <div className="flex justify-between items-baseline mb-0.5">
                  <div>
                    <span className="font-bold text-gray-900" style={{ fontSize: isCompact ? "9.5pt" : "10pt" }}>
                      {renderField
                        ? renderField(
                            {
                              id: `project.${proj.id}.name`,
                              value: cleanTitle,
                              placeholder: "Project Name",
                              meta: { projectId: proj.id, field: "name", ariaLabel: "Edit Project Name" },
                            },
                            cleanTitle
                          )
                        : cleanTitle}
                    </span>
                    {(cleanStack || renderField) && (
                      <span className="text-gray-600 font-normal ml-1" style={{ fontSize: isCompact ? "9pt" : "9.5pt" }}>
                        |{" "}
                        {renderField
                          ? renderField(
                              {
                                id: `project.${proj.id}.techStack`,
                                value: cleanStack || "",
                                placeholder: "Tech Stack",
                                meta: { projectId: proj.id, field: "techStack", ariaLabel: "Edit Tech Stack" },
                              },
                              cleanStack || "Tech Stack"
                            )
                          : cleanStack}
                      </span>
                    )}
                  </div>
                  {(proj.date || renderField) && (
                    <span className="text-gray-800 italic shrink-0 ml-2" style={{ fontSize: isCompact ? "9pt" : "9.5pt" }}>
                      {renderField
                        ? renderField(
                            {
                              id: `project.${proj.id}.date`,
                              value: proj.date || "",
                              placeholder: "Date",
                              meta: { projectId: proj.id, field: "date", ariaLabel: "Edit Project Date" },
                            },
                            proj.date || "Date"
                          )
                        : proj.date}
                    </span>
                  )}
                </div>

                {/* Bullets */}
                {bulletsToIterate.length === 0 && renderField && (
                  <div className="my-1 ml-4">
                    {renderField(
                      {
                        id: `project.${proj.id}.addFirstBullet`,
                        value: "",
                        type: "action",
                        placeholder: "+ Add your first bullet point",
                        meta: { projectId: proj.id, action: "addFirstBullet" },
                      },
                      null
                    )}
                  </div>
                )}

                {bulletsToIterate.length > 0 && (
                  <ul
                    className={isCompact ? "list-disc ml-4 space-y-0 text-gray-800" : "list-disc ml-5 space-y-0.5 text-gray-800"}
                    style={{ fontSize: isCompact ? "9pt" : "9.5pt" }}
                  >
                    {bulletsToIterate.map((bullet, idx) => {
                      const realIdx = renderField ? idx : (allBullets.indexOf(bullet) !== -1 ? allBullets.indexOf(bullet) : idx);
                      const defaultNode = removeEmDashes(bullet);
                      return (
                        <li key={realIdx} className="leading-snug">
                          {renderField
                            ? renderField(
                                {
                                  id: `project.${proj.id}.bullet.${realIdx}`,
                                  value: bullet,
                                  type: "textarea",
                                  placeholder: "Describe what you built and the outcome...",
                                  meta: { projectId: proj.id, bulletIndex: realIdx },
                                },
                                defaultNode
                              )
                            : defaultNode}
                        </li>
                      );
                    })}
                  </ul>
                )}

                {renderField && bulletsToIterate.length > 0 && (
                  <div className="mt-0.5 ml-5">
                    {renderField(
                      {
                        id: `project.${proj.id}.addBullet`,
                        value: "",
                        type: "action",
                        placeholder: "+ Add bullet",
                        meta: { projectId: proj.id, action: "addBullet" },
                      },
                      null
                    )}
                  </div>
                )}
              </div>
            );
          })}

        {hasProjects && renderField && (
          <div className="mt-2 pt-1 border-t border-dashed border-gray-200">
            {renderField(
              {
                id: "projects.add-another",
                value: "",
                type: "action",
                placeholder: "+ Add project",
                meta: { section: "projects", action: "addProject" },
              },
              null
            )}
          </div>
        )}
      </section>
    );
  };

  const renderSkills = () => {
    if (!skills && !renderField) return null;
    const categoryConfigs: {
      key: keyof typeof DR_WISSAM_SKILL_LABELS;
      label: string;
      items: string[];
    }[] = [
      { key: "languages", label: DR_WISSAM_SKILL_LABELS.languages, items: (skills?.languages || []).filter(hasText) },
      { key: "developerTools", label: DR_WISSAM_SKILL_LABELS.developerTools, items: (skills?.developerTools || []).filter(hasText) },
      { key: "technologiesFrameworks", label: DR_WISSAM_SKILL_LABELS.technologiesFrameworks, items: (skills?.technologiesFrameworks || []).filter(hasText) },
      { key: "projectManagementTools", label: DR_WISSAM_SKILL_LABELS.projectManagementTools, items: (skills?.projectManagementTools || []).filter(hasText) },
    ];
    const categoriesToRender = renderField
      ? categoryConfigs
      : categoryConfigs.filter((c) => c.items.length > 0);

    if (categoriesToRender.length === 0) return null;

    return (
      <section
        key="skills"
        onClick={onSectionClick ? () => onSectionClick("skills") : undefined}
        className={`group relative ${isCompact ? "mb-2" : "mb-3"} ${
          onSectionClick
            ? "cursor-pointer hover:outline hover:outline-1 hover:outline-ink hover:bg-raised rounded transition-all print:cursor-default print:outline-none print:bg-transparent"
            : ""
        }`}
      >
        {onSectionClick && (
          <span className="absolute top-0 right-1 hidden group-hover:inline-flex group-focus-within:inline-flex text-[12px] font-medium font-sans bg-ink text-paper px-1.5 py-0.5 rounded-control pointer-events-none print:hidden">
            Click to edit
          </span>
        )}

        <div
          className={`font-bold uppercase tracking-wider text-gray-900 border-b border-gray-800 pb-0.5 ${
            isCompact ? "mb-1" : "mb-1.5"
          }`}
          style={{ fontSize: isCompact ? "10pt" : "10.5pt" }}
        >
          Technical Skills
        </div>

        <div
          className={isCompact ? "space-y-0 text-gray-800" : "space-y-0.5 text-gray-800"}
          style={{ fontSize: isCompact ? "9pt" : "9.5pt", lineHeight: isCompact ? "1.3" : "1.4" }}
        >
          {categoriesToRender.map(({ key, label, items }) => (
            <div key={label}>
              <span className="font-bold text-gray-900">{label}:</span>{" "}
              {renderField
                ? renderField(
                    {
                      id: `skills.${key}`,
                      type: "comma-list",
                      value: items.join(", "),
                      placeholder: `+ Add ${label}`,
                      meta: { categoryKey: key, categoryLabel: label },
                    },
                    items.join(", ")
                  )
                : items.join(", ")}
            </div>
          ))}
        </div>
      </section>
    );
  };

  const renderCoursework = () => {
    const hasCoursework = Boolean(coursework && coursework.length > 0);
    if (!hasCoursework && !renderField) return null;

    return (
      <section
        key="coursework"
        onClick={onSectionClick ? () => onSectionClick("coursework") : undefined}
        className={`group relative ${isCompact ? "mb-2" : "mb-3"} ${
          onSectionClick
            ? "cursor-pointer hover:outline hover:outline-1 hover:outline-ink hover:bg-raised rounded transition-all print:cursor-default print:outline-none print:bg-transparent"
            : ""
        }`}
      >
        {onSectionClick && (
          <span className="absolute top-0 right-1 hidden group-hover:inline-flex group-focus-within:inline-flex text-[12px] font-medium font-sans bg-ink text-paper px-1.5 py-0.5 rounded-control pointer-events-none print:hidden">
            Click to edit
          </span>
        )}

        <div
          className={`font-bold uppercase tracking-wider text-gray-900 border-b border-gray-800 pb-0.5 ${
            isCompact ? "mb-1" : "mb-1.5"
          }`}
          style={{ fontSize: isCompact ? "10pt" : "10.5pt" }}
        >
          Relevant Coursework and Workshops
        </div>

        {!hasCoursework && renderField && (
          <div className="py-2">
            {renderField(
              {
                id: "coursework.add-first",
                value: "",
                type: "action",
                placeholder: "+ Add course or workshop",
                meta: { section: "coursework", action: "addCoursework" },
              },
              null
            )}
          </div>
        )}

        {hasCoursework && (
          <div
            className={isCompact ? "space-y-0.5 text-gray-800" : "space-y-1 text-gray-800"}
            style={{ fontSize: isCompact ? "9pt" : "9.5pt" }}
          >
            {(coursework || []).map((cw) => (
              <div key={cw.id} className="flex justify-between items-baseline leading-snug">
                <span>
                  {renderField
                    ? renderField(
                        {
                          id: `coursework.${cw.id}.title`,
                          value: cw.title || "",
                          placeholder: "Course or Workshop Title",
                          meta: { courseworkId: cw.id, field: "title", ariaLabel: "Edit Coursework Title" },
                        },
                        cw.title
                      )
                    : cw.title}
                </span>
                {cw.date && (
                  <span className="text-gray-800 italic shrink-0 ml-2" style={{ fontSize: isCompact ? "8.5pt" : "9pt" }}>
                    {renderField
                      ? renderField(
                          {
                            id: `coursework.${cw.id}.date`,
                            value: cw.date || "",
                            placeholder: "May 2024",
                            meta: { courseworkId: cw.id, field: "date", ariaLabel: "Edit Coursework Date" },
                          },
                          cw.date
                        )
                      : cw.date}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {hasCoursework && renderField && (
          <div className="mt-1.5">
            {renderField(
              {
                id: "coursework.add-another",
                value: "",
                type: "action",
                placeholder: "+ Add course or workshop",
                meta: { section: "coursework", action: "addCoursework" },
              },
              null
            )}
          </div>
        )}
      </section>
    );
  };

  const renderExtracurriculars = () => {
    const hasExtracurriculars = Boolean(extracurriculars && extracurriculars.length > 0);
    if (showExtracurriculars === false || (!hasExtracurriculars && !renderField)) return null;

    return (
      <section
        key="extracurriculars"
        onClick={onSectionClick ? () => onSectionClick("extracurriculars") : undefined}
        className={`group relative ${isCompact ? "mb-2" : "mb-3"} ${
          onSectionClick
            ? "cursor-pointer hover:outline hover:outline-1 hover:outline-ink hover:bg-raised rounded transition-all print:cursor-default print:outline-none print:bg-transparent"
            : ""
        }`}
      >
        {onSectionClick && (
          <span className="absolute top-0 right-1 hidden group-hover:inline-flex group-focus-within:inline-flex text-[12px] font-medium font-sans bg-ink text-paper px-1.5 py-0.5 rounded-control pointer-events-none print:hidden">
            Click to edit
          </span>
        )}

        <div
          className={`font-bold uppercase tracking-wider text-gray-900 border-b border-gray-800 pb-0.5 ${
            isCompact ? "mb-1" : "mb-1.5"
          }`}
          style={{ fontSize: isCompact ? "10pt" : "10.5pt" }}
        >
          Extracurricular Activities
        </div>

        {!hasExtracurriculars && renderField && (
          <div className="py-2">
            {renderField(
              {
                id: "extracurriculars.add-first",
                value: "",
                type: "action",
                placeholder: "+ Add activity",
                meta: { section: "extracurriculars", action: "addExtracurricular" },
              },
              null
            )}
          </div>
        )}

        {hasExtracurriculars &&
          (extracurriculars || []).map((ec) => {
            const ecBullets = nonEmptyBullets(ec.bulletPoints);
            return (
              <div key={ec.id} className={isCompact ? "mb-1.5" : "mb-2"}>
                <div className="flex justify-between items-baseline">
                  <span className="font-bold text-gray-900" style={{ fontSize: isCompact ? "9.5pt" : "10pt" }}>
                    {ec.organization}
                  </span>
                  {formatDateRange(ec.startDate, ec.endDate, ec.isCurrent) && (
                    <span className="text-gray-800 italic" style={{ fontSize: isCompact ? "9pt" : "9.5pt" }}>
                      {formatDateRange(ec.startDate, ec.endDate, ec.isCurrent)}
                    </span>
                  )}
                </div>
                {ec.role && (
                  <div className="italic text-gray-800 mb-0.5" style={{ fontSize: isCompact ? "9pt" : "9.5pt" }}>
                    {ec.role}
                  </div>
                )}
                {ecBullets.length > 0 && (
                  <ul
                    className={isCompact ? "list-disc ml-4 space-y-0 text-gray-800" : "list-disc ml-5 space-y-0.5 text-gray-800"}
                    style={{ fontSize: isCompact ? "9pt" : "9.5pt" }}
                  >
                    {ecBullets.map((bullet, idx) => (
                      <li key={idx} className="leading-snug">
                        {removeEmDashes(bullet)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}

        {hasExtracurriculars && renderField && (
          <div className="mt-1.5 pt-1 border-t border-dashed border-gray-200">
            {renderField(
              {
                id: "extracurriculars.add-another",
                value: "",
                type: "action",
                placeholder: "+ Add activity",
                meta: { section: "extracurriculars", action: "addExtracurricular" },
              },
              null
            )}
          </div>
        )}
      </section>
    );
  };

  return (
    <div
      ref={sheetRef}
      data-ui={dataUi ? "" : undefined}
      className="cv-sheet relative bg-white text-gray-950 font-sans mx-auto print:shadow-none print:m-0"
      style={{
        width: "210mm",
        minHeight: "297mm",
        fontFamily: fontPrimary,
        fontSize: isCompact ? "9.5pt" : "10pt",
        lineHeight: isCompact ? "1.25" : "1.35",
        padding: isCompact ? "10mm 12mm 10mm 12mm" : "12mm 15mm 12mm 15mm",
        boxSizing: "border-box",
        color: "#111827",
        transformOrigin: "top center",
        transform: scale !== 1 ? `scale(${scale})` : undefined,
      }}
    >
      {/* Dashed line at the end of page 1 (screen only, hidden in print) */}
      {isOverflow && (
        <div
          className="absolute left-0 right-0 border-b-2 border-dashed border-ink pointer-events-none z-30 print:hidden flex items-center justify-end px-3"
          style={{ top: "1123px" }}
        >
          <span className="text-[11px] font-semibold text-ink bg-ground border border-control px-2 py-0.5 rounded shadow-sm -mt-6">
            End of page 1
          </span>
        </div>
      )}

      {/* Inner content, measured by CleanTemplate */}
      <div ref={contentRef} className="w-full">
      {/* ============================================================== */}
      {/* HEADER: Centered Name, Subtitle, Contact Strip                 */}
      {/* ============================================================== */}
      <header
        onClick={onSectionClick ? () => onSectionClick("contact") : undefined}
        className={`group relative ${isCompact ? "text-center mb-2.5 pb-0.5" : "text-center mb-4 pb-1"} ${
          onSectionClick
            ? "cursor-pointer hover:outline hover:outline-1 hover:outline-ink hover:bg-raised rounded transition-all print:cursor-default print:outline-none print:bg-transparent"
            : ""
        }`}
      >
        {onSectionClick && (
          <span className="absolute top-0 right-1 hidden group-hover:inline-flex group-focus-within:inline-flex text-[12px] font-medium font-sans bg-ink text-paper px-1.5 py-0.5 rounded-control pointer-events-none print:hidden">
            Click to edit
          </span>
        )}

        <NameTag
          className="font-bold tracking-tight text-gray-900"
          style={{ fontSize: isCompact ? "18pt" : "20pt", lineHeight: "1.1", marginBottom: "2px" }}
        >
          {renderField
            ? renderField(
                {
                  id: "contact.fullName",
                  value: contact.fullName || "",
                  placeholder: "Your Name",
                  meta: { ariaLabel: "Edit Full Name" },
                },
                contact.fullName || "Your Name"
              )
            : contact.fullName || "Your Name"}
        </NameTag>

        {subtitle && (
          <div
            className="text-gray-700 font-semibold mb-0.5"
            style={{ fontSize: isCompact ? "10pt" : "11pt" }}
          >
            {renderField ? (
              <>
                {renderField(
                  {
                    id: "contact.targetRole",
                    value: data.targetRole || "",
                    placeholder: DR_WISSAM_DEFAULT_HEADLINE,
                    meta: { ariaLabel: "Edit Target Role" },
                  },
                  data.targetRole || DR_WISSAM_DEFAULT_HEADLINE
                )}
                {levelLabel && <span> – {levelLabel}</span>}
              </>
            ) : (
              subtitle
            )}
          </div>
        )}

        {contactItems.length > 0 && (
          <div
            className="flex items-center justify-center flex-wrap text-gray-600 gap-x-2"
            style={{ fontSize: isCompact ? "8.5pt" : "9pt" }}
          >
            {contactItems.map((item, idx) => (
              <React.Fragment key={item.key}>
                {idx > 0 && <span>|</span>}
                {item.isLink ? (
                  renderField ? (
                    <span className="inline-flex items-center text-gray-700">
                      {item.icon === "github" && (
                        <svg
                          className="w-3.5 h-3.5 inline-block -mt-0.5 mr-1"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                          aria-hidden="true"
                        >
                          <path
                            fillRule="evenodd"
                            clipRule="evenodd"
                            d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                          />
                        </svg>
                      )}
                      {item.icon === "linkedin" && (
                        <svg
                          className="w-3.5 h-3.5 inline-block -mt-0.5 mr-1"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                          aria-hidden="true"
                        >
                          <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 8.76c-.97 0-1.75-.79-1.75-1.76s.78-1.75 1.75-1.75 1.75.78 1.75 1.75-.78 1.76-1.75 1.76m1.39 9.74v-8.37H5.07v8.37h2.78z" />
                        </svg>
                      )}
                      {renderField(
                        {
                          id: item.key === "github" ? "contact.githubUrl" : "contact.linkedinUrl",
                          value: item.key === "github" ? (contact.githubUrl || item.text) : (contact.linkedinUrl || item.text),
                          placeholder: item.key === "github" ? "+ GitHub" : "+ LinkedIn",
                          meta: {
                            field: item.key === "github" ? "githubUrl" : "linkedinUrl",
                            ariaLabel: item.key === "github" ? "Edit GitHub URL" : "Edit LinkedIn URL",
                          },
                        },
                        <span>{item.text || (item.key === "github" ? "+ GitHub" : "+ LinkedIn")}</span>
                      )}
                    </span>
                  ) : (
                    <a
                      href={`https://${item.text}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center hover:underline text-gray-700"
                    >
                      {item.icon === "github" && (
                        <svg
                          className="w-3.5 h-3.5 inline-block -mt-0.5 mr-1"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                          aria-hidden="true"
                        >
                          <path
                            fillRule="evenodd"
                            clipRule="evenodd"
                            d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                          />
                        </svg>
                      )}
                      {item.icon === "linkedin" && (
                        <svg
                          className="w-3.5 h-3.5 inline-block -mt-0.5 mr-1"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                          aria-hidden="true"
                        >
                          <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 8.76c-.97 0-1.75-.79-1.75-1.76s.78-1.75 1.75-1.75 1.75.78 1.75 1.75-.78 1.76-1.75 1.76m1.39 9.74v-8.37H5.07v8.37h2.78z" />
                        </svg>
                      )}
                      <span>{item.text}</span>
                    </a>
                  )
                ) : (
                  <span>
                    {renderField
                      ? renderField(
                          {
                            id: item.key === "email" ? "contact.email" : "contact.phoneNumber",
                            value: item.key === "email" ? (contact.email || item.text) : (contact.phoneNumber || item.text),
                            type: item.key === "email" ? "email" : "tel",
                            placeholder: item.key === "email" ? "+ Add email" : "+ Add phone",
                            meta: {
                              field: item.key === "email" ? "email" : "phoneNumber",
                              ariaLabel: item.key === "email" ? "Edit Email" : "Edit Phone Number",
                            },
                          },
                          item.text || (item.key === "email" ? "+ Add email" : "+ Add phone")
                        )
                      : item.text}
                  </span>
                )}
              </React.Fragment>
            ))}
          </div>
        )}
      </header>

      {/* ============================================================== */}
      {/* DYNAMIC SECTIONS ORDERED BY cvData.sectionOrder               */}
      {/* ============================================================== */}
      {(data.sectionOrder && data.sectionOrder.length > 0
        ? data.sectionOrder
        : DEFAULT_SECTION_ORDER
      ).map((secId) => {
        switch (secId) {
          case "education":
            return renderEducation();
          case "experience":
            return renderExperience();
          case "projects":
            return renderProjects();
          case "skills":
            return renderSkills();
          case "coursework":
            return renderCoursework();
          case "extracurriculars":
            return renderExtracurriculars();
          default:
            return null;
        }
      })}
      </div>

    </div>
  );
}
