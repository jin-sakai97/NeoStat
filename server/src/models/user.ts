import { model, Schema } from "mongoose";

const userSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, required: true, trim: true, lowercase: true, unique: true },
}, { timestamps: true });

// Sample profiles only; add authentication when the challenge defines its needs.
export const User = model("User", userSchema);
