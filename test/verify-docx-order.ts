// Verifies that DOCX generator respects custom sectionOrder.
import JSZip from "jszip";
import { generateCvDocx } from "../src/lib/docx-generator";
import { DEMO_CV } from "../src/lib/sample-cv";
import type { SectionId } from "../src/types/resume";

let pass = 0;
let fail = 0;
const ok = (c: boolean, m: string) => {
  if (c) {
    pass++;
  } else {
    fail++;
    console.error("FAIL:", m);
  }
};

(async () => {
  // Test 1: Projects first, then Skills, then Experience, then Education
  const customOrder: SectionId[] = [
    "projects",
    "skills",
    "experience",
    "education",
    "coursework",
    "extracurriculars",
  ];

  const cvWithCustomOrder = {
    ...DEMO_CV,
    sectionOrder: customOrder,
  };

  const blob = await generateCvDocx(cvWithCustomOrder);
  ok(blob.size > 0, "generateCvDocx produces a non-empty blob");

  const arrayBuffer = await blob.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);
  const docXmlFile = zip.file("word/document.xml");
  ok(docXmlFile !== null, "document.xml exists in generated DOCX");

  if (docXmlFile) {
    const xml = await docXmlFile.async("string");

    const posProjects = xml.indexOf("SELECTED PROJECTS");
    const posSkills = xml.indexOf("TECHNICAL SKILLS");
    const posExperience = xml.indexOf("EXPERIENCE");
    const posEducation = xml.indexOf("EDUCATION");

    ok(posProjects !== -1, "Selected Projects header present");
    ok(posSkills !== -1, "Technical Skills header present");
    ok(posExperience !== -1, "Experience header present");
    ok(posEducation !== -1, "Education header present");

    ok(
      posProjects < posSkills,
      `Projects (${posProjects}) should precede Skills (${posSkills})`
    );
    ok(
      posSkills < posExperience,
      `Skills (${posSkills}) should precede Experience (${posExperience})`
    );
    ok(
      posExperience < posEducation,
      `Experience (${posExperience}) should precede Education (${posEducation})`
    );
  }

  // Test 2: Default section order when sectionOrder is undefined
  const cvDefault = {
    ...DEMO_CV,
    sectionOrder: undefined,
  };

  const blobDef = await generateCvDocx(cvDefault);
  const zipDef = await JSZip.loadAsync(await blobDef.arrayBuffer());
  const xmlDef = await zipDef.file("word/document.xml")!.async("string");

  const defEdu = xmlDef.indexOf("EDUCATION");
  const defExp = xmlDef.indexOf("EXPERIENCE");
  const defProj = xmlDef.indexOf("SELECTED PROJECTS");

  ok(
    defEdu < defExp,
    `Default: Education (${defEdu}) precedes Experience (${defExp})`
  );
  ok(
    defExp < defProj,
    `Default: Experience (${defExp}) precedes Projects (${defProj})`
  );

  console.log(`docx-order: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
