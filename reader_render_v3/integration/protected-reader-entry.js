import { bootstrapProtectedReaderIntegration } from "./protected-reader-bootstrap.js";

const bootstrap = await bootstrapProtectedReaderIntegration();
if (bootstrap && bootstrap.action === "open-protected-reader") {
  await import("../dev/protected-reader.js");
}
