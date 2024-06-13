const { GoogleGenerativeAI } = require("@google/generative-ai");
const axios = require("axios");
const dotenv = require("dotenv");
const { TaggedQuestion } = require("../models/TaggedQuestion");
dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

const generateTagsAndAnswer = async (question) => {
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
    throw error;
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
    await TaggedQuestion.create(taggedQuestion);
    console.info(`Saved question with subject: ${taggedQuestion.subject}`);
  } catch (error) {
    console.error(`Error saving to database: ${error}`);
    throw error;
  }
};

const rateLimit = async (tasks, rate = 13, interval = 60000) => {
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

const tagObjective = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        message: "Invalid request body. Input file is required.",
      });
    }

    const questions = JSON.parse(req.file.buffer.toString());
    console.log(`Received ${questions.length} questions`);

    const tasks = questions.map((question) => async () => {
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
        const isCorrect = correctOptionsList.includes(opt.option.toUpperCase());
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
      };

      await saveToDatabase(taggedQuestion);
      console.info(`Saved question: ${taggedQuestion.text}`);
      return taggedQuestion;
    });

    const results = await rateLimit(tasks, 13, 60000);

    res.status(200).json({ results });
  } catch (error) {
    console.error(`Error tagging questions: ${error}`);
    res.status(500).json({ message: "Internal server error." });
  }
};

module.exports = { tagObjective };
