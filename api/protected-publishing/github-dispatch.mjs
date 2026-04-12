export async function dispatchProtectedPublishJob(env, payload, fetchImpl = fetch) {
  const token = String(env.GITHUB_REPO_DISPATCH_TOKEN || "").trim();
  const owner = String(env.GITHUB_REPO_OWNER || "").trim();
  const repo = String(env.GITHUB_REPO_NAME || "").trim();
  if (!token || !owner || !repo) {
    return { ok: false, error: "GitHub dispatch is not configured" };
  }
  const response = await fetchImpl(`https://api.github.com/repos/${owner}/${repo}/dispatches`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "content-type": "application/json",
      "user-agent": "readerpub-protected-publish-worker",
    },
    body: JSON.stringify({
      event_type: "protected_publish_job",
      client_payload: payload,
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    return { ok: false, error: detail || `GitHub dispatch failed (${response.status})` };
  }
  return { ok: true };
}
