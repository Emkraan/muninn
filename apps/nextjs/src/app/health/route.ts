// Bare /health alias — re-exports the same handler as /api/health/ready so
// load-balancers and uptime probes that expect /health work out of the box.
export { GET } from "../api/health/ready/route";
