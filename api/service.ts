import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { patientExtractionPlugin, DEFAULT_MODEL } from "../server/patient";
import { kakaoRoutingPlugin } from "../server/routing";

type Middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => void | Promise<void>;
function middleware(plugin: ReturnType<typeof patientExtractionPlugin>): Middleware {
  let handler: Middleware | undefined;
  const install = plugin.configureServer as (server: unknown) => void;
  install({ middlewares: { use: (...args: unknown[]) => { handler = args[args.length - 1] as Middleware; } } });
  if (!handler) throw new Error("Missing API handler");
  return handler;
}
const groq = Boolean(process.env.GROQ_API_KEY);
const patient = middleware(patientExtractionPlugin(
  (groq ? process.env.GROQ_API_KEY : process.env.OPENROUTER_API_KEY) || "",
  (groq ? process.env.GROQ_MODEL || "openai/gpt-oss-120b" : process.env.OPENROUTER_MODEL || DEFAULT_MODEL),
  groq ? "groq" : "openrouter",
));
const routing = middleware(kakaoRoutingPlugin(process.env.KAKAO_REST_API_KEY || ""));

export default async function handler(req: IncomingMessage & { body?: unknown }, res: ServerResponse) {
  const url = new URL(req.url || "/", "http://localhost");
  const kind = url.searchParams.get("kind");
  const action = url.searchParams.get("path");
  const allowed = kind === "patient" ? ["status", "extract"] : kind === "routing" ? ["eta", "route"] : [];
  const missing = () => { res.statusCode = 404; res.setHeader("Content-Type", "application/json"); res.end('{"error":"Unknown API route"}'); };
  if (!allowed.includes(action || "")) return missing();
  // Vercel parses JSON before dispatch. Recreate the stream expected by the shared local adapters.
  const body = req.body === undefined ? null : typeof req.body === "string" ? req.body : JSON.stringify(req.body);
  const input = body === null ? req : Object.assign(Readable.from([Buffer.from(body)]), { headers: req.headers, method: req.method }) as unknown as IncomingMessage;
  input.url = kind === "patient" ? `/patient-api/${action}` : `/${action}`;
  await (kind === "patient" ? patient : routing)(input, res, missing);
}
