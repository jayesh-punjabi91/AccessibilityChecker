const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const accessibilityService = require("./accessibilityService"); // Adjust the path according to your project structure

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "../../public/index.html")); // Adjust the path according to your project structure

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.on("ready", createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// IPC Handler for Accessibility Check
ipcMain.handle("check-accessibility", async (event, url) => {
  try {
    const result = await accessibilityService.checkAccessibility(url);
    return result;
  } catch (error) {
    console.error("Error in accessibility check:", error);
    return { success: false, error: error.message };
  }
});

// IPC Handler for Excel Export
ipcMain.handle("export-to-excel", async (event, data) => {
  try {
    const result = await accessibilityService.exportToExcel(data);
    return result;
  } catch (error) {
    console.error("Error in export-to-excel handler:", error);
    return { success: false, error: error.message };
  }
});
