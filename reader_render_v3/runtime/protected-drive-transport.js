import { normalizeProtectedSyncBundle, serializeProtectedSyncBundle } from "./protected-sync-bundle.js";
import { assessProtectedSyncTransportImport } from "./protected-sync-transport.js";
import {
  buildProtectedDriveAppProperties,
  buildProtectedDriveFileIdentity,
  buildProtectedDriveHandoffState,
  buildProtectedDriveFileName,
  compareProtectedDriveFreshness,
  normalizeProtectedDriveRemoteFile
} from "./protected-drive-file.js";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.appdata";
const API_FILES = "https://www.googleapis.com/drive/v3/files";
const API_UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const TOKEN_KEY = "readerpub:drive:access_token";
const TOKEN_EXP_KEY = "readerpub:drive:access_token_exp";

function getStorage(type) {
  try {
    if (type === "session") return globalThis.sessionStorage || null;
    return globalThis.localStorage || null;
  } catch (error) {
    return null;
  }
}

function getDriveSync() {
  try {
    return globalThis.ReaderPubDriveSync || null;
  } catch (error) {
    return null;
  }
}

function getCachedDriveAuth() {
  const session = getStorage("session");
  const local = getStorage("local");
  const token =
    (session && session.getItem(TOKEN_KEY)) ||
    (local && local.getItem(TOKEN_KEY)) ||
    "";
  const tokenExp =
    parseInt(
      (session && session.getItem(TOKEN_EXP_KEY)) ||
      (local && local.getItem(TOKEN_EXP_KEY)) ||
      "0",
      10
    ) || 0;
  return {
    token: token ? String(token) : "",
    tokenExp
  };
}

function isTokenValid(tokenExp) {
  if (!tokenExp) return false;
  return Date.now() + 15000 < tokenExp;
}

function buildMultipartBody({ metadata, jsonPayload, boundary }) {
  return (
    `--${boundary}\r\n` +
    "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
    `${jsonPayload}\r\n` +
    `--${boundary}--`
  );
}

