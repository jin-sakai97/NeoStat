import { copyFile } from "node:fs/promises";
import { constants } from "node:fs";

for (const directory of ["client", "server"]) {
  try {
    await copyFile(`${directory}/.env.example`, `${directory}/.env`, constants.COPYFILE_EXCL);
    console.log(`Created ${directory}/.env`);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    console.log(`Kept existing ${directory}/.env`);
  }
}
