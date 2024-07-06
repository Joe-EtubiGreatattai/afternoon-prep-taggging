const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");
const axios = require("axios");
const dotenv = require("dotenv");
const { TaggedQuestion } = require("../models/TaggedQuestion");
const mongoose = require("mongoose");
dotenv.config();

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const apiKeys = [
  process.env.GOOGLE_API_KEY_1,
  process.env.GOOGLE_API_KEY_2,
  process.env.GOOGLE_API_KEY_3,
  process.env.GOOGLE_API_KEY_4,
  process.env.GOOGLE_API_KEY_5,
  process.env.GOOGLE_API_KEY_6,
  process.env.GOOGLE_API_KEY_7,
];

let currentKeyIndex = 0;

const getNextApiKey = () => {
  currentKeyIndex = (currentKeyIndex + 1) % apiKeys.length;
  return apiKeys[currentKeyIndex];
};

let genAI = new GoogleGenerativeAI(apiKeys[currentKeyIndex]);

const generateTagsAndAnswer = async (question, retryCount = 0) => {
  const maxRetries = 5;

  try {
    let prompt = `Generate tagging (ensure you include if the question is a word problem or not as part of the tags, the difficulty should be between3 word Easy, Intermediate and Hard) and answer for this Question: '${question.text}'. Strictly based on Waec Standard. Just respond with only the following format below and select the correct answer option from the given options: \n\nDifficulty Level:\n\nGrade Level:\n\nTopics:\n\nTags:\n\nExplain Question:\n\nAnswer:`;

    if (question.options && question.options.length > 0) {
      prompt += "\n\nOptions:\n";
      question.options.forEach((option, index) => {
        const optionLabel = String.fromCharCode(65 + index); // Generate option labels A, B, C, D...
        prompt += `- ${optionLabel}. ${option.text}\n`;
      });
      prompt +=
        "\nChoose the correct answer option letter (e.g., A, B, C, D). Enter only the alphabet corresponding to the correct option, without any additional text of the option just the alphabet corresponding to the correct option.note you can choose more than one option if there are multiple correct options but make sure they are comma separated.";
    }

    if (question.imageUrl && question.imageUrl.trim()) {
      const imageDescription = await getImageDescription(question.imageUrl);
      if (imageDescription) {
        prompt += `\n\nImage Description to be included in the explanation of the question:\n\n${imageDescription}`;
      }
    }

    const topics = question.topics || [];
    prompt += `\n\nTopics: ${topics.join(", ")}`;

    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    const result = await model.generateContent(prompt);
    const response = await result.response;

    const responseText = response.text();

    const parsedResponse = parseAIResponse(responseText);
    return { ...question, ...parsedResponse };
  } catch (error) {
    console.error(`Error generating tags and answer: ${error}`);

    if (error.message.includes("429 Too Many Requests")) {
      console.error("Rate limit exceeded. Switching to the next API key...");
      genAI = new GoogleGenerativeAI(getNextApiKey()); // Switch to the next API key
      await delay(1000); // Short delay before retrying
      return generateTagsAndAnswer(question, retryCount); // Retry immediately with new key
    }

    if (error.message.includes("Candidate was blocked due to SAFETY")) {
      console.error(
        "Safety error encountered. Waiting for 4 minutes before continuing..."
      );
      await delay(240000); // 4 minutes delay
      return generateTagsAndAnswer(question, retryCount); // Retry immediately after delay
    }

    if (
      error.message.includes("Network Error") ||
      error.code === "ECONNABORTED"
    ) {
      if (retryCount < maxRetries) {
        const retryDelay = Math.pow(2, retryCount) * 1000; // Exponential backoff
        console.error(
          `Network error. Retrying in ${
            retryDelay / 1000
          } seconds... (Attempt ${retryCount + 1}/${maxRetries})`
        );
        await delay(retryDelay);
        return generateTagsAndAnswer(question, retryCount + 1); // Retry with incremented retryCount
      } else {
        console.error(
          `Max retries reached. Could not process the question: ${question.text}`
        );
      }
    }

    throw error; // Rethrow the error if it's not handled
  }
};

const parseAIResponse = (responseText) => {
  const lines = responseText.split("\n");
  const response = {
    difficultyLevel: "",
    gradeLevel: "",
    topics: [],
    tags: [],
    explanation: "",
    answer: [],
  };

  lines.forEach((line) => {
    if (line.startsWith("Difficulty Level:")) {
      response.difficultyLevel = line.replace("Difficulty Level:", "").trim();
    } else if (line.startsWith("Grade Level:")) {
      response.gradeLevel = line.replace("Grade Level:", "").trim();
    } else if (line.startsWith("Topics:")) {
      response.topics = line
        .replace("Topics:", "")
        .trim()
        .split(",")
        .map((topic) => topic.trim());
    } else if (line.startsWith("Tags:")) {
      response.tags = line
        .replace("Tags:", "")
        .trim()
        .split(",")
        .map((tag) => tag.trim());
    } else if (line.toLowerCase().startsWith("explain question")) {
      response.explanation = line.trim().slice(16);
    } else if (line.startsWith("Answer:")) {
      const answers = line.replace("Answer:", "").trim().split(",");
      response.answer = answers.map((answer) => answer.trim());
    }
  });

  return response;
};

const getImageDescription = async (imageUrl) => {
  try {
    const imageBuffer = await axios
      .get(imageUrl, { responseType: "arraybuffer" })
      .then((res) => res.data);

    const imageBlob = new Blob([imageBuffer], { type: "image/jpeg" });

    const formData = new FormData();
    formData.append("image", imageBlob, "image.jpg");

    const response = await axios.post(
      "https://afternoonprep-backend-final.onrender.com/api/v1/ai/image/describe",
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      }
    );

    const imageDescription = response.data.data.text || "";

    return imageDescription;
  } catch (error) {
    console.error(`Error fetching image description: ${error}`);
    return "";
  }
};

