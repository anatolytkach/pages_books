export async function dispatchProtectedPublishJob(env, payload, fetchImpl = fetch) {
  const token = String(env.GITHUB_REPO_DISPATCH_TOKEN || "").trim();
  const owner = String(env.GITHUB_REPO_OWNER || "").trim();
  const repo = String(env.GITHUB_REPO_NAME || "").trim();
  const workflowId = String(env.GITHUB_WORKFLOW_ID || "process-protected-job.yml").trim();
  const workflowRef = String(env.GITHUB_WORKFLOW_REF || "").trim();
  if (!token || !owner || !repo) {
    return { ok: false, error: "GitHub dispatch is not configured" };
  }
  const headers = {
    authorization: `Bearer ${token}`,
    accept: "application/vnd.github+json",
    "content-type": "application/json",
    "user-agent": "readerpub-protected-publish-worker",
  };
  const useWorkflowDispatch = !!workflowRef;
  const url = useWorkflowDispatch
    ? `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${encodeURIComponent(workflowId)}/dispatches`
    : `https://api.github.com/repos/${owner}/${repo}/dispatches`;
  const body = useWorkflowDispatch
    ? {
        ref: workflowRef,
        inputs: {
          job_id: String(payload?.jobId || "").trim(),
          book_id: String(payload?.bookId || "").trim(),
          content_id: String(payload?.contentId || "").trim(),
          source_r2_key: String(payload?.sourceR2Key || "").trim(),
          protected_prefix: String(payload?.protectedPrefix || "").trim(),
          source_format: String(payload?.sourceFormat || "").trim(),
        },
      }
    : {
        event_type: "protected_publish_job",
        client_payload: payload,
      };
  const response = await fetchImpl(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    return { ok: false, error: detail || `GitHub dispatch failed (${response.status})` };
  }
  return { ok: true };
}
