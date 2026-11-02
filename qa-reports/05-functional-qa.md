# FUNCTIONAL QA AUDIT REPORT
**PrintCV Website & Studio Application**
**Auditor**: Agent 5 — Functional QA Specialist
**Date**: November 2, 2026
**Target**: `/home/alnassar/Desktop/printcv`
**Status**: Comprehensive Static & Functional Analysis Complete

---

## 1. Executive Summary

This report delivers an exhaustive, evidence-based functional quality assurance audit of the PrintCV platform, encompassing both the public Landing Page interactions and the Studio Editor application. Every user interaction, control mechanism, keyboard trap, modal lifecycle, state synchronization routine, and data export pipeline was inspected directly at the source code level.

### Overall Assessment
PrintCV exhibits exceptional architectural craftsmanship in several key areas:
- Robust WCAG 2.1 AA accessibility implementation across dialogs (`useDialog.ts`) with background inerting (`inertOutside`) and focus restoration.
- Highly resilient print styling (`PrintableCV.tsx` and `globals.css`) using native DOM portals, zero-margin A4 media rules, and dynamic `beforeprint`/`afterprint` filename injection.
- Fail-safe error recovery (`draft-rescue.ts`) operating completely independent of React or Zustand runtimes.
- Sophisticated focus-tracking heuristics (`focusAfterChange`, `refocusCardButton`) during list mutations.

However, the audit identified **1 Critical Usability Bug**, **3 High-Severity Functional Gaps**, and several **Medium/Low-Severity Interaction Anomalies** that impair the user experience, cause user data frustration, or create navigation dead-ends.

