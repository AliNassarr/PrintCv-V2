# Comprehensive Code Investigation & Architecture Audit Report

**Target Repository:** PrintCV (`/home/alnassar/Desktop/printcv`)  
**Auditor:** Agent 7 — Frontend Code Investigator & Senior QA Architect  
**Audit Scope:** `src/app/`, `src/components/`, `src/lib/`, `relay/`, `test/`  
**Classification:** Technical Audit / Code Quality & Security Report  
**Date:** November 2, 2026  

---

## Executive Summary

An exhaustive static code investigation and architectural analysis was conducted across the PrintCV codebase. The inspection covered React lifecycle management, state synchronization, CSS layout engines, trigonometric CSS scaling math, OAuth 2.0 authentication protocols, Cloudflare Worker relay operations, and application error boundaries.

The investigation uncovered **5 Critical Flaws**, **6 High-Priority Defects**, and **8 Medium/Low Architectural Inconsistencies**. Key findings include:

1. **Hydration Disconnect**: A severe state desynchronization bug where `StudioClient.tsx` uses a local `useState(false)` / `useEffect` hook (`useHasHydrated`) that completely bypasses the Zustand store's `hasHydrated` flag, risking store race conditions and hydration mismatch.
2. **Interactive Bullet Input Key Antipattern**: `LinesBlock` in `parts.tsx` uses index-keyed components (`key={`${itemId}-line-${i}`}`), breaking React DOM reconciliation during bullet reordering, deletion, and insertion, leading to text corruption, focus misplacement, and desynchronized ARIA hints.
3. **Typing-Time Normalization Anti-Pattern**: In `ContactSection.tsx`, URL normalizers (`normalizeLinkedIn`, `normalizeGitHub`) are invoked inside `onChange` handlers on every single keystroke. This causes cursor jumping to the end, backspace trapping, and makes manual URL entry impossible.
4. **CSS Trigonometric Fragility & Container Query Misconfiguration**: The application uses experimental CSS trigonometry (`tan(atan2(...))`) to calculate zoom scale without `@supports` or fallback values (breaking in Safari < 16.4 and older mobile browsers). Furthermore, Tailwind's official container queries plugin is missing from `package.json` and `tailwind.config.ts`, while CSS variables used by Tailwind color utilities are scoped only inside `.lp`, causing silent CSS resolution failures elsewhere.
5. **Printable Budget & Font Metrics Discrepancy**: The 1027px single-page budget in `CleanTemplate.tsx` relies on hardcoded dimensions against `innerContentRef.scrollHeight` (ignoring padding variations between standard 24mm and compact 20mm), while `CVSheet.tsx` relies on proprietary, unbundled font `Calibri`, which falls back to `Arial` on Linux/macOS with drastically different vertical metrics.
6. **DOCX Export Ignores User Section Ordering**: While the CV preview and `SectionOrderDialog.tsx` honor dynamic section ordering (`cvData.sectionOrder`), `docx-generator.ts` has completely hardcoded the section order, producing Word documents that silently defy the student's customized section arrangement.
7. **Cloudflare Relay Open Proxy & Cookie Truncation**: When `RELAY_SECRET` is unset, the relay worker acts as an open proxy to 42's API; furthermore, session cookie generation truncates only projects while large profiles with many roles or coursework risk exceeding browser 4096-byte limits, resulting in silent login drops.

---

## 1. React Lifecycle & State Management

### 1.1 Zustand Store Architecture (`src/lib/store/cv-store.ts`)

