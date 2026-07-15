const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

function canRun(command, args) {
  const result = spawnSync(command, args, { stdio: "ignore" });
  return result.status === 0;
}

function resolveComposeCommand() {
  if (canRun("docker", ["compose", "version"])) {
    return { command: "docker", args: ["compose"] };
  }

  if (canRun("docker-compose", ["--version"])) {
    return { command: "docker-compose", args: [] };
  }

  throw new Error("Docker Compose is not available. Install Docker Compose or start Docker Desktop.");
}

const compose = resolveComposeCommand();
const args = [...compose.args, ...process.argv.slice(2)];
const cwd = path.join(__dirname, "..", "external", "fleetbase");

function copyIfMissing(source, target) {
  if (!fs.existsSync(target) && fs.existsSync(source)) {
    fs.copyFileSync(source, target);
    console.log(`Created ${path.relative(path.join(__dirname, ".."), target)}`);
  }
}

copyIfMissing(path.join(cwd, "api", ".env.example"), path.join(cwd, "api", ".env"));
copyIfMissing(
  path.join(cwd, "docker-compose.override.yml.example"),
  path.join(cwd, "docker-compose.override.yml")
);

const overridePath = path.join(cwd, "docker-compose.override.yml");
if (fs.existsSync(overridePath)) {
  let override = fs.readFileSync(overridePath, "utf8");
  override = override.replace("CONSOLE_HOST: http://localhost:4200", "CONSOLE_HOST: http://127.0.0.1:4200");
  if (!override.includes("APP_URL: http://127.0.0.1:8000")) {
    override = override.replace(
      "CONSOLE_HOST: http://127.0.0.1:4200",
      "CONSOLE_HOST: http://127.0.0.1:4200\n      APP_URL: http://127.0.0.1:8000\n      SESSION_DOMAIN: 127.0.0.1"
    );
  }
  if (!override.includes("fleetbase_database:/var/lib/mysql")) {
    override = override.replace(
      "services:\n",
      "services:\n  database:\n    volumes:\n      - ./docker/database/:/docker-entrypoint-initdb.d/\n      - fleetbase_database:/var/lib/mysql\n\n"
    );
    override = `${override.trimEnd()}\n\nvolumes:\n  fleetbase_database:\n`;
  }
  fs.writeFileSync(overridePath, override);
}

const result = spawnSync(compose.command, args, {
  cwd,
  stdio: "inherit"
});

process.exit(result.status ?? 1);
