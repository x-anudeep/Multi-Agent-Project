const { execFileSync, execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const fleetbaseDir = path.join(root, "external", "fleetbase");
const rootEnvPath = path.join(root, ".env");
const fleetbaseEnvPath = path.join(fleetbaseDir, "api", ".env");

function run(command, args, options = {}) {
  console.log(`$ ${[command, ...args].join(" ")}`);
  return execFileSync(command, args, {
    cwd: options.cwd || root,
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit"
  });
}

function sh(command, options = {}) {
  console.log(`$ ${command}`);
  return execSync(command, {
    cwd: options.cwd || root,
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit"
  });
}

function upsertEnv(filePath, updates) {
  let content = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
  for (const [key, value] of Object.entries(updates)) {
    const line = `${key}=${value}`;
    const pattern = new RegExp(`^${key}=.*$`, "m");
    content = pattern.test(content) ? content.replace(pattern, line) : `${content.trimEnd()}\n${line}\n`;
  }
  fs.writeFileSync(filePath, content.trimEnd() + "\n");
}

function ensureRootEnv() {
  if (!fs.existsSync(rootEnvPath)) {
    fs.copyFileSync(path.join(root, ".env.example"), rootEnvPath);
  }

  upsertEnv(rootEnvPath, {
    DATABASE_URL: "",
    FLEETBASE_BASE_URL: "http://localhost:8000",
    FLEETBASE_ORDER_ENDPOINT: "/v1/orders"
  });
}

function ensureFleetbaseAppKey() {
  const env = fs.readFileSync(fleetbaseEnvPath, "utf8");
  if (/^APP_KEY=.+$/m.test(env)) return;

  const key = sh(
    "docker-compose -f docker-compose.yml -f docker-compose.override.yml run --rm --no-deps application php artisan key:generate --show",
    { cwd: fleetbaseDir, capture: true }
  ).trim().split(/\s+/).pop();

  upsertEnv(fleetbaseEnvPath, { APP_KEY: key });
}

function dockerExec(container, command) {
  return sh(`docker exec ${container} sh -lc ${JSON.stringify(command)}`, { capture: true });
}

function waitForMysql() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const status = sh("docker inspect fleetbase-database-1 --format '{{.State.Health.Status}}'", { capture: true }).trim();
      if (status === "healthy") return;
    } catch (error) {
      // keep waiting
    }
    execSync("sleep 3");
  }
  throw new Error("Fleetbase MySQL did not become healthy in time.");
}

function createFleetbaseDatabases() {
  dockerExec(
    "fleetbase-database-1",
    "mysql -uroot -e \"CREATE DATABASE IF NOT EXISTS fleetbase; CREATE DATABASE IF NOT EXISTS fleetbase_storefront;\""
  );
}

function runFleetbaseSetupCommands() {
  run("docker", ["exec", "fleetbase-application-1", "php", "artisan", "migrate", "--force"]);
  run("docker", ["exec", "fleetbase-application-1", "php", "artisan", "fleetbase:seed"]);
  run("docker", ["exec", "fleetbase-application-1", "php", "artisan", "fleetbase:create-permissions"]);
  run("docker", ["exec", "fleetbase-application-1", "php", "artisan", "fleetbase:assign-admin-roles"]);
  run("docker", ["exec", "fleetbase-application-1", "php", "artisan", "fleetops:assign-driver-roles"]);
  run("docker", ["exec", "fleetbase-application-1", "php", "artisan", "fleetops:assign-customer-roles"]);
}

function createApiKey() {
  const php = String.raw`
$user = \Fleetbase\Models\User::withoutGlobalScopes()->where('email', 'admin@example.com')->first();
$company = \Fleetbase\Models\Company::withoutGlobalScopes()->first();
if (!$company) {
    $company = \Fleetbase\Models\Company::create(['name' => 'Local Logistics Demo']);
}
if (!$user) {
    $user = \Fleetbase\Models\User::create([
        'name' => 'Local Admin',
        'email' => 'admin@example.com',
        'password' => 'Fleetbase2026!',
        'email_verified_at' => now(),
        'status' => 'active',
        'type' => 'admin',
        'company_uuid' => $company->uuid,
    ]);
}
$user->password = 'Fleetbase2026!';
$user->email_verified_at = now();
$user->status = 'active';
$user->type = 'admin';
$user->company_uuid = $company->uuid;
$user->save();
$company->owner_uuid = $user->uuid;
$company->save();
\Fleetbase\Models\CompanyUser::firstOrCreate(['user_uuid' => $user->uuid, 'company_uuid' => $company->uuid], ['status' => 'active']);
$cred = \Fleetbase\Models\ApiCredential::where('name', 'Multi Agent Backend')->where('company_uuid', $company->uuid)->first();
if (!$cred) {
    $cred = \Fleetbase\Models\ApiCredential::create(['name' => 'Multi Agent Backend', 'user_uuid' => $user->uuid, 'company_uuid' => $company->uuid, 'test_mode' => false, 'api' => 'fleet-ops']);
}
echo $cred->key;
`;

  return run("docker", ["exec", "fleetbase-application-1", "php", "artisan", "tinker", `--execute=${php}`], {
    capture: true
  }).trim();
}

ensureRootEnv();
run("git", ["submodule", "update", "--init", "external/fleetbase"]);
run("node", ["scripts/fleetbase-compose.js", "up", "-d"]);
ensureFleetbaseAppKey();
run("node", ["scripts/fleetbase-compose.js", "up", "-d", "--force-recreate", "application", "queue", "scheduler", "httpd"]);
waitForMysql();
createFleetbaseDatabases();
runFleetbaseSetupCommands();
const apiKey = createApiKey();
upsertEnv(rootEnvPath, { FLEETBASE_API_KEY: apiKey });

console.log("\nFleetbase setup complete.");
console.log("Fleetbase Console: http://localhost:4200");
console.log("Fleetbase API: http://localhost:8000");
console.log("Local admin: admin@example.com / Fleetbase2026!");
console.log(`API key written to .env: ${apiKey}`);
