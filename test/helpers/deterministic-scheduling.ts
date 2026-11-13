import { resetSessionControllerForTesting } from "../../src/lib/draft-session";
import { useCVStore } from "../../src/lib/store/cv-store";

/**
 * In-memory Mock Storage implementing the web Storage interface with error injection support.
 */
export class MockStorage implements Storage {
  private store = new Map<string, string>();
  private nextError: Error | null = null;
  private quotaErrorEnabled = false;

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.nextError) {
      const err = this.nextError;
      this.nextError = null;
      throw err;
    }
    if (this.quotaErrorEnabled) {
      throw new Error("QuotaExceededError");
    }
    this.store.set(key, String(value));
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  key(index: number): string | null {
    return [...this.store.keys()][index] ?? null;
  }

  get length(): number {
    return this.store.size;
  }

  // Error injection helpers
  failNextSetItem(err: Error): void {
    this.nextError = err;
  }

  setQuotaError(enabled: boolean): void {
    this.quotaErrorEnabled = enabled;
  }
}

/**
 * Deterministic controllable clock for fake-time testing.
 */
export class DeterministicClock {
  private currentTime: number;

  constructor(initialTime = 1000) {
    this.currentTime = initialTime;
  }

  now = (): number => this.currentTime;

  advance(ms: number): number {
    this.currentTime += ms;
    return this.currentTime;
  }

  setTime(time: number): void {
    this.currentTime = time;
  }
}

/**
 * Deterministic Web Lock Manager that can run immediately, hold/queue acquisitions, or invoke hooks.
 * Properly forwards both resolution and rejection when releasing queued callbacks.
 */
export class DeterministicLockManager {
  private queue: Array<() => void> = [];
  private holdEnabled = false;
  private hook: ((cb: (lock: any) => Promise<any>) => Promise<any>) | null = null;

  setHold(enabled: boolean): void {
    this.holdEnabled = enabled;
  }

  setHook(hook: ((cb: (lock: any) => Promise<any>) => Promise<any>) | null): void {
    this.hook = hook;
  }

  releaseOne(): boolean {
    const next = this.queue.shift();
    if (next) {
      next();
      return true;
    }
    return false;
  }

  releaseAll(): number {
    let count = 0;
    while (this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) {
        next();
        count++;
      }
    }
    return count;
  }

  get queuedCount(): number {
    return this.queue.length;
  }

  reset(): void {
    this.queue = [];
    this.holdEnabled = false;
    this.hook = null;
  }

  async request(_name: string, optionsOrCallback: any, maybeCallback?: any): Promise<any> {
    const callback = typeof optionsOrCallback === "function" ? optionsOrCallback : maybeCallback;
    if (this.hook) {
      return this.hook(callback);
    }
    if (this.holdEnabled) {
      return new Promise((resolve, reject) => {
        this.queue.push(() => {
          try {
            Promise.resolve(callback({})).then(resolve, reject);
          } catch (err) {
            reject(err);
          }
        });
      });
    }
    return callback({});
  }

  /**
   * Helper to create a queuing hook that captures lock requests and returns a release controller,
   * guaranteeing that both fulfilled values and rejected errors are properly propagated.
   */
  createQueuedHook(): {
    hook: (cb: (lock: any) => Promise<any>) => Promise<any>;
    releaseNext: () => boolean;
    releaseAll: () => number;
    getQueueLength: () => number;
  } {
    const internalQueue: Array<() => void> = [];
    const hook = (cb: (lock: any) => Promise<any>): Promise<any> => {
      return new Promise((resolve, reject) => {
        internalQueue.push(() => {
          try {
            Promise.resolve(cb({})).then(resolve, reject);
          } catch (err) {
            reject(err);
          }
        });
      });
    };

    return {
      hook,
      releaseNext: () => {
        const next = internalQueue.shift();
        if (next) {
          next();
          return true;
        }
        return false;
      },
      releaseAll: () => {
        let count = 0;
        while (internalQueue.length > 0) {
          const next = internalQueue.shift();
          if (next) {
            next();
            count++;
          }
        }
        return count;
      },
      getQueueLength: () => internalQueue.length,
    };
  }
}

/**
 * Deterministic Fetch Manager supporting user mocking, delayed promises, and custom overrides.
 */
export class DeterministicFetchManager {
  private currentUser: any = null;
  private override: ((url: string, opts?: any) => Promise<any>) | null = null;

  setUser(user: any): void {
    this.currentUser = user;
  }

  getUser(): any {
    return this.currentUser;
  }

  setOverride(fn: ((url: string, opts?: any) => Promise<any>) | null): void {
    this.override = fn;
  }

  delayNextAuth(): { resolve: (user?: any) => void; promise: Promise<any> } {
    let resolveFn!: (user?: any) => void;
    const promise = new Promise<any>((resolve) => {
      resolveFn = (userOverride?: any) => {
        const u = userOverride !== undefined ? userOverride : this.currentUser;
        resolve({
          ok: true,
          json: async () => ({
            authenticated: Boolean(u),
            user: u,
          }),
        });
      };
    });
    this.override = () => promise;
    return { resolve: resolveFn, promise };
  }

