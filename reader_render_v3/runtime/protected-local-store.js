function getDefaultLocalStorage() {
  try {
    if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  } catch (error) {}
  return null;
}

function safeParseJson(raw) {
  if (!raw) return null;
  return JSON.parse(raw);
}

export function createProtectedLocalStore({
  namespace = "reader_render_v3:persistence",
  storage = getDefaultLocalStorage()
} = {}) {
  const available = !!storage;

  function keyFor(key) {
    return `${namespace}:${String(key || "")}`;
  }

  return {
    type: "localStorage",
    namespace,
    available,
    async getJson(key) {
      if (!available) return null;
      try {
        return safeParseJson(storage.getItem(keyFor(key)));
      } catch (error) {
        return null;
      }
    },
    async setJson(key, value) {
      if (!available) return false;
      try {
        storage.setItem(keyFor(key), JSON.stringify(value));
        return true;
      } catch (error) {
        return false;
      }
    },
    async remove(key) {
      if (!available) return false;
      try {
        storage.removeItem(keyFor(key));
        return true;
      } catch (error) {
        return false;
      }
    }
  };
}
