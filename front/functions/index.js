const acceptsMarkdown = (request) =>
  request.headers
    .get("Accept")
    ?.toLowerCase()
    .split(",")
    .some((value) => value.trim().startsWith("text/markdown")) ?? false;

const appendVary = (headers, value) => {
  const values = new Set(
    (headers.get("Vary") || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
  values.add(value);
  headers.set("Vary", [...values].join(", "));
};

/**
 * Keeps the human homepage static while providing a compact, current,
 * machine-readable representation to clients that explicitly negotiate for it.
 */
export const onRequestGet = async (context) => {
  if (!acceptsMarkdown(context.request)) {
    return context.next();
  }

  const markdownUrl = new URL("/llms.txt", context.request.url);
  const markdownResponse = await fetch(
    new Request(markdownUrl, { headers: { Accept: "text/plain" } }),
  );

  if (!markdownResponse.ok) {
    return context.next();
  }

  const headers = new Headers(markdownResponse.headers);
  headers.set("Content-Type", "text/markdown; charset=utf-8");
  headers.set("Content-Location", markdownUrl.toString());
  headers.set("Cache-Control", "public, max-age=3600");
  appendVary(headers, "Accept");

  return new Response(markdownResponse.body, {
    status: markdownResponse.status,
    headers,
  });
};
