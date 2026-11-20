const { spawnSync } = require("node:child_process");
const path = require("node:path");

const env = { ...process.env };
for (const key of Object.keys(env)) {
  if (key.toLowerCase() === "npm_config_allow_scripts") delete env[key];
}

const result = spawnSync("npm", ["install"], {
  cwd: path.resolve(__dirname, "..", "server"),
  stdio: "inherit",
  env,
  shell: true,
});

process.exit(result.status ?? 1);
