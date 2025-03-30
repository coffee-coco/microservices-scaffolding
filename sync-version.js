const fs = require('fs');
const packageJson = require('./package.json');
const metadataJson = require('./metadata.json');

metadataJson.version = packageJson.version;

fs.writeFileSync('./metadata.json', JSON.stringify(metadataJson, null, 2) + '\n');