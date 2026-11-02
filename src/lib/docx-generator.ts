import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  TabStopType,
  TabStopPosition,
  HeadingLevel,
  BorderStyle,
} from "docx";
import { CVData, DEFAULT_SECTION_ORDER } from "@/types/resume";
import { removeEmDashes } from "@/lib/sanitizer";
import { MAIN_EDUCATION_ID } from "@/lib/intra/cv-from-intra";

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

/**
 * Generates an authentic Microsoft Word (.docx) file adhering 100% to the CV template.
 * Uses native paragraph TabStopType.RIGHT to place dates at the exact right margin without tables.
 */
export async function generateCvDocx(data: CVData): Promise<Blob> {
  const sections: Paragraph[] = [];
  const FONT_FAMILY = "Calibri";
  const isCompact = data.styleDensity === "compact";

  // Helper for Section Headers with solid bottom border
  const addSectionHeader = (title: string) => {
    sections.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: isCompact ? 130 : 180, after: isCompact ? 40 : 60 },
        border: {
          bottom: { color: "111827", space: 2, style: BorderStyle.SINGLE, size: 8 },
        },
        children: [
          new TextRun({
            text: title.toUpperCase(),
            bold: true,
            size: isCompact ? 20 : 21, // 10pt or 10.5pt
            font: FONT_FAMILY,
            color: "111827",
          }),
        ],
      })
    );
  };

  // ==============================================================
  // HEADER: Centered Name, Subtitle, Contact Strip
  // Only fields the student actually filled in are shown.
  // ==============================================================
  const mainEducation = (data.education || []).find((e) => e.id === MAIN_EDUCATION_ID);
  const otherEducation = (data.education || []).filter((e) => e.id !== MAIN_EDUCATION_ID);
  const level = hasLevel(data.contact.level) ? data.contact.level : mainEducation?.level;
  const levelLabel = hasLevel(level) ? `Level ${level}` : "";

  const targetRole = data.targetRole?.trim() || "";
  // The level is shown on the school line. Only put it under the name when there is no school line.
  const subtitle =
    mainEducation || targetRole.includes("Level")
      ? targetRole
      : [targetRole, levelLabel].filter(Boolean).join(" – ");

  const stripProtocol = (url?: string) => (url || "").trim().replace(/^https?:\/\//, "");
  const contactLine = [
    data.contact.location?.trim() || "",
    data.contact.email?.trim() || "",
    data.contact.phoneNumber?.trim() || "",
    stripProtocol(data.contact.linkedinUrl),
    stripProtocol(data.contact.githubUrl),
  ]
    .filter(Boolean)
    .join("  |  ");

  sections.push(
    new Paragraph({
      alignment: "center",
      spacing: { before: 0, after: isCompact ? 20 : 40 },
      children: [
        new TextRun({
          text: (data.contact.fullName || "").toUpperCase(),
          bold: true,
          size: isCompact ? 36 : 40, // 18pt or 20pt
          font: FONT_FAMILY,
          color: "111827",
        }),
      ],
    })
  );

  if (subtitle) {
    sections.push(
      new Paragraph({
        alignment: "center",
        spacing: { after: isCompact ? 30 : 60 },
        children: [
          new TextRun({
            text: subtitle,
            bold: true,
            size: isCompact ? 20 : 22, // 10pt or 11pt
            font: FONT_FAMILY,
            color: "374151",
          }),
        ],
      })
    );
  }

  if (contactLine) {
    sections.push(
      new Paragraph({
        alignment: "center",
        spacing: { after: isCompact ? 120 : 180 },
        children: [
          new TextRun({
            text: contactLine,
            size: isCompact ? 17 : 19, // 8.5pt or 9.5pt
            font: FONT_FAMILY,
            color: "4B5563",
          }),
        ],
      })
    );
  }

  // ==============================================================
  // SECTION 1: EDUCATION (main school entry first, then the rest)
  // ==============================================================
  // Bold title on the left, italic dates at the right tab stop (dates omitted if missing)
  const addEducationTitle = (title: string, dates: string) => {
    if (!title && !dates) return;
    sections.push(
      new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
        spacing: { before: 40, after: 20 },
        children: [
          new TextRun({
            text: title,
            bold: true,
            size: 20, // 10pt
            font: FONT_FAMILY,
          }),
          ...(dates
            ? [
                new TextRun("\t"),
                new TextRun({
                  text: dates,
                  italics: true,
                  size: 19,
                  font: FONT_FAMILY,
                }),
              ]
            : []),
        ],
      })
    );
  };

  const renderEducation = () => {
    if (!mainEducation && otherEducation.length === 0) return;
    addSectionHeader("Education");

    if (mainEducation) {
      addEducationTitle(
        [mainEducation.institution?.trim(), levelLabel].filter(Boolean).join(" – "),
        formatDateRange(mainEducation.startDate, mainEducation.endDate, mainEducation.isCurrent)
      );

      const mainProgram = mainEducation.program?.trim() || "";
      const track = data.specializationTrack?.trim() || "";
      const location = data.contact.location?.trim() || "";

      if (data.educationState === "STATE_A_CORE") {
        if (mainProgram || location) {
          sections.push(
            new Paragraph({
              tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
              spacing: { after: 60 },
              children: [
                new TextRun({
                  text: mainProgram,
                  size: 19,
                  font: FONT_FAMILY,
                }),
                ...(location
                  ? [
                      new TextRun("\t"),
                      new TextRun({
                        text: location,
                        italics: true,
                        size: 18,
                        font: FONT_FAMILY,
                        color: "4B5563",
                      }),
                    ]
                  : []),
              ],
            })
          );
        }
      } else {
        if (mainProgram) {
          sections.push(
            new Paragraph({
              spacing: { after: track ? 20 : 60 },
              children: [
                new TextRun({
                  text: mainProgram,
                  size: 19,
                  font: FONT_FAMILY,
                }),
              ],
            })
          );
        }
        if (track) {
          sections.push(
            new Paragraph({
              spacing: { after: 60 },
              children: [
                new TextRun({
                  text: `Specialization: ${track}`,
                  italics: true,
                  size: 18,
                  font: FONT_FAMILY,
                }),
              ],
            })
          );
        }
      }
    }

    // Other education entries
    for (const edu of otherEducation) {
      addEducationTitle(edu.institution?.trim() || "", formatDateRange(edu.startDate, edu.endDate, edu.isCurrent));
      const detail = edu.degree?.trim() || edu.program?.trim() || "";
      if (detail) {
        sections.push(
          new Paragraph({
            spacing: { after: 60 },
            children: [
              new TextRun({
                text: detail,
                size: 19,
                font: FONT_FAMILY,
              }),
            ],
          })
        );
      }
    }
  };

  // ==============================================================
  // SECTION 2: EXPERIENCE (Dynamic Weighting Toggle)
  // When showExperience is false, this section is completely skipped
  // ==============================================================
  const renderExperience = () => {
    if (!data.showExperience || !data.experience || data.experience.length === 0) return;
    addSectionHeader("Experience");

    for (const exp of data.experience) {
      const dates = formatDateRange(exp.startDate, exp.endDate, exp.isCurrent);
      sections.push(
        new Paragraph({
          tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
          spacing: { before: 40, after: 10 },
          children: [
            new TextRun({
              text: exp.company,
              bold: true,
              size: 20,
              font: FONT_FAMILY,
            }),
            ...(dates
              ? [
                  new TextRun("\t"),
                  new TextRun({
                    text: dates,
                    italics: true,
                    size: 19,
                    font: FONT_FAMILY,
                  }),
                ]
              : []),
          ],
        })
      );

      if (exp.role || exp.location) {
        sections.push(
          new Paragraph({
            tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
            spacing: { after: 40 },
            children: [
              new TextRun({
                text: exp.role,
                italics: true,
                size: 19,
                font: FONT_FAMILY,
              }),
              ...(exp.location
                ? [
                    new TextRun("\t"),
                    new TextRun({
                      text: exp.location,
                      italics: true,
                      size: 18,
                      font: FONT_FAMILY,
                      color: "4B5563",
                    }),
                  ]
                : []),
            ],
          })
        );
      }

      for (const bullet of nonEmptyBullets(exp.bulletPoints)) {
        sections.push(
          new Paragraph({
            bullet: { level: 0 },
            spacing: { before: 10, after: 20 },
            children: [
              new TextRun({
                text: removeEmDashes(bullet),
                size: 19,
                font: FONT_FAMILY,
              }),
            ],
          })
        );
      }
    }
  };

  // ==============================================================
  // SECTION 3: SELECTED PROJECTS
  // Format: Name | Tech Stack (Left) \t Date (Right)
  // A project with no bullets renders only its header line.
  // ==============================================================
  const renderProjects = () => {
    if (!data.projects || data.projects.length === 0) return;
    addSectionHeader("Selected Projects");

    for (const proj of data.projects) {
      const cleanTitle = proj.name.includes("|") ? proj.name.split("|")[0].trim() : proj.name;
      const cleanStack =
        proj.name.includes("|") && (!proj.techStack || proj.techStack === "C")
          ? proj.name.split("|").slice(1).join("|").trim()
          : proj.techStack;

      sections.push(
        new Paragraph({
          tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
          spacing: { before: isCompact ? 25 : 40, after: isCompact ? 10 : 20 },
          children: [
            new TextRun({
              text: cleanTitle,
              bold: true,
              size: isCompact ? 19 : 20,
              font: FONT_FAMILY,
            }),
            ...(cleanStack
              ? [
                  new TextRun({
                    text: ` | ${cleanStack}`,
                    size: isCompact ? 18 : 19,
                    font: FONT_FAMILY,
                    color: "374151",
                  }),
                ]
              : []),
            ...(proj.date
              ? [
                  new TextRun("\t"),
                  new TextRun({
                    text: proj.date,
                    italics: true,
                    size: isCompact ? 18 : 19,
                    font: FONT_FAMILY,
                  }),
                ]
              : []),
          ],
        })
      );

      for (const bullet of nonEmptyBullets(proj.bulletPoints)) {
        sections.push(
          new Paragraph({
            bullet: { level: 0 },
            spacing: { before: isCompact ? 5 : 10, after: isCompact ? 12 : 20 },
            children: [
              new TextRun({
                text: removeEmDashes(bullet),
                size: isCompact ? 18 : 19,
                font: FONT_FAMILY,
              }),
            ],
          })
        );
      }
    }
  };

  // ==============================================================
  // SECTION 4: TECHNICAL SKILLS (Strict 4 Categories, empty ones hidden)
  // ==============================================================
  const renderSkills = () => {
    const skillRows = (
      [
        ["Languages", data.skills?.languages],
        ["Developer Tools", data.skills?.developerTools],
        ["Technologies & Frameworks", data.skills?.technologiesFrameworks],
        ["Project Management Tools", data.skills?.projectManagementTools],
      ] as [string, string[] | undefined][]
    )
      .map(([label, items]) => [label, (items || []).filter(hasText)] as [string, string[]])
      .filter(([, items]) => items.length > 0);

    if (skillRows.length === 0) return;
    addSectionHeader("Technical Skills");

    for (const [label, items] of skillRows) {
      sections.push(
        new Paragraph({
          spacing: { before: isCompact ? 15 : 20, after: isCompact ? 15 : 20 },
          children: [
            new TextRun({
              text: `${label}: `,
              bold: true,
              size: isCompact ? 18 : 19,
              font: FONT_FAMILY,
            }),
            new TextRun({
              text: items.join(", "),
              size: isCompact ? 18 : 19,
              font: FONT_FAMILY,
            }),
          ],
        })
      );
    }
  };

  // ==============================================================
  // SECTION 5: RELEVANT COURSEWORK AND WORKSHOPS
  // ==============================================================
  const renderCoursework = () => {
    if (!data.coursework || data.coursework.length === 0) return;
    addSectionHeader("Relevant Coursework and Workshops");

    for (const cw of data.coursework) {
      sections.push(
        new Paragraph({
          tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
          bullet: { level: 0 },
          spacing: { before: isCompact ? 5 : 10, after: isCompact ? 10 : 20 },
          children: [
            new TextRun({
              text: cw.title,
              size: isCompact ? 18 : 19,
              font: FONT_FAMILY,
            }),
            ...(cw.date
              ? [
                  new TextRun("\t"),
                  new TextRun({
                    text: cw.date,
                    italics: true,
                    size: isCompact ? 17 : 18,
                    font: FONT_FAMILY,
                  }),
                ]
              : []),
          ],
        })
      );
    }
  };

  // ==============================================================
  // SECTION 6: EXTRACURRICULAR ACTIVITIES
  // ==============================================================
  const renderExtracurriculars = () => {
    if (data.showExtracurriculars === false || !data.extracurriculars || data.extracurriculars.length === 0) return;
    addSectionHeader("Extracurricular Activities");

    for (const ec of data.extracurriculars) {
      const dates = formatDateRange(ec.startDate, ec.endDate, ec.isCurrent);
      sections.push(
        new Paragraph({
          tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
          spacing: { before: isCompact ? 25 : 40, after: isCompact ? 5 : 10 },
          children: [
            new TextRun({
              text: ec.organization,
              bold: true,
              size: isCompact ? 19 : 20,
              font: FONT_FAMILY,
            }),
            ...(dates
              ? [
                  new TextRun("\t"),
                  new TextRun({
                    text: dates,
                    italics: true,
                    size: isCompact ? 18 : 19,
                    font: FONT_FAMILY,
                  }),
                ]
              : []),
          ],
        })
      );

      if (ec.role) {
        sections.push(
          new Paragraph({
            spacing: { after: isCompact ? 15 : 30 },
            children: [
              new TextRun({
                text: ec.role,
                italics: true,
                size: isCompact ? 18 : 19,
                font: FONT_FAMILY,
              }),
            ],
          })
        );
      }

      for (const bullet of nonEmptyBullets(ec.bulletPoints)) {
        sections.push(
          new Paragraph({
            bullet: { level: 0 },
            spacing: { before: isCompact ? 5 : 10, after: isCompact ? 12 : 20 },
            children: [
              new TextRun({
                text: removeEmDashes(bullet),
                size: isCompact ? 18 : 19,
                font: FONT_FAMILY,
              }),
            ],
          })
        );
      }
    }
  };

  // Render sections according to cvData.sectionOrder
  const order = (data.sectionOrder && data.sectionOrder.length > 0)
    ? data.sectionOrder
    : DEFAULT_SECTION_ORDER;

  for (const secId of order) {
    switch (secId) {
      case "education":
        renderEducation();
        break;
      case "experience":
        renderExperience();
        break;
      case "projects":
        renderProjects();
        break;
      case "skills":
        renderSkills();
        break;
      case "coursework":
        renderCoursework();
        break;
      case "extracurriculars":
        renderExtracurriculars();
        break;
    }
  }

  // Margins: Standard (720 DXAs = 0.5") or Compact (540 DXAs = 0.375")
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: isCompact
              ? { top: 540, bottom: 540, left: 600, right: 600 }
              : { top: 720, bottom: 720, left: 720, right: 720 },
          },
        },
        children: sections,
      },
    ],
  });

  return await Packer.toBlob(doc);
}
