const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const axios = require("axios");
const cheerio = require("cheerio");
const xlsx = require("xlsx");

let mainWindow;

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  mainWindow.loadFile("index.html");
  // mainWindow.webContents.openDevTools();
}

async function checkImageStatus(imageUrl) {
  try {
    const response = await axios.head(imageUrl);
    return response.status;
  } catch (error) {
    console.error("Error checking image URL:", imageUrl, error);
    if (error.response) {
      if (error.response.status === 405) {
        return 200; // Treat 405 as "OK" for now (or you could use a special code like 300)
      }
      return error.response.status;
    }
    return 500;
  }
}

async function crawlAndCheckImages(urls) {
  const startTime = Date.now();
  let crawledImagesCount = 0;
  let brokenImagesCount = 0;
  const brokenImagesDetails = [];
  const allCrawledImagesDetails = []; // NEW: Array to store details of all crawled images

  for (const pageUrl of urls) {
    try {
      console.log(`Crawling page: ${pageUrl}`);
      const response = await axios.get(pageUrl);
      if (response.status !== 200) {
        console.warn(
          `Failed to fetch page: ${pageUrl} - Status: ${response.status}`
        );
        continue;
      }
      const html = response.data;
      const $ = cheerio.load(html);
      const images = $("img");
      console.log(
        `Number of images tags found on ${pageUrl}: ${images.length}`
      );

      if (images.length > 0) {
        for (let i = 0; i < images.length; i++) {
          const imgSrc = images[i].attribs.src;
          if (imgSrc) {
            crawledImagesCount++;
            let imageUrl = imgSrc;

            if (!imageUrl.startsWith("http")) {
              try {
                imageUrl = new URL(imageUrl, pageUrl).href;
              } catch (urlError) {
                console.warn(
                  `Could not resolve image URL: ${imgSrc} on page: ${pageUrl}`,
                  urlError
                );
                brokenImagesCount++;
                brokenImagesDetails.push({
                  pageUrl,
                  imageUrl: imgSrc,
                  resolvedImageUrl: "Could not resolve",
                  status: "N/A",
                }); // Status N/A for resolution error
                allCrawledImagesDetails.push({
                  pageUrl,
                  imageUrl: imgSrc,
                  resolvedImageUrl: "Could not resolve",
                  status: "N/A",
                }); // Add to all crawled images too
                continue;
              }
            }

            const status = await checkImageStatus(imageUrl);
            if (status >= 400) {
              brokenImagesCount++;
              brokenImagesDetails.push({
                pageUrl,
                imageUrl,
                resolvedImageUrl: imageUrl,
                status,
              });
              console.warn(
                `Broken image found on ${pageUrl}: ${imageUrl} - Status: ${status}`
              );
            }
            // NEW: Add details to allCrawledImagesDetails for every image, regardless of status
            allCrawledImagesDetails.push({
              pageUrl,
              imageUrl,
              resolvedImageUrl: imageUrl,
              status,
            });
          }
        }
      }
    } catch (error) {
      console.error(
        `Error crawling or checking images on page: ${pageUrl}`,
        error
      );
    }
  }

  const endTime = Date.now();
  const timeTaken = (endTime - startTime) / 1000;

  return {
    crawledImagesCount,
    brokenImagesCount,
    brokenImagesDetails,
    allCrawledImagesDetails, // NEW: Return allCrawledImagesDetails
    timeTaken,
  };
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  ipcMain.on("process-urls", async (event, urls) => {
    console.log("URLs received from renderer:", urls);
    event.reply("urls-processed-ack", {
      message:
        "URLs received and processing started in main process. Crawling and checking images...",
    });

    const crawlResults = await crawlAndCheckImages(urls);
    console.log("Crawling completed. Results:", crawlResults);

    event.reply("crawl-results", crawlResults);
  });

  // --- Excel Export Logic ---
  ipcMain.on("export-report", async (event, exportData) => {
    try {
      const workbook = xlsx.utils.book_new(); // Create a new workbook

      // --- Summary Worksheet ---
      const summarySheetData = [
        ["Metric", "Value"],
        ["Images Crawled", exportData.summary.imagesCrawledCount],
        ["Broken Images Found", exportData.summary.brokenImagesCount],
        ["Time Taken (seconds)", exportData.summary.timeTaken],
      ];
      const summarySheet = xlsx.utils.aoa_to_sheet(summarySheetData); // Array of arrays to sheet
      xlsx.utils.book_append_sheet(workbook, summarySheet, "Summary"); // Add sheet to workbook

      // --- Broken Images Worksheet ---
      const brokenImagesSheetHeader = ["Page URL", "Image URL", "Status Code"];
      const brokenImagesSheetData = [brokenImagesSheetHeader]; // Start with header row
      exportData.brokenImagesDetails.forEach((item) => {
        brokenImagesSheetData.push([
          item.pageUrl,
          item.imageUrl,
          item.statusCode,
        ]); // Add data rows
      });
      const brokenImagesSheet = xlsx.utils.aoa_to_sheet(brokenImagesSheetData);
      xlsx.utils.book_append_sheet(
        workbook,
        brokenImagesSheet,
        "Broken Images"
      );

      // --- Crawled Images Worksheet (NEW) ---
      const crawledImagesSheetHeader = [
        "Page URL",
        "Image URL",
        "Resolved Image URL",
        "Status Code",
      ]; // Added "Resolved Image URL"
      const crawledImagesSheetData = [crawledImagesSheetHeader];
      exportData.allCrawledImagesDetails.forEach((item) => {
        crawledImagesSheetData.push([
          item.pageUrl,
          item.imageUrl,
          item.resolvedImageUrl,
          item.status,
        ]); // Added resolvedImageUrl
      });
      const crawledImagesSheet = xlsx.utils.aoa_to_sheet(
        crawledImagesSheetData
      );
      xlsx.utils.book_append_sheet(
        workbook,
        crawledImagesSheet,
        "Crawled Images"
      ); // Added new worksheet

      // --- Show Save Dialog ---
      const saveDialogResult = await dialog.showSaveDialog(mainWindow, {
        title: "Save Report Excel File",
        defaultPath: `accessibility-report-${new Date()
          .toISOString()
          .slice(0, 10)}.xlsx`, // Default file name
        filters: [{ name: "Excel Files", extensions: ["xlsx"] }],
      });

      if (!saveDialogResult.canceled && saveDialogResult.filePath) {
        const filePath = saveDialogResult.filePath;
        xlsx.writeFile(workbook, filePath); // Write workbook to file

        event.reply("export-complete", { success: true, filePath: filePath }); // Send success response
      } else {
        event.reply("export-complete", {
          success: false,
          error: "Save dialog canceled or file path not selected.",
        }); // Canceled save
      }
    } catch (error) {
      console.error("Error exporting to Excel:", error);
      event.reply("export-complete", {
        success: false,
        error: error.message || "Unknown export error",
      }); // Send error response
    }
  });
  // --- End of Excel Export Logic ---
});

app.on("window-all-closed", function () {
  if (process.platform !== "darwin") app.quit();
});
