import { copyFile, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { randomBytes } from "node:crypto";

for (const directory of ["client", "server"]) {
  try {
    await copyFile(`${directory}/.env.example`, `${directory}/.env`, constants.COPYFILE_EXCL);
    console.log(`Created ${directory}/.env`);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    console.log(`Kept existing ${directory}/.env`);
  }
}

// Fill an empty SESSION_SECRET without ever printing it.
const serverEnv = await readFile("server/.env", "utf8");
if (/^SESSION_SECRET=\s*$/m.test(serverEnv)) {
  await writeFile("server/.env", serverEnv.replace(/^SESSION_SECRET=\s*$/m, `SESSION_SECRET=${randomBytes(32).toString("base64url")}`));
  console.log("Generated SESSION_SECRET in server/.env");
}
