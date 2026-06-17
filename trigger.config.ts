import { defineConfig } from "@trigger.dev/sdk/v3";

export default defineConfig({
  project: "vaultrise",
  runtime: "node",
  logLevel: "log",
  maxDuration: 300,
  dirs: ["./trigger"],
  retries: {
    enabledInDev: false,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      factor: 2,
    },
  },
});
