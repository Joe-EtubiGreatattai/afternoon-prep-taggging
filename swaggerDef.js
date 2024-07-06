// swaggerDef.js
const swaggerJsDoc = require("swagger-jsdoc");

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Afternoonprep question tagging",
      version: "1.0.0",
      description: "API documentation for Afternoonprep question tagging",
    },
    servers: [
      {
        url: "http://localhost:4000",
      },
    ],
  },
  apis: ["./controllers/*.js"],
};

const swaggerSpec = swaggerJsDoc(options);

module.exports = swaggerSpec;
