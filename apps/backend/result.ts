import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";

// Your .env uses CLAUDE_API_KEY; the SDK defaults to ANTHROPIC_API_KEY, so pass it explicitly.
const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

const outputSchema = z.object({
    feedback: z.string().describe("Feedback for the user"),
    score: z.int().describe("Score out of 10 for their interview"),
});

const MODEL = "claude-sonnet-4-6"; // cheaper/faster; swap to "claude-opus-4-8" for max scoring quality


const RESULT_PROMPT = `
You are an expert technical interviewer evaluating a candidate's performance in a computer-science interview.

Evaluate ONLY the candidate's own answers — the "User" turns in the transcript. The "Assistant" turns are the interviewer's questions; treat them as context, never score them.

Judge the candidate on:
- Technical correctness — are the answers actually right?
- Depth — do they explain *why*, not just *what*?
- Communication — are the answers clear and well-structured?

Use this 0–10 scale:
- 0–2: no substantive answers, or largely incorrect
- 3–4: major gaps, surface-level only
- 5–6: basics correct but shallow
- 7–8: solid, accurate, well-reasoned
- 9–10: excellent — precise, deep, and clearly communicated

Be objective and calibrated. Base every judgement strictly on what the candidate actually said — if they barely engaged, score low and do not give credit for answers they never gave. For the feedback, write 2–4 sentences naming one specific strength and the single most important thing to improve.

Return a JSON object like this:
{ "feedback": "Strong on hashing fundamentals but vague on collision handling and Big-O. Solidify how open addressing vs chaining affects lookups.", "score": 6 }

Interview transcript:
{{USER_TRANSCRIPT}}
`

// Anthropic's structured-outputs JSON Schema doesn't support numeric range
// constraints (minimum/maximum/multipleOf) — z.int() emits them, so strip
// them recursively before sending, along with the $schema meta key.
function stripUnsupportedSchemaKeys(node: unknown): unknown {
    if (Array.isArray(node)) return node.map(stripUnsupportedSchemaKeys);
    if (node && typeof node === "object") {
        const out: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(node)) {
            if (["$schema", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf"].includes(key)) continue;
            out[key] = stripUnsupportedSchemaKeys(value);
        }
        return out;
    }
    return node;
}

export async function calculateResult(messages: {type: "Assistant" | "User", message: string, createdAt: Date}[]) {
    const jsonSchema = stripUnsupportedSchemaKeys(z.toJSONSchema(outputSchema)) as Record<string, unknown>;

    const response = await client.messages.create({
        model: MODEL,
        max_tokens: 1024,
        messages: [
            { role: "user", content: RESULT_PROMPT.replace(`{{USER_TRANSCRIPT}}`, JSON.stringify(messages)) },
        ],
        output_config: {
            format: { type: "json_schema", schema: jsonSchema },
        },
    });

    const block = response.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") throw new Error("No structured output returned");
    console.log(block.text);
    const result = outputSchema.parse(JSON.parse(block.text));
    return result;
}