function createGoogleDriveFileApi() {
  async function ensureAuth(interactive) {
    const driveSync = getDriveSync();
    if (!driveSync) {
      throw new Error("Google Drive transport helper is unavailable.");
    }
    const authState = driveSync.getAuthState ? driveSync.getAuthState() : { configured: false, authorized: false };
    if (!authState.configured) {
      return {
        configured: false,
        authorized: false,
        scope: DRIVE_SCOPE
      };
    }
    if (!authState.authorized) {
      const ok = driveSync.ensureAuthorized
        ? await driveSync.ensureAuthorized(!!interactive)
        : driveSync.signIn
          ? await driveSync.signIn()
          : false;
      const refreshed = driveSync.getAuthState ? driveSync.getAuthState() : { configured: true, authorized: !!ok };
      return {
        configured: !!refreshed.configured,
        authorized: !!refreshed.authorized,
        scope: DRIVE_SCOPE
      };
    }
    return {
      configured: !!authState.configured,
      authorized: !!authState.authorized,
      scope: DRIVE_SCOPE
    };
  }

  async function driveFetch(url, options = {}) {
    const auth = getCachedDriveAuth();
    if (!auth.token || !isTokenValid(auth.tokenExp)) {
      throw new Error("Google Drive authorization is unavailable.");
    }
    const headers = new Headers(options.headers || {});
    headers.set("Authorization", `Bearer ${auth.token}`);
    const response = await fetch(url, {
      ...options,
      headers
    });
    if (response.status === 401) {
      throw new Error("Drive authorization expired.");
    }
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Drive request failed (${response.status}): ${text || response.statusText}`);
    }
    return response;
  }

  return {
    async getAvailability(interactive = false) {
      return ensureAuth(interactive);
    },
    async findFile(identity, interactive = false) {
      const auth = await ensureAuth(interactive);
      if (!auth.configured || !auth.authorized) return null;
      const q = encodeURIComponent(`name = '${identity.fileName}' and trashed = false`);
      const fields = encodeURIComponent("files(id,name,modifiedTime,size,appProperties)");
      const url = `${API_FILES}?spaces=appDataFolder&q=${q}&pageSize=10&orderBy=modifiedTime desc&fields=${fields}`;
      const response = await driveFetch(url);
      const json = await response.json();
      const files = Array.isArray(json && json.files) ? json.files : [];
      return files.length ? normalizeProtectedDriveRemoteFile(files[0]) : null;
    },
    async createFile({ identity, serializedSyncFile, appProperties }, interactive = true) {
      const auth = await ensureAuth(interactive);
      if (!auth.configured || !auth.authorized) throw new Error("Google Drive is not authorized.");
      const boundary = `-------readerpub-protected-${Date.now()}`;
      const metadata = {
        name: identity.fileName,
        parents: ["appDataFolder"],
        mimeType: "application/json",
        appProperties
      };
      const response = await driveFetch(`${API_UPLOAD}?uploadType=multipart&fields=id,name,modifiedTime,size,appProperties`, {
        method: "POST",
        headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
        body: buildMultipartBody({
          metadata,
          jsonPayload: serializedSyncFile,
          boundary
        })
      });
      return normalizeProtectedDriveRemoteFile(await response.json());
    },
    async updateFile({ fileId, identity, serializedSyncFile, appProperties }, interactive = true) {
      const auth = await ensureAuth(interactive);
      if (!auth.configured || !auth.authorized) throw new Error("Google Drive is not authorized.");
      const boundary = `-------readerpub-protected-${Date.now()}`;
      const metadata = {
        name: identity.fileName,
        mimeType: "application/json",
        appProperties
      };
      const response = await driveFetch(
        `${API_UPLOAD}/${encodeURIComponent(fileId)}?uploadType=multipart&fields=id,name,modifiedTime,size,appProperties`,
        {
          method: "PATCH",
          headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
          body: buildMultipartBody({
            metadata,
            jsonPayload: serializedSyncFile,
            boundary
          })
        }
      );
      return normalizeProtectedDriveRemoteFile(await response.json());
    },
    async downloadFile(fileId, interactive = true) {
      const auth = await ensureAuth(interactive);
      if (!auth.configured || !auth.authorized) throw new Error("Google Drive is not authorized.");
      const response = await driveFetch(`${API_FILES}/${encodeURIComponent(fileId)}?alt=media`);
      return response.text();
    }
  };
}

export function createProtectedDriveTransport({ fileApi = createGoogleDriveFileApi() } = {}) {
  return {
    async checkAvailability({ interactive = false } = {}) {
      return fileApi.getAvailability(!!interactive);
    },
    async getRemoteStatus({ bookId, userScope = "default", localUpdatedAt = null, interactive = false } = {}) {
      const availability = await fileApi.getAvailability(!!interactive);
      const identity = buildProtectedDriveFileIdentity({ bookId, userScope });
      if (!availability.configured || !availability.authorized) {
        return {
          availability,
          identity,
          remoteFile: null,
          freshness: localUpdatedAt ? "local-only" : "unknown"
        };
      }
      const remoteFile = await fileApi.findFile(identity, !!interactive);
      return {
        availability,
        identity,
        remoteFile,
        freshness: compareProtectedDriveFreshness({
          localUpdatedAt,
          remoteModifiedAt: remoteFile && remoteFile.modifiedAt ? remoteFile.modifiedAt : null
        })
      };
    },
    async uploadSyncFile({
      syncTransport,
      interactive = true,
      localUpdatedAt = null
    } = {}) {
      const normalizedSyncFile = normalizeProtectedSyncBundle(syncTransport.syncFile || syncTransport);
      const serializedSyncFile =
        syncTransport && syncTransport.serializedSyncFile
          ? String(syncTransport.serializedSyncFile)
          : serializeProtectedSyncBundle(normalizedSyncFile);
      const identity = buildProtectedDriveFileIdentity({
        bookId: normalizedSyncFile.bookId,
        userScope: normalizedSyncFile.userScope
      });
      const existing = await fileApi.findFile(identity, !!interactive);
      const appProperties = buildProtectedDriveAppProperties(normalizedSyncFile);
      const remoteFile = existing && existing.fileId
        ? await fileApi.updateFile({
            fileId: existing.fileId,
            identity,
            serializedSyncFile,
            appProperties
          }, !!interactive)
        : await fileApi.createFile({
            identity,
            serializedSyncFile,
            appProperties
          }, !!interactive);
      const handoffState = buildProtectedDriveHandoffState(normalizedSyncFile, remoteFile);
      return {
        action: existing && existing.fileId ? "updated" : "created",
        identity,
        remoteFile,
        handoffState,
        freshness: compareProtectedDriveFreshness({
          localUpdatedAt,
          remoteModifiedAt: remoteFile.modifiedAt
        })
      };
    },
    async downloadSyncFile({
      bookId,
      userScope = "default",
      bookFingerprint = null,
      localUpdatedAt = null,
      interactive = true
    } = {}) {
      const identity = buildProtectedDriveFileIdentity({ bookId, userScope });
      const remoteFile = await fileApi.findFile(identity, !!interactive);
      if (!remoteFile || !remoteFile.fileId) {
        return {
          status: "missing",
          identity,
          remoteFile: null,
          syncFile: null,
          handoffState: null,
          syncAssessment: {
            status: "missing",
            allowed: false,
            warning: "No remote protected sync file was found in Google Drive."
          },
          freshness: compareProtectedDriveFreshness({
            localUpdatedAt,
            remoteModifiedAt: null
          })
        };
      }
      const raw = await fileApi.downloadFile(remoteFile.fileId, !!interactive);
      const syncFile = normalizeProtectedSyncBundle(raw);
      const handoffState = buildProtectedDriveHandoffState(syncFile, remoteFile);
      const syncAssessment = assessProtectedSyncTransportImport({
        syncFile,
        handoffState,
        bookFingerprint
      });
      return {
        status: syncAssessment.allowed ? "downloaded" : syncAssessment.status,
        identity,
        remoteFile,
        syncFile,
        serializedSyncFile: serializeProtectedSyncBundle(syncFile),
        handoffState,
        syncAssessment,
        freshness: compareProtectedDriveFreshness({
          localUpdatedAt,
          remoteModifiedAt: remoteFile.modifiedAt
        })
      };
    }
  };
}
