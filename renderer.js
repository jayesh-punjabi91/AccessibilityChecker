const xlsx = require("xlsx");
const { ipcRenderer } = require("electron");

const excelFileSelector = document.getElementById("excelFile");
const processButton = document.getElementById("processButton");
const messageArea = document.getElementById("messageArea");
const dashboard = document.getElementById("dashboard");
const imagesCrawledCountElement = document.getElementById("imagesCrawledCount");
const brokenImagesCountElement = document.getElementById("brokenImagesCount");
const timeTakenElement = document.getElementById("timeTaken");
const brokenImagesTableBody = document.querySelector(
  "#brokenImagesTable tbody"
);
const exportButton = document.getElementById("exportButton");

let urls = [];

excelFileSelector.addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) {
    return;
  }

  messageArea.textContent = "Loading Excel file...";
  processButton.disabled = true;

  const reader = new FileReader();

  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = xlsx.read(data, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

      urls = jsonData
        .slice(1)
        .map((row) => row[0])
        .filter((url) => typeof url === "string" && url.trim() !== "");

      if (urls.length > 0) {
        messageArea.textContent = `Excel file loaded. Found ${urls.length} URLs.`;
        processButton.disabled = false;
      } else {
        messageArea.textContent =
          "No URLs found in the Excel file (first column).";
        processButton.disabled = true;
      }
    } catch (error) {
      console.error("Error reading Excel file:", error);
      messageArea.textContent =
        "Error reading Excel file. Please check the file format.";
      processButton.disabled = true;
    }
  };

  reader.onerror = (error) => {
    console.error("Error reading file:", error);
    messageArea.textContent = "Error reading file.";
    processButton.disabled = true;
  };

  reader.readAsArrayBuffer(file);
});

processButton.addEventListener("click", () => {
  if (urls.length > 0) {
    messageArea.textContent = "Processing URLs... Please wait.";
    processButton.disabled = true;
    dashboard.style.display = "none";
    exportButton.disabled = true; // Disable export button at start of processing

    ipcRenderer.send("process-urls", urls);

    ipcRenderer.on("urls-processed-ack", (event, response) => {
      console.log("Acknowledgement from main process:", response.message);
      messageArea.textContent = response.message;
    });

    ipcRenderer.once("crawl-results", (event, results) => {
      console.log("Crawl results received from main process:", results);
      messageArea.textContent =
        "Crawling and broken image check complete. Displaying results.";
      processButton.disabled = false;
      dashboard.style.display = "block";

      // Update dashboard tiles
      imagesCrawledCountElement.textContent = results.crawledImagesCount;
      brokenImagesCountElement.textContent = results.brokenImagesCount;
      timeTakenElement.textContent = results.timeTaken.toFixed(2);

      // Populate broken images table
      brokenImagesTableBody.innerHTML = "";
      if (results.brokenImagesDetails.length > 0) {
        results.brokenImagesDetails.forEach((brokenImage) => {
          const row = brokenImagesTableBody.insertRow();
          const pageUrlCell = row.insertCell();
          const imageUrlCell = row.insertCell();
          const statusCodeCell = row.insertCell();

          pageUrlCell.textContent = brokenImage.pageUrl;
          imageUrlCell.textContent =
            brokenImage.resolvedImageUrl === "Could not resolve"
              ? brokenImage.imageUrl
              : brokenImage.resolvedImageUrl;
          statusCodeCell.textContent = brokenImage.status || "N/A";
        });
      } else {
        const row = brokenImagesTableBody.insertRow();
        const noDataCell = row.insertCell();
        noDataCell.colSpan = 3;
        noDataCell.textContent = "No broken images found.";
        noDataCell.style.textAlign = "center";
      }

      exportButton.disabled = false; // Enable export button after results are ready

      exportButton.addEventListener("click", () => {
        if (!exportButton.disabled) {
          exportButton.disabled = true;
          messageArea.textContent = "Exporting report to Excel... Please wait.";

          // Collect data for export
          const exportData = {
            summary: {
              imagesCrawledCount: imagesCrawledCountElement.textContent,
              brokenImagesCount: brokenImagesCountElement.textContent,
              timeTaken: timeTakenElement.textContent,
            },
            brokenImagesDetails: [], // We'll populate this from the table
            allCrawledImagesDetails: results.allCrawledImagesDetails, // NEW: Add allCrawledImagesDetails to exportData
          };

          // Extract broken images details from the table
          const tableRows = brokenImagesTableBody.querySelectorAll("tr");
          tableRows.forEach((row) => {
            const cells = row.querySelectorAll("td");
            if (cells.length === 3) {
              // Ensure it's a data row, not the "No broken images" row
              exportData.brokenImagesDetails.push({
                pageUrl: cells[0].textContent,
                imageUrl: cells[1].textContent,
                statusCode: cells[2].textContent,
              });
            }
          });

          // Send 'export-report' event to main process with export data
          ipcRenderer.send("export-report", exportData);

          // Listen for 'export-complete' event from main process
          ipcRenderer.once("export-complete", (event, response) => {
            exportButton.disabled = false; // Re-enable export button
            if (response.success) {
              messageArea.textContent = `Report exported successfully to: ${response.filePath}`;
              // Optionally, you could open the exported file location here using shell.showItemInFolder if needed.
            } else {
              messageArea.textContent = `Export failed: ${
                response.error || "Unknown error"
              }`;
              console.error("Excel export failed:", response.error);
            }
          });
        }
      });
    });
  } else {
    messageArea.textContent =
      "No URLs to process. Please select an Excel file and ensure it contains URLs in the first column.";
  }
});