  reset(): void {
    this.currentUser = null;
    this.override = null;
  }

  async fetch(url: string, opts?: any): Promise<any> {
    if (this.override) {
      return this.override(url, opts);
    }
    if (opts?.method === "DELETE") {
      return {
        ok: true,
        json: async () => ({ success: true }),
      };
    }
    return {
      ok: true,
      json: async () => ({
        authenticated: Boolean(this.currentUser),
        user: this.currentUser,
      }),
    };
  }
}

/**
 * Deterministic scheduling pause helper.
 */
export const pause = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Global test environment container.
 */
export interface DeterministicTestEnv {
  localStorage: MockStorage;
  sessionStorage: MockStorage;
  locks: DeterministicLockManager;
  fetchManager: DeterministicFetchManager;
  clock: DeterministicClock;
  reset(): void;
}

let activeEnv: DeterministicTestEnv | null = null;

/**
 * Sets up the deterministic global environment.
 */
export function setupDeterministicEnv(): DeterministicTestEnv {
  if (activeEnv) {
    activeEnv.reset();
    return activeEnv;
  }

  const localStorage = new MockStorage();
  const sessionStorage = new MockStorage();
  const locks = new DeterministicLockManager();
  const fetchManager = new DeterministicFetchManager();
  const clock = new DeterministicClock();

  (global as any).localStorage = localStorage;
  (global as any).sessionStorage = sessionStorage;
  (global as any).window = {
    localStorage,
    sessionStorage,
    location: { search: "", pathname: "/studio" },
    history: { replaceState: () => {} },
  };
  (global as any).document = { title: "QA" };

  Object.defineProperty(global, "navigator", {
    value: {
      locks: {
        request: (n: string, o: any, cb?: any) => locks.request(n, o, cb),
      },
    },
    configurable: true,
  });

  (global as any).fetch = (url: string, opts?: any) => fetchManager.fetch(url, opts);

  const env: DeterministicTestEnv = {
    localStorage,
    sessionStorage,
    locks,
    fetchManager,
    clock,
    reset: () => {
      resetSessionControllerForTesting();
      localStorage.clear();
      sessionStorage.clear();
      locks.reset();
      fetchManager.reset();
      clock.setTime(1000);
      try {
        useCVStore.getState().resetToDefaults();
      } catch {
        // ignore if store not yet initialized
      }
    },
  };

  activeEnv = env;
  return env;
}

/**
 * Self-check verifying scheduler rejection forwarding, holding, and controllable clock.
 */
export async function runSchedulerSelfCheck(): Promise<boolean> {
  const locks = new DeterministicLockManager();
  const clock = new DeterministicClock(500);

  // Clock verification
  if (clock.now() !== 500) throw new Error("Clock init failed");
  clock.advance(250);
  if (clock.now() !== 750) throw new Error("Clock advance failed");

  // Rejection forwarding verification in hold mode
  locks.setHold(true);
  let rejected = false;
  const lockPromise = locks.request("test", async () => {
    throw new Error("Lock action intentional rejection");
  }).catch((err) => {
    if (err.message === "Lock action intentional rejection") {
      rejected = true;
    }
  });

  if (locks.queuedCount !== 1) throw new Error("Expected lock to be queued");
  locks.releaseOne();
  await lockPromise;
  if (!rejected) throw new Error("Lock rejection was not forwarded!");

  // Rejection forwarding verification with createQueuedHook
  const hookObj = locks.createQueuedHook();
  let hookRejected = false;
  const hookPromise = hookObj.hook(async () => {
    throw new Error("Hook intentional rejection");
  }).catch((err) => {
    if (err.message === "Hook intentional rejection") {
      hookRejected = true;
    }
  });

  if (hookObj.getQueueLength() !== 1) throw new Error("Expected hook to be queued");
  hookObj.releaseNext();
  await hookPromise;
  if (!hookRejected) throw new Error("Hook rejection was not forwarded!");

  return true;
}

/** Cancellable fake timer queue; advancing time never sleeps or polls. */
export class DeterministicTaskScheduler {
  private time = 0;
  private sequence = 0;
  private tasks = new Map<number, { due: number; run: () => void }>();
  schedule = (run: () => void, delay: number): (() => void) => {
    const id = ++this.sequence;
    this.tasks.set(id, { due: this.time + delay, run });
    return () => { this.tasks.delete(id); };
  };
  advance(ms: number): void {
    this.time += ms;
    const due = [...this.tasks].filter(([, task]) => task.due <= this.time)
      .sort((a, b) => a[1].due - b[1].due || a[0] - b[0]);
    for (const [id, task] of due) {
      if (this.tasks.delete(id)) task.run();
    }
  }
}
