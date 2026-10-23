import { connectDatabase, disconnectDatabase } from "./connection.js";
import { env } from "../config/env.js";
import { Note } from "../models/note.js";
import { User } from "../models/user.js";

try {
  if (env.NODE_ENV === "production") throw new Error("Seed is for development only.");
  await connectDatabase();
  const samples = [
    { name: "Alex Demo", email: "alex@example.test" },
    { name: "Sam Demo", email: "sam@example.test" },
  ];
  for (const sample of samples) {
    const user = await User.findOneAndUpdate(
      { email: sample.email },
      { $setOnInsert: sample },
      { upsert: true, returnDocument: "after", runValidators: true },
    );
    await Note.updateOne(
      { seedKey: `welcome:${sample.email}` },
      { $setOnInsert: {
        title: `Welcome, ${sample.name}`,
        body: "Sample data for checking MongoDB connectivity. Replace with your challenge domain.",
        owner: user._id,
      } },
      { upsert: true, runValidators: true },
    );
  }
  console.log("Seed ready: 2 sample profiles and 2 notes. Existing records were preserved.");
} catch {
  console.error("Seed failed. Use a development database, check MONGODB_URI, and run db:migrate first.");
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
