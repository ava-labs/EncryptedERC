const {spawnSync} = require("child_process");

const steps = [
  ["hardhat", ["compile"]],
  ["hardhat", ["zkit", "make", "--force"]],
  ["node", ["scripts/fix-win-paths.js"]],
];

const hardhatBin = require("path").join(
  __dirname,
  "..",
  "node_modules",
  ".bin",
  process.platform === "win32" ? "hardhat.cmd" : "hardhat",
);

for (const [cmd, args] of steps) {
  const bin = cmd === "hardhat" ? hardhatBin : cmd;
  const result = spawnSync(bin, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    cwd: require("path").join(__dirname, ".."),
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

require("./run-zkit-verifiers.cjs");
