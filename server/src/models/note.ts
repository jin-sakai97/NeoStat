import { model, Schema } from "mongoose";

const noteSchema = new Schema({
  seedKey: { type: String, unique: true, sparse: true },
  title: { type: String, required: true, trim: true, maxlength: 120 },
  body: { type: String, required: true, maxlength: 2000 },
  owner: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
}, { timestamps: true });

export const Note = model("Note", noteSchema);
