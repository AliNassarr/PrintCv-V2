// The printed CV itself: pure markup with no hooks and no browser code, so it can render on the
// server (landing page) as well as inside CleanTemplate (studio preview and PrintableCV).
import React from "react";
import { CVData, DEFAULT_SECTION_ORDER } from "@/types/resume";
import { removeEmDashes } from "@/lib/sanitizer";
import { MAIN_EDUCATION_ID } from "@/lib/cv-constants";

const hasText = (value: unknown): boolean =>
  value !== undefined && value !== null && String(value).trim() !== "";

// A level only counts if it is a positive number or a non-empty string other than "0".
const hasLevel = (value: unknown): boolean => {
  if (typeof value === "number") return Number.isFinite(value) && value > 0;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed !== "" && trimmed !== "0";
  }
  return false;
};

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


// 1027px printable A4 vertical budget at 96 DPI (normal density: 297mm - 24mm = 273mm; compact: 297mm - 20mm = 277mm)
export const PRINTABLE_BUDGET_PX = 1027;
export const getPrintableBudgetPx = (density?: "compact" | "standard" | string) =>
  density === "compact" ? 1047 : 1027;

export interface CVSheetProps {
  data: CVData;
  scale?: number;
  isOverflow?: boolean;
  onSectionClick?: (id: TemplateSectionId) => void;
  nameAs?: "h1" | "p";      // "p" on the landing page and in the studio preview; PrintableCV keeps "h1"
  dataUi?: boolean;          // marks the sheet as a product fragment for the taste inspector
  sheetRef?: React.Ref<HTMLDivElement>;
  contentRef?: React.Ref<HTMLDivElement>;
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

  const fontPrimary = "'Calibri', 'Calibri Fallback', 'Arial', sans-serif";

  const mainEducation = education?.find((e) => e.id === MAIN_EDUCATION_ID);
  const otherEducation = (education || []).filter((e) => e.id !== MAIN_EDUCATION_ID);
  const level = hasLevel(contact.level) ? contact.level : mainEducation?.level;
  const levelLabel = hasLevel(level) ? `Level ${level}` : "";

  const targetRole = data.targetRole?.trim() || "";
  // The level is shown on the school line. Only put it under the name when there is no school line.
  const subtitle =
    mainEducation || targetRole.includes("Level")
      ? targetRole
      : [targetRole, levelLabel].filter(Boolean).join(" – ");