### Key Findings Summary
1. **CRITICAL**: Synchronous normalization in [ContactSection.tsx](file:///home/alnassar/Desktop/printcv/src/components/studio/sections/ContactSection.tsx#L57-L68) on `onChange` triggers severe cursor jumps and backspace fighting on GitHub and LinkedIn inputs.
2. **HIGH**: Mobile navigation `<details>` menu in [Masthead.tsx](file:///home/alnassar/Desktop/printcv/src/components/landing/Masthead.tsx#L30-L41) fails to close upon clicking anchor links, staying open and obscuring content.
3. **HIGH**: Dead-end CTA copy in [Cta.tsx](file:///home/alnassar/Desktop/printcv/src/components/landing/Cta.tsx#L21-L24): "Open the editor and fill it in by hand" is rendered as unlinked plain text.
4. **HIGH**: Missing Undo / Soft-Delete capability in Activities and Education sections ([ActivitiesSection.tsx](file:///home/alnassar/Desktop/printcv/src/components/studio/sections/ActivitiesSection.tsx#L90-L96), [EducationSection.tsx](file:///home/alnassar/Desktop/printcv/src/components/studio/sections/EducationSection.tsx#L71-L79)), leading to irreversible data loss upon accidental deletion.
5. **MEDIUM**: Focus displacement in NextStep banner ([ReziStudioLayout.tsx](file:///home/alnassar/Desktop/printcv/src/components/studio/ReziStudioLayout.tsx#L86-L96)) when `itemId` is undefined; keyboard focus remains trapped on the "Fix it" button.
6. **MEDIUM**: Canvas preview sections in [CVSheet.tsx](file:///home/alnassar/Desktop/printcv/src/components/templates/CVSheet.tsx#L59-L71) support click-to-edit but lack keyboard attributes (`tabIndex`, `role="button"`, `onKeyDown`).
7. **MEDIUM**: Missing `institution` input field in [ActivitiesSection.tsx](file:///home/alnassar/Desktop/printcv/src/components/studio/sections/ActivitiesSection.tsx#L51-L56) coursework entries despite data store support.

---

## 2. Landing Page Interaction Audit

### 2.1 Masthead Navigation & Mobile Menu
- **Component**: [`Masthead.tsx`](file:///home/alnassar/Desktop/printcv/src/components/landing/Masthead.tsx)
- **Anchor Targets**:
  - `#how` -> Matches `<section id="how" ...>` in [`HowItWorks.tsx`](file:///home/alnassar/Desktop/printcv/src/components/landing/HowItWorks.tsx#L72).
  - `#sample` -> Matches `<section id="sample" ...>` in [`Showcase.tsx`](file:///home/alnassar/Desktop/printcv/src/components/landing/Showcase.tsx#L41).
  - `#questions` -> Matches `<section id="questions" ...>` in [`Faq.tsx`](file:///home/alnassar/Desktop/printcv/src/components/landing/Faq.tsx#L24).
  - `#main` -> Matches `<main id="main">` in [`page.tsx`](file:///home/alnassar/Desktop/printcv/src/app/page.tsx#L20) for the skip-link.

#### Interaction Analysis & Defects:
1. **Desktop Anchors**:
   - The desktop navigation (`hidden md:flex`, lines 20-26) renders standard `<a href="...">` elements. Smooth scrolling behaves as expected.
2. **Mobile `<details>` Dropdown Menu Bug (Severity: HIGH)**:
   - Lines 30-41 implement a scriptless mobile menu using HTML5 `<details>` and `<summary>`:
     ```tsx
     <details className="relative md:hidden">
       <summary className="flex h-11 cursor-pointer list-none items-center px-1 text-step-small font-medium text-ink [&::-webkit-details-marker]:hidden">
         Menu
       </summary>
       <ul className="absolute right-0 top-full mt-2 w-48 rounded-card border border-line bg-paper py-2">
         {LINKS.map((l) => (
           <li key={l.href}>
             <a href={l.href} className="flex h-11 items-center px-4 text-step-small text-ink hover:bg-stage">{l.label}</a>
           </li>
         ))}
       </ul>
     </details>
     ```
   - **Failure Mode**: In native HTML, clicking an `<a>` inside a `<details>` element does **not** close the `<details>` parent. When a mobile user taps "How it works", the viewport scrolls down to `#how`, but the dropdown menu remains expanded over the masthead.
   - **No Outside Click Handler**: Tapping outside the dropdown does not close it. The user must manually tap the `summary` button again to collapse it.
   - **No Escape Key Handler**: Keyboard users on mobile/tablet viewports cannot dismiss the menu with `Escape`.

---

### 2.2 Call-to-Action (CTA) Flows
- **Components**: [`Hero.tsx`](file:///home/alnassar/Desktop/printcv/src/components/landing/Hero.tsx), [`Cta.tsx`](file:///home/alnassar/Desktop/printcv/src/components/landing/Cta.tsx), [`Masthead.tsx`](file:///home/alnassar/Desktop/printcv/src/components/landing/Masthead.tsx)

#### Interaction Analysis & Defects:
1. **"Log in with 42" CTA**:
   - Masthead: `<a href="/api/auth/42/login" className="...">Log in with 42</a>` (line 27).
   - Hero: `<a href="/api/auth/42/login" ...>Log in with 42</a>` (lines 37-39).
   - Bottom CTA: `<a href="/api/auth/42/login" ...>Log in with 42</a>` (lines 16-19).
   - All entry points correctly route to the OAuth handoff endpoint `/api/auth/42/login`.
2. **"Open the editor" Flow & Dead-End Bug (Severity: HIGH)**:
   - In [`Hero.tsx`](file:///home/alnassar/Desktop/printcv/src/components/landing/Hero.tsx#L40-L44):
     `<a href="/studio" ...>Open the editor <ArrowRight /></a>` correctly routes directly to the editor.
   - In [`Cta.tsx`](file:///home/alnassar/Desktop/printcv/src/components/landing/Cta.tsx#L21-L24):
     ```tsx
     <div data-reveal="" style={at(1)} className="space-y-1 text-step-small text-muted md:col-span-6 md:col-start-7 md:self-end">
       <p>Free. No card. Your CV stays in your browser.</p>
       <p>Not at 42? Open the editor and fill it in by hand.</p>
     </div>
     ```
   - **Defect**: The phrase **"Open the editor and fill it in by hand"** is rendered as inert plain text (`<p>`). A non-42 user arriving at the bottom of the page is instructed to open the editor, but has no clickable link. They are forced to scroll all the way back up to the Hero section to enter the studio.

---

### 2.3 Interactive Line Check (`LineCheck.tsx`)
- **Component**: [`LineCheck.tsx`](file:///home/alnassar/Desktop/printcv/src/components/landing/LineCheck.tsx)
- **Logic Module**: [`line-checks.ts`](file:///home/alnassar/Desktop/printcv/src/lib/line-checks.ts)

#### Interaction Analysis:
1. **Hydration Protection**:
   - Line 10: `const [ready, setReady] = useState(false);`
   - Line 12: `useEffect(() => setReady(true), []);`
   - Line 19: `<textarea ... readOnly={!ready} ... />`
   - Prevents SSR/client hydration mismatch by keeping textarea read-only until the component mounts.
2. **Live Validation Execution**:
   - Line 13: `const checks = useMemo(() => runLineChecks(text), [text]);`
   - Re-evaluates all 5 rules synchronously on every keystroke:
     1. Starts with action verb (`startsWithActionVerb`): Matches against `IRREGULAR_VERBS` or regular verbs ending with `"ed"` (excluding `WEAK_OPENERS` like "worked", "helped").
     2. Contains a number (`hasNumber`): Tests `/\d/`.
     3. No pronouns (`hasPronoun`): Detects capital `"I"` (`/\bI(?![\w/])/`) and case-insensitive pronouns ("me", "my", "we", "us", "our").
     4. Length constraint: `t.length > 0 && t.length <= 220` (`MAX_BULLET_LENGTH`).
     5. Not a template: Word overlap test against `OLD_TEMPLATE_BULLETS` and `ALL_SAMPLE_LINES` (`looksLikeTemplate`).
3. **Debounced Screen-Reader Summary**:
   - Line 15:
     ```tsx
     useEffect(() => {
       const t = setTimeout(() => setSummary(summarize(text)), 400);
       return () => clearTimeout(t);
     }, [text]);
     ```
   - Line 29: `<p aria-live="polite" className="mt-4 text-step-small text-muted">{summary}</p>`
   - **Observation**: Highly responsive. Debouncing the summary announcement by 400ms prevents screen reader chatter during rapid typing while updating visual pills synchronously.
4. **Edge Cases**:
   - *Empty Input*: All 5 checks evaluate to `pass: false`. Summary reads `"0 of 5 checks pass. Start with what you did, like Built, Fixed or Tested."`.
   - *Multi-line input*: Textarea allows newlines, but `runLineChecks` trims and regex-tests the first word.

---

### 2.4 Showcase Tab Switcher (`OutputIndex.tsx`)
- **Component**: [`OutputIndex.tsx`](file:///home/alnassar/Desktop/printcv/src/components/landing/OutputIndex.tsx)
- **Panels**:
  - Panel 0: `PdfPanel` ([`Showcase.tsx`](file:///home/alnassar/Desktop/printcv/src/components/landing/Showcase.tsx#L27-L37))
  - Panel 1: `ScoreReceipt` ([`ScoreReceipt.tsx`](file:///home/alnassar/Desktop/printcv/src/components/landing/ScoreReceipt.tsx))
  - Panel 2: `AiMessage` ([`AiMessage.tsx`](file:///home/alnassar/Desktop/printcv/src/components/landing/AiMessage.tsx))

#### Interaction Analysis:
1. **ARIA Roles & Attributes**:
   - Tablist container: `role="tablist" aria-label="What you get"` (line 18).
   - Tabs: `role="tab" id="out-tab-{i}" aria-controls="out-panel-{i}" aria-selected={i === active}` (lines 20-21).
   - Panels: `role="tabpanel" id="out-panel-{i}" aria-labelledby="out-tab-{i}" hidden={i !== active} tabIndex={0}` (lines 33-34).
2. **Keyboard Handling (`onKeyDown`)**:
   - `ArrowRight`: Moves to `(active + 1) % names.length`.
   - `ArrowLeft`: Moves to `(active - 1 + names.length) % names.length`.
   - `Home`: Moves to index 0.
   - `End`: Moves to index `names.length - 1`.
   - Focus is explicitly transferred: `tabs.current[n]?.focus()`.
3. **Tabpanel Visibility & Container Sizing**:
   - Lines 33-34 combine `hidden={i !== active}` and Tailwind `className={`${i === active ? "flex" : "hidden"} ...`}`. This properly guards against CSS display rules overriding HTML5 `hidden` attributes.
   - `[container-type:inline-size]` on line 31 enables container queries (`100cqw`) used in `PdfPanel` to dynamically scale the preview sheet on mobile viewports.
4. **UX Gap in `AiMessage.tsx` (Severity: LOW)**:
   - In Panel 2 ("The AI message"), a complete prompt is rendered inside a `<pre>` block.
   - There is no "Copy to clipboard" button on this panel. Users must manually highlight and copy the preformatted text.

---

## 3. Studio Editor Interaction Audit

### 3.1 Section Rail & Step Navigation
- **Component**: [`SectionRail.tsx`](file:///home/alnassar/Desktop/printcv/src/components/studio/SectionRail.tsx)
- **Parent Layout**: [`ReziStudioLayout.tsx`](file:///home/alnassar/Desktop/printcv/src/components/studio/ReziStudioLayout.tsx)

#### Interaction Analysis:
1. **Roving TabIndex & Keyboard Navigation**:
   - Lines 66-81: `onKeyDown` handles `ArrowRight`, `ArrowLeft`, `Home`, and `End` across all 6 sections (CONTACT, EXPERIENCE, PROJECTS, EDUCATION, SKILLS, ACTIVITIES).
   - Proper roving tabindex is maintained: active tab has `tabIndex={0}`, inactive tabs have `tabIndex={-1}`.
   - Upon keyboard navigation, focus is shifted and scrolled into view:
     ```ts
     const tab = e.currentTarget.querySelector<HTMLButtonElement>(`[data-section="${ids[to]}"]`);
     tab?.focus();
     tab?.scrollIntoView({ block: "nearest", inline: "nearest" });
     ```
2. **Responsive Mobile Rail Auto-Scroll**:
   - On viewports < 1024px, the rail scrolls horizontally inside a 44px container with a gradient fade mask (`[mask-image:linear-gradient(...)]`).
   - In [`ReziStudioLayout.tsx`](file:///home/alnassar/Desktop/printcv/src/components/studio/ReziStudioLayout.tsx#L69-L78), an effect monitors `activeSection` and calculates whether the active tab is partially clipped:
     ```ts
     useEffect(() => {
       const tab = document.querySelector<HTMLElement>('[role="tablist"][aria-label="Sections"] [aria-selected="true"]');
       const row = tab?.parentElement;
       if (!tab || !row || !row.clientWidth || row.scrollWidth <= row.clientWidth) return;
       const t = tab.getBoundingClientRect();
       const r = row.getBoundingClientRect();
       const pad = getComputedStyle(row);
       const padLeft = parseFloat(pad.paddingLeft);
       if (t.left < r.left + padLeft || t.right > r.right - parseFloat(pad.paddingRight)) {
         row.scrollLeft += t.left - r.left - padLeft;
       }
     }, [activeSection]);
     ```
   - This prevents mobile users from losing visibility of their current section tab.
3. **Step State Indicators**:
   - `SectionMark` (lines 19-48) correctly handles states: `issues > 0` (warning pill), `"done"` (green checkmark), `"started"` (centered pip), `"todo"` (empty circle), `"optional"` (dashed circle), and `"off"` ("Hidden" text).

---

### 3.2 NextStep Banner & Action Linking
- **Components**: [`NextStep.tsx`](file:///home/alnassar/Desktop/printcv/src/components/studio/NextStep.tsx), [`ReziStudioLayout.tsx`](file:///home/alnassar/Desktop/printcv/src/components/studio/ReziStudioLayout.tsx#L86-L96), [`progress.ts`](file:///home/alnassar/Desktop/printcv/src/lib/progress.ts)

#### Interaction Analysis & Defects:
1. **NextStep Determination**:
   - [`nextStep()`](file:///home/alnassar/Desktop/printcv/src/lib/progress.ts#L91-L107) computes the next single most impactful action based on score check priorities.
   - When an issue exists on a line, it returns `{ section, itemId, lineText, text }`.
2. **Deep-Linking Execution (`jumpToItem`)**:
   - In [`ReziStudioLayout.tsx`](file:///home/alnassar/Desktop/printcv/src/components/studio/ReziStudioLayout.tsx#L86-L96):
     ```ts
     const jumpToItem = (section: StudioSection, itemId?: string, lineText?: string) => {
       selectSection(section);
       if (!itemId) return;
       setCollapsedItems((prev) => ({ ...prev, [itemId]: false }));
       setTimeout(() => {
         const card = document.getElementById(`item-${itemId}`);
         card?.scrollIntoView({ behavior: "smooth", block: "start" });
         const areas = Array.from(card?.querySelectorAll<HTMLTextAreaElement>("textarea[aria-label^='Line ']") ?? []);
         (areas.find((a) => a.value.trim() === lineText?.trim()) ?? areas[0])?.focus({ preventScroll: true });
       }, 60);
     };
     ```
3. **Defect 1: Focus Lost When `itemId` is Undefined (Severity: MEDIUM)**:
   - When `nextStep` returns an item without an `itemId` (e.g. `section: "PROJECTS", text: "Add your 42 projects first."` or `section: "EDUCATION", text: "Add the name of your school."`), `jumpToItem` executes `selectSection(section); return;`.
   - **Result**: The section tab switches, but **keyboard focus remains on the "Fix it" button** in the `<nav>`. Screen reader and keyboard users receive no indication that the sheet updated and focus does not transfer to the section heading or first input.
   - *Contrast*: In [`ScoreEngineModal.tsx`](file:///home/alnassar/Desktop/printcv/src/components/studio/ScoreEngineModal.tsx#L430), the author specifically handled this:
     `if (!itemId) setTimeout(() => document.querySelector<HTMLElement>("#studio-sheet h1")?.focus(), 60);`
     This fallback is missing in `jumpToItem`.
4. **Defect 2: Hardcoded 60ms Timing Race Condition (Severity: LOW)**:
   - On low-powered mobile devices or under main-thread contention, React re-rendering and DOM mounting of the newly selected section can exceed 60ms. If the DOM element `item-${itemId}` does not exist yet when the timeout fires, scroll and focus fail silently.

---

### 3.3 Projects Section
- **Component**: [`ProjectsSection.tsx`](file:///home/alnassar/Desktop/printcv/src/components/studio/sections/ProjectsSection.tsx)
- **Shared Helpers**: [`parts.tsx`](file:///home/alnassar/Desktop/printcv/src/components/studio/sections/parts.tsx), [`BulletEditorRow.tsx`](file:///home/alnassar/Desktop/printcv/src/components/studio/BulletEditorRow.tsx)

#### Interaction Analysis:
1. **Accordion Toggling**:
   - `ItemCard` (in `parts.tsx`, lines 84-126) wraps each project.
   - Card toggle button implements `aria-expanded={!collapsed}` and `aria-controls={collapsed ? undefined : bodyId}`.
   - Collapse state is tracked in `collapsedItems` dictionary.
2. **Passed 42 Project Picker**:
   - Lines 137-167: If the student logged in via 42 Intra, `otherIntraProjects` lists passed projects not yet added to the CV.
   - Displays first 12 projects (`PICKER_FIRST = 12`). If more exist, renders `"Show all {count}"` toggle button.
   - Clicking a project pill invokes `addProjectToCV({ name: p.name, slug: p.slug, is42Project: true, ... })`.
3. **Manual Project Creation**:
   - Line 169: `<SlotButton onClick={() => addProjectToCV({ name: "", techStack: "", date: "", is42Project: false, bulletPoints: [] })}>Add a project yourself</SlotButton>`
4. **Line Editor Interactions (`LinesBlock` & `BulletEditorRow`)**:
   - Adding a line (`onAdd`): Appends an empty string. `LinesBlock` sets `added.current = true`, and a `useEffect` on `lines.length` immediately focuses the newly rendered textarea.
   - Editing a line (`onChangeLine`): Directly calls `setLine(proj.id, i, v)` updating the store.
   - Character count and warnings: `BulletEditorRow` computes length in real time, displays `{length}/220` (warn color when exceeded), and renders specific warnings (`LINE_HINTS`).
   - Line reordering: Line Up and Line Down buttons swap lines via `swapLines`. A `requestAnimationFrame` callback refocuses the moved line's button.
   - Line deletion: Calls `focusAfterChange(groupRef.current, "textarea[aria-label^='Line ']", i, 'button[data-add="line"]')`, keeping focus on the next line or falling back to the add button.
5. **Project Card Reordering & Deletion**:
   - Reordering: Up/Down buttons call `moveProject(projIdx, dir)` and `refocusCardButton`.
   - Deletion: Removes project and triggers Soft Delete with Undo toast:
     ```ts
     removeProjectFromCV(proj.id);
     onSoftDelete({ id: proj.id, type: "project", label: proj.name || "Project", item: proj, index: projIdx });
     focusAfterChange(rootRef.current, CARD_TOGGLE, projIdx, ADD_ITEM);
     ```

---

### 3.4 Experience Section
- **Component**: [`ExperienceSection.tsx`](file:///home/alnassar/Desktop/printcv/src/components/studio/sections/ExperienceSection.tsx)

#### Interaction Analysis:
1. **Show/Hide Toggle**:
   - Managed via `<Toggle checked={shown} onChange={setShowExperience} label="Show on CV" />` in `SectionTitle`.
   - When `shown === false`: Renders informational card with "Show work experience" button.
   - **Auto-Hide on Last Job Deletion**:
     When the last job is deleted, `removeExperienceItem` automatically sets `showExperience: false`. The focus restoration logic handles this transition gracefully by targeting the fallback `'button[data-add="show"]'`.
2. **Current Position Checkbox ("I still work here")**:
   - Lines 120-140: `<input type="checkbox" checked={exp.isCurrent} ... />`
   - When checked: `endDate` input is disabled (`disabled={exp.isCurrent}`) with value `"Present"`.
   - When unchecked: Clears `"Present"` so the student can type their true end date.
3. **Soft Delete / Undo**:
   - Removing a job triggers `onSoftDelete({ id: exp.id, type: "experience", label: ..., item: exp, index: expIdx })`.

---

### 3.5 Education Section
- **Component**: [`EducationSection.tsx`](file:///home/alnassar/Desktop/printcv/src/components/studio/sections/EducationSection.tsx)

#### Interaction Analysis & Defects:
1. **Stage Selection**:
   - Radio buttons for 42 stage: `STATE_A_CORE` ("Common core"), `STATE_B_SPECIALIZATION` ("Advanced track"), `STATE_C_ALUMNUS` ("Finished 42").
   - Implemented via `<div role="group" aria-labelledby="edu-state-label">` with `aria-pressed={on}` buttons.
   - When clicked, `setEducationState` automatically updates the default program name of the main 42 school entry if the student has not typed a custom program name.
2. **Track Name Input**:
   - Rendered conditionally only when `cvData.educationState === "STATE_B_SPECIALIZATION"`.
   - Controls `cvData.specializationTrack`.
3. **School Card Interactions**:
   - Allows adding multiple schools via "Add a school".
   - Delete button is conditionally rendered only when `cvData.education.length > 1` (the primary school cannot be deleted).
4. **Defect 1: No Reordering Mechanism (Severity: LOW)**:
   - Unlike Projects and Experience, schools cannot be reordered. If a student adds their previous university and 42, there is no way to place university first or second.
5. **Defect 2: Missing Soft Delete / Undo (Severity: HIGH)**:
   - Deleting a school (`removeEducationItem(edu.id)`) executes immediately without confirmation and without creating an Undo toast buffer. Accidental deletion permanently destroys the entry.

---

### 3.6 Skills Section
- **Component**: [`SkillsSection.tsx`](file:///home/alnassar/Desktop/printcv/src/components/studio/sections/SkillsSection.tsx)

#### Interaction Analysis:
1. **Input Fields**:
   - 4 comma-separated fields: Languages, Tools, Frameworks, Teamwork tools.
2. **Local vs Store Synchronization (`SkillField`)**:
   - Lines 21-39 implement a robust pattern to prevent cursor disruption:
     ```tsx
     function SkillField({ id, label, placeholder, value, onChange }: ...) {
       const [text, setText] = useState(() => value.join(", "));
       useEffect(() => {
         setText((t) => (sameList(toList(t), value) ? t : value.join(", ")));
       }, [value]);

       return (
         ...
         <TextInput id={id} type="text" value={text} placeholder={placeholder}
           onChange={(e) => { setText(e.target.value); onChange(toList(e.target.value)); }} />
       );
     }
     ```
   - **Architectural Excellence**:
     - `text` is preserved locally while typing, so commas and trailing spaces are not stripped immediately.
     - `toList` parses clean arrays for the store (`text.split(",").map(s => s.trim()).filter(Boolean)`).
     - `sameList` guards the effect: external updates (e.g. 42 login import) overwrite local text, but internal typing does not reset the cursor.

---

### 3.7 Activities Section
- **Component**: [`ActivitiesSection.tsx`](file:///home/alnassar/Desktop/printcv/src/components/studio/sections/ActivitiesSection.tsx)

#### Interaction Analysis & Defects:
1. **Dual Structure**:
   - Subsection 1: "Courses and certificates" (always printed on CV).
   - Subsection 2: "Activities" (extracurriculars, governed by `Toggle` "Show on CV").
2. **Defect 1: Missing `institution` Field (Severity: MEDIUM)**:
   - In [`cv-store.ts`](file:///home/alnassar/Desktop/printcv/src/lib/store/cv-store.ts#L786-L791), `addCourseworkItem` accepts `{ title, date, institution }`.
   - In `ActivitiesSection.tsx` lines 51-56, only `title` and `date` inputs are rendered:
     ```tsx
     <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_11rem]">
       <TextInput type="text" aria-label="Course or certificate name" value={cw.title} placeholder="Course or certificate name" ... />
       <TextInput type="text" aria-label="Date" value={cw.date} placeholder="e.g. May 2024" ... />
     </div>
     ```
   - The user cannot enter or edit the institution/issuer for their certifications.
3. **Defect 2: Inconsistent Card Behaviors (Severity: LOW)**:
   - Extracurricular cards cannot be collapsed (no accordion toggle).
   - Extracurricular cards cannot be reordered (no Move Up / Move Down buttons).
4. **Defect 3: Critical Data Loss Risk on Activity Removal (Severity: HIGH)**:
   - Line 90-95:
     ```tsx
     <IconButton label="Remove activity" onClick={() => {
       removeExtracurricularItem(act.id);
       focusAfterChange(activitiesRef.current, 'button[aria-label="Remove activity"]', actIdx, ADD_ITEM);
     }}>
     ```
   - No confirmation dialog is shown, and **no Undo toast is triggered** (unlike Projects and Experience). If a student has written 4 detailed bullet points for an activity and misclicks the trash button, the entire activity and all lines are irreversibly deleted from localStorage.

---

## 4. Deep Dive: CRITICAL USABILITY BUG in `ContactSection.tsx`

### 4.1 Bug Description & Evidence
- **File**: [`ContactSection.tsx`](file:///home/alnassar/Desktop/printcv/src/components/studio/sections/ContactSection.tsx), Lines 57-68:
  ```tsx
  <Field id="contact-github" label="GitHub">
    {(a11y) => (
      <TextInput {...a11y} type="text" value={cvData.contact.githubUrl || ""} placeholder="github.com/username"
        onChange={(e) => updateContact({ githubUrl: normalizeGitHub(e.target.value) })} />
    )}
  </Field>
  <Field id="contact-linkedin" label="LinkedIn">
    {(a11y) => (
      <TextInput {...a11y} type="text" value={cvData.contact.linkedinUrl || ""} placeholder="linkedin.com/in/username"
        onChange={(e) => updateContact({ linkedinUrl: normalizeLinkedIn(e.target.value) })} />
    )}
  </Field>
  ```
- **Store Functions**: [`cv-store.ts`](file:///home/alnassar/Desktop/printcv/src/lib/store/cv-store.ts), Lines 36-54:
  ```ts
  export function normalizeLinkedIn(val: string): string {
    if (!val) return "";
    let cleaned = val.trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "");
    while (/^linkedin\.com\/(in\/)?/i.test(cleaned)) {
      cleaned = cleaned.replace(/^linkedin\.com\/(in\/)?/i, "");
    }
    cleaned = cleaned.replace(/\/+$/, "").replace(/\?.*$/, "");
    return cleaned ? `linkedin.com/in/${cleaned}` : "";
  }

  export function normalizeGitHub(val: string): string {
    if (!val) return "";
    let cleaned = val.trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "");
    while (/^github\.com\//i.test(cleaned)) {
      cleaned = cleaned.replace(/^github\.com\//i, "");
    }
    cleaned = cleaned.replace(/\/+$/, "").replace(/\?.*$/, "");
    return cleaned ? `github.com/${cleaned}` : "";
  }
  ```

### 4.2 Failure Mode Analysis

#### 1. Cursor Jump Bug
When an empty field receives the first keystroke (e.g. user types `'a'`):
1. `e.target.value` is `"a"`.
2. `normalizeGitHub("a")` runs synchronously: `cleaned` is `"a"`, return value is `"github.com/a"`.
3. The store `cvData.contact.githubUrl` is set to `"github.com/a"`.
4. React updates the controlled `<input>` with `"github.com/a"`.
5. Because the controlled input value was altered from what the browser DOM typed (`"a"` -> `"github.com/a"`), the browser's cursor tracking is broken and selection jumps to the end of the input string.
6. If the user clicks into the middle of their username to edit a typo, any keystroke causes the cursor to jump immediately to the end of the string.

#### 2. Backspace Fighting & Instant Field Erasure
Suppose the user has typed `github.com/a`:
1. The user presses `Backspace` at the end of the input to delete `'a'`.
2. The browser sets input value to `"github.com/"`.
3. `onChange` fires with `"github.com/"`.
4. `normalizeGitHub("github.com/")` executes:
   - `while (/^github\.com\//i.test(cleaned))` strips `"github.com/"`.
   - `cleaned` becomes `""`.
   - Function returns `""`!
5. **The entire input is wiped completely blank instantly!** The user cannot delete a single character without the normalization stripping the prefix and blanking the input.

#### 3. Backspace Fighting on the Domain Prefix
Suppose the user pastes `github.com/johndoe` and wants to delete `github.com/`:
1. The user places the cursor before `j` and presses Backspace to delete the slash: value becomes `github.comjohndoe`.
2. `normalizeGitHub("github.comjohndoe")` runs:
   - Does NOT match `^github\.com\/`.
   - `cleaned` remains `"github.comjohndoe"`.
   - Returns `"github.com/github.comjohndoe"`.
3. **The domain prefix is duplicated!** Every backspace keystroke into the prefix creates recursive prepending of `github.com/`.

#### 4. Root Cause & Architectural Inconsistency
In [`SkillsSection.tsx`](file:///home/alnassar/Desktop/printcv/src/components/studio/sections/SkillsSection.tsx), the engineer knew not to normalize on keystroke and used local state. In `ContactSection.tsx`, normalization was inappropriately attached to `onChange`.

### 4.3 Proposed Solution
Two acceptable fixes:
1. **Option A (Blur Normalization)**:
   Keep raw user input in local state during typing; apply `normalizeGitHub` / `normalizeLinkedIn` only `onBlur`.
2. **Option B (Visual Prefix Addon)**:
   Render `github.com/` and `linkedin.com/in/` as a static visual prefix addon outside the input element. The input value then stores only the pure handle (`username`), eliminating domain normalization while typing.

---

## 5. Modals, Dialogs, and Accessibility

### 5.1 Score Engine Modal (`ScoreEngineModal.tsx`)
- **Component**: [`ScoreEngineModal.tsx`](file:///home/alnassar/Desktop/printcv/src/components/studio/ScoreEngineModal.tsx)

#### Interaction Analysis:
1. **Tabs & Keyboard Navigation**:
   - Tabs: "Your score" (`overview`), "Fix lines ({count})" (`issues`), "Compare with a job ad" (`matcher`).
   - Line 84-96: `onTabKey` supports `ArrowRight`, `ArrowLeft`, `Home`, and `End` with circular wrapping.
   - Active tabpanel receives `tabIndex={0}` to allow keyboard users to scroll panel content.
2. **Deep-Linking ("Fix this line")**:
   - On the `issues` tab, each flagged bullet has a button `Fix this line`.
   - Clicking calls `jump(item.section, item.itemId, item.text)`, which closes the modal, opens the section tab, uncollapses the card, scrolls to it, and focuses the exact line textarea.
3. **Compare with Job Ad (`matcher`)**:
   - Textarea for job description text.
   - Synchronously extracts tech keywords via `matchJobKeywords` and compares against `cvData`.
   - Displays matched keywords (`Pill tone="positive"`) and missing keywords (`Pill tone="neutral"`).

---

### 5.2 Section Order Dialog (`SectionOrderDialog.tsx`)
- **Component**: [`SectionOrderDialog.tsx`](file:///home/alnassar/Desktop/printcv/src/components/studio/SectionOrderDialog.tsx)

#### Interaction Analysis:
1. **Button-Based Reordering (No Drag & Drop)**:
   - Reordering is implemented via accessible Move Up and Move Down buttons. (There is **no HTML5 drag-and-drop** implemented; interactions are strictly discrete button clicks).
2. **Focus Retention via `useLayoutEffect`**:
   - Lines 35-37:
     ```ts
     useLayoutEffect(() => {
       if (moved) buttons.current.get(`${moved.id}-${moved.dir}`)?.focus();
     }, [moved, order]);
     ```
   - When a row is moved up or down, focus does not jump to the top of the dialog; it stays on the exact directional button of the moved item.
3. **Boundary Protection & Announcements**:
   - At boundaries (top row Move Up, bottom row Move Down), buttons have `aria-disabled={true}` and inert click handling.
   - Screen reader announcement on line 78:
     `<p role="status" aria-live="polite" className="sr-only">{said}</p>`
     Announces e.g. `"Projects is now number 1 of 6."`.

---

### 5.3 Bullet Helper 3-Step Wizard (`BulletHelper.tsx`)
- **Component**: [`BulletHelper.tsx`](file:///home/alnassar/Desktop/printcv/src/components/studio/BulletHelper.tsx)
- **Logic Module**: [`bullet-helper.ts`](file:///home/alnassar/Desktop/printcv/src/lib/bullet-helper.ts)

#### Interaction Analysis:
1. **Step 0: Answer**:
   - Loads project-specific questions from `project-guide.ts` (e.g. for `ft_irc`: networking, poll, RFC parsing) or generic questions.
   - Multi-choice options modeled as buttons with `aria-pressed`. Freeform text uses auto-resizing textareas.
   - Validation gate: `hasEnoughAnswers(target, answers)` requires either 1 text answer >= 10 chars or 3 answered questions before the "Next" button is enabled.
2. **Step 1: Copy**:
   - Renders generated prompt in a read-only textarea.
   - Copy button invokes `navigator.clipboard.writeText(prompt)` with fallback to `select()` + `document.execCommand("copy")`.
   - Provides polite live region confirmation: `"Copied. Now paste it into the chat and send it."`.
   - Links to external AI services (ChatGPT, Claude, Gemini) with `target="_blank" rel="noopener noreferrer"`.
3. **Step 2: Paste & Parsing**:
   - User pastes the AI response.
   - [`parseBulletsFromAI()`](file:///home/alnassar/Desktop/printcv/src/lib/bullet-helper.ts#L161-L181) strips markdown (`*`, `_`, `` ` ``), bullet markers (`-`, `•`, numbers), and conversational preamble ("Here are your bullets:").
   - Strips em-dashes via `removeEmDashes`.
   - Evaluates each parsed bullet against quality criteria (action verb, number, length, template words).
   - "Apply" buttons: If the item already has lines, offers both "Add below mine" and "Replace my lines".

---

### 5.4 Dialog Lifecycle & Keyboard Trapping (`useDialog.ts`)
- **Module**: [`useDialog.ts`](file:///home/alnassar/Desktop/printcv/src/lib/use-dialog.ts)
- **Component**: [`DialogFrame.tsx`](file:///home/alnassar/Desktop/printcv/src/components/ui/DialogFrame.tsx)

#### Interaction Analysis:
1. **Background Inerting (`inertOutside`)**:
   - When a dialog opens, `inertOutside(ref.current)` walks up the DOM tree and sets `inert = true` on all sibling nodes. This guarantees screen readers and clicks cannot escape the modal window.
2. **Focus Trapping**:
   - Lines 48-67 intercept `Tab` and `Shift+Tab`. Focus wraps between the first and last focusable elements.
3. **Escape Key Handling**:
   - Closes dialog and returns focus to the original triggering button (`opener.focus({ preventScroll: true })`).
4. **Body Scroll Lock**:
   - Locks scrolling on `document.documentElement` (`overflow = "hidden"`).

---

## 6. Toasts & Undo System

### 6.1 Toast Region & Timers
- **Components**: [`StudioToasts.tsx`](file:///home/alnassar/Desktop/printcv/src/components/studio/StudioToasts.tsx), [`toast.ts`](file:///home/alnassar/Desktop/printcv/src/lib/toast.ts), [`ToastRegion.tsx`](file:///home/alnassar/Desktop/printcv/src/components/ui/ToastRegion.tsx)

#### Interaction Analysis:
1. **Dual Queue Architecture**:
   - Queue holds at most one `info` toast and one `undo` toast.
   - `undo` toasts always sort above `info` toasts.
2. **Timer Rules**:
   - Info toasts: auto-dismiss after 4000ms (`INFO_MS = 4000`).
   - Undo toasts: **Persistent** (`UNDO_MS = null`). The undo toast does not vanish until the user clicks Undo, clicks Close, or performs another deletion that replaces it.
3. **Timer Pausing on Hover & Focus**:
   - Lines 13-30: `onMouseEnter` / `onMouseLeave` and `onFocus` / `onBlur` set `paused = hovered || focused`.
   - When paused, active timeouts are cleared.
   - When unpaused, the timer restarts with the full duration.
4. **Focus Restoration on Dismissal**:
   - Tracks `cameFrom.current` when focus enters the toast region. If a toast closes while focused, focus returns to the initiating control.
   - When "Undo" is clicked, focus is immediately directed to the restored item (`focusAfterChange`).
5. **Systemic Gap: Asymmetric Undo Coverage (Severity: HIGH)**:
   - Soft-delete undo is implemented **only** for:
     - Projects (`restoreProjectAt`)
     - Experience (`restoreExperienceAt`)
   - Soft-delete undo is **completely missing** for:
     - Education
     - Skills
     - Coursework
     - Activities (Extracurriculars)

---

## 7. Export Workflows & Error Recovery

### 7.1 PDF Export & Print Portal
- **Components**: [`PrintableCV.tsx`](file:///home/alnassar/Desktop/printcv/src/components/templates/PrintableCV.tsx), [`globals.css`](file:///home/alnassar/Desktop/printcv/src/app/globals.css#L80-L112)

#### Interaction Analysis:
1. **DOM Portal Architecture**:
   - `PrintableCV` renders a 1:1 scale unzoomed copy of `CleanTemplate` via `createPortal(..., document.body)` inside a container `.print-root` marked `aria-hidden="true"`.
2. **Print Styles Isolation**:
   - `@media print` rules:
     ```css
     body > *:not(.print-root) { display: none !important; }
     .print-root { display: block !important; }
     @page { size: A4 portrait; margin: 0; }
     ```
   - This cleanly removes all studio UI, sidebars, buttons, and preview frames, printing only the pure A4 sheet.
3. **Dynamic PDF Filename Injection**:
   - Lines 18-34:
     ```ts
     useEffect(() => {
       let savedTitle = "";
       const before = () => {
         savedTitle = document.title;
         const name = cvData.contact.fullName?.trim();
         if (name) document.title = `${name} CV`;
       };
       const after = () => {
         if (savedTitle) document.title = savedTitle;
       };
       window.addEventListener("beforeprint", before);
       window.addEventListener("afterprint", after);
       return () => {
         window.removeEventListener("beforeprint", before);
         window.removeEventListener("afterprint", after);
       };
     }, [cvData.contact.fullName]);
     ```
   - Standard browser print dialogs use `document.title` as the default suggested filename when saving to PDF. This guarantees the downloaded PDF is named e.g. `Alex Morgan CV.pdf` instead of `PrintCV - Studio`.

---

### 7.2 Word DOCX Export
- **Module**: [`docx-generator.ts`](file:///home/alnassar/Desktop/printcv/src/lib/docx-generator.ts)
- **Studio Invocation**: [`ReziStudioLayout.tsx`](file:///home/alnassar/Desktop/printcv/src/components/studio/ReziStudioLayout.tsx#L224-L253)

#### Interaction Analysis:
1. **Dynamic Loading & Performance**:
   - Dynamically imported (`await import("@/lib/docx-generator")`) on button click, preventing the heavy `docx` library from slowing down initial page loads.
2. **Download Execution**:
   - `Packer.toBlob(doc)` generates binary blob.
   - Creates an Object URL, generates an invisible `<a download="..." href="...">` tag, programmatically triggers click, and cleans up with `setTimeout(() => URL.revokeObjectURL(url), 1000)`.
3. **Button State & Error Feedback**:
   - Button displays disabled state during generation (`isExportingDocx`).
   - Dispatches success or error toasts via `showToast`.

---

### 7.3 Error Recovery & Draft Rescue
- **Module**: [`draft-rescue.ts`](file:///home/alnassar/Desktop/printcv/src/lib/draft-rescue.ts)
- **Error Pages**: [`error.tsx`](file:///home/alnassar/Desktop/printcv/src/app/error.tsx), [`global-error.tsx`](file:///home/alnassar/Desktop/printcv/src/app/global-error.tsx)

#### Interaction Analysis:
1. **Zero-Dependency Architecture**:
   - `draft-rescue.ts` imports neither Zustand nor React. It reads directly from browser `localStorage.getItem(CV_STORE_KEY)`.
   - If an unhandled runtime error crashes the React tree or Zustand store, the error boundaries in `error.tsx` and `global-error.tsx` remain functional.
2. **Rescue Controls**:
   - **"Save a copy of my CV"** (`downloadSavedDraft`): Exports raw localStorage content as `printcv-draft.json`.
   - **"Start again"** (`startAgain`): Prompts `confirm("This clears the CV saved in this browser.")`, purges `localStorage`, and calls `location.assign("/studio")`.

---

## 8. Defect Severity Matrix & Recommendations

| ID | Location | Severity | Defect Description | User Impact | Recommended Remediation |
|---|---|---|---|---|---|
| **BUG-01** | `ContactSection.tsx:57-68` | **CRITICAL** | `normalizeGitHub` & `normalizeLinkedIn` run synchronously in `onChange`. | Severe cursor jumps to string end; backspace erases entire field or duplicates domain prefix. | Buffer raw input in local state; apply normalization only on `onBlur`, or render domain as static visual prefix addon. |
| **BUG-02** | `Masthead.tsx:30-41` | **HIGH** | Mobile `<details>` menu does not close when anchor links are clicked. | Menu stays open, covering the viewport after navigating to `#how`, `#sample`, or `#questions`. | Add `onClick={() => detailsRef.current?.removeAttribute("open")}` to child links, or bind outside-click handler. |
| **BUG-03** | `Cta.tsx:21-24` | **HIGH** | "Open the editor and fill it in by hand" is unlinked plain text. | Interaction dead-end for non-42 users at the bottom of the landing page. | Wrap "Open the editor" in `<a href="/studio">` styled as a link or button. |
| **BUG-04** | `ActivitiesSection.tsx:90-95` | **HIGH** | No soft delete / Undo toast when deleting an extracurricular activity. | Accidental deletion instantly and irreversibly destroys activity and all its bullet points. | Implement `onSoftDelete` and `restoreExtracurricularAt` matching the Projects section pattern. |
| **BUG-05** | `EducationSection.tsx:71-79` | **HIGH** | No soft delete / Undo toast when deleting a secondary school. | Accidental deletion permanently loses school degree, institution, and dates without recovery. | Implement soft delete buffer for education removals. |
| **BUG-06** | `ReziStudioLayout.tsx:86-96` | **MEDIUM** | `jumpToItem` does not transfer focus when `itemId` is undefined. | Clicking "Fix it" for general tasks leaves keyboard focus stranded on the Fix it button in nav. | Add `if (!itemId) setTimeout(() => document.querySelector("#studio-sheet h1")?.focus(), 60);`. |
| **BUG-07** | `ActivitiesSection.tsx:51-56` | **MEDIUM** | Coursework items lack `institution` input field in UI. | User cannot input or edit certification issuer/institution despite store support. | Add `institution` text field to the coursework grid. |
| **BUG-08** | `CVSheet.tsx:59-71` | **MEDIUM** | Canvas preview sections have `onClick` but lack keyboard focus/activation attributes. | Keyboard users cannot navigate the preview canvas to activate sections. | Add `tabIndex={0}`, `role="button"`, and `onKeyDown` (Enter/Space) to interactive section headers. |
| **BUG-09** | `AiMessage.tsx:12-18` | **LOW** | No "Copy prompt" button in the landing page showcase panel. | Users on mobile must manually select and copy long preformatted text. | Add a "Copy message" button with clipboard feedback to Panel 2. |
| **BUG-10** | `EducationSection.tsx:67-109` | **LOW** | Schools list cannot be reordered. | Users cannot choose whether 42 or their previous university appears first. | Add Move Up / Move Down buttons to education cards. |
| **BUG-11** | `ReziStudioLayout.tsx:90-95` | **LOW** | Hardcoded 60ms timeout in `jumpToItem` creates race condition on slow devices. | Focus/scroll can fail if DOM mounting takes > 60ms. | Use `requestAnimationFrame` polling or a mutation observer to wait for element existence. |

---

## 9. Conclusion

The functional architecture of PrintCV demonstrates remarkable maturity in keyboard accessibility, print reliability, and crash-resilient storage recovery. However, resolving **BUG-01** (Contact URL input normalization) is urgently necessary to eliminate a frustrating data entry experience, and addressing **BUG-02**, **BUG-03**, and **BUG-04** will ensure navigation and data safety parity across all user flows.

*Report compiled and verified by Agent 5 (Functional QA Specialist).*