const saveToDatabase = async (taggedQuestion) => {
  try {
    const formattedQuestion = {
      ...taggedQuestion,
      structure: "OBJECTIVE", // Add the required 'structure' field
      _id: new mongoose.Types.ObjectId(), // Generate a new ObjectId for _id
      createdAt: new Date(), // Set the createdAt field to the current date
      updatedAt: new Date(), // Set the updatedAt field to the current date
    };

    // Remove any fields that should not be saved in the database
    delete formattedQuestion._id;
    delete formattedQuestion.__v;

    await TaggedQuestion.create(formattedQuestion);
    console.info(`Saved question with subject: ${taggedQuestion.subject}`);
  } catch (error) {
    console.error(`Error saving to database: ${error}`);
    throw error;
  }
};

const rateLimit = async (tasks, rate = 6, interval = 120000) => {
  const results = [];
  const batches = [];
  for (let i = 0; i < tasks.length; i += rate) {
    batches.push(tasks.slice(i, i + rate));
  }
  for (const batch of batches) {
    const batchResults = await Promise.all(batch.map((task) => task()));
    results.push(...batchResults);
    if (batch !== batches[batches.length - 1]) {
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
  }
  return results;
};

/**
 * @swagger
 * /tagObjective:
 *   post:
 *     summary: Tag objective questions with difficulty level, grade level, topics, tags, explanation, and answer.
 *     consumes:
 *       - multipart/form-data
 *     parameters:
 *       - in: formData
 *         name: file
 *         type: file
 *         description: The input file containing the questions.
 *         required: true
 *       - in: formData
 *         name: index
 *         type: integer
 *         description: The starting index for processing questions.
 *         required: false
 *     responses:
 *       200:
 *         description: Successfully tagged questions.
 *         schema:
 *           type: object
 *           properties:
 *             results:
 *               type: array
 *               items:
 *                 type: object
 *             originalQuestions:
 *               type: array
 *               items:
 *                 type: object
 *       400:
 *         description: Invalid request body. Input file is required.
 *         schema:
 *           type: object
 *           properties:
 *             message:
 *               type: string
 *       500:
 *         description: Internal server error.
 *         schema:
 *           type: object
 *           properties:
 *             message:
 *               type: string
 */

const tagObjective = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        message: "Invalid request body. Input file is required.",
      });
    }

    const index = parseInt(req.body.index, 10) || 0;
    let questions = JSON.parse(req.file.buffer.toString());
    const originalQuestions = [...questions]; // Create a copy of the original questions
    console.log(`Received ${questions.length} questions`);

    // Adjust the starting point of the questions array
    questions = questions.slice(index);

    const tasks = questions.map((question) => async () => {
      try {
        const tagsInfo = await generateTagsAndAnswer(question);

        if (!tagsInfo) {
          return null;
        }

        let gradeLevel;
        switch (question.type?.toUpperCase()) {
          case "WASSCE":
          case "WAEC":
          case "NECO":
          case "JAMB":
          case "UTME":
          case "POST-UTME":
            gradeLevel = 12;
            break;
          case "JCE":
            gradeLevel = 9;
            break;
          case "GRE":
            gradeLevel = "Post Graduate Studies";
            break;
          default:
            gradeLevel = null;
        }

        const correctOptionsList = question.correctOption || [];

        const optionsWithCorrectFlag = question.options.map((opt) => {
          const isCorrect = correctOptionsList.includes(
            opt.option.toUpperCase()
          );
          const personalityType =
            {
              A: 1,
              B: 2,
              C: 3,
              D: 4,
              E: 5,
            }[opt.option.toUpperCase()] || null;

          return {
            ...opt,
            correct: isCorrect,
            personalityType,
          };
        });

        let imageDescription = "";
        if (question.imageUrl?.trim()) {
          imageDescription = await getImageDescription(question.imageUrl);
        }

        const sectionID = "";

        // Add the subType field, defaulting to an empty string if not present
        const subType = question.subType || "";

        const taggedQuestion = {
          ...question,
          options: optionsWithCorrectFlag,
          topic: tagsInfo.topics || [],
          tags: tagsInfo.tags || [],
          explanation: tagsInfo.explanation || "",
          ai_answer: tagsInfo.answer || "",
          difficulty: tagsInfo.difficultyLevel || "",
          gradeLevel,
          uploader: "ADMIN",
          uploader_id: "653cb4945584360b20bf0089",
          imageDescription,
          sectionID,
          subType, // Ensure the subType field is included
        };

        await saveToDatabase(taggedQuestion);
        console.info(`Saved question with subject: ${taggedQuestion.subject}`);

        // Remove the tagged question from the questions array
        questions = questions.filter((q) => q.text !== question.text);

        return taggedQuestion;
      } catch (error) {
        console.error(`Error tagging question: ${error}`);
        return null;
      }
    });

    const results = await rateLimit(tasks, 13, 60000);

    // Save the remaining untagged questions to a file
    if (questions.length > 0) {
      const untaggedQuestionsFilePath = "untagged_questions.json";
      fs.writeFileSync(
        untaggedQuestionsFilePath,
        JSON.stringify(questions, null, 2)
      );
      console.log(
        `Saved ${questions.length} untagged questions to ${untaggedQuestionsFilePath}`
      );
    }

    res.status(200).json({ results, originalQuestions });
  } catch (error) {
    console.error(`Error tagging questions: ${error}`);
    res.status(500).json({ message: "Internal server error." });
  }
};

module.exports = { tagObjective };
