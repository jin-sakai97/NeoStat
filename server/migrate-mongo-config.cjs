require("dotenv").config({ quiet: true });

if (!process.env.MONGODB_URI) throw new Error("Set MONGODB_URI in server/.env");

module.exports = {
  mongodb: { url: process.env.MONGODB_URI },
  migrationsDir: "migrations",
  changelogCollectionName: "migrations",
  migrationFileExtension: ".cjs",
  useFileHash: false,
  moduleSystem: "commonjs",
};
