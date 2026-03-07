// Bootstrap script to start the browser service with correct working directory
const { execSync } = require("child_process");
const path = require("path");

process.chdir(path.join(__dirname));
console.log("Working directory:", process.cwd());

require("child_process").fork(
  path.join(__dirname, "node_modules", ".bin", "tsx"),
  [path.join(__dirname, "src", "server.ts")],
  { stdio: "inherit" },
);
