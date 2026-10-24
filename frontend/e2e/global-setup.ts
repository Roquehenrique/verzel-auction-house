import { execSync } from "node:child_process";

// Before every run: recreate the demo data in the e2e database (seed + vehicle
// catalog cache). Servers may be reused between runs, the data never is.
export default function globalSetup() {
  execSync("npm run e2e:prepare", { cwd: "../backend", stdio: "inherit" });
}
