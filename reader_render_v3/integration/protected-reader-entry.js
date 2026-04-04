import { bootstrapProtectedReaderIntegration } from "./protected-reader-bootstrap.js";

await bootstrapProtectedReaderIntegration();
await import("../dev/protected-reader.js");
