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

async function extractShipmentWithOpenAI(text) {
  if (!env.openai.apiKey) return null;

  try {
    const { ChatOpenAI } = await import("@langchain/openai");
    const { ChatPromptTemplate } = await import("@langchain/core/prompts");
    const { StringOutputParser } = await import("@langchain/core/output_parsers");

    const model = new ChatOpenAI({
      apiKey: env.openai.apiKey,
      model: env.openai.model,
      temperature: 0
    });

    const prompt = ChatPromptTemplate.fromMessages([
      [
        "system",
        "Extract logistics shipment details from the text. Return only JSON with customer.name, customer.email, shipment.pickup, shipment.dropoff, shipment.pickupDate, shipment.weight, shipment.volume, shipment.commodity. Use empty strings for unknown fields."
      ],
      ["human", "{text}"]
    ]);

    const output = await prompt.pipe(model).pipe(new StringOutputParser()).invoke({ text });
    return parseJsonFromText(output);
  } catch (error) {
    return null;
  }
}

async function extractShipmentFromText(text) {
  const llmExtracted = await extractShipmentWithOpenAI(text);
  return {
    source: llmExtracted ? "langchain_openai" : "langchain_heuristic",
    payload: llmExtracted || heuristicExtractShipment(text)
  };
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
  extractShipmentFromText
};