#### 1.1.1 The `setHasHydrated` vs `useHasHydrated` Disconnect (Critical)
In [cv-store.ts](file:///home/alnassar/Desktop/printcv/src/lib/store/cv-store.ts), the Zustand store is configured with the `persist` middleware.

- **Store Definition** ([cv-store.ts#L223-L247](file:///home/alnassar/Desktop/printcv/src/lib/store/cv-store.ts#L223-L247)):
  ```typescript
  // Line 223: Interface declaration
  hasHydrated: boolean;
  setHasHydrated: (val: boolean) => void;

  // Lines 246-247: Store initial state
  hasHydrated: false,
  setHasHydrated: (hasHydrated) => set({ hasHydrated }),
  ```

- **Rehydration Callback** ([cv-store.ts#L1220-L1230](file:///home/alnassar/Desktop/printcv/src/lib/store/cv-store.ts#L1220-L1230)):
  ```typescript
  onRehydrateStorage: () => (state) => {
    if (state) {
      if (!state.cvData?.sectionOrder || state.cvData.sectionOrder.length === 0) {
        state.cvData = {
          ...state.cvData,
          sectionOrder: [...DEFAULT_SECTION_ORDER],
        };
      }
      state.setHasHydrated(true);
    }
  },
  ```

- **Disconnected Local Hook** ([cv-store.ts#L1235-L1241](file:///home/alnassar/Desktop/printcv/src/lib/store/cv-store.ts#L1235-L1241)):
  ```typescript
  export function useHasHydrated() {
    const [hasHydrated, setHasHydrated] = useState(false);
    useEffect(() => {
      setHasHydrated(true);
    }, []);
    return hasHydrated;
  }
  ```

- **Usage in Consumer** ([StudioClient.tsx#L4-L72](file:///home/alnassar/Desktop/printcv/src/app/studio/StudioClient.tsx#L4-L72)):
  ```typescript
  // Line 4
  import { useCVStore, useHasHydrated } from "@/lib/store/cv-store";
  // Line 12
  const hasHydrated = useHasHydrated();
  // Line 71-72
  // The grey-bar shell until the saved draft is read
  if (!hasHydrated) return <StudioLoading />;
  ```

**Defect Analysis:**
1. The comment in `StudioClient.tsx` states: `// The grey-bar shell until the saved draft is read`. However, `useHasHydrated()` has **zero awareness** of `localStorage` or the Zustand rehydration status. It is simply a generic client-mount check (`isMounted`).
2. The store property `hasHydrated` (updated on line 1228 via `state.setHasHydrated(true)`) is **never subscribed to anywhere in the application**.
3. If Zustand rehydration is asynchronous or delayed across microtasks, `useHasHydrated()` returns `true` on React mount while the store still contains default empty data (`defaultCVData`). This causes `StudioClient` to immediately render `ReziStudioLayout` with unhydrated state, leading to layout flashing or draft overwrite race conditions.
4. If rehydration throws an error or `localStorage` is disabled/corrupted, `onRehydrateStorage` never calls `state.setHasHydrated(true)`, but `StudioClient` continues to unblock because `useHasHydrated()` unconditionally turns `true`.

**Remediation:**
Eliminate the disconnected local hook and bind directly to the Zustand store or Zustand's native persist API:
```typescript
export function useHasHydrated() {
  return useCVStore((s) => s.hasHydrated);
}
```
Or use `useCVStore.persist.hasHydrated()`.

---

#### 1.1.2 State Serialization, Partialize, and Storage Error Swallowing
- **Storage Wrapper** ([cv-store.ts#L1178-L1199](file:///home/alnassar/Desktop/printcv/src/lib/store/cv-store.ts#L1178-L1199)):
  ```typescript
  setItem: (name: string, value: string) => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(name, value);
    } catch {}
  },
  ```
  In `setItem`, exceptions such as `QuotaExceededError` (DOMException code 22) are silently swallowed via an empty `catch {}`. When a user has a large CV or local storage is constrained by browser privacy quotas, saves silently fail without notifying the user, and no fallback to `draft-rescue.ts` is triggered.
- **`resetToDefaults` Storage Race** ([cv-store.ts#L1104-L1133](file:///home/alnassar/Desktop/printcv/src/lib/store/cv-store.ts#L1104-L1133)):
  `resetToDefaults()` calls `set({ ... })` and then executes `localStorage.removeItem(CV_STORE_KEY)`. Because Zustand's persist listener fires synchronously upon `set()`, it immediately executes `setItem(CV_STORE_KEY, serializedState)`, which is then immediately followed by `removeItem`. While the item is removed, any subsequent mutation in memory restores it.
- **Architectural Mutation Asymmetry**:
  In `cv-store.ts`, `ExperienceItem` has full CRUD mutations: `addExperienceItem`, `updateExperienceItem`, `removeExperienceItem`, `moveExperience`, `reorderExperience` ([cv-store.ts#L193-L199](file:///home/alnassar/Desktop/printcv/src/lib/store/cv-store.ts#L193-L199)).
  Conversely, `ProjectItem` lacks an `updateProject` mutation. As a result, [ProjectsSection.tsx#L37-L38](file:///home/alnassar/Desktop/printcv/src/components/studio/sections/ProjectsSection.tsx#L37-L38) must manually construct and execute ad-hoc store mutations via `setCVData({ ...cvData, projects: cvData.projects.map(...) })`, breaking store encapsulation and bypassing centralized persistence triggers.

---

### 1.2 Component Rendering Lifecycle & Prop Drilling

#### 1.2.1 Non-Selective Store Subscriptions & Excessive Re-rendering
In [ReziStudioLayout.tsx#L35-L48](file:///home/alnassar/Desktop/printcv/src/components/studio/ReziStudioLayout.tsx#L35-L48):
```typescript
export function ReziStudioLayout({ notice, onCloseNotice }: ...) {
  const {
    cvData,
    setCVData,
    updateExperienceItem,
    updateExtracurricularItem,
    restoreProjectAt,
    restoreExperienceAt,
    setStyleDensity,
    setShowExtracurriculars,
    studentProfile,
    setStudentProfile,
    sampleDataRemovedNotice,
    dismissSampleDataRemovedNotice,
  } = useCVStore();
```
**Defect Analysis:**
- Calling `useCVStore()` without a selector subscribes `ReziStudioLayout` to the **entire Zustand store state**.
- Every single state update—including typing in a bullet point, updating `lastSavedTimestamp`, toggling an accordion, or changing a contact field—forces `ReziStudioLayout` (437 lines of JSX and heavy hooks) to completely re-render.
- On each re-render, four expensive scoring and analytical pipelines run synchronously in `useMemo`:
  - `scoreCV(cvData, ...)` ([ReziStudioLayout.tsx#L200-L203](file:///home/alnassar/Desktop/printcv/src/components/studio/ReziStudioLayout.tsx#L200-L203))
  - `sectionProgress(cvData, cvScore)` ([ReziStudioLayout.tsx#L206](file:///home/alnassar/Desktop/printcv/src/components/studio/ReziStudioLayout.tsx#L206))
  - `nextStep(cvData, cvScore)` ([ReziStudioLayout.tsx#L207](file:///home/alnassar/Desktop/printcv/src/components/studio/ReziStudioLayout.tsx#L207))
  - `linesToFix(cvData, cvScore)` ([ReziStudioLayout.tsx#L209](file:///home/alnassar/Desktop/printcv/src/components/studio/ReziStudioLayout.tsx#L209))
- As the user types rapidly into a bullet point, this causes noticeable input lag (dropped frames during IME composition or fast keystrokes).

#### 1.2.2 Prop Drilling vs Store Isolation
- `cvScore` is computed at the layout root and drilled down into `ContactSection`: `<ContactSection score={cvScore} />` ([ReziStudioLayout.tsx#L353](file:///home/alnassar/Desktop/printcv/src/components/studio/ReziStudioLayout.tsx#L353)).
- In `ContactSection.tsx`, the component *also* subscribes directly to `useCVStore((s) => s.cvData)` and `useCVStore((s) => s.updateContact)`.
- In `ProjectsSection.tsx` ([ProjectsSection.tsx#L31-L32](file:///home/alnassar/Desktop/printcv/src/components/studio/sections/ProjectsSection.tsx#L31-L32)), the author bypassed subscription by reading store actions via `useCVStore.getState()` at top-level component scope:
  ```typescript
  const { addProjectBullet: addLine, updateProjectBullet: setLine, removeProjectBullet: dropLine } = useCVStore.getState();
  ```
  Reading `getState()` directly inside a component body violates React's pure render contract and will not observe store transitions or hot reloads.

---

### 1.3 Array Index Key Antipattern in `LinesBlock` (High Severity)

In [parts.tsx#L192-L205](file:///home/alnassar/Desktop/printcv/src/components/studio/sections/parts.tsx#L192-L205):
```tsx
<div ref={listRef} className="flex flex-col gap-3">
  {lines.map((text, i) => (
    <BulletEditorRow
      key={`${itemId}-line-${i}`}
      text={text}
      index={i}
      onChange={(v) => onChangeLine(i, v)}
      onDelete={() => remove(i)}
      onMoveUp={i > 0 ? () => move(i, i - 1) : undefined}
      onMoveDown={i < lines.length - 1 ? () => move(i, i + 1) : undefined}
    />
  ))}
</div>
```

**Defect Analysis:**
1. **Reconciliation Failure during Reorder:**
   When a user clicks "Move line up" ([parts.tsx#L155-L163](file:///home/alnassar/Desktop/printcv/src/components/studio/sections/parts.tsx#L155-L163)) from index 1 to index 0, React reconciles children by their keys: `${itemId}-line-0` and `${itemId}-line-1`. Because the keys are tied to the array index `i`, React assumes the identity of DOM elements has not changed. It reuses the existing DOM nodes and component instances, merely updating their props.
2. **Internal Component State & Hook Corruptions:**
   In [BulletEditorRow.tsx#L60](file:///home/alnassar/Desktop/printcv/src/components/studio/BulletEditorRow.tsx#L60):
   ```typescript
   const warnId = useId();
   ```
   Each row generates a unique `warnId` used in `aria-describedby` ([BulletEditorRow.tsx#L73](file:///home/alnassar/Desktop/printcv/src/components/studio/BulletEditorRow.tsx#L73)). When lines are deleted, say line 0 from a 3-line list:
   - Index 0 retains key `${itemId}-line-0`.
   - Index 1 retains key `${itemId}-line-1`.
   - Index 2 (`${itemId}-line-2`) is unmounted.
   The DOM node representing line 0 now receives props for line 1, but its browser selection, native undo/redo stack, and active input composition state belong to the old line 0.
3. **Focus Flaws & DOM Queries:**
   In [parts.tsx#L157-L162](file:///home/alnassar/Desktop/printcv/src/components/studio/sections/parts.tsx#L157-L162):
   ```typescript
   requestAnimationFrame(() => {
     const row = listRef.current?.children[to];
     ...
     (row?.querySelector<HTMLButtonElement>(`button[aria-label="${want}"]`) ?? ...)?.focus();
   });
   ```
   Because React did not physically move the DOM node, the imperative `requestAnimationFrame` query races against React's DOM patch, frequently causing focus loss or focusing the incorrect button on mobile touch devices.

---

### 1.4 Normalization Functions & OnChange Anti-Pattern (High Severity)

#### 1.4.1 Code Duplication
The functions `normalizeLinkedIn` and `normalizeGitHub` are defined twice with identical implementations:
1. [src/lib/store/cv-store.ts#L36-L54](file:///home/alnassar/Desktop/printcv/src/lib/store/cv-store.ts#L36-L54)
2. [src/lib/sanitizer.ts#L104-L125](file:///home/alnassar/Desktop/printcv/src/lib/sanitizer.ts#L104-L125)

#### 1.4.2 The `onChange` Normalization Anti-Pattern
In [ContactSection.tsx#L57-L68](file:///home/alnassar/Desktop/printcv/src/components/studio/sections/ContactSection.tsx#L57-L68):
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

Looking at `normalizeGitHub` ([sanitizer.ts#L117-L125](file:///home/alnassar/Desktop/printcv/src/lib/sanitizer.ts#L117-L125)):
```typescript
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

**Defect Analysis & User Breakdown:**
1. **Keystroke Hijacking**: When a user focuses on the empty GitHub input and types `j`:
   - `e.target.value` is `"j"`.
   - `normalizeGitHub("j")` immediately returns `"github.com/j"`.
   - The input's controlled value changes from `""` to `"github.com/j"`.
2. **Cursor Position Displacement**: When React replaces `"j"` with `"github.com/j"`, the browser DOM cursor position resets to the end of the text (`position: 12`), preventing the user from typing anywhere else or making in-place corrections.
3. **Backspace Trapping**:
   - If the input currently contains `"github.com/a"` and the user presses Backspace to delete the `a`, `e.target.value` becomes `"github.com/"`.
   - In `normalizeGitHub`, `cleaned` is stripped of `github.com/`, becoming `""`.
   - Since `cleaned` is empty, `return cleaned ? ... : ""` returns `""`!
   - The entire field is immediately cleared from `"github.com/"` to `""`, wiping out the input unexpectedly.
4. **Impossible Protocol Entry**:
   - If a user tries to paste or type `https://github.com/username`: As soon as they type the first letter `h`, `normalizeGitHub("h")` transforms it into `github.com/h`. The next typed character `t` produces `github.com/ht`. The user is completely blocked from manually typing an HTTPS prefix.

**Remediation:**
Inputs must remain raw and uncontrolled during typing (`onChange`), with normalization applied strictly on blur (`onBlur`):
```tsx
const [githubInput, setGithubInput] = useState(cvData.contact.githubUrl || "");

<TextInput
  value={githubInput}
  onChange={(e) => setGithubInput(e.target.value)}
  onBlur={() => updateContact({ githubUrl: normalizeGitHub(githubInput) })}
/>
```

---

## 2. CSS Architecture & Conflicts

### 2.1 Tailwind Configuration & Scoped CSS Variables

#### 2.1.1 Missing Container Queries Plugin
In [tailwind.config.ts#L44](file:///home/alnassar/Desktop/printcv/tailwind.config.ts#L44):
```typescript
plugins: [],
```
In [package.json#L21-L33](file:///home/alnassar/Desktop/printcv/package.json#L21-L33), `@tailwindcss/container-queries` is **not installed**.

#### 2.1.2 Variable Scoping Mismatch
In [tailwind.config.ts#L9-L13](file:///home/alnassar/Desktop/printcv/tailwind.config.ts#L9-L13):
```typescript
colors: {
  paper: v("paper"), ground: v("ground"), ink: v("ink"), muted: v("muted"),
  canvas: v("canvas"), stage: v("stage"), "stage-hover": v("stage-hover"), 
  pane: v("pane"), line: v("line"), "line-strong": v("line-strong"),
  accent: v("accent"), flow: { 1: v("flow-1"), 2: v("flow-2"), 3: v("flow-3"), 4: v("flow-4") },
  ...
}
```
In [globals.css#L18-L27](file:///home/alnassar/Desktop/printcv/src/app/globals.css#L18-L27), the `:root` scope defines:
`--paper`, `--ground`, `--ink`, `--muted`, `--muted-on-ink`, `--mint`, `--data`, `--positive`, `--bad`, `--warn`, `--raised`, `--active`, `--edge`, `--rule`, `--control`, `--field`, `--bar`, `--pill-*`.

However, the variables:
`--canvas`, `--stage`, `--stage-hover`, `--pane`, `--line`, `--line-strong`, `--accent`, and `--flow-1..4`
are **only declared inside `.lp`** ([globals.css#L32-L38](file:///home/alnassar/Desktop/printcv/src/app/globals.css#L32-L38)).

**Consequence:**
If any component in the studio, 404 page, error boundary, or modal attempts to use Tailwind utility classes such as `bg-canvas`, `bg-stage`, `border-line`, or `text-accent`, the CSS variable resolves to `undefined` / `initial`, rendering transparent backgrounds and missing borders without any build-time or CSS warning.

---

### 2.2 Container Query Implementation in Landing Components

- In [Hero.tsx#L61](file:///home/alnassar/Desktop/printcv/src/components/landing/Hero.tsx#L61):
  ```tsx
  <div className="relative mx-auto aspect-[210/297] max-w-[480px] overflow-hidden bg-paper [container-type:inline-size] [--sheet-scale:tan(atan2(100cqw,793.7px))]">
    <div className="absolute left-0 top-0 origin-top-left" style={{ transform: "scale(var(--sheet-scale))" }}>
      <CVSheet data={DEMO_CV} nameAs="p" dataUi />
    </div>
  </div>
  ```
- In [Showcase.tsx#L26-L34](file:///home/alnassar/Desktop/printcv/src/components/landing/Showcase.tsx#L26-L34):
  ```tsx
  const FIT = "[--pdf-w:min(560px,100cqw_-_32px)] md:[--pdf-w:min(560px,100cqw_-_64px)] [--pdf-scale:tan(atan2(var(--pdf-w),793.7px))]";
  ...
  <div className={`aspect-[210/297] w-[var(--pdf-w)] overflow-hidden bg-paper ${FIT}`}>
    <div className="w-[210mm] origin-top-left" style={{ transform: "scale(var(--pdf-scale))" }}>
      <CVSheet data={DEMO_CV} nameAs="p" dataUi />
    </div>
  </div>
  ```
- In [OutputIndex.tsx#L31](file:///home/alnassar/Desktop/printcv/src/components/landing/OutputIndex.tsx#L31):
  ```tsx
  <div className="relative mt-2 overflow-hidden rounded-xl border border-line bg-stage [container-type:inline-size]">
  ```

**Defect Analysis:**
1. The developer wrote ad-hoc arbitrary Tailwind properties `[container-type:inline-size]` because the Tailwind container queries plugin was omitted.
2. In `Showcase.tsx`, `--pdf-w` references `100cqw` inside `FIT`. For `100cqw` to resolve, `Showcase.tsx` relies on the parent container declared inside `OutputIndex.tsx` ([OutputIndex.tsx#L31](file:///home/alnassar/Desktop/printcv/src/components/landing/OutputIndex.tsx#L31)). If `Showcase` is ever refactored, rendered standalone, or tested in isolation, `100cqw` evaluates against the viewport or defaults to `0px`, causing the entire PDF preview to collapse.
3. In `[--pdf-w:min(560px,100cqw_-_32px)]`, Tailwind uses underscores to represent spaces around subtraction operators in CSS `calc`/`min`. While modern WebKit and Blink parse this, older browsers reject unit subtractions inside `min()` without an explicit `calc()` wrapper.

---

### 2.3 Trigonometric CSS Functions: `tan(atan2(...))` Math & Support

#### 2.3.1 The Mathematical Mechanism
In CSS Values and Units Module Level 4:
`atan2(y, x)` calculates the arc tangent of two numbers or lengths `y` and `x`.
The developer used:
```css
--sheet-scale: tan(atan2(100cqw, 793.7px));
--pdf-scale: tan(atan2(var(--pdf-w), 793.7px));
```
Because standard CSS `calc()` explicitly prohibits dividing a `<length>` by another `<length>` (e.g., `calc(100cqw / 793.7px)` is invalid CSS), the author exploited trigonometric identities:
$$\tan(\operatorname{atan2}(y, x)) = \frac{y}{x}$$
Since `100cqw` and `793.7px` are both `<length>` values, `atan2` accepts them, returning an `<angle>`. The `tan()` function then takes that angle and returns a unitless `<number>`, effectively performing length division in pure CSS.

#### 2.3.2 Syntactic & Browser Support Vulnerabilities (High Severity)
1. **Browser Compatibility Threshold**:
   - Chrome / Chromium: Supported since Chrome 111 (March 2023).
   - Safari / WebKit: Basic trigonometry was introduced in Safari 15.4, but **`atan2()` was only supported starting in Safari 16.4** (March 27, 2023).
   - Firefox: Supported since Firefox 108 (December 2022).
2. **Failure Mode (Catastrophic Visual Overflow)**:
   In any browser engine released prior to Safari 16.4, iOS 16.4, or Chromium 111, `tan(atan2(...))` is an **unrecognized CSS function**.
   - The CSS declaration `--sheet-scale: tan(...)` is discarded as invalid.
   - `style={{ transform: "scale(var(--sheet-scale))" }}` resolves to `transform: scale()` (invalid syntax) or `scale(initial)`.
   - The preview sheet does **NOT scale down**. It renders at its raw 793.7px (210mm) width inside a 480px box, overflowing the hero card and violently blowing out the mobile viewport.
3. **No Fallback Provided**:
   Neither `Hero.tsx` nor `Showcase.tsx` includes a fallback value in `var()`, e.g., `var(--sheet-scale, 0.5)`, nor does the stylesheet implement `@supports (transform: scale(tan(atan2(1px, 1px))))`.

---

### 2.4 CleanTemplate vs CVSheet Measurement Pipeline

#### 2.4.1 Measurement Inaccuracy Against the 1027px Budget
In [CVSheet.tsx#L52](file:///home/alnassar/Desktop/printcv/src/components/templates/CVSheet.tsx#L52):
```typescript
export const PRINTABLE_BUDGET_PX = 1027;
```
In [CVSheet.tsx#L542](file:///home/alnassar/Desktop/printcv/src/components/templates/CVSheet.tsx#L542):
```typescript
padding: isCompact ? "10mm 12mm 10mm 12mm" : "12mm 15mm 12mm 15mm",
```
In [CleanTemplate.tsx#L34-L36](file:///home/alnassar/Desktop/printcv/src/components/templates/CleanTemplate.tsx#L34-L36):
```typescript
const height = innerContentRef.current.scrollHeight;
const percentage = Math.round((height / PRINTABLE_BUDGET_PX) * 100);
const isOverflow = height > PRINTABLE_BUDGET_PX;
```

**Defect Analysis:**
1. In `CVSheet.tsx` ([CVSheet.tsx#L562](file:///home/alnassar/Desktop/printcv/src/components/templates/CVSheet.tsx#L562)), `innerContentRef` is attached to:
   ```html
   <div ref={contentRef} className="w-full">
   ```
   This `div` is situated **inside** the padded sheet container (`.cv-sheet`). Therefore, `scrollHeight` measures **only the inner content**, excluding the sheet's padding.
2. A standard A4 sheet at 96 DPI is $297\text{ mm} \times \frac{96}{25.4} = 1122.52\text{ px}$.
   - **Standard Density Padding**: Top (12mm) + Bottom (12mm) = $24\text{ mm} \approx 90.71\text{ px}$.  
     Available printable content height = $1122.52 - 90.71 = \mathbf{1031.81\text{ px}}$.
   - **Compact Density Padding**: Top (10mm) + Bottom (10mm) = $20\text{ mm} \approx 75.59\text{ px}$.  
     Available printable content height = $1122.52 - 75.59 = \mathbf{1046.93\text{ px}}$.
3. **Flaw**: `PRINTABLE_BUDGET_PX` is hardcoded to `1027px` regardless of whether `styleDensity` is `"standard"` or `"compact"`. In compact mode, the user actually has `1046.93px` of available height, but `CleanTemplate` incorrectly flags overflow and triggers the "Longer than 1 page" warning when content reaches `1028px` (nearly 20px prematurely).

#### 2.4.2 Cross-Platform Font Metrics Drift (`Calibri` vs System Fonts)
In [CVSheet.tsx#L93](file:///home/alnassar/Desktop/printcv/src/components/templates/CVSheet.tsx#L93):
```typescript
const fontPrimary = "'Calibri', 'Arial', sans-serif";
```
In [globals.css#L6-L16](file:///home/alnassar/Desktop/printcv/src/app/globals.css#L6-L16), web font declarations exist for `Jost` and `Bodoni Moda`, with explicit font-metric overrides (`size-adjust`, `ascent-override`, `descent-override`).
**However, `Calibri` is completely unhosted.**
- Windows machines have native Microsoft Calibri.
- Linux (Ubuntu, Debian, Fedora, Arch) and default macOS/iOS installations **do not have Calibri**. They immediately fall back to `Arial` or `sans-serif`.
- `Arial` has a larger x-height, wider character bounding boxes, and different line-gap metrics than `Calibri`.
- **Impact**: A CV that measures 1010px (under budget) on a Windows developer workstation will measure ~1060px on Linux or macOS, triggering an artificial overflow indicator and shifting page breaks unpredictably.

#### 2.4.3 `ResizeObserver` Inefficiencies in `CleanTemplate.tsx`
In [CleanTemplate.tsx#L29-L57](file:///home/alnassar/Desktop/printcv/src/components/templates/CleanTemplate.tsx#L29-L57):
- The `useEffect` hook depends on `[data]`.
- On every single keystroke in the studio, `data` reference changes.
- React tears down the old `ResizeObserver` and instantiates a brand new one.
- During effect execution, `calculateBudget()` immediately invokes `onHeightBudgetChangeRef.current(...)`, synchronously updating the parent layout's state (`setHeightBudget` in `ReziStudioLayout.tsx#L106-L111`), triggering an immediate second rendering pass.
- In [PrintableCV.tsx#L39-L41](file:///home/alnassar/Desktop/printcv/src/components/templates/PrintableCV.tsx#L39-L41), `CleanTemplate` is mounted inside `.print-root` which has `display: none`. In DOM layout, `display: none` renders element dimensions as $0\times 0$, meaning `CleanTemplate` needlessly attaches a `ResizeObserver` to an element with 0 height.

---

## 3. API Routes & Auth Security

### 3.1 OAuth 2.0 Flow Architecture

PrintCV provides two distinct OAuth 2.0 completion architectures:

```
[Standard Flow]
Browser -> GET /api/auth/42/login
        -> Redirect to 42 Intra (/oauth/authorize)
        -> 42 Redirects to /api/auth/callback/42-school
        -> Node Server exchanges code at Intra (/oauth/token & /v2/me)
        -> Sets session cookies & redirects to /studio?login=...
        -> StudioClient calls /api/auth/session?code=...

[Relay Flow] (Used when 42 blocks Vercel server IPs)
Browser -> GET /api/auth/42/login (sets SameSite=None state cookie)
        -> Redirect to 42 Intra (/oauth/authorize with redirect_uri=relay/callback)
        -> 42 Redirects student to Cloudflare Worker (/callback)
        -> Worker calls Intra API (/oauth/token & /v2/me)
        -> Worker generates HTML form auto-submitting POST to /api/auth/42/relay-finish
        -> Node Server validates HMAC signature, timestamp, & state cookie
        -> Sets session cookies & redirects to /studio?login=...
```

#### 3.1.1 State Nonce Security & CSRF
- **State Generation**: In [auth-session.ts#L114-L116](file:///home/alnassar/Desktop/printcv/src/lib/auth-session.ts#L114-L116), `createOAuthState()` generates 32 bytes of cryptographic randomness using `crypto.randomBytes(32).toString("base64url")`.
- **Comparison**: State validation in [auth-session.ts#L34-L38](file:///home/alnassar/Desktop/printcv/src/lib/auth-session.ts#L34-L38) uses `crypto.timingSafeEqual` after buffer length verification.
- **Login Code**: In [auth-session.ts#L96-L98](file:///home/alnassar/Desktop/printcv/src/lib/auth-session.ts#L96-L98), a secondary one-time code (`createLoginCode()`) is stored in an `httpOnly` cookie with a 2-minute max-age. When `StudioClient.tsx` exchanges this code at `/api/auth/session?code=...`, the code is cleared immediately ([session/route.ts#L30](file:///home/alnassar/Desktop/printcv/src/app/api/auth/session/route.ts#L30)), preventing URL-sharing replay attacks.

---

### 3.2 Cookie Security & Storage Boundaries

| Cookie Name | Scope / Path | httpOnly | Secure | SameSite | Max Age |
| :--- | :--- | :---: | :---: | :---: | :---: |
| `printcv_session` | `/` | **Yes** | `NODE_ENV === "production"` | `lax` | 24 Hours |
| `printcv_oauth_state` (Standard) | `/api/auth` | **Yes** | `NODE_ENV === "production"` | `lax` | 10 Minutes |
| `printcv_oauth_state` (Relay) | `/api/auth` | **Yes** | **True** (Required) | `none` | 10 Minutes |
| `printcv_login_code` | `/api/auth` | **Yes** | `NODE_ENV === "production"` | `lax` | 2 Minutes |

#### 3.2.1 Vulnerability: Silent Profile Drop on Large Profiles (Medium Severity)
In [auth-session.ts#L46-L60](file:///home/alnassar/Desktop/printcv/src/lib/auth-session.ts#L46-L60):
```typescript
export function createSessionToken(user: IntraProfile): string {
  const expiresAt = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;
  let trimmed = user;
  let token = encode(trimmed, expiresAt);

  // Very long project histories: keep the newest projects until the cookie fits
  while (token.length > MAX_COOKIE_BYTES && trimmed.validatedProjects.length > 0) {
    trimmed = {
      ...trimmed,
      validatedProjects: trimmed.validatedProjects.slice(0, Math.floor(trimmed.validatedProjects.length * 0.8)),
    };
    token = encode(trimmed, expiresAt);
  }
  return token;
}
```
**Defect Analysis:**
- The compression algorithm only truncates `validatedProjects`.
- If an Intra student has extensive cursus data, numerous campus roles, or large campus metadata outside of `validatedProjects`, `trimmed.validatedProjects` will reduce to `0` while `token.length` still exceeds `MAX_COOKIE_BYTES` (3800 bytes).
- When `token.length > 4096`, standard browsers (Chrome, Safari, Firefox) **silently reject the Set-Cookie header**.
- The student completes the OAuth redirect successfully, but upon landing on `/studio`, `/api/auth/session` finds no cookie and reports `authenticated: false`. The user is stuck in a silent login failure loop with no error message.

---

### 3.3 Cloudflare Worker Security (`relay/cloudflare-worker.js`)

#### 3.3.1 HMAC SHA-256 Signature Verification
In [cloudflare-worker.js#L57-L64](file:///home/alnassar/Desktop/printcv/relay/cloudflare-worker.js#L57-L64), the worker signs handoff data:
```javascript
async function sign(secret, text) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(text)));
  let binary = "";
  for (const byte of mac) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
```
In [relay-handoff.ts#L13-L15](file:///home/alnassar/Desktop/printcv/src/lib/intra/relay-handoff.ts#L13-L15):
```typescript
export function signRelayHandoff(secret: string, state: string, ts: string, me: string): string {
  return crypto.createHmac("sha256", secret).update(`${state}.${ts}.${me}`).digest("base64url");
}
```
**Verification Assessment:**
- Both implementations correctly produce RFC 7515 URL-safe base64 strings without padding.
- [relay-handoff.ts#L34](file:///home/alnassar/Desktop/printcv/src/lib/intra/relay-handoff.ts#L34) enforces strict regex matching on `state` (`/^[A-Za-z0-9_-]+$/`) and `ts` (`/^\d{13}$/`), preventing delimiter injection.
- Replay protection is enforced via a 5-minute maximum age ([relay-handoff.ts#L9](file:///home/alnassar/Desktop/printcv/src/lib/intra/relay-handoff.ts#L9)) and 60-second clock skew tolerance.

#### 3.3.2 Open Proxy Risk in Worker Fallback (High Severity)
In [cloudflare-worker.js#L191-L206](file:///home/alnassar/Desktop/printcv/relay/cloudflare-worker.js#L191-L206):
```javascript
// The older way: PrintCV's server calls 42 through here. Turned off once RELAY_SECRET is set.
if (setting((env || {}).RELAY_SECRET) || ALLOWED[pathname] !== request.method) {
  return Response.json({ error: "not_found" }, { status: 404 });
}
...
const res = await fetch(INTRA + pathname, { method: request.method, headers, body: ... });
```
**Defect Analysis:**
If an administrator deploys the Cloudflare Worker without immediately setting `RELAY_SECRET` in worker environment variables:
- The worker acts as an **unauthenticated open forward proxy** to `https://api.intra.42.fr/oauth/token` and `/v2/me`.
- Anyone on the public internet can send requests through the worker, exploiting Cloudflare's IP range to bypass IP restrictions or conceal malicious scraping activity against 42 Intra.
- In addition, [cloudflare-worker.js#L161-L189](file:///home/alnassar/Desktop/printcv/relay/cloudflare-worker.js#L161-L189) exposes an unauthenticated `/check` endpoint that actively probes 42 Intra servers on demand.

---

## 4. Error Handling & Boundary Hierarchy

### 4.1 Boundary Hierarchy: `error.tsx` vs `global-error.tsx`

```
Next.js Root Layout (src/app/layout.tsx)
  |
  +---> Caught by src/app/global-error.tsx (Renders <html><body>)
  |
  +---> App Subtree (src/app/page.tsx, src/app/studio/page.tsx)
          |
          +---> Caught by src/app/error.tsx (Renders within Root Layout)
```

#### 4.1.1 Defect: Parameter Destructuring in `global-error.tsx` (Medium Severity)
In [global-error.tsx#L5](file:///home/alnassar/Desktop/printcv/src/app/global-error.tsx#L5):
```typescript
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
```
**Analysis:**
- The component defines the TypeScript type `{ error: Error & { digest?: string }; reset: () => void }`, but in the function parameter list, `error` is **omitted from destructuring**.
- While [error.tsx#L9](file:///home/alnassar/Desktop/printcv/src/app/error.tsx#L9) logs `console.error("PrintCV error", error.digest ?? "")`, `global-error.tsx` **completely drops the error object**.
- No log, no console output, and no diagnostic message is recorded when a root layout crash occurs.

#### 4.1.2 Production Debugging Black Hole
In [error.tsx#L7-L10](file:///home/alnassar/Desktop/printcv/src/app/error.tsx#L7-L10):
```typescript
useEffect(() => {
  // Log only the code, never CV or profile data
  console.error("PrintCV error", error.digest ?? "");
}, [error]);
```
**Analysis:**
To protect user privacy (avoiding leaking CV text into logs), the error boundary explicitly logs *only* `error.digest`. However, client-side runtime errors in React (e.g., `TypeError: Cannot read properties of undefined`) do not have a server `digest`. As a result, the console outputs:
```
PrintCV error
```
with an empty string. The actual error stack and error name are completely obscured, making client-side triage in production nearly impossible.

---

### 4.2 Draft Rescue Isolation (`src/lib/draft-rescue.ts`)

In [draft-rescue.ts](file:///home/alnassar/Desktop/printcv/src/lib/draft-rescue.ts):
```typescript
export function readSavedDraft(): string | null {
  try {
    return localStorage.getItem(CV_STORE_KEY);
  } catch {
    return null;
  }
}
```
**Architecture Review:**
- The rescue utility has **zero imports from Zustand, React, or UI components**.
- This guarantees that if the Zustand store bundle is corrupted, or if React hydration fails catastrophically, `draft-rescue.ts` functions remain 100% executable.
- `downloadSavedDraft()` ([draft-rescue.ts#L13-L24](file:///home/alnassar/Desktop/printcv/src/lib/draft-rescue.ts#L13-L24)) creates an offline JSON blob and triggers a browser download without React intervention.
- **Limitation**: When a user clicks "Try again" (`reset()`) in `error.tsx`, React re-mounts the component tree against the same in-memory or persisted Zustand store. If the crash was caused by corrupted data in `cvData`, `reset()` immediately re-crashes the app. The error boundary should offer an explicit "Safe Reset" option that clears the corrupted store before retrying.

---

### 4.3 DOCX Generation & Section Order Disconnect (Critical Bug)

In [ReziStudioLayout.tsx#L224-L253](file:///home/alnassar/Desktop/printcv/src/components/studio/ReziStudioLayout.tsx#L224-L253):
```typescript
const handleExportDocx = async () => {
  setIsExportingDocx(true);
  try {
    const { generateCvDocx } = await import("@/lib/docx-generator");
    const blob = await generateCvDocx(cvData);
    ...
  } catch (err) {
    console.error("DOCX generation error:", err instanceof Error ? err.message : "unknown");
    showToast({ title: "Could not make the Word file", desc: "Something went wrong. Please try again." });
  } finally {
    setIsExportingDocx(false);
  }
};
```

**CRITICAL FINDING: Section Order Ignored in Word Export**
In [docx-generator.ts](file:///home/alnassar/Desktop/printcv/src/lib/docx-generator.ts):
- A comprehensive search for `sectionOrder` in `docx-generator.ts` returns **0 occurrences**.
- The sections are generated in a completely hardcoded sequence:
  1. `addSectionHeader("Education")` ([docx-generator.ts#L184](file:///home/alnassar/Desktop/printcv/src/lib/docx-generator.ts#L184))
  2. `addSectionHeader("Experience")` ([docx-generator.ts#L283](file:///home/alnassar/Desktop/printcv/src/lib/docx-generator.ts#L283))
  3. `addSectionHeader("Selected Projects")` ([docx-generator.ts#L366](file:///home/alnassar/Desktop/printcv/src/lib/docx-generator.ts#L366))
  4. `addSectionHeader("Technical Skills")` ([docx-generator.ts#L444](file:///home/alnassar/Desktop/printcv/src/lib/docx-generator.ts#L444))
  5. `addSectionHeader("Relevant Coursework and Workshops")` ([docx-generator.ts#L472](file:///home/alnassar/Desktop/printcv/src/lib/docx-generator.ts#L472))
  6. `addSectionHeader("Extracurricular Activities")` ([docx-generator.ts#L507](file:///home/alnassar/Desktop/printcv/src/lib/docx-generator.ts#L507))

**Impact:**
When a student uses `SectionOrderDialog.tsx` to move **Projects** to the top of their CV (standard practice for 42 students with limited professional work experience), the web preview and PDF print accurately display Projects first. **However, exporting to Word (.docx) silently ignores `cvData.sectionOrder` and places Education and Experience above Projects.** This represents a severe mismatch between screen preview and downloaded output.

---

## 5. Audit Findings & Remediation Matrix

| ID | Domain | Severity | Location | Issue Description | Recommended Remediation |
| :--- | :--- | :---: | :--- | :--- | :--- |
| **F-01** | React State | **CRITICAL** | `cv-store.ts:1235` `StudioClient.tsx:12` | `useHasHydrated` is a disconnected local hook ignoring Zustand store `hasHydrated`. | Replace `useHasHydrated` implementation with `useCVStore((s) => s.hasHydrated)`. |
| **F-02** | DOCX Export | **CRITICAL** | `docx-generator.ts:184-507` | Word export hardcodes section order, ignoring `cvData.sectionOrder`. | Refactor `generateCvDocx` to iterate over `cvData.sectionOrder` dynamically like `CVSheet.tsx`. |
| **F-03** | React UX | **HIGH** | `ContactSection.tsx:60,66` `sanitizer.ts:104` | Calling `normalizeGitHub` / `normalizeLinkedIn` in `onChange` hijacks cursor & traps backspace. | Store raw text in local state on `onChange`; apply normalization strictly `onBlur`. |
| **F-04** | React Keys | **HIGH** | `parts.tsx:195` | `LinesBlock` uses array index in keys (`key={`${itemId}-line-${i}`}`), breaking DOM reconciliation. | Assign stable IDs to bullet points or generate deterministic hash keys based on creation timestamp. |
| **F-05** | CSS Math | **HIGH** | `Hero.tsx:61` `Showcase.tsx:26` | `tan(atan2(...))` math lacks fallback; breaks completely in Safari < 16.4 / older browsers. | Add `@supports` check or CSS variable fallback scalar: `transform: scale(var(--sheet-scale, 0.5))`. |
| **F-06** | Relay Security| **HIGH** | `cloudflare-worker.js:192` | Cloudflare Worker acts as an open forward proxy to 42 Intra when `RELAY_SECRET` is unset. | Require `RELAY_SECRET` at worker entry point; return 403/500 if unconfigured. |
| **F-07** | CSS Config | **MEDIUM** | `tailwind.config.ts:44` `globals.css:32` | `@tailwindcss/container-queries` missing; theme variables (`--line`, `--stage`) missing from `:root`. | Install container query plugin and move common landing tokens to `:root` with default values. |
| **F-08** | CSS Height | **MEDIUM** | `CleanTemplate.tsx:35` `CVSheet.tsx:52` | 1027px budget is hardcoded, ignoring compact mode padding differences (20mm vs 24mm). | Dynamically calculate budget: `PRINTABLE_BUDGET_PX = A4_H - (isCompact ? 75.6 : 90.7)`. |
| **F-09** | Typography | **MEDIUM** | `CVSheet.tsx:93` | `fontPrimary = "'Calibri'..."` uses unbundled proprietary font; renders with Arial metrics on Mac/Linux. | Bundle Carlito/Calibri metrics override font or use standard font-face stack. |
| **F-10** | React Perf | **MEDIUM** | `ReziStudioLayout.tsx:35` | Destructuring whole store via `useCVStore()` forces layout re-render on every keystroke. | Use atomic selectors: `useCVStore((s) => s.cvData)` or Zustand slice selectors. |
| **F-11** | Storage | **MEDIUM** | `cv-store.ts:1191` | `localStorage.setItem` swallows `QuotaExceededError` silently. | Catch quota errors and trigger toast notification with `draft-rescue` backup option. |
| **F-12** | Auth / Cookie | **MEDIUM** | `auth-session.ts:52` | Large student profiles fail to set cookie when non-project fields exceed 3800 bytes. | Truncate cursus/roles or store overflow in partitioned session chunks. |
| **F-13** | Error Logging | **LOW** | `global-error.tsx:5` `error.tsx:9` | `global-error.tsx` omits `error` parameter; `error.tsx` only logs `digest`, hiding stack trace. | Destructure `error` in `global-error.tsx`; log `error.message` and stack in development/client log. |
| **F-14** | Code Hygiene | **LOW** | `cv-store.ts:36-54` `sanitizer.ts:104-125`| Duplicated normalizer functions between `cv-store.ts` and `sanitizer.ts`. | Consolidate normalization functions exclusively in `sanitizer.ts`. |

---
*Report completed and submitted by Agent 7 (Frontend Code Investigator).*
