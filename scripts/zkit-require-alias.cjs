// Fallback when generated imports were not yet normalized (e.g. during zkit verifiers).
const Module = require("module");
const path = require("path");

const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function resolveZkitGeneratedHelpers(request, parent, isMain, options) {
  if (request === "..helpers" || request.replace(/\\/g, "/") === "../helpers") {
    return path.join(process.cwd(), "generated-types", "zkit", "helpers.ts");
  }

  return originalResolveFilename.call(this, request, parent, isMain, options);
};
