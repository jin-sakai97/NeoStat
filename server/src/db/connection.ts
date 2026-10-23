import mongoose from "mongoose";
import { env } from "../config/env.js";

mongoose.set("bufferCommands", false);

export async function connectDatabase() {
  await mongoose.connect(env.MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
    autoIndex: false,
    autoCreate: false,
  });
}

export async function pingDatabase() {
  if (!mongoose.connection.db) throw new Error("Database is disconnected");
  await mongoose.connection.db.admin().ping();
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
}
