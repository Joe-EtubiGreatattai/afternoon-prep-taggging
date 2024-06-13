// swagger.js
const swaggerUi = require('swagger-ui-express');
const yamljs = require('yamljs');
const path = require('path');

// Load the Swagger YAML file
const swaggerDocument = yamljs.load(path.join(__dirname, 'swagger.yaml'));

module.exports = {
  serve: swaggerUi.serve,
  setup: swaggerUi.setup(swaggerDocument),
};
