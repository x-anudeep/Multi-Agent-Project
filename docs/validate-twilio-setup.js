#!/usr/bin/env node

/**
 * Phase 1 Twilio Setup Validator
 * 
 * Checks Twilio credentials, validates configuration,
 * and provides diagnostic information.
 */

const fs = require("fs");
const path = require("path");

// Color codes for terminal output
const colors = {
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[36m",
  reset: "\x1b[0m"
};

function check(condition, message) {
  const symbol = condition ? "✅" : "❌";
  const color = condition ? colors.green : colors.red;
  console.log(`${color}${symbol}${colors.reset} ${message}`);
  return condition;
}

function warn(message) {
  console.log(`${colors.yellow}⚠️${colors.reset}  ${message}`);
}

function info(message) {
  console.log(`${colors.blue}ℹ️${colors.reset}  ${message}`);
}

function section(title) {
  console.log(`\n${colors.blue}═══════════════════════════════════════${colors.reset}`);
  console.log(`${colors.blue}${title}${colors.reset}`);
  console.log(`${colors.blue}═══════════════════════════════════════${colors.reset}\n`);
}

// Main validation
console.log(`\n${colors.blue}Phase 1 - Twilio Integration Validator${colors.reset}\n`);

let allPass = true;

// Section 1: Check .env file
section("1️⃣  Environment Configuration");

let envPath = path.join(process.cwd(), ".env");
let hasEnv = fs.existsSync(envPath);
check(hasEnv, ".env file exists");

if (!hasEnv) {
  warn("No .env file found. Copy .env.example to .env and fill in credentials.");
  const examplePath = path.join(process.cwd(), ".env.example");
  if (fs.existsSync(examplePath)) {
    info(`Template available at: ${examplePath}`);
  }
  allPass = false;
} else {
  const envContent = fs.readFileSync(envPath, "utf8");
  
  const vars = {
    TWILIO_ACCOUNT_SID: "Twilio Account SID",
    TWILIO_AUTH_TOKEN: "Twilio Auth Token",
    TWILIO_PHONE_NUMBER: "Twilio Phone Number",
    TWILIO_WEBHOOK_URL: "Twilio Webhook URL"
  };
  
  Object.entries(vars).forEach(([key, label]) => {
    const hasVar = envContent.includes(key);
    const isSet = hasVar && !envContent.split("\n")
      .find(line => line.startsWith(key))
      ?.includes("=") || false;
    
    const match = envContent.match(new RegExp(`^${key}=(.+)$`, "m"));
    const value = match ? match[1] : null;
    const isConfigured = value && value.trim() && value.trim() !== "";
    
    if (!isConfigured) {
      check(false, `${label}: NOT CONFIGURED`);
      allPass = false;
    } else {
      // Mask sensitive values
      let display = value;
      if (key === "TWILIO_AUTH_TOKEN") {
        display = value.substring(0, 4) + "***" + value.substring(value.length - 4);
      }
      check(true, `${label}: ${display}`);
    }
  });
}

// Section 2: Check project structure
section("2️⃣  Project Structure");

const files = [
  ["src/config/env.js", "Environment config module"],
  ["automation/twilio/voiceWebhookHandler.js", "Twilio voice handler"],
  ["automation/email_parser/imapPoller.js", "Email parser"],
  ["automation/speech_processing/whisperService.js", "Whisper service"],
  ["src/services/orderIntakeService.js", "Order intake service"],
  ["src/controllers/intakeController.js", "Intake controller"],
  ["src/routes/intakeRoutes.js", "Intake routes"],
  ["src/routes/integrationsRoutes.js", "Integrations routes"]
];

files.forEach(([filepath, label]) => {
  const fullPath = path.join(process.cwd(), filepath);
  const exists = fs.existsSync(fullPath);
  check(exists, label);
  if (!exists) allPass = false;
});

// Section 3: Check dependencies
section("3️⃣  NPM Dependencies");

const packageJsonPath = path.join(process.cwd(), "package.json");
if (fs.existsSync(packageJsonPath)) {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  const deps = packageJson.dependencies || {};
  
  const required = ["twilio", "imap", "mailparser"];
  required.forEach(dep => {
    const installed = dep in deps;
    check(installed, `${dep}: ${installed ? deps[dep] : "NOT INSTALLED"}`);
    if (!installed) allPass = false;
  });
} else {
  check(false, "package.json not found");
  allPass = false;
}

// Section 4: Check database
section("4️⃣  Database Configuration");

if (hasEnv) {
  const envContent = fs.readFileSync(envPath, "utf8");
  const dbMatch = envContent.match(/^DATABASE_URL=(.+)$/m);
  const dbUrl = dbMatch ? dbMatch[1] : null;
  
  if (!dbUrl || dbUrl.trim() === "") {
    warn("DATABASE_URL not configured - using in-memory storage");
    info("To use PostgreSQL, set: DATABASE_URL=postgresql://user:pass@host:5432/db");
  } else {
    check(true, `Database configured: ${dbUrl.substring(0, 50)}...`);
  }
}

// Section 5: Twilio webhook URL validation
section("5️⃣  Webhook Configuration");

if (hasEnv) {
  const envContent = fs.readFileSync(envPath, "utf8");
  const webhookMatch = envContent.match(/^TWILIO_WEBHOOK_URL=(.+)$/m);
  const webhookUrl = webhookMatch ? webhookMatch[1] : null;
  
  if (!webhookUrl || webhookUrl.trim() === "") {
    warn("TWILIO_WEBHOOK_URL not configured");
    info("For local development, use ngrok: ngrok http 3000");
    info("Then set: TWILIO_WEBHOOK_URL=https://your-ngrok-url.ngrok.io");
  } else if (webhookUrl.includes("localhost") || webhookUrl.includes("127.0.0.1")) {
    check(false, "Webhook URL is localhost - must be public for Twilio");
    info("Use ngrok to expose local server: ngrok http 3000");
    allPass = false;
  } else {
    check(true, `Webhook URL: ${webhookUrl}`);
  }
}

// Section 6: Quick start commands
section("6️⃣  Next Steps");

console.log("To test Phase 1 with real Twilio:\n");
console.log("1. Fill in Twilio credentials in .env");
console.log("   Required: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER\n");
console.log("2. Set up public webhook URL (ngrok recommended):");
console.log("   ngrok http 3000\n");
console.log("3. Update Twilio phone number webhook in console:");
console.log("   https://console.twilio.com/phone-numbers\n");
console.log("4. Start the server:");
console.log("   npm start\n");
console.log("5. Make a test call to your Twilio number\n");
console.log("6. Follow detailed guide:");
console.log("   cat PHASE1_TWILIO_TESTING.md\n");

// Final status
section("Summary");

if (allPass) {
  console.log(`${colors.green}✅ All checks passed!${colors.reset}\n`);
  console.log("Your Phase 1 setup appears to be ready for Twilio testing.\n");
} else {
  console.log(`${colors.yellow}⚠️  Some checks failed or warnings present${colors.reset}\n`);
  console.log("Please fix the issues above and re-run this validator.\n");
}

console.log(`For detailed testing guide, see: PHASE1_TWILIO_TESTING.md\n`);
