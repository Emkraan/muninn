// Main /api/health endpoint — delegates to the /ready handler which
// returns a full per-subsystem {ok, status, message} response.
export { GET } from "./ready/route";
