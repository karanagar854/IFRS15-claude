import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

export default async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const { system, prompt, max_tokens } = await req.json();

  if (!prompt) {
    return new Response(JSON.stringify({ error: "prompt is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: max_tokens || 8192,
    system: system || "",
    messages: [{ role: "user", content: prompt }],
  });

  const text = message.content?.[0]?.text || "";

  return Response.json({ text });
};

export const config = {
  path: "/api/analyze",
};
