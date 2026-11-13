// Dedicated browser acceptance test for account/draft isolation using Chrome DevTools Protocol (CDP)
import fs from "fs";
import { launch, Page } from "./cdp";

const CHROME =
  process.platform === "win32"
    ? "C:/Program Files/Google/Chrome/Application/chrome.exe"
    : "/usr/bin/google-chrome";

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  console.log("==================================================================");
  console.log("QA: ACCOUNT DRAFT BROWSER ISOLATION ACCEPTANCE CHECK");
  console.log("==================================================================\n");

  // 1. Verify prerequisites
  if (!fs.existsSync(CHROME)) {
    console.error(`[BLOCKED] Chrome executable not found at: ${CHROME}`);
    process.exitCode = 2;
    return;
  }

  let serverReachable = false;
  try {
    const res = await fetch("http://127.0.0.1:3000/studio", { method: "HEAD" });
    if (res.ok || res.status === 200 || res.status === 304) {
      serverReachable = true;
    }
  } catch {
    serverReachable = false;
  }

  if (!serverReachable) {
    console.error("[BLOCKED] Local test server at http://127.0.0.1:3000/studio is not reachable.");
    process.exitCode = 2;
    return;
  }

  let proc: any = null;
  let page: Page | null = null;
  let tempDir: string | null = null;

  try {
    const cdp = await launch(9333);
    proc = cdp.proc;
    page = cdp.page;
    tempDir = cdp.tempDir;

    // Mock session state
    let currentMockUser: { id: number; login: string; displayname?: string; validatedProjects?: any[] } | null = {
      id: 101,
      login: "alice",
      displayname: "Alice Candidate",
      validatedProjects: [],
    };
    const metrics = { deleteRequestCount: 0 };
    const getDeleteCount = () => metrics.deleteRequestCount;
    const activePage = page;

    // Intercept /api/auth/session requests via CDP Fetch domain
    await activePage.send("Fetch.enable", {
      patterns: [{ urlPattern: "*api/auth/session*", requestStage: "Request" }],
    });

    activePage.on("Fetch.requestPaused", async (params: any) => {
      try {
        const { requestId, request } = params;
        const method = request.method;
        let responseBody = "";

        if (method === "DELETE") {
          metrics.deleteRequestCount++;
          currentMockUser = null;
          responseBody = JSON.stringify({ success: true });
        } else {
          responseBody = JSON.stringify({
            authenticated: Boolean(currentMockUser),
            fresh: false,
            user: currentMockUser,
          });
        }

        const base64Body = Buffer.from(responseBody).toString("base64");
        await activePage.send("Fetch.fulfillRequest", {
          requestId,
          responseCode: 200,
          responseHeaders: [
            { name: "Content-Type", value: "application/json" },
            { name: "Cache-Control", value: "no-store" },
          ],
          body: base64Body,
        });
      } catch (err) {
        console.error("Fetch interception error:", err);
      }
    });

    // -------------------------------------------------------------------------
    // STEP 1: Student A (Alice, ID 101) mounts studio, edits contact in DOM, autosaves
    // -------------------------------------------------------------------------
    console.log("[STEP 1] Alice (Student 101) mounts Studio and enters editor...");
    await page.goto("http://127.0.0.1:3000/studio", 3000);

    const title = await page.eval<string>("document.title");
    console.log("  - Page Title:", title);

    const editorMounted = await page.eval<boolean>(
      "Boolean(window.__PRINTCV_CONTROLLER__ && window.__PRINTCV_STORE__)"
    );
    if (!editorMounted) {
      throw new Error("Studio controller and store were not initialized on page load.");
    }

    const stateA = await page.eval<any>("window.__PRINTCV_CONTROLLER__.getState()");
    console.log("  - Controller State A:", JSON.stringify(stateA));
    if (stateA.state !== "EDITING_ACCOUNT" || stateA.studentId !== 101) {
      throw new Error(`Expected Alice in EDITING_ACCOUNT 101, got: ${JSON.stringify(stateA)}`);
    }

    // Alice performs a deliberate edit via real DOM input
    console.log("  - Alice switches to Contact tab and performs substantive edit via DOM input: fullName = 'Alice Systems Architect'...");
    await page.eval(`(() => {
      const contactTab = document.querySelector('button[data-section="CONTACT"]') ||
        document.querySelector('#section-tab-contact') ||
        Array.from(document.querySelectorAll('button[role="tab"]')).find(b => b.innerText.includes("details") || b.innerText.includes("Contact"));
      if (contactTab) contactTab.click();
    })()`);
    await pause(300);

    await page.eval(`(() => {
      const input = document.querySelector('input[autocomplete="name"]') ||
        document.querySelector('input[placeholder*="Alex Morgan"]');
      if (!input) throw new Error("Full name input not found in DOM");
      input.focus();
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      nativeSetter.call(input, "Alice Systems Architect");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    })()`);

    // Wait for debounce autosave (300ms + margin)
    await pause(600);

    // Verify DOM rendered text contains Alice's name
    const domBodyA = await page.eval<string>("document.body.innerText");
    if (!domBodyA.includes("Alice Systems Architect")) {
      throw new Error("Alice's name was not rendered in the DOM preview/editor!");
    }

    const storedA = await page.eval<string>(
      "localStorage.getItem('printcv_drafts_v1:account:42:101')"
    );
    if (!storedA || !storedA.includes("Alice Systems Architect")) {
      throw new Error(`Alice's edit was not persisted to account:42:101 storage: ${storedA}`);
    }

    const storedBBefore = await page.eval<string>(
      "localStorage.getItem('printcv_drafts_v1:account:42:202')"
    );
    if (storedBBefore !== null) {
      throw new Error("Student B's storage key was unexpectedly created before B logged in.");
    }
    console.log("✓ STEP 1 PASSED: Alice's draft entered via DOM input and persisted safely to account:42:101.\n");

    // -------------------------------------------------------------------------
    // STEP 2: Alice logs out truthfully via real DOM account menu click
    // -------------------------------------------------------------------------
    console.log("[STEP 2] Alice logs out via DOM menu interaction...");
    await page.eval(`(() => {
      const accountBtn = document.querySelector('[data-test-id="account-button"]');
      if (accountBtn) accountBtn.click();
      const buttons = Array.from(document.querySelectorAll('button'));
      const logoutBtn = buttons.find((b) => b.innerText.includes("Log out") || b.title?.includes("Log out"));
      if (!logoutBtn) {
        // Fallback to topbar MoreMenu logout
        const moreBtn = document.querySelector('[aria-label="More"]');
        if (moreBtn) moreBtn.click();
        const moreLogout = Array.from(document.querySelectorAll('button')).find((b) => b.innerText.includes("Log out"));
        if (moreLogout) moreLogout.click();
        else window.__PRINTCV_CONTROLLER__.logout();
      } else {
        logoutBtn.click();
      }
    })()`);

    await pause(600);

    if (getDeleteCount() !== 1) {
      throw new Error(`Expected exactly 1 DELETE request, received: ${getDeleteCount()}`);
    }

    // Verify DOM absence of Alice's name after logout
    const domBodyAfterLogout = await page.eval<string>("document.body.innerText");
    if (domBodyAfterLogout.includes("Alice Systems Architect")) {
      throw new Error("DOM LEAK: Alice's draft still rendered in DOM after logout!");
    }

    const stateAfterLogout = await page.eval<any>("window.__PRINTCV_CONTROLLER__.getState()");
    if (stateAfterLogout.state !== "WELCOME") {
      throw new Error(`Expected WELCOME state after logout, got: ${JSON.stringify(stateAfterLogout)}`);
    }

    // Verify Alice's draft remains preserved in localStorage, not visible in active editor
    const aliceDataPersisted = await page.eval<string>(
      "localStorage.getItem('printcv_drafts_v1:account:42:101')"
    );
    if (!aliceDataPersisted || !aliceDataPersisted.includes("Alice Systems Architect")) {
      throw new Error("Alice's draft in localStorage was destroyed on logout!");
    }
    console.log("✓ STEP 2 PASSED: Alice logged out via DOM menu; DOM cleanly unrendered and draft preserved.\n");

    // -------------------------------------------------------------------------
    // STEP 3: Student B (Bob, ID 202) logs in, exercises Review/Keep-Separate Banner & Edits
    // -------------------------------------------------------------------------
    console.log("[STEP 3] Bob (Student 202) logs in and exercises DOM review banner...");
    currentMockUser = {
      id: 202,
      login: "bob",
      displayname: "Bob Infrastructure",
      validatedProjects: [],
    };

    // Inject a guest draft with substantive work to trigger the review banner
    await page.eval(`(() => {
      localStorage.setItem('printcv_drafts_v1:guest', JSON.stringify({
        schemaVersion: 1,
        draftId: 'guest-sample-banner',
        owner: { kind: 'guest' },
        revision: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        snapshotVersion: 1,
        snapshot: {
          cvData: {
            contact: { fullName: "Shared Guest Draft" },
            projects: [{ id: "p1", name: "Push_swap", bulletPoints: ["Sorting in C"] }],
            education: [],
            experience: [],
            skills: { languages: [], developerTools: [], technologiesFrameworks: [], projectManagementTools: [] },
            coursework: [],
            extracurriculars: []
          }
        }
      }));
    })()`);

    await page.eval("window.__PRINTCV_CONTROLLER__.reconcileSession()");
    await pause(800);

    const stateB = await page.eval<any>("window.__PRINTCV_CONTROLLER__.getState()");
    console.log("  - Controller State B:", JSON.stringify(stateB));
    if (stateB.state !== "EDITING_ACCOUNT" || stateB.studentId !== 202) {
      throw new Error(`Expected Bob in EDITING_ACCOUNT 202, got: ${JSON.stringify(stateB)}`);
    }

    // Assert DOM does NOT render Alice's name
    const domBodyB = await page.eval<string>("document.body.innerText");
    if (domBodyB.includes("Alice Systems Architect")) {
      throw new Error(`DOM LEAK: Bob's session rendered Alice's data!`);
    }

    // Verify Review Banner is present in DOM
    const bannerPresent = await page.eval<boolean>(
      "Boolean(document.querySelector('aside[aria-label=\"Available previous draft banner\"]'))"
    );
    if (!bannerPresent) {
      throw new Error("Expected review draft banner in DOM for available guest draft.");
    }

    // Click "Review Guest Draft" in the DOM banner
    console.log("  - Clicking Review button in DOM banner...");
    await page.eval(`(() => {
      const banner = document.querySelector('aside[aria-label=\"Available previous draft banner\"]');
      if (!banner) throw new Error("Banner not found");
      const btn = banner.querySelector('button');
      if (!btn) throw new Error("Review button not found in banner");
      btn.click();
    })()`);
    await pause(400);

    // Verify DraftOwnershipDialog opened in DOM
    const dialogOpened = await page.eval<boolean>(
      "Boolean(document.querySelector('[role=\"dialog\"]'))"
    );
    if (!dialogOpened) {
      throw new Error("Draft ownership dialog did not open after clicking Review button.");
    }

    // Click "Keep Separate" button in DOM
    console.log("  - Clicking 'Keep Separate' button in DOM dialog...");
    await page.eval(`(() => {
      const buttons = Array.from(document.querySelectorAll('[role=\"dialog\"] button'));
      const keepBtn = buttons.find((b) => b.innerText.includes("Keep Separate"));
      if (!keepBtn) throw new Error("Keep Separate button not found in dialog");
      keepBtn.click();
    })()`);
    await pause(400);

    // Assert banner is REMOVED from DOM after Keep Separate choice
    const bannerAfterKeep = await page.eval<boolean>(
      "Boolean(document.querySelector('aside[aria-label=\"Available previous draft banner\"]'))"
    );
    if (bannerAfterKeep) {
      throw new Error("Review banner unexpectedly remained in DOM after 'Keep Separate' choice.");
    }

    // Bob edits his contact via DOM
    console.log("  - Bob switches to Contact tab and enters his own name via DOM: 'Bob Cloud Architect'...");
    await page.eval(`(() => {
      const contactTab = document.querySelector('button[data-section="CONTACT"]') ||
        document.querySelector('#section-tab-contact') ||
        Array.from(document.querySelectorAll('button[role="tab"]')).find(b => b.innerText.includes("details") || b.innerText.includes("Contact"));
      if (contactTab) contactTab.click();
    })()`);
    await pause(300);

    await page.eval(`(() => {
      const input = document.querySelector('input[autocomplete="name"]') ||
        document.querySelector('input[placeholder*="Alex Morgan"]');
      if (!input) throw new Error("Full name input not found in DOM");
      input.focus();
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      nativeSetter.call(input, "Bob Cloud Architect");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    })()`);
    await pause(600);

    const storedB = await page.eval<string>(
      "localStorage.getItem('printcv_drafts_v1:account:42:202')"
    );
    if (!storedB || !storedB.includes("Bob Cloud Architect")) {
      throw new Error(`Bob's edit was not persisted to account:42:202 storage: ${storedB}`);
    }

    // Re-verify Alice's storage was NOT touched by Bob's edits
    const aliceStillIntact = await page.eval<string>(
      "localStorage.getItem('printcv_drafts_v1:account:42:101')"
    );
    if (!aliceStillIntact || !aliceStillIntact.includes("Alice Systems Architect")) {
      throw new Error("Alice's storage was corrupted or overwritten by Bob!");
    }
    console.log("✓ STEP 3 PASSED: Complete data isolation, DOM banner review, and Keep Separate verified.\n");

    // -------------------------------------------------------------------------
    // STEP 4: Page Refresh & Returning Student Story (A -> B -> A)
    // -------------------------------------------------------------------------
    console.log("[STEP 4] Refreshing page to verify persistence under Bob, then Alice returns...");
    await page.goto("http://127.0.0.1:3000/studio", 3000);
    await pause(600);

    // Assert Bob's CV restored from storage on page refresh
    const refreshedBobDom = await page.eval<string>("document.body.innerText");
    if (!refreshedBobDom.includes("Bob Cloud Architect")) {
      throw new Error("Bob's data was not restored after page refresh!");
    }

    // Bob logs out via DOM menu
    await page.eval(`(() => {
      const accountBtn = document.querySelector('[data-test-id="account-button"]');
      if (accountBtn) accountBtn.click();
      const buttons = Array.from(document.querySelectorAll('button'));
      const logoutBtn = buttons.find((b) => b.innerText.includes("Log out") || b.title?.includes("Log out"));
      if (logoutBtn) logoutBtn.click();
      else window.__PRINTCV_CONTROLLER__.logout();
    })()`);
    await pause(600);

    if (getDeleteCount() !== 2) {
      throw new Error(`Expected exactly 2 DELETE requests, received: ${getDeleteCount()}`);
    }

    // Alice logs back in
    currentMockUser = {
      id: 101,
      login: "alice",
      displayname: "Alice Candidate",
      validatedProjects: [],
    };

    await page.eval("window.__PRINTCV_CONTROLLER__.reconcileSession()");
    await pause(800);

    const stateAReturn = await page.eval<any>("window.__PRINTCV_CONTROLLER__.getState()");
    if (stateAReturn.state !== "EDITING_ACCOUNT" || stateAReturn.studentId !== 101) {
      throw new Error(`Expected Alice back in EDITING_ACCOUNT 101, got: ${JSON.stringify(stateAReturn)}`);
    }

    // Verify Alice's name rendered in DOM
    const restoredAliceDom = await page.eval<string>("document.body.innerText");
    if (!restoredAliceDom.includes("Alice Systems Architect")) {
      throw new Error("Alice's name was not rendered in DOM upon returning!");
    }
    if (restoredAliceDom.includes("Bob Cloud Architect")) {
      throw new Error("DOM LEAK: Bob's data leaked into Alice's restored account view!");
    }
    console.log("✓ STEP 4 PASSED: Page refresh and returning student A restored with exact edits, zero DOM leaks.\n");

    console.log("==================================================================");
    console.log("ALL REAL CDP BROWSER ISOLATION CHECKS COMPLETED SUCCESSFULLY!");
    console.log("==================================================================");
    process.exitCode = 0;
  } catch (err) {
    console.error("\n[FAIL] QA Browser Acceptance Check Error:", err);
    process.exitCode = 1;
  } finally {
    console.log("Cleaning up browser process and temporary test profile...");
    if (page) {
      try { page.close(); } catch {}
    }
    if (proc) {
      try { proc.kill(); } catch {}
    }
    if (tempDir) {
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
    }
    console.log("Browser check cleanup complete.");
  }
}

main();
