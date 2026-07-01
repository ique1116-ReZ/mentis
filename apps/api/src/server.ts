import { createServer } from "node:http";
import {
  authenticateDemoUser,
  chatWithQwen,
  createPlatformDemo,
  getUserMemory,
  registerDemoUser,
  rememberCase,
  resolveCorsOrigin,
  runAssessmentWorkflow,
  type AssessmentWorkflowInput,
  type ChatMessage,
  type LoginInput,
  type MemoryCaseSummary,
  type RegistrationInput,
  type RehabConsultCategory,
} from "./index.js";

const platform = createPlatformDemo();

const server = createServer(async (request, response) => {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Access-Control-Allow-Origin", resolveCorsOrigin(request.headers.origin));
  response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Vary", "Origin");

  if (request.method === "OPTIONS") {
    response.statusCode = 204;
    response.end();
    return;
  }

  if (request.method === "GET" && request.url === "/health") {
    response.end(JSON.stringify({ ok: true, service: "mentis-api" }));
    return;
  }

  try {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");

    if (request.method === "POST" && url.pathname === "/v1/auth/login") {
      const body = await readJson(request);
      const result = authenticateDemoUser(platform, body as unknown as LoginInput);
      response.end(JSON.stringify(result));
      return;
    }

    if (request.method === "POST" && url.pathname === "/v1/auth/register") {
      const body = await readJson(request);
      const result = registerDemoUser(platform, body as unknown as RegistrationInput);
      response.end(JSON.stringify(result));
      return;
    }

    const memoryMatch = url.pathname.match(/^\/v1\/users\/([^/]+)\/memory$/);
    if (request.method === "GET" && memoryMatch) {
      const result = getUserMemory(platform, decodeURIComponent(memoryMatch[1]));
      response.end(JSON.stringify(result));
      return;
    }

    const caseMemoryMatch = url.pathname.match(/^\/v1\/users\/([^/]+)\/memory\/cases$/);
    if (request.method === "POST" && caseMemoryMatch) {
      const body = await readJson(request);
      const result = rememberCase(
        platform,
        decodeURIComponent(caseMemoryMatch[1]),
        body as unknown as MemoryCaseSummary,
      );
      response.end(JSON.stringify(result));
      return;
    }

    if (request.method === "POST" && request.url === "/v1/assessments") {
      const body = await readJson(request);
      const result = await runAssessmentWorkflow(platform, body as unknown as AssessmentWorkflowInput);
      response.end(JSON.stringify(result));
      return;
    }

    if (request.method === "POST" && request.url === "/v1/chat") {
      const body = await readJson(request);
      const messages = Array.isArray(body.messages) ? (body.messages as ChatMessage[]) : [];
      const category = typeof body.category === "string" ? (body.category as RehabConsultCategory) : undefined;
      const result = await chatWithQwen(messages, { category });
      response.end(JSON.stringify(result));
      return;
    }
  } catch (error) {
    response.statusCode = 502;
    response.end(
      JSON.stringify({
        error: "upstream_chat_failed",
        message: error instanceof Error ? error.message : "Unknown API error",
      }),
    );
    return;
  }

  response.statusCode = 404;
  response.end(JSON.stringify({ error: "not_found" }));
});

const port = Number(process.env.PORT ?? 3001);
server.listen(port, "127.0.0.1", () => {
  console.log(`Mentis API listening on http://127.0.0.1:${port}`);
});

function readJson(request: NodeJS.ReadableStream): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let raw = "";
    request.on("data", (chunk: Buffer) => {
      raw += chunk;
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(raw || "{}"));
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}
