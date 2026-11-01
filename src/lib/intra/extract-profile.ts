import { IntraProfile, format42ProjectDate } from "./cv-from-intra";

const MAIN_CURSUS_ID = 21;
const MAIN_CURSUS_SLUG = "42cursus";

const asArray = (value: unknown): any[] => (Array.isArray(value) ? value : []);

const asString = (value: unknown): string => (typeof value === "string" ? value : "");

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
};

const isPiscine = (cu: any): boolean => {
  const slug = asString(cu?.cursus?.slug).toLowerCase();
  const name = asString(cu?.cursus?.name).toLowerCase();
  return cu?.cursus_id === 9 || slug.includes("piscine") || name.includes("piscine");
};

const isMainCursus = (cu: any): boolean =>
  cu?.cursus_id === MAIN_CURSUS_ID ||
  cu?.cursus?.id === MAIN_CURSUS_ID ||
  asString(cu?.cursus?.slug).toLowerCase() === MAIN_CURSUS_SLUG;

const cursusIdOf = (cu: any): number | null => toNumber(cu?.cursus_id ?? cu?.cursus?.id);

/** The main 42 cursus, else the highest-level cursus that is not a Piscine. */
function pickCursus(cursusUsers: any[]): any | null {
  const main = cursusUsers.find(isMainCursus);
  if (main) return main;
  const candidates = cursusUsers
    .filter((cu) => cu && !isPiscine(cu))
    .sort((a, b) => (toNumber(b.level) ?? 0) - (toNumber(a.level) ?? 0));
  return candidates[0] || null;
}

const timeOf = (date: string): number => {
  const t = date ? new Date(date).getTime() : NaN;
  return Number.isNaN(t) ? 0 : t;
};

export function extractIntraProfile(rawMe: any): IntraProfile {
  const me = rawMe && typeof rawMe === "object" ? rawMe : {};

  // 1. Cursus
  const cursus = pickCursus(asArray(me.cursus_users));
  const cursusId = cursus ? cursusIdOf(cursus) : null;
  const rawLevel = cursus ? toNumber(cursus.level) : null;
  const level = rawLevel === null ? 0 : Math.round(rawLevel * 100) / 100;

  // 2. Campus: the one marked primary, else the first one listed
  const campuses = asArray(me.campus);
  const primaryCampusUser = asArray(me.campus_users).find((cu) => cu?.is_primary === true);
  const campusObj =
    (primaryCampusUser && campuses.find((c) => c?.id === primaryCampusUser.campus_id)) || campuses[0] || null;

  // 3. Validated, finished projects from the chosen cursus
  const validatedProjects: IntraProfile["validatedProjects"] = asArray(me.projects_users)
    .filter((pu) => {
      if (!pu || pu["validated?"] !== true || pu.status !== "finished") return false;
      const ids = pu.cursus_ids;
      if (cursusId !== null && Array.isArray(ids) && ids.length > 0) return ids.includes(cursusId);
      return true;
    })
    .map((pu, index) => {
      const name = asString(pu.project?.name);
      const rawSlug = asString(pu.project?.slug) || name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const slug = rawSlug.replace(/^42cursus-/, "");
      const markedAt = asString(pu.marked_at);
      const id = toNumber(pu.project?.id) ?? toNumber(pu.id) ?? -(index + 1);
      return {
        id,
        name: name || slug,
        slug,
        finalMark: toNumber(pu.final_mark),
        validated: true,
        markedAt,
        date: format42ProjectDate(markedAt),
      };
    })
    .sort((a, b) => timeOf(b.markedAt) - timeOf(a.markedAt));

  const fullName = `${asString(me.first_name)} ${asString(me.last_name)}`.trim();
  const poolYear = toNumber(me.pool_year);

  return {
    id: toNumber(me.id) ?? 0,
    login: asString(me.login),
    email: asString(me.email),
    displayname: asString(me.displayname) || asString(me.usual_full_name) || fullName || asString(me.login),
    image: asString(me.image?.link) || asString(me.image_url) || "",
    campusName: asString(campusObj?.name),
    campusId: toNumber(campusObj?.id) ?? 0,
    level,
    grade: asString(cursus?.grade),
    poolMonth: asString(me.pool_month),
    poolYear: poolYear === null ? null : Math.trunc(poolYear),
    coalition: "",
    beginAt: asString(cursus?.begin_at),
    validatedProjects,
  };
}
