const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const TaggedQuestionSchema = new Schema(
  {
    text: { type: String, required: true },
    options: { type: Array, required: true },
    correctOption: { type: Array, required: true },
    year: { type: Number, required: true },
    subject: { type: String, required: true },
    type: { type: String, required: true },
    subType: { type: String, default: "" },
    flagged: { type: Boolean, default: false },
    flags: { type: Array, default: [] },
    structure: { type: String, required: true },
    topic: { type: Array, default: [] },
    tags: { type: Array, default: [] },
    explanation: { type: String, default: "" },
    ai_answer: { type: Array, required: true },
    difficulty: { type: String, default: "" },
    gradeLevel: { type: String, default: "" },
    uploader: { type: String, default: "admin" },
    uploader_id: { type: String, default: "" },
    imageDescription: { type: String, default: "" },
    sectionID: { type: String, default: "" },
  },
  { timestamps: true }
);

const TaggedQuestion = mongoose.model("TaggedQuestion", TaggedQuestionSchema);
module.exports = { TaggedQuestion };
