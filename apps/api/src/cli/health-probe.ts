// Container healthcheck: asks this process's own listener for readiness over
// loopback, with HTTPS when the internal TLS listener is configured. Reads only
// the listen port and whether TLS is on; prints a single status word.
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

const port = Number(process.env.ORION_API_PORT ?? "3000");
const tls = Boolean(process.env.ORION_TLS_CERT_FILE);
const path = process.argv[2] ?? "/health/ready";
if (
  !Number.isInteger(port) ||
  port < 1 ||
  port > 65535 ||
  !path.startsWith("/health/")
) {
  process.stderr.write(
    "Usage: health-probe [/health/startup|/health/live|/health/ready]\n",
  );
  process.exit(2);
}
// The certificate names the public or internal proxy target, not loopback;
// this probe reads only a status code from the process it runs beside.
const send = tls ? httpsRequest : httpRequest;
const outgoing = send(
  {
    host: "127.0.0.1",
    port,
    path,
    timeout: 3000,
    ...(tls ? { rejectUnauthorized: false } : {}),
  },
  (response) => {
    response.resume();
    const ok = response.statusCode === 200;
    process.stdout.write(ok ? "ready\n" : "unavailable\n");
    process.exitCode = ok ? 0 : 1;
  },
);
outgoing.once("timeout", () => outgoing.destroy(new Error("timeout")));
outgoing.once("error", () => {
  process.stdout.write("unreachable\n");
  process.exitCode = 1;
});
outgoing.end();
