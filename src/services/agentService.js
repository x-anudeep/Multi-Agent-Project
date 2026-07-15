const { runLangChainTriage } = require("../agents/langchainAgentPipeline");

async function triage(input) {
  return runLangChainTriage(input);
}

module.exports = { triage };
