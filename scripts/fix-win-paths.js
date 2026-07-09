// Normalize backslashes in zkit generated TypeScript import/require paths (Windows).
// @solarity/zktype uses path.relative() which emits `\` on Windows; Node cannot resolve those.
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..", "generated-types", "zkit");

function walk(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs.readdirSync(dir, {withFileTypes: true}).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

if (!fs.existsSync(root)) {
  console.log("No generated-types found, skipping path fix.");
  process.exit(0);
}

let fixed = 0;

for (const filePath of walk(root)) {
  if (!filePath.endsWith(".ts")) {
    continue;
  }

  const original = fs.readFileSync(filePath, "utf8");
  let content = original;

  content = content.replace(/from\s+(['"])([^'"]*)\1/g, (match, quote, importPath) => {
    const normalized = importPath.replace(/\\/g, "/");
    return normalized === importPath ? match : `from ${quote}${normalized}${quote}`;
  });

  content = content.replace(/require\((['"])([^'"]*)\1\)/g, (match, quote, importPath) => {
    const normalized = importPath.replace(/\\/g, "/");
    return normalized === importPath ? match : `require(${quote}${normalized}${quote})`;
  });

  if (content !== original) {
    fs.writeFileSync(filePath, content);
    console.log(`Fixed paths in: ${path.relative(process.cwd(), filePath)}`);
    fixed++;
  }
}

console.log(`Fixed ${fixed} file(s).`);
