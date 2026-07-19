// Next.js instrumentation hook: runs once when the server process starts.
// Used to run Muninn's boot preflight (fail-fast on missing critical config in
// production). Only runs in the Node.js runtime, not edge.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { runPreflight } = await import("./lib/preflight");
    runPreflight();
  }
}
