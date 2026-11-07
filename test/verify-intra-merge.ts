// Checks how 42 Intra data is added to a CV. Run: npx tsx --tsconfig tsconfig.json test/verify-intra-merge.ts
import { removeLegacySampleData, removeGuessedLinks, isDefaultProgram, mergeIntraIntoCV, createEmptyCV, createInitialCVFromIntra, programForState } from "../src/lib/intra/cv-from-intra";
let pass = 0, fail = 0;
const ok = (c: any, m: string) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };
// Real student's CV is untouched
const real = createEmptyCV(); real.contact.fullName = "Sam Student"; real.contact.level = 9; real.education[0].startDate = "2025";
ok(!removeLegacySampleData(real).changed, "real CV untouched");
// Merge
const user: any = { id: 1, login: "sstud", email: "s@example.org", displayname: "Sam Student", image: "", campusName: "Northfield", campusId: 1, level: 5.4, grade: "Learner", poolMonth: "", poolYear: 2024, coalition: "", beginAt: "2024-10-01T00:00:00Z", validatedProjects: [{ id: 3, name: "libft", slug: "libft", finalMark: 100, validated: true, markedAt: "2024-11-01T00:00:00Z" }, { id: 4, name: "Exam 02", slug: "exam-rank-02", finalMark: 100, validated: true, markedAt: "2024-11-01T00:00:00Z" }] };
const fresh = createInitialCVFromIntra(user);
ok(fresh.education[0].institution === "42 Northfield" && fresh.education[0].startDate === "2024" && fresh.education[0].level === 5.4, "fresh edu filled");
ok(fresh.education[0].program === programForState("STATE_A_CORE"), "fresh program");
ok(fresh.projects.length === 1 && fresh.contact.level === 5.4, "fresh projects/level");
ok(createEmptyCV().education[0].program === "", "empty CV has no program");
const typed = createEmptyCV(); typed.contact.fullName = "My Name"; typed.education[0].program = "My program"; typed.education[0].startDate = "2023"; typed.education[0].endDate = "2025"; typed.education[0].isCurrent = false;
const merged = mergeIntraIntoCV(typed, user);
ok(merged.contact.fullName === "My Name" && merged.contact.email === user.email, "merge keeps name, fills email");
ok(merged.education[0].program === "My program" && merged.education[0].startDate === "2023" && merged.education[0].endDate === "2025", "merge keeps typed edu");
ok(merged.education[0].institution === "42 Northfield", "merge fills school");
const zero = mergeIntraIntoCV(createEmptyCV(), { ...user, level: 0 });
ok(zero.contact.level === "" && !zero.education[0].level, "level 0 -> empty");
const keep = createEmptyCV(); keep.contact.level = 4;
ok(mergeIntraIntoCV(keep, { ...user, level: 0 }).contact.level === 4, "level 0 keeps old");
const alum = createInitialCVFromIntra({ ...user, grade: "Alumni" });
ok(alum.education[0].endDate === "" && alum.education[0].isCurrent === false && alum.educationState === "STATE_C_ALUMNUS", "alumni dates");
// A common city or a shared project id alone must not start the cleanup
const city = createEmptyCV(); city.contact.location = "Southport, Example"; city.contact.level = 9; city.education[0].institution = "42 Southport"; city.education[0].startDate = "2025";
ok(!removeLegacySampleData(city).changed, "city alone does not trigger cleanup");
const sharedId = createEmptyCV(); sharedId.contact.level = 7; sharedId.education[0].startDate = "2023";
sharedId.projects = [{ id: "proj-minishell", name: "minishell", is42Project: true, techStack: "", date: "", bulletPoints: ["Wrote my own shell"] }];
ok(!removeLegacySampleData(sharedId).changed, "own project with a sample id is kept");
// Old default program text is replaced; typed text is kept
const oldProgram = createEmptyCV(); oldProgram.education[0].program = "Completed the Core Systems Curriculum - Software & Systems Engineering";
ok(mergeIntraIntoCV(oldProgram, user).education[0].program === programForState("STATE_A_CORE"), "old default program replaced");
ok(isDefaultProgram("") && !isDefaultProgram("My program"), "isDefaultProgram");
// A typed end date is kept even when the start date is empty
const endOnly = createEmptyCV(); endOnly.education[0].endDate = "2025"; endOnly.education[0].isCurrent = false;
const endMerged = mergeIntraIntoCV(endOnly, user).education[0];
ok(endMerged.endDate === "2025" && endMerged.isCurrent === false, "typed end date kept");
// Guessed links from the old login are removed; real ones stay
const links = createEmptyCV(); links.contact.githubUrl = "https://github.com/sstud"; links.contact.linkedinUrl = "linkedin.com/in/example-student";
const cleanedLinks = removeGuessedLinks(links, "sstud").contact;
ok(cleanedLinks.githubUrl === "" && cleanedLinks.linkedinUrl === "linkedin.com/in/example-student", "guessed links removed");
// Contact details keep only 12 bits, so made-up values with the same bits stand in for the old ones
const low12 = (t: string) => { let h = 5381; for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0; return (h >>> 0) & 0xfff; };
const sameBits = (prefix: string) => { for (let i = 0; ; i++) if (low12(`${prefix}${i}`) === 0x563) return `${prefix}${i}`; };
const onePhone = createEmptyCV(); onePhone.contact.phoneNumber = sameBits("+1 555 ");
ok(!removeLegacySampleData(onePhone).changed, "a phone match alone does not trigger cleanup");
const oneName = createEmptyCV(); oneName.contact.fullName = sameBits("name ");
ok(!removeLegacySampleData(oneName).changed, "one name match alone does not trigger cleanup");
const two = createEmptyCV(); two.contact.fullName = sameBits("name "); two.contact.email = sameBits("e"); two.contact.phoneNumber = sameBits("+1 555 "); two.contact.location = "Southport, Example";
const twoResult = removeLegacySampleData(two);
ok(twoResult.changed && twoResult.cv.contact.fullName === "" && twoResult.cv.contact.email === "" && twoResult.cv.contact.phoneNumber === "" && twoResult.cv.contact.location === "Southport, Example", "two matches clear the matching details and the phone, other details stay");
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
