/**
 * Cloudflare Pages Function - Proxy Price Expert Chat API
 * Securely proxies requests to OpenRouter without exposing API keys
 */

// Cloudflare Pages Function types
interface Env {
  OPENROUTER_API_KEY: string;
  ALLOWED_ORIGINS?: string;
}

interface EventContext<E> {
  request: Request;
  env: E;
  params: Record<string, string>;
  waitUntil: (promise: Promise<unknown>) => void;
  passThroughOnException: () => void;
}

type PagesFunction<E = unknown> = (
  context: EventContext<E>,
) => Response | Promise<Response>;

interface ChatRequest {
  message: string;
  history?: Array<{ role: string; content: string }>;
}

type ChatMessage = { role: "user" | "assistant"; content: string };

const SYSTEM_PROMPT = `You are **Proxy Price Expert**, a friendly AI assistant on ProxyPrice.com - the definitive proxy price comparison platform.

## Your Expertise
- Proxy pricing structures ($/GB, $/port, $/IP, subscriptions)
- Proxy types: Residential, Datacenter, Mobile, ISP proxies
- Provider comparisons and recommendations
- Use case matching (web scraping, social media, sneaker bots, ad verification)
- Technical proxy concepts (rotation, sticky sessions, CGNAT, authentication)

## Guidelines
1. **Be concise** - Users want quick, actionable answers
2. **Use pricing data** - Reference typical price ranges ($X-Y/GB)
3. **Recommend wisely** - Match proxy type to use case
4. **Stay on topic** - Politely redirect off-topic questions back to proxies
5. **Use markdown** - Format with **bold**, lists, and \`code\` when helpful

## Price Ranges (2026)
- Residential: $2-15/GB
- Datacenter: $0.50-3/GB
- Mobile: $15-50/GB
- ISP: $3-10/GB

## Response Style
- Friendly but professional
- Maximum 150 words unless complex topic
- Always suggest using the Price Calculator for specific comparisons
- End with a relevant follow-up question when appropriate`;

const MODEL = "meta-llama/llama-3.3-70b-instruct:free";
const MAX_BODY_BYTES = 4096;
const MAX_MESSAGE_CHARS = 500;
const MAX_HISTORY_MESSAGES = 6;
const MAX_HISTORY_CHARS = 1000;
const UPSTREAM_TIMEOUT_MS = 10000;
const DEFAULT_ALLOWED_ORIGINS = [
  "https://proxyprice.com",
  "https://www.proxyprice.com",
  "https://proxyprice.pages.dev",
  "http://localhost:4321",
  "http://127.0.0.1:4321",
];

const jsonResponse = (
  body: Record<string, unknown>,
  status: number,
  headers: HeadersInit,
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...headers,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });

const allowedOrigins = (env: Env) => {
  const configured = (env.ALLOWED_ORIGINS || "")
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...configured]);
};

const corsHeadersFor = (request: Request, env: Env) => {
  const origin = request.headers.get("Origin");
  const allowed = allowedOrigins(env);
  const allowOrigin = origin && allowed.has(origin) ? origin : null;

  return {
    allowed: !origin || Boolean(allowOrigin),
    headers: {
      ...(allowOrigin && { "Access-Control-Allow-Origin": allowOrigin }),
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin",
      "Cache-Control": "no-store",
    },
  };
};

const sanitizeHistory = (history: unknown): ChatMessage[] => {
  if (!Array.isArray(history)) return [];

  return history
    .filter(
      (message): message is ChatMessage =>
        message &&
        typeof message === "object" &&
        (message as ChatMessage).role !== undefined &&
        ["user", "assistant"].includes((message as ChatMessage).role) &&
        typeof (message as ChatMessage).content === "string",
    )
    .slice(-MAX_HISTORY_MESSAGES)
    .map((message) => ({
      role: message.role,
      content: message.content.slice(0, MAX_HISTORY_CHARS),
    }));
};

const parseChatRequest = async (request: Request): Promise<ChatRequest> => {
  const contentLength = Number(request.headers.get("Content-Length") || "0");
  if (contentLength > MAX_BODY_BYTES) {
    throw new Response("Request body too large", { status: 413 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new Response("Invalid JSON", { status: 400 });
  }

  if (!body || typeof body !== "object") {
    throw new Response("JSON object is required", { status: 400 });
  }

  const message = (body as ChatRequest).message;
  if (typeof message !== "string" || !message.trim()) {
    throw new Response("Message is required", { status: 400 });
  }

  return {
    message: message.trim().slice(0, MAX_MESSAGE_CHARS),
    history: sanitizeHistory((body as ChatRequest).history),
  };
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const requestId = crypto.randomUUID();
  const { allowed, headers: corsHeaders } = corsHeadersFor(request, env);

  if (!allowed) {
    return jsonResponse({ error: "Origin not allowed", request_id: requestId }, 403, corsHeaders);
  }

  // Validate API key exists
  if (!env.OPENROUTER_API_KEY) {
    return jsonResponse({ error: "API not configured", request_id: requestId }, 503, corsHeaders);
  }

  try {
    const body = await parseChatRequest(request);

    // Build messages array
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...(body.history || []),
      { role: "user", content: body.message },
    ];

    // Call OpenRouter API
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://proxyprice.com",
          "X-Title": "ProxyPrice Expert",
        },
        body: JSON.stringify({
          model: MODEL,
          messages,
          max_tokens: 500,
          temperature: 0.7,
          stream: false,
        }),
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      },
    );

    if (!response.ok) {
      console.error(
        "OpenRouter error",
        JSON.stringify({ requestId, status: response.status }),
      );
      return jsonResponse(
        { error: "AI service temporarily unavailable", request_id: requestId },
        502,
        corsHeaders,
      );
    }

    const data = (await response.json()) as any;
    const assistantMessage =
      data.choices?.[0]?.message?.content ||
      "Sorry, I couldn't generate a response.";

    return jsonResponse(
      {
        message: assistantMessage,
        model: MODEL,
      },
      200,
      corsHeaders,
    );
  } catch (error) {
    if (error instanceof Response) {
      return jsonResponse(
        { error: await error.text(), request_id: requestId },
        error.status,
        corsHeaders,
      );
    }

    const isTimeout =
      error instanceof DOMException && error.name === "TimeoutError";
    console.error(
      "Chat API error",
      JSON.stringify({
        requestId,
        kind: isTimeout ? "upstream_timeout" : "internal",
      }),
    );
    return jsonResponse(
      {
        error: isTimeout
          ? "AI service timed out"
          : "Internal server error",
        request_id: requestId,
      },
      isTimeout ? 504 : 500,
      corsHeaders,
    );
  }
};

export const onRequestOptions: PagesFunction<Env> = async ({ request, env }) => {
  const { allowed, headers } = corsHeadersFor(request, env);
  if (!allowed) {
    return new Response(null, { status: 403, headers });
  }
  return new Response(null, {
    status: 204,
    headers,
  });
};
