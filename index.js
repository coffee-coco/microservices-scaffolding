const express = require('express');
const fs = require('fs');
const { execSync } = require('child_process');

const app = express();
const port = process.env.PORT || 3000;

// Read metadata from file
const metadata = JSON.parse(fs.readFileSync('metadata.json', 'utf8'));

// Get the latest commit SHA
const sha = execSync('git rev-parse HEAD').toString().trim();

// Root endpoint
app.get('/', (req, res) => {
  res.json({ message: 'Hello World' });
});

// Status endpoint
app.get('/status', (req, res) => {
  const buildNumber = process.env.BUILD_NUMBER || '0';
  res.json({
    'my-application': [
      {
        description: metadata.description,
        version: `${metadata.version}-${buildNumber}`,
        sha: sha,
      },
    ],
  });
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});