// The line checks give the same answers from both import paths. Run: npx tsx test/verify-line-checks.ts
import * as lc from "../src/lib/line-checks";
import * as bh from "../src/lib/bullet-helper";
let pass = 0, fail = 0;
const ok = (c: unknown, m: string) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };
for (const k of ["MAX_BULLET_LENGTH", "openingWord", "startsWithActionVerb", "startsWithWeakWord", "hasPronoun", "hasNumber", "looksLikeTemplate"] as const) {
  ok((lc as any)[k] === (bh as any)[k], `${k} is the same from both paths`);
}
ok(lc.startsWithActionVerb("Built a parser") && !lc.startsWithActionVerb("Worked on a parser"), "action verb");
ok(lc.hasPronoun("I wrote it") && lc.hasPronoun("We built it") && !lc.hasPronoun("Built it in 3 days"), "pronouns");
// "I" is a pronoun only as a word of its own
const pronounHint = (line: string) => lc.runLineChecks(line).some((c) => !c.pass && c.hint === lc.LINE_HINTS.pronoun);
ok(!pronounHint("Built an I/O multiplexer with poll()."), "I/O is not a pronoun");
ok(!pronounHint("Wrote I2C driver code."), "I2C is not a pronoun");
ok(!lc.hasPronoun("Ported the UI to iOS.") && !lc.hasPronoun("Rewrote the API's I/O layer."), "UI, iOS and I/O are not pronouns");
ok(pronounHint("I built a shell."), "I at the start is a pronoun");
ok(pronounHint("Fixed bugs I found in the parser."), "I in the middle is a pronoun");
ok(pronounHint("My team shipped it."), "My is a pronoun");
// The others only in lower case or with a capital first letter: "US", "ME" and "MY" in capitals are short names
ok(!pronounHint("Deployed to US servers."), "US in capitals is not a pronoun");
ok(!lc.hasPronoun("Ran it on ME and MY servers."), "ME and MY in capitals are not pronouns");
ok(pronounHint("We built a shell."), "We is a pronoun");
ok(pronounHint("Helped us ship."), "us is a pronoun");
ok(lc.hasPronoun("I'm the owner.") && lc.hasPronoun("Fixed it, I.") && lc.hasPronoun("Tested by me") && lc.hasPronoun("Our team won"), "other pronouns still found");
ok(lc.looksLikeOldTemplate("Built a Unix shell from scratch in C with support for pipelines, I/O redirections, heredocs, and environment variable expansion."), "old template found");
ok(lc.isSampleLine(lc.SAMPLE_LINE_LIST[0]) && lc.looksLikeTemplate(lc.SAMPLE_LINE_LIST[0]), "sample lines are flagged");
ok(!lc.isSampleLine("Fixed 12 memory leaks in a ray caster by freeing textures on exit."), "own line is not a sample");
const start = lc.runLineChecks("I worked on minishell with my team");
ok(start.filter((c) => c.pass).length === 2, "starting line passes 2 of 5");
ok(lc.LINE_HINTS.template.startsWith("This is the same line many students have"), "editor wording kept");
console.log(`line checks: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
