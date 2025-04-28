const puppeteer = require("puppeteer");
const axios = require("axios");
const exceljs = require("exceljs");
const { dialog } = require("electron");

const userAgents = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Safari/605.1.15",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/120.0.2210.77",
  // Add more user agents here
];

function getRandomUserAgent() {
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

const accessibilityService = {
  async checkBrokenLinks(filePath, webContents) {
    let browser = null;
    const timeout = 90000;
    const results = [];
    let totalUrls = 0;
    let processedUrls = 0;
    const crawledLinks = []; // Array to store crawled links and status codes
    let totalLinksCrawled = 0; // Add this line

    try {
      console.time("Read Excel File");
      const workbook = new exceljs.Workbook();
      await workbook.xlsx.readFile(filePath);
      const worksheet = workbook.getWorksheet(1);
      console.timeEnd("Read Excel File");

      // Calculate total URLs
      totalUrls = worksheet.rowCount - 1; // Subtract header row

      console.time("Launch Puppeteer");
      browser = await puppeteer.launch({
        headless: "new", // Or true
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
        ],
      });
      console.timeEnd("Launch Puppeteer");

      // Process each URL in the Excel sheet
      for (let row = 2; row <= worksheet.rowCount; row++) {
        const url = worksheet.getCell(`A${row}`).value;
        if (!url) continue;

        console.time(`Process URL: ${url}`);
        let page = null; // Declare page outside the try block
        try {
          page = await browser.newPage();
          await page.setDefaultNavigationTimeout(timeout);

          // Set User-Agent
          await page.setUserAgent(getRandomUserAgent());

          // Set navigator.webdriver to false to avoid detection
          await page.evaluate(() => {
            Object.defineProperty(navigator, "webdriver", {
              get: () => false,
            });
          });

          console.time(`page.goto(${url})`);
          await page.goto(url, { waitUntil: "networkidle2" });
          console.timeEnd(`page.goto(${url})`);
          await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 5 seconds

          console.time(`Extract Links from ${url}`);
          // Simplified link extraction
          let links = [];
          try {
            links = await page.evaluate(() => {
              const linkElements = document.querySelectorAll("a");
              const links = Array.from(linkElements)
                .map((a) => a.href)
                .filter((href) => href.startsWith("http"));
              console.log("Links found in page:", links); // Add this line
              return links;
            });
          } catch (error) {
            console.error("Error in page.evaluate:", error);
          }
          console.log("Links after evaluate:", links); // Add this line
          console.timeEnd(`Extract Links from ${url}`);

          console.log("totalLinksCrawled before increment:", totalLinksCrawled); // Add this line
          totalLinksCrawled += links.length; // Add this line
          console.log("totalLinksCrawled after increment:", totalLinksCrawled); // Add this line

          // Check each link
          const brokenLinks = [];
          console.time(`Check Links for ${url}`);

          // Concurrency limit
          const concurrencyLimit = 2; // Reduced concurrency to 2
          const queue = [...links]; // Create a copy of the links array
          const running = [];

          while (queue.length > 0 || running.length > 0) {
            // Fill the running queue up to the concurrency limit
            while (running.length < concurrencyLimit && queue.length > 0) {
              const link = queue.shift();
              const promise = this.checkLink(link, crawledLinks, url, 5, 1000); // Pass parent URL, retries and initial delayBase to checkLink
              running.push(promise);
              promise.finally(() => {
                running.splice(running.indexOf(promise), 1); // Remove from running when complete
              });
            }

            // Wait for at least one promise to complete
            if (running.length > 0) {
              await Promise.race(running);
            }
          }

          // Collect the results from the promises
          for (const promise of running) {
            const result = await promise;
            if (result) {
              brokenLinks.push(result);
            }
          }

          console.timeEnd(`Check Links for ${url}`);

          results.push({
            pageUrl: url,
            brokenLinks: brokenLinks,
          });
        } catch (error) {
          results.push({
            pageUrl: url,
            error: error.message,
          });
        } finally {
          if (page) {
            await page.close();
          }
          console.timeEnd(`Process URL: ${url}`);

          // Update progress
          processedUrls++;
          const progress = Math.round((processedUrls / totalUrls) * 100);
          webContents.send("progress-update", progress); // Send progress to renderer
        }
      }

      console.log("Crawled Links:", crawledLinks); // Add this line for debugging
      await browser.close();
      return {
        success: true,
        data: results,
        crawledLinks: crawledLinks,
        totalLinksCrawled: totalLinksCrawled, // Add this line
      };
    } catch (error) {
      if (browser) await browser.close();
      return { success: false, error: error.message };
    }
  },

  // Helper function to check a single link
  async checkLink(
    link,
    crawledLinks,
    parentUrl,
    retries = 5,
    delayBase = 1000
  ) {
    try {
      // Introduce a random delay within a range
      const randomDelay = Math.random() * delayBase + delayBase; // Random delay between delayBase and 2*delayBase
      await new Promise((resolve) => setTimeout(resolve, randomDelay));

      const response = await axios.get(link, { timeout: 10000 }); // Changed to axios.get
      const statusCode = response.status;
      const contentType = response.headers["content-type"];

      crawledLinks.push({
        url: link,
        status: statusCode,
        parentUrl: parentUrl,
      });

      // Check for content type indicating an error page
      if (
        statusCode === 200 &&
        contentType &&
        contentType.includes("text/html") &&
        response.data.includes("Not Found")
      ) {
        console.log(
          `Link ${link} returned 200 OK but contains "Not Found" in the content. Treating as 404.`
        );
        return { url: link, status: 404 };
      }

      if (statusCode >= 400) {
        return { url: link, status: statusCode };
      }
      return null;
    } catch (error) {
      let statusCode = error.response
        ? error.response.status
        : "Connection failed";

      // Check for DNS resolution errors
      if (error.code === "ENOTFOUND" || error.code === "EAI_AGAIN") {
        statusCode = "DNS Resolution Failed";
        console.log(`DNS Resolution Failed for ${link}`);
      }

      // Domain-specific handling for Twitter
      if (link.includes("twitter.com") && statusCode === 403) {
        console.log(`Skipping Twitter link ${link} due to 403 error.`);
        crawledLinks.push({
          url: link,
          status: "Blocked",
          parentUrl: parentUrl,
        });
        return { url: link, status: "Blocked" }; // Return immediately
      }

      if (retries > 0) {
        // Exponential backoff: wait longer with each retry
        const delay = Math.pow(2, 5 - retries) * 1000; // 1s, 2s, 4s, 8s, 16s delays
        console.log(
          `Retrying ${link} in ${delay}ms (${retries} retries remaining), Status Code: ${statusCode}`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));

        // Increase the delay base if we encounter a "Connection Failed" error
        let newDelayBase = delayBase;
        if (statusCode === "Connection failed") {
          newDelayBase = delayBase * 2; // Double the delay base
          console.log(
            `Increasing delay base to ${newDelayBase}ms due to Connection Failed`
          );
        }

        return this.checkLink(
          link,
          crawledLinks,
          parentUrl,
          retries - 1,
          newDelayBase
        ); // Recursive call with fewer retries and potentially increased delay
      }

      crawledLinks.push({
        url: link,
        status: statusCode,
        parentUrl: parentUrl,
      });
      return {
        url: link,
        status: statusCode,
      };
    }
  },

  async exportToExcel(data) {
    const workbook = new exceljs.Workbook();

    // Broken Links Report Worksheet
    const brokenLinksWorksheet = workbook.addWorksheet("Broken Links Report");
    brokenLinksWorksheet.columns = [
      { header: "Page URL", key: "pageUrl", width: 50 },
      { header: "Broken Link", key: "brokenLink", width: 50 },
      { header: "Status Code", key: "status", width: 15 },
      { header: "Parent URL", key: "parentUrl", width: 50 }, // Add Parent URL column
    ];

    data.results.forEach((page) => {
      if (page.brokenLinks && page.brokenLinks.length > 0) {
        page.brokenLinks.forEach((link) => {
          brokenLinksWorksheet.addRow({
            pageUrl: page.pageUrl,
            brokenLink: link.url,
            status: link.status,
            parentUrl: page.pageUrl, // Add Parent URL
          });
        });
      } else if (page.error) {
        brokenLinksWorksheet.addRow({
          pageUrl: page.pageUrl,
          brokenLink: "ERROR",
          status: page.error,
          parentUrl: page.pageUrl, // Add Parent URL
        });
      }
    });

    // Crawled Links Worksheet
    const crawledLinksWorksheet = workbook.addWorksheet("Crawled Links");
    crawledLinksWorksheet.columns = [
      { header: "URL", key: "url", width: 50 },
      { header: "Status Code", key: "status", width: 15 },
      { header: "Parent URL", key: "parentUrl", width: 50 }, // Add Parent URL column
    ];

    const crawledLinks = data.crawledLinks;

    if (crawledLinks) {
      crawledLinks.forEach((link) => {
        crawledLinksWorksheet.addRow({
          url: link.url,
          status: link.status,
          parentUrl: link.parentUrl, // Add Parent URL
        });
      });
    }

    // Save the workbook
    try {
      const saveDialogResult = await dialog.showSaveDialog({
        title: "Save Broken Links Report",
        defaultPath: `broken-links-report-${
          new Date().toISOString().split("T")[0]
        }.xlsx`,
        filters: [{ name: "Excel Files", extensions: ["xlsx"] }],
      });

      if (!saveDialogResult.canceled) {
        await workbook.xlsx.writeFile(saveDialogResult.filePath);
        return { success: true, filePath: saveDialogResult.filePath };
      }
      return { success: false, message: "Export cancelled" };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
};

module.exports = accessibilityService;
