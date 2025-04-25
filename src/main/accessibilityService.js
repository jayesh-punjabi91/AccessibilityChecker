const puppeteer = require("puppeteer");
const axios = require("axios");
const exceljs = require("exceljs");
const { dialog } = require("electron");

const accessibilityService = {
  async checkAccessibility(url, retryCount = 2) {
    let browser = null;
    const timeout = 90000;

    // URL Analysis Function
    const urlAnalysis = (url) => {
      const reasons = [];
      let status = "PASS";

      try {
        const urlObj = new URL(url);

        if (urlObj.protocol !== "https:") {
          reasons.push("URL should use HTTPS for secure connections.");
          status = "FAIL";
        }

        if (url !== url.toLowerCase()) {
          reasons.push("URL should use lowercase letters for consistency.");
          status = "FAIL";
        }

        const specialCharsRegex = /[!@#\$%\^\*\(\)+\=\[\]\{\}\|;:'",\?]/;
        if (specialCharsRegex.test(urlObj.pathname + urlObj.search)) {
          reasons.push(
            "URL should avoid special characters (except hyphens, equal signs, and ampersands)."
          );
          status = "FAIL";
        }

        if (url.length > 200) {
          reasons.push(
            "URL is too long. Shorter URLs are generally better for usability and SEO."
          );
          status = "FAIL";
        }

        const pathSegments = urlObj.pathname
          .split("/")
          .filter((segment) => segment !== "");
        if (pathSegments.length === 0) {
          reasons.push(
            "URL path should contain relevant keywords related to the page content."
          );
          status = "FAIL";
        }
      } catch (error) {
        reasons.push(`Invalid URL format: ${error.message}`);
        status = "FAIL";
      }

      return {
        status: status,
        reasons: reasons,
      };
    };

    for (let attempt = 0; attempt <= retryCount; attempt++) {
      try {
        browser = await puppeteer.launch({
          headless: "new",
          args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-accelerated-2d-canvas",
            "--disable-gpu",
            "--window-size=1920x1080",
          ],
          timeout: timeout,
        });

        const page = await browser.newPage();
        await page.setDefaultNavigationTimeout(timeout);
        await page.setDefaultTimeout(timeout);
        await page.setViewport({ width: 1920, height: 1080 });

        console.log(
          `Attempting to load URL (attempt ${attempt + 1}/${retryCount + 1}):`,
          url
        );

        await page.goto(url, {
          waitUntil: "networkidle0",
          timeout: timeout,
        });
        // H1 Check
        const h1Info = await page.evaluate(() => {
          const h1s = document.getElementsByTagName("h1");
          return {
            count: h1s.length,
            elements: Array.from(h1s).map((h1) => ({
              text: h1.textContent.trim(),
              html: h1.outerHTML,
              path: getElementPath(h1),
            })),
          };

          function getElementPath(el) {
            const path = [];
            while (el && el.nodeType === Node.ELEMENT_NODE) {
              let selector = el.nodeName.toLowerCase();
              if (el.id) {
                selector += `#${el.id}`;
                path.unshift(selector);
                break;
              } else {
                let sibling = el;
                let nth = 1;
                while (sibling.previousElementSibling) {
                  sibling = sibling.previousElementSibling;
                  if (sibling.nodeName === el.nodeName) nth++;
                }
                if (nth > 1) selector += `:nth-of-type(${nth})`;
              }
              path.unshift(selector);
              el = el.parentNode;
            }
            return path.join(" > ");
          }
        });

        //Text Contrast Checks
        // Add these utility functions at the top of accessibilityService.js
        const contrastChecker = {
          // Convert RGB to relative luminance
          getLuminance(r, g, b) {
            let [rs, gs, bs] = [r, g, b].map((c) => {
              c = c / 255;
              return c <= 0.03928
                ? c / 12.92
                : Math.pow((c + 0.055) / 1.055, 2.4);
            });
            return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
          },

          // Calculate contrast ratio
          getContrastRatio(l1, l2) {
            let lighter = Math.max(l1, l2);
            let darker = Math.min(l1, l2);
            return (lighter + 0.05) / (darker + 0.05);
          },

          // Convert hex to RGB
          hexToRgb(hex) {
            const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
            hex = hex.replace(
              shorthandRegex,
              (m, r, g, b) => r + r + g + g + b + b
            );
            const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(
              hex
            );
            return result
              ? {
                  r: parseInt(result[1], 16),
                  g: parseInt(result[2], 16),
                  b: parseInt(result[3], 16),
                }
              : null;
          },

          // Get RGB values from various color formats
          parseColor(color) {
            if (color.startsWith("#")) {
              return this.hexToRgb(color);
            }

            if (color.startsWith("rgb")) {
              const matches = color.match(/(\d+),\s*(\d+),\s*(\d+)/);
              if (matches) {
                return {
                  r: parseInt(matches[1]),
                  g: parseInt(matches[2]),
                  b: parseInt(matches[3]),
                };
              }
            }

            return null;
          },
        };

        // Add the text readability checker function
        async function checkTextReadability(page) {
          const readabilityIssues = await page.evaluate(() => {
            const issues = [];

            function isElementVisible(element) {
              const style = window.getComputedStyle(element);
              return (
                style.display !== "none" &&
                style.visibility !== "hidden" &&
                style.opacity !== "0" &&
                element.offsetWidth > 0 &&
                element.offsetHeight > 0
              );
            }

            function getEffectiveBackgroundColor(element) {
              let currentElement = element;
              let backgroundColor;

              while (currentElement && currentElement !== document.body) {
                const style = window.getComputedStyle(currentElement);
                backgroundColor = style.backgroundColor;

                if (
                  backgroundColor !== "rgba(0, 0, 0, 0)" &&
                  backgroundColor !== "transparent"
                ) {
                  return backgroundColor;
                }

                currentElement = currentElement.parentElement;
              }

              return window.getComputedStyle(document.body).backgroundColor;
            }

            // Get all text elements
            const textElements = document.querySelectorAll(
              "h1, h2, h3, h4, h5, h6, p, span, a, li, td, th, div:not(:empty)"
            );

            textElements.forEach((element) => {
              if (!isElementVisible(element) || !element.textContent.trim()) {
                return;
              }

              const style = window.getComputedStyle(element);
              const textColor = style.color;
              const backgroundColor = getEffectiveBackgroundColor(element);
              const fontSize = parseFloat(style.fontSize);
              const fontWeight = style.fontWeight;

              // Store element information
              const elementInfo = {
                text: element.textContent.trim(),
                textColor: textColor,
                backgroundColor: backgroundColor,
                fontSize: `${fontSize}px`,
                fontWeight: fontWeight,
                path: element.tagName.toLowerCase(),
                isLargeText:
                  fontSize >= 18 || (fontSize >= 14 && fontWeight >= 700),
                backgroundImage: style.backgroundImage,
                position: {
                  x: element.getBoundingClientRect().left,
                  y: element.getBoundingClientRect().top,
                },
              };

              // Check if element is over an image
              const isOverImage = Array.from(
                document.getElementsByTagName("img")
              ).some((img) => {
                const imgRect = img.getBoundingClientRect();
                const elRect = element.getBoundingClientRect();

                return !(
                  elRect.right < imgRect.left ||
                  elRect.left > imgRect.right ||
                  elRect.bottom < imgRect.top ||
                  elRect.top > imgRect.bottom
                );
              });

              if (isOverImage) {
                elementInfo.isOverImage = true;
              }

              issues.push(elementInfo);
            });

            return issues;
          });

          // Process the issues and calculate contrast ratios
          return readabilityIssues.map((issue) => {
            const textColor = contrastChecker.parseColor(issue.textColor);
            const bgColor = contrastChecker.parseColor(issue.backgroundColor);

            if (textColor && bgColor) {
              const textLuminance = contrastChecker.getLuminance(
                textColor.r,
                textColor.g,
                textColor.b
              );
              const bgLuminance = contrastChecker.getLuminance(
                bgColor.r,
                bgColor.g,
                bgColor.b
              );
              const contrastRatio = contrastChecker.getContrastRatio(
                textLuminance,
                bgLuminance
              );

              issue.contrastRatio = contrastRatio;
              issue.meetsWCAG = issue.isLargeText
                ? contrastRatio >= 3 // WCAG AA for large text
                : contrastRatio >= 4.5; // WCAG AA for normal text
            }

            return issue;
          });
        }

        const readabilityIssues = await checkTextReadability(page);

        // Image Checks
        const imageChecksInfo = await page.evaluate(() => {
          function getElementPath(el) {
            const path = [];
            while (el && el.nodeType === Node.ELEMENT_NODE) {
              let selector = el.nodeName.toLowerCase();
              if (el.id) {
                selector += `#${el.id}`;
                path.unshift(selector);
                break;
              } else {
                let sibling = el;
                let nth = 1;
                while (sibling.previousElementSibling) {
                  sibling = sibling.previousElementSibling;
                  if (sibling.nodeName === el.nodeName) nth++;
                }
                if (nth > 1) selector += `:nth-of-type(${nth})`;
              }
              path.unshift(selector);
              el = el.parentNode;
            }
            return path.join(" > ");
          }

          const images = document.getElementsByTagName("img");

          // In the page.evaluate() function, modify the imageAnalysis part:
          const imageAnalysis = Array.from(images).map((img) => {
            const src =
              img.getAttribute("src") || img.currentSrc || img.src || "";
            console.log("Found image with src:", src);

            function getElementPath(el) {
              const path = [];
              while (el && el.nodeType === Node.ELEMENT_NODE) {
                let selector = el.nodeName.toLowerCase();
                if (el.id) {
                  selector += `#${el.id}`;
                  path.unshift(selector);
                  break;
                } else {
                  let sibling = el;
                  let nth = 1;
                  while (sibling.previousElementSibling) {
                    sibling = sibling.previousElementSibling;
                    if (sibling.nodeName === el.nodeName) nth++;
                  }
                  if (nth > 1) selector += `:nth-of-type(${nth})`;
                }
                path.unshift(selector);
                el = el.parentNode;
              }
              return path.join(" > ");
            }

            console.log("Checking image:", {
              src: img.src,
              parentClass: img.parentElement?.className,
              grandParentClass: img.parentElement?.parentElement?.className,
              nearbyText: Array.from(
                img.parentElement?.parentElement?.querySelectorAll(
                  "h1, h2, h3, span"
                ) || []
              ).map((el) => ({
                text: el.textContent.trim(),
                tag: el.tagName,
                class: el.className,
              })),
            });

            const hasOverlaidText = (() => {
              // Step 1: Get image details
              const rect = img.getBoundingClientRect();

              // Skip if image is not visible
              if (rect.width === 0 || rect.height === 0) {
                return {
                  status: true,
                  value: "No overlaid text",
                  overlaidElements: [],
                };
              }

              // Helper function to check if element has meaningful text
              function hasMeaningfulText(element) {
                const text = element.textContent.trim();
                return text.length > 0 && !text.includes("Error Code:");
              }

              // Step 2: Find text elements that could be overlaid
              function findOverlaidText() {
                const overlaidElements = [];

                // First, get the parent container that holds both image and text
                const possibleContainers = [
                  // Start with closest parent
                  img.parentElement,
                  // Then check for specific containers
                  img.closest(".billboard-inner"),
                  img.closest(".cmp-image"),
                  img.closest('[class*="banner"]'),
                  img.closest('[class*="slider"]'),
                  img.closest("picture")?.parentElement,
                ].filter(Boolean);

                for (const container of possibleContainers) {
                  // Look for text containers that are siblings to the image container
                  const textContainers = [
                    container.querySelector(".contentHolder"),
                    container.querySelector(".billboard-paragraph"),
                    container.querySelector(".content"),
                    container.querySelector('[class*="text"]'),
                    ...Array.from(container.children).filter(
                      (child) =>
                        !child.contains(img) &&
                        (child.classList.contains("contentHolder") ||
                          child.classList.contains("billboard-paragraph") ||
                          child.classList.contains("content"))
                    ),
                  ].filter(Boolean);

                  for (const textContainer of textContainers) {
                    // Look for specific text elements
                    const textElements = [
                      ...textContainer.querySelectorAll(
                        'h1, h2, h3, h4, h5, h6, span[class*="Headline"], span[class*="display"]'
                      ),
                      textContainer.querySelector(".richtext"),
                      textContainer,
                    ].filter((el) => el && hasMeaningfulText(el));

                    for (const element of textElements) {
                      const elementRect = element.getBoundingClientRect();

                      // Check if the text element overlaps with the image
                      const overlaps = !(
                        elementRect.right < rect.left ||
                        elementRect.left > rect.right ||
                        elementRect.bottom < rect.top ||
                        elementRect.top > rect.bottom
                      );

                      if (overlaps) {
                        overlaidElements.push({
                          tagName: element.tagName.toLowerCase(),
                          text: element.textContent.trim(),
                          path:
                            element.className || element.tagName.toLowerCase(),
                        });
                      }
                    }
                  }
                }

                return overlaidElements;
              }

              // Main execution

              // Main execution
              try {
                const overlaidElements = findOverlaidText();
                const hasText = overlaidElements.length > 0;

                if (!hasText) {
                  // If no overlaid text found, return minimal object
                  return {
                    status: true,
                    value: "No overlaid text",
                    overlaidElements: [], // Empty array for no overlaid text
                  };
                }

                // Only return details if overlaid text was found
                return {
                  status: false, // false indicates an issue was found
                  value: "Has overlaid text",
                  overlaidElements: overlaidElements, // Include elements only when text is found
                };
              } catch (error) {
                console.error("Error analyzing image:", error);
                return {
                  status: true,
                  value: "Error checking for overlaid text",
                  overlaidElements: [],
                };
              }
            })();

            // Update the implementedChecks object
            const implementedChecks = {
              brokenImage: {
                status: !(
                  !img.complete ||
                  !img.naturalWidth ||
                  img.naturalWidth === 0 ||
                  img.src === "" ||
                  img.src === window.location.href
                ),
                value: img.complete ? "Image loaded" : "Image broken",
              },
              altText: {
                status: img.hasAttribute("alt"),
                value: img.getAttribute("alt") || "No alt text",
              },
              validSource: {
                status: src !== "" && src !== window.location.href,
                value: src,
              },
              webpFormat: {
                status: src.toLowerCase().endsWith(".webp"),
                value: src,
              },
              imageSize: {
                status: true,
                value: 0,
                threshold: 200,
              },
              overlaidText: hasOverlaidText,
            };

            // For debugging
            console.log("Image analysis:", {
              src: img.src,
              hasOverlaidText: !hasOverlaidText.status,
              value: hasOverlaidText.value,
            });

            return {
              element: {
                path: getElementPath(img),
                id: img.id || "",
                className: img.className || "",
                outerHTML: img.outerHTML,
                src: src,
                dimensions: `${img.width}x${img.height}`,
              },
              implementedChecks,
            };
          });

          const summary = {
            implemented: {
              total:
                imageAnalysis.length *
                  Object.keys(imageAnalysis[0]?.implementedChecks || {})
                    .length || 0,
              passed: imageAnalysis.reduce((acc, img) => {
                return (
                  acc +
                  Object.values(img.implementedChecks).filter(
                    (check) => check.status
                  ).length
                );
              }, 0),
              categories: {
                brokenImage: imageAnalysis.filter(
                  (img) => img.implementedChecks.brokenImage.status
                ).length,
                altText: imageAnalysis.filter(
                  (img) => img.implementedChecks.altText.status
                ).length,
                validSource: imageAnalysis.filter(
                  (img) => img.implementedChecks.validSource.status
                ).length,
                webpFormat: imageAnalysis.filter(
                  (img) => img.implementedChecks.webpFormat.status
                ).length,
                imageSize: imageAnalysis.filter(
                  (img) => img.implementedChecks.imageSize.status
                ).length,
              },
            },
            totalImages: images.length,
            largeImagesCount: imageAnalysis.filter(
              (img) => !img.implementedChecks.imageSize.status
            ).length,
            overlaidTextCount: imageAnalysis.filter(
              (img) => !img.implementedChecks.overlaidText.status
            ).length,
          };

          return {
            totalImages: images.length,
            analysis: imageAnalysis,
            summary,
          };
        });

        // After page.evaluate, check image sizes
        for (let img of imageChecksInfo.analysis) {
          try {
            const imgSrc = img.element.src;
            if (!imgSrc) {
              console.log("Skipping image with no source");
              continue;
            }

            console.log("Checking image:", imgSrc);

            // Construct full URL and handle relative paths
            let fullUrl;
            try {
              fullUrl = new URL(imgSrc, url).href;
            } catch (urlError) {
              console.error("Invalid URL:", imgSrc);
              continue;
            }
            console.log("Full URL:", fullUrl);

            const response = await axios({
              method: "get",
              url: fullUrl,
              responseType: "arraybuffer",
              headers: {
                Accept: "image/*",
              },
              timeout: 5000,
              maxContentLength: 50 * 1024 * 1024, // 50MB max
              validateStatus: function (status) {
                return status < 400;
              },
            });

            // Get content length from headers first
            let sizeInKB;
            const contentLength = response.headers["content-length"];
            if (contentLength) {
              sizeInKB = parseInt(contentLength) / 1024;
            } else {
              // Fallback to response data length
              sizeInKB = response.data.length / 1024;
            }

            console.log(`Image size for ${fullUrl}: ${sizeInKB.toFixed(2)} KB`);

            img.implementedChecks.imageSize.value = Math.round(sizeInKB);
            img.implementedChecks.imageSize.status = sizeInKB <= 200;

            console.log("Image check result:", {
              url: fullUrl,
              size: sizeInKB.toFixed(2),
              isOverThreshold: sizeInKB > 200,
            });
          } catch (error) {
            console.error("Error checking image:", {
              src: img.element.src,
              error: error.message,
              ...(error.response && {
                status: error.response.status,
                statusText: error.response.statusText,
              }),
            });
            img.implementedChecks.imageSize.value = 0;
            img.implementedChecks.imageSize.status = false;
          }
        }

        // Add these lines right here, after the for loop
        const largeImages = imageChecksInfo.analysis.filter((img) => {
          const size = img.implementedChecks.imageSize.value;
          const src = img.element.src;
          console.log(`Evaluating image: ${src} with size: ${size} KB`);
          return size > 200;
        });

        console.log(
          "Found large images:",
          largeImages.map((img) => ({
            src: img.element.src,
            size: img.implementedChecks.imageSize.value,
          }))
        );

        imageChecksInfo.summary.largeImagesCount = largeImages.length;
        console.log(
          "Large images count:",
          imageChecksInfo.summary.largeImagesCount
        );

        // Head Tags Check
        const headTagsInfo = await page.evaluate(() => {
          // Helper function to get content safely
          const getContent = (element) => {
            if (!element) return null;
            return (
              element.getAttribute("content") || element.textContent || null
            );
          };

          // Title check
          const titleElement = document.querySelector("title");
          const titleCheck = {
            name: "Title Tag",
            present: !!titleElement,
            value: titleElement ? titleElement.textContent : null,
          };

          // Meta tags checks
          const metaDescription = document.querySelector(
            'meta[name="description"]'
          );
          const metaKeywords = document.querySelector('meta[name="keywords"]');
          const metaAuthor = document.querySelector('meta[name="author"]');
          const metaViewport = document.querySelector('meta[name="viewport"]');
          const canonicalTag = document.querySelector('link[rel="canonical"]');

          // Commented metaKeywords and metaAuthor tags
          const checks = [
            titleCheck,
            {
              name: "Meta Description",
              present: !!metaDescription,
              value: getContent(metaDescription),
            },
            // {
            //   name: "Meta Keywords",
            //   present: !!metaKeywords,
            //   value: getContent(metaKeywords),
            // },
            // {
            //   name: "Meta Author",
            //   present: !!metaAuthor,
            //   value: getContent(metaAuthor),
            // },
            {
              name: "Meta Viewport",
              present: !!metaViewport,
              value: getContent(metaViewport),
            },
            {
              name: "Canonical Tag",
              present: !!canonicalTag,
              value: canonicalTag ? canonicalTag.getAttribute("href") : null,
            },
          ];

          return { checks };
        });

        // Broken Links Check
        let brokenLinks = [];
        const links = await page.evaluate(() => {
          const anchors = Array.from(document.querySelectorAll("a"));
          return anchors
            .map((anchor) => anchor.href)
            .filter((href) => {
              // Filter out JavaScript pseudo-URLs and incomplete URLs
              if (!href) return false;
              if (href.toLowerCase().startsWith("javascript:")) return false;
              if (href === "#") return false;
              if (href === "javascript:void(0)") return false;

              try {
                // Check if it's a valid URL
                new URL(href);
                return true;
              } catch {
                return false;
              }
            });
        });

        // Dynamically import p-limit
        const pLimit = await import("p-limit").then((module) => module.default);

        // Limit concurrency to 5 requests at a time
        const limit = pLimit(5);

        // Function to check link status
        const checkLinkStatus = async (url) => {
          try {
            const response = await axios.get(url, {
              timeout: 10000,
              validateStatus: function (status) {
                return status < 600;
              },
            });
            return { url, status: response.status };
          } catch (error) {
            return {
              url,
              status: error.response ? error.response.status : 500,
            };
          }
        };

        // Create an array of promises
        const promises = links.map((link) =>
          limit(() => checkLinkStatus(link))
        );

        // Wait for all promises to resolve
        const results = await Promise.all(promises);

        // Filter broken links to only include 404 and 500 errors
        brokenLinks = results.filter(
          (result) => result.status === 404 || result.status === 500
        );

        const brokenLinks404Count = brokenLinks.filter(
          (link) => link.status === 404
        ).length;
        const brokenLinks500Count = brokenLinks.filter(
          (link) => link.status === 500
        ).length;

        // Calculate meta tags status
        const metaTagsStatus = headTagsInfo.checks.every(
          (check) => check.present
        )
          ? "PASS"
          : "FAIL";

        const h1Check = {
          type: h1Info.count > 1 ? "error" : "notice",
          code: "SINGLE_H1_CHECK",
          message:
            h1Info.count > 1
              ? `Found ${h1Info.count} <h1> tags. There should be exactly one <h1> tag per page.`
              : h1Info.count === 0
              ? "No <h1> tag found. Each page should have exactly one <h1> tag."
              : "Page has exactly one <h1> tag as recommended.",
          context:
            h1Info.elements.length > 0
              ? h1Info.elements
                  .map((el) => `${el.html} (at ${el.path})`)
                  .join("\n")
              : "No H1 tags found",
          selector: "h1",
          details: h1Info.elements.map((el) => ({
            text: el.text,
            path: el.path,
          })),
        };

        // URL Analysis
        const urlCheckResult = urlAnalysis(url);

        console.log("H1 Info:", h1Info);
        console.log("Image Checks Info:", imageChecksInfo);
        console.log("Head Tags Info:", headTagsInfo);
        console.log("Broken Links:", brokenLinks);
        const response = {
          success: true,
          data: {
            pageUrl: url,
            timestamp: new Date().toISOString(),
            categories: {
              contentStructure: {
                headingHierarchy: [h1Check],
              },
              media: {
                imageChecks: imageChecksInfo,
              },
              headTags: {
                headTagsChecks: headTagsInfo,
              },
              urlAnalysis: {
                urlCheck: urlCheckResult,
              },
              links: {
                brokenLinks: brokenLinks,
              },
              textReadability: {
                issues: readabilityIssues.filter((issue) => !issue.meetsWCAG),
                summary: {
                  totalIssues: readabilityIssues.filter(
                    (issue) => !issue.meetsWCAG
                  ).length,
                  status: readabilityIssues.every((issue) => issue.meetsWCAG)
                    ? "PASS"
                    : "FAIL",
                },
              },
            },
            documentTitle: await page.title(),
            pageUrl: url,
            summary: {
              h1Count: h1Info.count,
              totalImages: imageChecksInfo.totalImages,
              status: {
                headings: h1Info.count === 1 ? "PASS" : "FAIL",
                images:
                  imageChecksInfo.summary.implemented.passed ===
                  imageChecksInfo.summary.implemented.total
                    ? "PASS"
                    : "FAIL",
                metaTags: metaTagsStatus,
                url: urlCheckResult.status,
                brokenLinks: brokenLinks.length > 0 ? "FAIL" : "PASS",
              },
              brokenLinks404Count: brokenLinks404Count,
              brokenLinks500Count: brokenLinks500Count,
            },
          },
        };

        await browser.close();
        console.log("Successfully completed analysis");
        return response;
      } catch (error) {
        if (browser) {
          try {
            await browser.close();
          } catch (closeError) {
            console.error("Error closing browser:", closeError);
          }
        }

        if (attempt === retryCount) {
          return {
            success: false,
            error: `Error checking accessibility: ${error.message}`,
          };
        }

        await new Promise((resolve) => setTimeout(resolve, 2000));
        console.log(`Retrying... (${attempt + 2}/${retryCount + 1})`);
      }
    }
  },

  // Excel Export Function
  async exportToExcel(data) {
    const workbook = new exceljs.Workbook();

    // 1. Summary Worksheet
    const summarySheet = workbook.addWorksheet("Summary");
    summarySheet.columns = [
      { header: "Category", key: "category", width: 20 },
      { header: "Value", key: "value", width: 30 },
      { header: "Status", key: "status", width: 15 },
    ];

    // Add summary data
    summarySheet.addRow({
      category: "URL",
      value: data.pageUrl,
    });
    summarySheet.addRow({
      category: "Scan Date",
      value: new Date(data.timestamp).toLocaleString(),
    });
    summarySheet.addRow({
      category: "H1 Tags",
      value: data.summary.h1Count,
      status: data.summary.status.headings,
    });
    summarySheet.addRow({
      category: "Total Images",
      value: data.summary.totalImages,
      status: data.summary.status.images,
    });
    summarySheet.addRow({
      category: "WebP Images",
      value:
        data.categories.media.imageChecks.summary.implemented.categories
          .webpFormat,
    });
    summarySheet.addRow({
      category: "Large Images (>200KB)",
      value: data.categories.media.imageChecks.summary.largeImagesCount,
      status:
        data.categories.media.imageChecks.summary.largeImagesCount === 0
          ? "PASS"
          : "FAIL",
    });
    summarySheet.addRow({
      category: "Non-WebP Images",
      value:
        data.categories.media.imageChecks.totalImages -
        data.categories.media.imageChecks.summary.implemented.categories
          .webpFormat,
    });
    summarySheet.addRow({
      category: "Images with Overlaid Text",
      value: data.categories.media.imageChecks.summary.overlaidTextCount,
      status:
        data.categories.media.imageChecks.summary.overlaidTextCount === 0
          ? "PASS"
          : "FAIL",
    });
    summarySheet.addRow({
      category: "Meta Tags",
      value: "See Meta Tags sheet",
      status: data.summary.status.metaTags,
    });
    summarySheet.addRow({
      category: "Broken Links",
      value: `404: ${data.summary.brokenLinks404Count}, 500: ${data.summary.brokenLinks500Count}`,
      status: data.summary.status.brokenLinks,
    });

    // Style summary sheet
    summarySheet.getRow(1).font = { bold: true };
    summarySheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE0E0E0" },
    };

    // 2. H1 Tags Worksheet
    const h1Sheet = workbook.addWorksheet("H1 Tags");
    h1Sheet.columns = [
      { header: "Text", key: "text", width: 40 },
      { header: "Path", key: "path", width: 60 },
    ];

    if (data.categories.contentStructure?.headingHierarchy?.[0]?.details) {
      data.categories.contentStructure.headingHierarchy[0].details.forEach(
        (h1) => {
          h1Sheet.addRow({ text: h1.text, path: h1.path });
        }
      );
    }

    // Style H1 sheet
    h1Sheet.getRow(1).font = { bold: true };
    h1Sheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE0E0E0" },
    };

    // 3. Image Checks Worksheet
    const imageSheet = workbook.addWorksheet("Image Checks");
    imageSheet.columns = [
      { header: "Path", key: "path", width: 60 },
      { header: "Alt Text Status", key: "altTextStatus", width: 15 },
      { header: "Broken Image Status", key: "brokenImageStatus", width: 15 },
      { header: "Valid Source Status", key: "validSourceStatus", width: 15 },
      { header: "WebP Format Status", key: "webpFormatStatus", width: 15 },
      { header: "Source URL", key: "sourceUrl", width: 60 },
    ];

    if (data.categories.media?.imageChecks?.analysis) {
      data.categories.media.imageChecks.analysis.forEach((img) => {
        imageSheet.addRow({
          path: img.element.path,
          altTextStatus: img.implementedChecks.altText.status ? "PASS" : "FAIL",
          brokenImageStatus: img.implementedChecks.brokenImage.status
            ? "PASS"
            : "FAIL",
          validSourceStatus: img.implementedChecks.validSource.status
            ? "PASS"
            : "FAIL",
          webpFormatStatus: img.implementedChecks.webpFormat.status
            ? "PASS"
            : "FAIL",
          sourceUrl: img.implementedChecks.validSource.value,
        });
      });
    }

    // Style image sheet
    imageSheet.getRow(1).font = { bold: true };
    imageSheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE0E0E0" },
    };

    // 4. Meta Tags Worksheet
    const metaSheet = workbook.addWorksheet("Meta Tags");
    metaSheet.columns = [
      { header: "Tag Name", key: "name", width: 30 },
      { header: "Status", key: "status", width: 15 },
      { header: "Value", key: "value", width: 60 },
    ];

    if (data.categories.headTags?.headTagsChecks?.checks) {
      data.categories.headTags.headTagsChecks.checks.forEach((tag) => {
        metaSheet.addRow({
          name: tag.name,
          status: tag.present ? "Present" : "Missing",
          value: tag.value || "N/A",
        });
      });
    }

    // Style meta sheet
    metaSheet.getRow(1).font = { bold: true };
    metaSheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE0E0E0" },
    };

    // 5. Broken Links Worksheet
    const brokenLinkSheet = workbook.addWorksheet("Broken Links");
    brokenLinkSheet.columns = [
      { header: "URL", key: "url", width: 100 },
      { header: "Status Code", key: "status", width: 15 },
    ];

    if (data.categories.links?.brokenLinks) {
      data.categories.links.brokenLinks.forEach((link) => {
        brokenLinkSheet.addRow({
          url: link.url,
          status: link.status,
        });
      });
    }

    // Style broken links sheet
    brokenLinkSheet.getRow(1).font = { bold: true };
    brokenLinkSheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE0E0E0" },
    };

    // Add a new worksheet for large images
    const largeImagesSheet = workbook.addWorksheet("Large Images");
    largeImagesSheet.columns = [
      { header: "Path", key: "path", width: 60 },
      { header: "Size (KB)", key: "size", width: 15 },
      { header: "Source URL", key: "sourceUrl", width: 100 },
    ];

    const largeImages = data.categories.media.imageChecks.analysis.filter(
      (img) => !img.implementedChecks.imageSize.status
    );

    if (largeImages.length > 0) {
      largeImages.forEach((img) => {
        largeImagesSheet.addRow({
          path: img.element.path,
          size: img.implementedChecks.imageSize.value.toFixed(2),
          sourceUrl: img.element.src,
        });
      });
    }

    // Style large images sheet
    largeImagesSheet.getRow(1).font = { bold: true };
    largeImagesSheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE0E0E0" },
    };

    // Add a new worksheet for images with overlaid text
    const overlaidTextSheet = workbook.addWorksheet(
      "Images with Overlaid Text"
    );
    overlaidTextSheet.columns = [
      { header: "Image Path", key: "path", width: 60 },
      { header: "Text Content", key: "text", width: 40 },
      { header: "Element Type", key: "element", width: 20 },
    ];

    // Safely handle the overlaid text data
    if (data.categories?.media?.imageChecks?.analysis) {
      const imagesWithText = data.categories.media.imageChecks.analysis.filter(
        (img) => !img.implementedChecks.overlaidText.status // false means text was found
      );

      if (imagesWithText && imagesWithText.length > 0) {
        imagesWithText.forEach((img) => {
          // Safely access overlaidElements
          const overlaidElements =
            img.implementedChecks.overlaidText.overlaidElements || [];

          overlaidElements.forEach((textElement) => {
            overlaidTextSheet.addRow({
              path: img.element.path || "Unknown",
              text: textElement.text || "No text",
              element: textElement.tagName || "Unknown",
            });
          });
        });
      }
    }

    overlaidTextSheet.getRow(1).font = { bold: true };
    overlaidTextSheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE0E0E0" },
    };

    //Text Readability
    const readabilitySheet = workbook.addWorksheet("Text Readability Issues");
    readabilitySheet.columns = [
      { header: "Text Content", key: "text", width: 40 },
      { header: "Element Type", key: "elementType", width: 15 },
      { header: "Contrast Ratio", key: "contrastRatio", width: 15 },
      { header: "Required Ratio", key: "requiredRatio", width: 15 },
      { header: "Font Size", key: "fontSize", width: 12 },
      { header: "Text Color", key: "textColor", width: 20 },
      { header: "Background", key: "backgroundColor", width: 20 },
      { header: "Over Image", key: "overImage", width: 12 },
      { header: "Location", key: "path", width: 50 },
    ];

    // Add data to readability sheet
    if (data.categories?.textReadability?.issues) {
      data.categories.textReadability.issues.forEach((issue) => {
        readabilitySheet.addRow({
          text:
            issue.text.substring(0, 100) +
            (issue.text.length > 100 ? "..." : ""),
          elementType: issue.path,
          contrastRatio: issue.contrastRatio
            ? issue.contrastRatio.toFixed(2) + ":1"
            : "N/A",
          requiredRatio: issue.isLargeText ? "3:1" : "4.5:1",
          fontSize: issue.fontSize,
          textColor: issue.textColor,
          backgroundColor: issue.backgroundColor,
          overImage: issue.isOverImage ? "Yes" : "No",
          path: issue.path,
        });
      });

      // Style the sheet
      readabilitySheet.getRow(1).font = { bold: true };
      readabilitySheet.getRow(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE0E0E0" },
      };

      // Add conditional formatting for contrast ratio
      readabilitySheet
        .getColumn("contrastRatio")
        .eachCell({ includeEmpty: false }, (cell, rowNumber) => {
          if (rowNumber > 1) {
            const row = readabilitySheet.getRow(rowNumber);
            const contrastValue = parseFloat(cell.value);
            const isLargeText = row.getCell("fontSize").value >= "18px";
            const requiredRatio = isLargeText ? 3 : 4.5;

            if (contrastValue < requiredRatio) {
              cell.fill = {
                type: "pattern",
                pattern: "solid",
                fgColor: { argb: "FFFF9999" },
              };
            }
          }
        });

      // Add summary section at the bottom
      readabilitySheet.addRow([]); // Empty row for spacing
      readabilitySheet.addRow(["Summary"]);
      readabilitySheet.addRow([
        "Total Issues:",
        data.categories.textReadability.summary.totalIssues,
      ]);
      readabilitySheet.addRow([
        "Status:",
        data.categories.textReadability.summary.status,
      ]);

      // Style summary section
      const summaryStartRow = readabilitySheet.rowCount - 2;
      readabilitySheet.getRow(summaryStartRow).font = { bold: true };
      readabilitySheet.getRow(summaryStartRow + 1).font = { bold: true };
      readabilitySheet.getRow(summaryStartRow + 2).font = { bold: true };
    } else {
      readabilitySheet.addRow(["No text readability issues found"]);
    }

    // Add color coding legend
    readabilitySheet.addRow([]); // Empty row for spacing
    readabilitySheet.addRow(["Color Coding Legend"]);
    readabilitySheet.addRow([
      "Red Background",
      "Contrast ratio below WCAG requirements",
    ]);

    const legendRow = readabilitySheet.lastRow;
    legendRow.getCell(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFF9999" },
    };

    // Auto-fit columns
    readabilitySheet.columns.forEach((column) => {
      column.width = Math.max(
        column.width || 10,
        column.header?.length || 10,
        ...readabilitySheet
          .getColumn(column.key)
          .values.filter(Boolean)
          .map((v) => v.toString().length)
      );
    });

    // Save the workbook
    try {
      const saveDialogResult = await dialog.showSaveDialog({
        title: "Save Accessibility Report",
        defaultPath: `accessibility-report-${
          new Date().toISOString().split("T")[0]
        }.xlsx`,
        filters: [{ name: "Excel Files", extensions: ["xlsx"] }],
      });

      if (saveDialogResult.canceled) {
        return { success: false, message: "Export cancelled by user" };
      }

      const filePath = saveDialogResult.filePath;
      await workbook.xlsx.writeFile(filePath);
      return { success: true, filePath };
    } catch (error) {
      console.error("Error saving Excel file:", error);
      return { success: false, error: error.message };
    }
  },
};

module.exports = accessibilityService;
