const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const accessibilityService = require("./accessibilityService");

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
    },
  });

  // Load the index.html file
  mainWindow.loadFile(path.join(__dirname, "../../public/index.html"));

  // Open DevTools for debugging (you can remove this in production)
  // mainWindow.webContents.openDevTools();

  // Listen for progress updates from accessibilityService
  ipcMain.on("progress-update", (event, progress) => {
    mainWindow.webContents.send("progress-update", progress); // Forward to renderer
  });
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

ipcMain.handle("select-file", async () => {
  try {
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "Excel Files", extensions: ["xlsx", "xls"] }],
    });

    if (result && result.filePaths && result.filePaths.length > 0) {
      // More robust check
      return result;
    } else {
      return { canceled: true }; // Return a canceled result
    }
  } catch (error) {
    console.error("Error in select-file:", error); // Log the error
    return { canceled: true, error: error.message }; // Return a canceled result with the error message
  }
});

ipcMain.handle("check-broken-links", async (event, filePath) => {
  return await accessibilityService.checkBrokenLinks(
    filePath,
    mainWindow.webContents
  );
});

ipcMain.handle("export-report", async (event, data) => {
  return await accessibilityService.exportToExcel(data);
});
