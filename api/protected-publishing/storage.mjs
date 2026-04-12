function joinFilters(filters = []) {
  return filters.filter(Boolean).join("&");
}

export async function fetchPublishingJob(sbFetch, jobId, options = {}) {
  const filters = [`id=eq.${jobId}`, options.params || "", "select=*"];
  const { data, error } = await sbFetch("publishing_jobs", {
    params: joinFilters(filters),
    single: true,
  });
  return { data, error };
}

export async function createPublishingJob(sbFetch, payload) {
  return sbFetch("publishing_jobs", {
    method: "POST",
    body: payload,
    single: true,
  });
}

export async function updatePublishingJob(sbFetch, jobId, updates, options = {}) {
  const filters = [`id=eq.${jobId}`, options.params || "", "select=*"];
  return sbFetch("publishing_jobs", {
    method: "PATCH",
    params: joinFilters(filters),
    body: updates,
    single: true,
  });
}