  const stripProtocol = (url?: string) => (url || "").trim().replace(/^https?:\/\//, "");
  const contactItems: { text: string; isLink?: boolean }[] = [
    { text: contact.location?.trim() || "" },
    { text: contact.email?.trim() || "" },
    { text: contact.phoneNumber?.trim() || "" },
    { text: stripProtocol(contact.linkedinUrl), isLink: true },
    { text: stripProtocol(contact.githubUrl), isLink: true },
  ].filter((item) => item.text);

  const HeadingTag = (dataUi ? "div" : "h2") as React.ElementType;

  const sectionClass = (extra: string = "") =>
    `group relative ${extra} ${
      onSectionClick
        ? "cursor-pointer hover:outline hover:outline-1 hover:outline-ink hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-1 rounded transition-all print:cursor-default print:outline-none print:bg-transparent"
        : ""
    }`;

  const renderEducation = () => {
    if (!mainEducation && otherEducation.length === 0) return null;
    const mainTitle = mainEducation
      ? [mainEducation.institution?.trim(), levelLabel].filter(Boolean).join(" – ")
      : "";
    const mainDates = mainEducation
      ? formatDateRange(mainEducation.startDate, mainEducation.endDate, mainEducation.isCurrent)
      : "";
    const mainProgram = mainEducation?.program?.trim() || "";
    const track = specializationTrack?.trim() || "";
    return (
    <section
      key="education"
      role={onSectionClick ? "button" : undefined}
      tabIndex={onSectionClick ? 0 : undefined}
      aria-label={onSectionClick ? "Edit education section" : undefined}
      onClick={onSectionClick ? () => onSectionClick("education") : undefined}
      onKeyDown={onSectionClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSectionClick("education"); } } : undefined}
      className={sectionClass(isCompact ? "mb-2" : "mb-3")}
    >
      {onSectionClick && (
        <span className="absolute top-0 right-1 hidden group-hover:inline-flex group-focus-within:inline-flex text-[12px] font-medium font-sans bg-ink text-paper px-1.5 py-0.5 rounded-control pointer-events-none print:hidden">
          Click to edit
        </span>
      )}

      <HeadingTag
        className={`font-bold uppercase tracking-wider text-gray-900 border-b border-gray-800 pb-0.5 ${
          isCompact ? "mb-1" : "mb-1.5"
        }`}
        style={{ fontSize: isCompact ? "10pt" : "10.5pt" }}
      >
        Education
      </HeadingTag>

      {/* Main school entry (id "edu-main"), program line comes from the entry itself */}
      {mainEducation && (
        <div className={isCompact ? "mb-1.5" : "mb-2"}>
          {(mainTitle || mainDates) && (
            <div className="flex justify-between items-baseline">
              <span className="font-bold text-gray-900" style={{ fontSize: isCompact ? "9.5pt" : "10pt" }}>
                {mainTitle}
              </span>
              {mainDates && (
                <span className="text-gray-800 italic" style={{ fontSize: isCompact ? "9pt" : "9.5pt" }}>
                  {mainDates}
                </span>
              )}
            </div>
          )}

          {educationState === "STATE_A_CORE" ? (
            (mainProgram || contact.location) && (
              <div className="flex justify-between items-baseline text-gray-800" style={{ fontSize: isCompact ? "9pt" : "9.5pt" }}>
                <span>{mainProgram}</span>
                {contact.location && (
                  <span className="italic text-gray-600" style={{ fontSize: isCompact ? "8.5pt" : "9pt" }}>{contact.location}</span>
                )}
              </div>
            )
          ) : (
            (mainProgram || track) && (
              <div className="text-gray-800" style={{ fontSize: isCompact ? "9pt" : "9.5pt" }}>
                {mainProgram && <div>{mainProgram}</div>}
                {track && <div className="italic text-gray-700">Specialization: {track}</div>}
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
                  {edu.institution}
                </span>
                {dates && (
                  <span className="text-gray-800 italic" style={{ fontSize: isCompact ? "9pt" : "9.5pt" }}>
                    {dates}
                  </span>
                )}
              </div>
            )}
            {detail && (
              <div className="text-gray-800" style={{ fontSize: isCompact ? "9pt" : "9.5pt" }}>
                {detail}
              </div>
            )}
          </div>
        );
      })}
    </section>
    );
  };

  const renderExperience = () => {
    if (!showExperience || !experience || experience.length === 0) return null;
    return (
      <section
        key="experience"
        role={onSectionClick ? "button" : undefined}
        tabIndex={onSectionClick ? 0 : undefined}
        aria-label={onSectionClick ? "Edit experience section" : undefined}
        onClick={onSectionClick ? () => onSectionClick("experience") : undefined}
        onKeyDown={onSectionClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSectionClick("experience"); } } : undefined}
        className={sectionClass(isCompact ? "mb-2" : "mb-3")}
      >
        {onSectionClick && (
          <span className="absolute top-0 right-1 hidden group-hover:inline-flex group-focus-within:inline-flex text-[12px] font-medium font-sans bg-ink text-paper px-1.5 py-0.5 rounded-control pointer-events-none print:hidden">
            Click to edit
          </span>
        )}

        <HeadingTag
          className={`font-bold uppercase tracking-wider text-gray-900 border-b border-gray-800 pb-0.5 ${
            isCompact ? "mb-1" : "mb-1.5"
          }`}
          style={{ fontSize: isCompact ? "10pt" : "10.5pt" }}
        >
          Experience
        </HeadingTag>

        {experience.map((exp) => {
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
      </section>
    );
  };

  const renderProjects = () => {
    if (!projects || projects.length === 0) return null;
    return (
      <section
        key="projects"
        role={onSectionClick ? "button" : undefined}
        tabIndex={onSectionClick ? 0 : undefined}
        aria-label={onSectionClick ? "Edit selected projects section" : undefined}
        onClick={onSectionClick ? () => onSectionClick("projects") : undefined}
        onKeyDown={onSectionClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSectionClick("projects"); } } : undefined}
        className={sectionClass(isCompact ? "mb-2" : "mb-3")}
      >
        {onSectionClick && (
          <span className="absolute top-0 right-1 hidden group-hover:inline-flex group-focus-within:inline-flex text-[12px] font-medium font-sans bg-ink text-paper px-1.5 py-0.5 rounded-control pointer-events-none print:hidden">
            Click to edit
          </span>
        )}

        <HeadingTag
          className={`font-bold uppercase tracking-wider text-gray-900 border-b border-gray-800 pb-0.5 ${
            isCompact ? "mb-1" : "mb-1.5"
          }`}
          style={{ fontSize: isCompact ? "10pt" : "10.5pt" }}
        >
          Selected Projects
        </HeadingTag>

        {projects.map((proj) => {
          const cleanTitle = proj.name.includes("|") ? proj.name.split("|")[0].trim() : proj.name;
          const cleanStack =
            proj.name.includes("|") && (!proj.techStack || proj.techStack === "C")
              ? proj.name.split("|").slice(1).join("|").trim()
              : proj.techStack;

          const bulletsToRender = nonEmptyBullets(proj.bulletPoints);

          return (
            <div key={proj.id} className={isCompact ? "mb-1.5" : "mb-2"}>
              <div className="flex justify-between items-baseline mb-0.5">
                <div>
                  <span className="font-bold text-gray-900" style={{ fontSize: isCompact ? "9.5pt" : "10pt" }}>
                    {cleanTitle}
                  </span>
                  {cleanStack && (
                    <span className="text-gray-600 font-normal ml-1" style={{ fontSize: isCompact ? "9pt" : "9.5pt" }}>
                      | {cleanStack}
                    </span>
                  )}
                </div>
                {proj.date && (
                  <span className="text-gray-800 italic shrink-0 ml-2" style={{ fontSize: isCompact ? "9pt" : "9.5pt" }}>
                    {proj.date}
                  </span>
                )}
              </div>

              {bulletsToRender.length > 0 && (
                <ul
                  className={isCompact ? "list-disc ml-4 space-y-0 text-gray-800" : "list-disc ml-5 space-y-0.5 text-gray-800"}
                  style={{ fontSize: isCompact ? "9pt" : "9.5pt" }}
                >
                  {bulletsToRender.map((bullet, idx) => (
                    <li key={idx} className="leading-snug">
                      {removeEmDashes(bullet)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </section>
    );
  };

  const renderSkills = () => {
    if (!skills) return null;
    const skillRows = (
      [
        ["Languages", skills.languages],
        ["Developer Tools", skills.developerTools],
        ["Technologies & Frameworks", skills.technologiesFrameworks],
        ["Project Management Tools", skills.projectManagementTools],
      ] as [string, string[] | undefined][]
    )
      .map(([label, items]) => [label, (items || []).filter(hasText)] as [string, string[]])
      .filter(([, items]) => items.length > 0);
    if (skillRows.length === 0) return null;
    return (
      <section
        key="skills"
        role={onSectionClick ? "button" : undefined}
        tabIndex={onSectionClick ? 0 : undefined}
        aria-label={onSectionClick ? "Edit technical skills section" : undefined}
        onClick={onSectionClick ? () => onSectionClick("skills") : undefined}
        onKeyDown={onSectionClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSectionClick("skills"); } } : undefined}
        className={sectionClass(isCompact ? "mb-2" : "mb-3")}
      >
        {onSectionClick && (
          <span className="absolute top-0 right-1 hidden group-hover:inline-flex group-focus-within:inline-flex text-[12px] font-medium font-sans bg-ink text-paper px-1.5 py-0.5 rounded-control pointer-events-none print:hidden">
            Click to edit
          </span>
        )}

        <HeadingTag
          className={`font-bold uppercase tracking-wider text-gray-900 border-b border-gray-800 pb-0.5 ${
            isCompact ? "mb-1" : "mb-1.5"
          }`}
          style={{ fontSize: isCompact ? "10pt" : "10.5pt" }}
        >
          Technical Skills
        </HeadingTag>

        <div
          className={isCompact ? "space-y-0 text-gray-800" : "space-y-0.5 text-gray-800"}
          style={{ fontSize: isCompact ? "9pt" : "9.5pt", lineHeight: isCompact ? "1.3" : "1.4" }}
        >
          {skillRows.map(([label, items]) => (
            <div key={label}>
              <span className="font-bold text-gray-900">{label}:</span>{" "}
              {items.join(", ")}
            </div>
          ))}
        </div>
      </section>
    );
  };

  const renderCoursework = () => {
    if (!coursework || coursework.length === 0) return null;
    return (
      <section
        key="coursework"
        role={onSectionClick ? "button" : undefined}
        tabIndex={onSectionClick ? 0 : undefined}
        aria-label={onSectionClick ? "Edit coursework section" : undefined}
        onClick={onSectionClick ? () => onSectionClick("coursework") : undefined}
        onKeyDown={onSectionClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSectionClick("coursework"); } } : undefined}
        className={sectionClass(isCompact ? "mb-2" : "mb-3")}
      >
        {onSectionClick && (
          <span className="absolute top-0 right-1 hidden group-hover:inline-flex group-focus-within:inline-flex text-[12px] font-medium font-sans bg-ink text-paper px-1.5 py-0.5 rounded-control pointer-events-none print:hidden">
            Click to edit
          </span>
        )}

        <HeadingTag
          className={`font-bold uppercase tracking-wider text-gray-900 border-b border-gray-800 pb-0.5 ${
            isCompact ? "mb-1" : "mb-1.5"
          }`}
          style={{ fontSize: isCompact ? "10pt" : "10.5pt" }}
        >
          Relevant Coursework and Workshops
        </HeadingTag>

        <ul
          className={isCompact ? "list-disc ml-4 space-y-0 text-gray-800" : "list-disc ml-5 space-y-0.5 text-gray-800"}
          style={{ fontSize: isCompact ? "9pt" : "9.5pt" }}
        >
          {coursework.map((cw) => (
            <li key={cw.id} className="leading-snug">
              <div className="flex justify-between items-baseline">
                <span>{cw.title}</span>
                {cw.date && (
                  <span className="text-gray-700 italic ml-2" style={{ fontSize: isCompact ? "8.5pt" : "9pt" }}>
                    {cw.date}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
    );
  };

  const renderExtracurriculars = () => {
    if (showExtracurriculars === false || !extracurriculars || extracurriculars.length === 0) return null;
    return (
      <section
        key="extracurriculars"
        role={onSectionClick ? "button" : undefined}
        tabIndex={onSectionClick ? 0 : undefined}
        aria-label={onSectionClick ? "Edit extracurricular activities section" : undefined}
        onClick={onSectionClick ? () => onSectionClick("extracurriculars") : undefined}
        onKeyDown={onSectionClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSectionClick("extracurriculars"); } } : undefined}
        className={sectionClass(isCompact ? "mb-2" : "mb-3")}
      >
        {onSectionClick && (
          <span className="absolute top-0 right-1 hidden group-hover:inline-flex group-focus-within:inline-flex text-[12px] font-medium font-sans bg-ink text-paper px-1.5 py-0.5 rounded-control pointer-events-none print:hidden">
            Click to edit
          </span>
        )}

        <HeadingTag
          className={`font-bold uppercase tracking-wider text-gray-900 border-b border-gray-800 pb-0.5 ${
            isCompact ? "mb-1" : "mb-1.5"
          }`}
          style={{ fontSize: isCompact ? "10pt" : "10.5pt" }}
        >
          Extracurricular Activities
        </HeadingTag>

        {extracurriculars.map((ec) => {
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
        role={onSectionClick ? "button" : undefined}
        tabIndex={onSectionClick ? 0 : undefined}
        aria-label={onSectionClick ? "Edit contact information" : undefined}
        onClick={onSectionClick ? () => onSectionClick("contact") : undefined}
        onKeyDown={onSectionClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSectionClick("contact"); } } : undefined}
        className={sectionClass(isCompact ? "text-center mb-2.5 pb-0.5" : "text-center mb-4 pb-1")}
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
          {(contact.fullName || "").toUpperCase()}
        </NameTag>

        {subtitle && (
          <div
            className="text-gray-700 font-semibold mb-0.5"
            style={{ fontSize: isCompact ? "10pt" : "11pt" }}
          >
            {subtitle}
          </div>
        )}

        {contactItems.length > 0 && (
          <div
            className="flex items-center justify-center flex-wrap text-gray-600 gap-x-2"
            style={{ fontSize: isCompact ? "8.5pt" : "9pt" }}
          >
            {contactItems.map((item, idx) => (
              <React.Fragment key={idx}>
                {idx > 0 && <span>|</span>}
                {item.isLink ? (
                  <a
                    href={`https://${item.text}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline text-gray-700"
                  >
                    {item.text}
                  </a>
                ) : (
                  <span>{item.text}</span>
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
