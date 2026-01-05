/**
 * Cloudflare Pages Function - Proxy Price Expert Chat API
 * Securely proxies requests to OpenRouter without exposing API keys
 */

// Cloudflare Pages Function types
interface Env {
  OPENROUTER_API_KEY: string;
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

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  // CORS headers
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  // Handle preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Validate API key exists
  if (!env.OPENROUTER_API_KEY) {
    return new Response(JSON.stringify({ error: "API not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body: ChatRequest = await request.json();

    if (!body.message || typeof body.message !== "string") {
      return new Response(JSON.stringify({ error: "Message is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Rate limiting by IP (simple implementation)
    const clientIP = request.headers.get("CF-Connecting-IP") || "unknown";

    // Build messages array
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...(body.history || []).slice(-6), // Keep last 6 messages for context
      { role: "user", content: body.message.slice(0, 1000) }, // Limit message length
    ];

    // Call OpenRouter API
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://proxyprice.pages.dev",
          "X-Title": "ProxyPrice Expert",
        },
        body: JSON.stringify({
          model: MODEL,
          messages,
          max_tokens: 500,
          temperature: 0.7,
          stream: false,
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenRouter error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: "AI service temporarily unavailable" }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const data = (await response.json()) as any;
    const assistantMessage =
      data.choices?.[0]?.message?.content ||
      "Sorry, I couldn't generate a response.";

    return new Response(
      JSON.stringify({
        message: assistantMessage,
        model: MODEL,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Chat API error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
};
