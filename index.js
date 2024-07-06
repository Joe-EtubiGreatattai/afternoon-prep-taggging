const express = require("express");
const multer = require("multer");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const theoryController = require("./controllers/theoryController");
const objectiveController = require("./controllers/objectiveController");
const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./swaggerDef");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 4000;

// Middleware
app.use(bodyParser.json());

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/json") {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only JSON files are allowed."), false);
    }
  },
});

// Connect to MongoDB
const mongoURI = process.env.MONGO_URI;
mongoose
  .connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

// Routes
// Swagger UI setup
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Theory Tagging Endpoint
app.post("/theory", theoryController.tagTheory);

// Objective Tagging Endpoint
app.post("/objective", upload.single("inputFile"), objectiveController.tagObjective);

// Start server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
