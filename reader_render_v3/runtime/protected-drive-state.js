export function createInitialProtectedDriveState() {
  return {
    configured: false,
    authorized: false,
    transportStatus: "idle",
    remotePresent: false,
    remoteFileId: "",
    remoteFileName: "",
    remoteModifiedAt: "",
    remoteSize: 0,
    freshness: "unknown",
    lastUploadResult: "none",
    lastDownloadResult: "none",
    lastApplyResult: "none",
    lastWarning: "",
    pendingRemoteSyncFile: null,
    pendingRemoteHandoffState: null
  };
}

export function mergeProtectedDriveState(currentState, patch = {}) {
  return {
    ...(currentState || createInitialProtectedDriveState()),
    ...(patch || {})
  };
}
