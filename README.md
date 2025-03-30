# Microservices Scaffolding

This repository provides the basic scaffolding required for developing REST APIs using Node.js. It includes a simple REST API with two endpoints, a GitHub Actions pipeline, and a Dockerfile for containerization.


## Endpoints

- `/`: Returns a "Hello World" message.
- `/status`: Returns application status information.

## Metadata

The `metadata.json` file contains the application description and version. The version is concatenated with the build number during the build process.

## GitHub Actions Pipeline

The pipeline includes the following stages:
- Test: Runs the test cases.
- Build: Builds the Docker image.
- Publish: Publishes the Docker image to GitHub Packages.

## Running Locally

To run the application locally:

```bash
npm install
node index.js