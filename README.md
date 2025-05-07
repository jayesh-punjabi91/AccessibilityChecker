# Accessibility Checker

This project consists of an Electron.js based desktop application to perform a health check on a website from the Accessibility Standpoint.
Among alot of checks performed below are a few of them:
- Structural Hierarchy of the DOM
- Broken Links
- Broken Images
- Format of the Images on the webpage
- Size of the Images Present
- Missing Alt Texts
- Availablity of required SEO Tags with their Values

## Prerequisites

Before getting started, make sure you have the following installed on your system:

- **Node.js** and **npm** (Node Package Manager)

Install the necessary npm packages:

```bash
npm install
```

## Running the Angular Application

Once the dependencies are installed, you can run the frontend application with:

```bash
npm run build
npm start
```

A Desktop Application will be launched, input the URL to be checked in the input box and a detailed summary report will be generated post health check.
