// Plain constants shared by the printed CV and the store. No imports, so the landing page can use them.
export const MAIN_EDUCATION_ID = "edu-main";
// localStorage key of the saved CV draft (the store re-exports it; the error pages read it without the store)
export const CV_STORE_KEY = "printcv_draft_v1";
export const CV_STORE_VERSION = 2;

// Multi-owner drafts and locking constants
export const DRAFTS_LOCK_NAME = "printcv-drafts-v1";
export const DRAFTS_KEY_PREFIX = "printcv_drafts_v1:";
export const WORKSPACE_STORAGE_KEY = "printcv_workspace_v1";
export const BROADCAST_CHANNEL_NAME = "printcv_drafts_channel";
