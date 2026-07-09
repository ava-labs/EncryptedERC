const {spawnSync} = require("child_process");
const path = require("path");

const preload = path.join(__dirname, "zkit-require-alias.cjs");
const hardhatBin = path.join(
  __dirname,
  "..",
  "node_modules",
  ".bin",
  process.platform === "win32" ? "hardhat.cmd" : "hardhat",
);

const existingNodeOptions = process.env.NODE_OPTIONS || "";
const requireOption = `--require ${JSON.stringify(preload)}`;

const result = spawnSync(hardhatBin, ["zkit", "verifiers"], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: {
    ...process.env,
    NODE_OPTIONS: `${requireOption} ${existingNodeOptions}`.trim(),
  },
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

require("./fix-win-paths.js");
