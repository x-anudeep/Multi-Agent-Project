const { env } = require("../config/env");
const { runTriageAgent } = require("./triageAgent");
const { runRouteCapacityAgent } = require("./routeCapacityAgent");
const { runPricingAgent } = require("./pricingAgent");
const { runLoadOptimizationAgent } = require("./loadOptimizationAgent");
const { runQuoteReviewAgent } = require("./quoteReviewAgent");

async function loadRunnableLambda() {
  const { RunnableLambda } = await import("@langchain/core/runnables");
  return RunnableLambda;
}

function parseJsonFromText(text) {
  if (!text) return null;
  const cleaned = String(text).trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "");
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return null;

  try {
    return JSON.parse(match[0]);
  } catch (error) {
    return null;
  }
}

function heuristicExtractShipment(text) {
  const source = String(text || "");
  const lower = source.toLowerCase();

  const email = source.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || "";
  const weight = source.match(/(\d+(?:\.\d+)?)\s*(kg|kilograms?|lbs?|pounds?)/i)?.[0] || "";
  const volume = source.match(/(\d+(?:\.\d+)?)\s*(m3|cubic meters?|cbm)/i)?.[0] || "";
  const pickup = source.match(/(?:pickup|pick up|from|origin)\s+(?:in|at|from)?\s*([A-Za-z ]+?)(?:\s+(?:to|and|on|with|for)|[,.\n]|$)/i)?.[1]?.trim();
  const dropoff = source.match(/(?:dropoff|drop off|deliver(?:y)? to|destination|to)\s+(?:in|at|to)?\s*([A-Za-z ]+?)(?:\s+(?:on|with|for)|[,.\n]|$)/i)?.[1]?.trim();
  const date = source.match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1] || "";

  return {
    customer: {
      name: source.match(/(?:customer|company|client)\s*[:\-]\s*([A-Za-z0-9 &'-]+?)(?:[.,\n]|$)/i)?.[1]?.trim() || "Unknown Customer",
      email
    },
    shipment: {
      pickup: pickup || (lower.includes("phoenix") ? "Phoenix" : ""),
      dropoff: dropoff || (lower.includes("los angeles") ? "Los Angeles" : ""),
      pickupDate: date,
      weight,
      volume,
      commodity: source.match(/(?:commodity|cargo|goods?)\s*[:\-]\s*([A-Za-z0-9 &'-]+?)(?:[.,\n]|$)/i)?.[1]?.trim() || "general"
    }
  };
}

const EXTRACTION_SYSTEM_PROMPT =
  "Extract logistics shipment details from the text. Return only JSON with customer.name, customer.email, shipment.pickup, shipment.dropoff, shipment.pickupDate, shipment.weight, shipment.volume, shipment.commodity. Use empty strings for unknown fields.";

const REPLY_CLASSIFICATION_SYSTEM_PROMPT =
  "Classify the customer's email reply to a shipment quote. Respond with exactly one word: " +
  "CONFIRMED if they clearly agree to proceed with the quote, or QUERY if they have questions, " +
  "objections, want changes, or the reply is unclear or ambiguous. When in doubt, respond QUERY.";

/**
 * Call a single OpenAI-compatible chat model and return its raw text output.
 * @returns {Promise<string|null>} null on missing key or any failure
 */
async function callChatModel({ apiKey, model, baseUrl }, { systemPrompt, humanPrompt, humanInput }) {
  if (!apiKey) return null;

  try {
    const { ChatOpenAI } = await import("@langchain/openai");
    const { ChatPromptTemplate } = await import("@langchain/core/prompts");
    const { StringOutputParser } = await import("@langchain/core/output_parsers");

    const chatModel = new ChatOpenAI({
      apiKey,
      model,
      temperature: 0,
      ...(baseUrl ? { configuration: { baseURL: baseUrl } } : {})
    });

    const prompt = ChatPromptTemplate.fromMessages([
      ["system", systemPrompt],
      ["human", humanPrompt]
    ]);

    return await prompt.pipe(chatModel).pipe(new StringOutputParser()).invoke(humanInput);
  } catch (error) {
    return null;
  }
}

/**
 * Try OpenAI first, then Groq, returning the first successful result along
 * with which provider produced it.
 */
async function withLlmFallback(callback) {
  const openAiOutput = await callback({ apiKey: env.openai.apiKey, model: env.openai.model });
  if (openAiOutput) return { source: "langchain_openai", output: openAiOutput };

  const groqOutput = await callback({ apiKey: env.groq.apiKey, model: env.groq.model, baseUrl: env.groq.baseUrl });
  if (groqOutput) return { source: "langchain_groq", output: groqOutput };

  return null;
}

async function extractShipmentFromText(text) {
  const llmResult = await withLlmFallback((credentials) =>
    callChatModel(credentials, {
      systemPrompt: EXTRACTION_SYSTEM_PROMPT,
      humanPrompt: "{text}",
      humanInput: { text }
    }).then((output) => parseJsonFromText(output))
  );

  if (llmResult) {
    return { source: llmResult.source, payload: llmResult.output };
  }

  return { source: "langchain_heuristic", payload: heuristicExtractShipment(text) };
}

const CONFIRMATION_KEYWORDS = [
  "confirm",
  "confirmed",
  "yes",
  "sounds good",
  "go ahead",
  "proceed",
  "accept",
  "approved",
  "looks good",
  "agree",
  "book it",
  "let's do it",
  "lets do it"
];

function heuristicClassifyReply(replyText) {
  const lower = String(replyText || "").toLowerCase();
  const hasConfirmationKeyword = CONFIRMATION_KEYWORDS.some((keyword) => lower.includes(keyword));
  const hasQuestion = lower.includes("?");
  // Default to "query" whenever uncertain -- safer to route to a human
  // than to silently treat an ambiguous reply as a confirmed order.
  return hasConfirmationKeyword && !hasQuestion ? "confirmed" : "query";
}

/**
 * Classify a customer's reply to a quote email as "confirmed" or "query".
 * @param {string} replyText
 * @returns {Promise<"confirmed"|"query">}
 */
async function classifyQuoteReply(replyText) {
  const llmResult = await withLlmFallback((credentials) =>
    callChatModel(credentials, {
      systemPrompt: REPLY_CLASSIFICATION_SYSTEM_PROMPT,
      humanPrompt: "{replyText}",
      humanInput: { replyText }
    }).then((output) => {
      const normalized = output?.trim().toUpperCase();
      if (normalized === "CONFIRMED") return "confirmed";
      if (normalized === "QUERY") return "query";
      return null; // unrecognized output; fall through to the next provider
    })
  );

  return llmResult?.output || heuristicClassifyReply(replyText);
}

async function runLangChainTriage(input) {
  const RunnableLambda = await loadRunnableLambda();

  const extractionChain = RunnableLambda.from(async (payload) => {
    if (typeof payload === "string" || payload?.text || payload?.transcript || payload?.emailBody) {
      const text = payload.text || payload.transcript || payload.emailBody || payload;
      const extracted = await extractShipmentFromText(text);
      return {
        originalInput: payload,
        extractionSource: extracted.source,
        shipmentPayload: extracted.payload
      };
    }

    return {
      originalInput: payload,
      extractionSource: "structured_payload",
      shipmentPayload: payload
    };
  });

  const triageChain = RunnableLambda.from(async (context) => ({
    ...context,
    triage: runTriageAgent(context.shipmentPayload)
  }));

  return extractionChain.pipe(triageChain).invoke(input);
}

async function runLangChainQuotePipeline(order) {
  const RunnableLambda = await loadRunnableLambda();

  const triageStep = RunnableLambda.from(async (context) => ({
    ...context,
    triage: runTriageAgent(context.order.normalizedRequest || context.order)
  }));

  const routeStep = RunnableLambda.from(async (context) => ({
    ...context,
    routeCapacity: runRouteCapacityAgent(context.order)
  }));

  const pricingStep = RunnableLambda.from(async (context) => ({
    ...context,
    pricing: runPricingAgent(context.order, context.routeCapacity)
  }));

  const optimizationStep = RunnableLambda.from(async (context) => ({
    ...context,
    loadOptimization: runLoadOptimizationAgent(context.pricing, context.routeCapacity)
  }));

  const reviewStep = RunnableLambda.from(async (context) => ({
    ...context,
    review: runQuoteReviewAgent(context.order, context.routeCapacity, context.loadOptimization)
  }));

  return triageStep
    .pipe(routeStep)
    .pipe(pricingStep)
    .pipe(optimizationStep)
    .pipe(reviewStep)
    .invoke({ order });
}

module.exports = {
  runLangChainTriage,
  runLangChainQuotePipeline,
  extractShipmentFromText,
  classifyQuoteReply
};
