import React, { useState } from "react";
import "./App.css";
import "./components/nonWebpImagesDisplay.css"; // Import the new CSS
import Loader from "../renderer/components/loader";
import Accordion from "../renderer/components/accordian";
const { ipcRenderer } = window.require("electron");

// New Component to display non-WebP images
const NonWebpImagesDisplay = ({ images }) => {
  if (!images || images.length === 0) {
    return <p>All images are in .webp format!</p>;
  }

  return (
    <div className="non-webp-images-container">
      <ul>
        {images.map((img, index) => (
          <li key={index} className="non-webp-image-item">
            <div className="image-location">
              <strong>Location:</strong> {img.element.path}
            </div>
            <div className="html-element">
              <strong>HTML Element:</strong>
              <pre>
                <code>{img.element.outerHTML}</code>
              </pre>
            </div>
            <div className="image-source">
              <strong>Source:</strong> {img.implementedChecks.webpFormat.value}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

// Main App Component
function App() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState("");
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [excelFilePath, setExcelFilePath] = useState(null); // State for Excel file path
  const [excelError, setExcelError] = useState(null); // State for Excel export error

  // State for showing failed metadata for each category
  const [showFailedBrokenImages, setShowFailedBrokenImages] = useState(false);
  const [showFailedAltText, setShowFailedAltText] = useState(false);
  const [showFailedValidSources, setShowFailedValidSources] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    console.log("Starting analysis...");

    setLoading(true);
    setError(null);
    setResults(null);
    setExcelFilePath(null); // Reset Excel file path
    setExcelError(null); // Reset Excel error
    setLoadingStatus("Initializing accessibility check...");

    try {
      const response = await ipcRenderer.invoke("check-accessibility", url);
      console.log("Response received:", response);

      if (response.success) {
        debugger;
        console.log("Setting results:", response.data);
        setResults(response.data);
        setExcelFilePath(response.data.excelFilePath || null); // Set Excel file path
        setExcelError(response.data.excelError || null); // Set Excel error
      } else {
        setError(response.error);
      }
    } catch (err) {
      console.error("Error:", err);
      setError("Failed to check accessibility: " + err.message);
    } finally {
      setLoading(false);
      setLoadingStatus("");
    }
  };

  // const handleExportToExcel = async () => {
  //   // Send message to main process to open the file
  //   if (excelFilePath) {
  //     ipcRenderer.send("open-excel-file", excelFilePath);
  //   }
  // };

  const handleExportToExcel = async () => {
    if (!results) return;

    try {
      // Remove .data here - just pass results directly
      const response = await ipcRenderer.invoke("export-to-excel", results);
      if (response.success) {
        alert("Report exported successfully!");
      } else {
        alert(response.message || response.error || "Failed to export report");
      }
    } catch (error) {
      console.error("Error exporting to Excel:", error);
      alert("Failed to export report: " + error.message);
    }
  };

  const LargeImagesDisplay = ({ images }) => {
    const largeImages = images.filter(
      (img) => img.implementedChecks.imageSize.value > 200
    );

    if (!largeImages || largeImages.length === 0) {
      return <p>No images above 200KB found!</p>;
    }

    return (
      <div className="large-images-container">
        <ul>
          {largeImages.map((img, index) => (
            <li key={index} className="large-image-item">
              <div className="image-location">
                <strong>Location:</strong> {img.element.path}
              </div>
              <div className="image-size">
                <strong>Size:</strong>{" "}
                {img.implementedChecks.imageSize.value.toFixed(2)} KB
              </div>
              <div className="html-element">
                <strong>HTML Element:</strong>
                <pre>
                  <code>{img.element.outerHTML}</code>
                </pre>
              </div>
              <div className="image-source">
                <strong>Source:</strong> {img.element.src}
              </div>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  const renderIssues = (issues) => {
    if (!Array.isArray(issues) || issues.length === 0) {
      return <p>No issues found</p>;
    }

    return issues.map((issue, index) => (
      <div key={index} className={`issue-item ${issue.type}`}>
        <div className="issue-header">
          <span className={`issue-type ${issue.type}`}>
            {issue.type.toUpperCase()}
          </span>
        </div>
        <div className="issue-details">
          <p>
            <strong>Message:</strong> {issue.message}
          </p>

          {issue.details && issue.details.length > 0 && (
            <div className="h1-details">
              <strong>Found H1 tags:</strong>
              <ul>
                {issue.details.map((h1, i) => (
                  <li key={i}>
                    <div>
                      <strong>Text Content:</strong> {h1.text}
                    </div>
                    <div>
                      <strong>Location:</strong> {h1.path}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    ));
  };

  // Helper function to render failed metadata
  const renderFailedMetadata = (failedImages) => {
    return (
      <div className="failed-metadata">
        {failedImages.map((img, index) => (
          <div key={index} className="failed-item">
            <hr /> {/* Divider between image entries */}
            <div className="metadata-group">
              <div className="check-location">
                <strong>Image Location:</strong> {img.element.path}
              </div>
              <div className="html-element">
                <strong>HTML Element:</strong>
                <pre>
                  <code>{img.element.outerHTML}</code>
                </pre>
              </div>
            </div>
            {Object.entries(img.implementedChecks)
              .filter(([_, check]) => !check.status)
              .map(([checkName, check]) => (
                <div key={checkName} className="check-detail">
                  <div className="check-name">
                    <strong>{checkName}:</strong>
                  </div>
                  <div className="check-info">
                    {check.value && <div>Current Value: {check.value}</div>}
                    {check.details &&
                      Object.entries(check.details).map(([key, value]) => (
                        <div key={key}>
                          {key}: {value.toString()}
                        </div>
                      ))}
                  </div>
                </div>
              ))}
          </div>
        ))}
      </div>
    );
  };

  // ImageChecksDisplay Component (integrated into App.js)
  const ImageChecksDisplay = ({ imageChecks }) => {
    if (!imageChecks) return <p>No image checks available</p>;

    const { analysis, summary } = imageChecks;

    const brokenImagesFailedCount =
      summary.totalImages - summary.implemented.categories.brokenImage;
    const altTextFailedCount =
      summary.totalImages - summary.implemented.categories.altText;
    const validSourcesFailedCount =
      summary.totalImages - summary.implemented.categories.validSource;

    const failedBrokenImages = analysis.filter(
      (img) => !img.implementedChecks.brokenImage.status
    );
    const failedAltTextImages = analysis.filter(
      (img) => !img.implementedChecks.altText.status
    );
    const failedValidSourcesImages = analysis.filter(
      (img) => !img.implementedChecks.validSource.status
    );

    return (
      <div className="image-checks-container">
        <div className="summary-card">
          <h4>Image Accessibility Summary</h4>
          <p>Total Images: {summary.totalImages}</p>
          <div className="check-categories">
            <h5>Categories:</h5>
            <ul>
              <li>
                <div className="category-name">Broken Images</div>
                <div className="category-status">
                  Passed - {summary.implemented.categories.brokenImage} Failed -{" "}
                  <button
                    className={`failed-count-button ${
                      brokenImagesFailedCount > 0 ? "has-failures" : ""
                    }`}
                    onClick={() =>
                      setShowFailedBrokenImages(!showFailedBrokenImages)
                    }
                    disabled={brokenImagesFailedCount === 0}
                  >
                    {brokenImagesFailedCount}
                  </button>{" "}
                  Total - {summary.totalImages}
                </div>
                {showFailedBrokenImages &&
                  brokenImagesFailedCount > 0 &&
                  renderFailedMetadata(failedBrokenImages)}
              </li>
              <li>
                <div className="category-name">Alt Text</div>
                <div className="category-status">
                  Passed - {summary.implemented.categories.altText} Failed -{" "}
                  <button
                    className={`failed-count-button ${
                      altTextFailedCount > 0 ? "has-failures" : ""
                    }`}
                    onClick={() => setShowFailedAltText(!showFailedAltText)}
                    disabled={altTextFailedCount === 0}
                  >
                    {altTextFailedCount}
                  </button>{" "}
                  Total - {summary.totalImages}
                </div>
                {showFailedAltText &&
                  altTextFailedCount > 0 &&
                  renderFailedMetadata(failedAltTextImages)}
              </li>
              <li>
                <div className="category-name">Valid Sources</div>
                <div className="category-status">
                  Passed - {summary.implemented.categories.validSource} Failed -{" "}
                  <button
                    className={`failed-count-button ${
                      validSourcesFailedCount > 0 ? "has-failures" : ""
                    }`}
                    onClick={() =>
                      setShowFailedValidSources(!showFailedValidSources)
                    }
                    disabled={validSourcesFailedCount === 0}
                  >
                    {validSourcesFailedCount}
                  </button>{" "}
                  Total - {summary.totalImages}
                </div>
                {showFailedValidSources &&
                  validSourcesFailedCount > 0 &&
                  renderFailedMetadata(failedValidSourcesImages)}
              </li>
            </ul>
          </div>
        </div>
      </div>
    );
  };

  const OverlaidTextDisplay = ({ images }) => {
    const imagesWithText = images.filter(
      (img) =>
        !img.implementedChecks.overlaidText.status &&
        img.implementedChecks.overlaidText.overlaidElements?.length > 0
    );

    if (!imagesWithText || imagesWithText.length === 0) {
      return <p>No images with overlaid text found.</p>;
    }

    return (
      <div className="overlaid-text-container">
        {imagesWithText.map((img, index) => (
          <div key={index} className="image-analysis-card">
            <div className="image-header">
              <h4>Image {index + 1}</h4>
              <div className="image-details">
                <div className="image-source">
                  <strong>Source:</strong>
                  <code className="source-code">{img.element.src}</code>
                </div>
                <div className="image-path">
                  <strong>Path:</strong>
                  <code className="path-code">{img.element.path}</code>
                </div>
              </div>
            </div>

            <table className="overlaid-text-table">
              <thead>
                <tr>
                  <th>Element Type</th>
                  <th>Text Content</th>
                  <th>Location</th>
                </tr>
              </thead>
              <tbody>
                {img.implementedChecks.overlaidText.overlaidElements
                  .filter((text, i, arr) => {
                    // Remove duplicates based on text content
                    return arr.findIndex((t) => t.text === text.text) === i;
                  })
                  .map((text, textIndex) => (
                    <tr key={textIndex}>
                      <td>
                        <span className="element-tag">{text.tagName}</span>
                      </td>
                      <td>{text.text}</td>
                      <td>
                        <code className="path-code">{text.path}</code>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    );
  };

  const TextReadabilityDisplay = ({ issues }) => {
    if (!issues || issues.length === 0) {
      return <p>No text readability issues found.</p>;
    }

    return (
      <div className="readability-issues-container">
        {issues.map((issue, index) => (
          <div key={index} className="readability-card">
            <div className="issue-header">
              <h4>Text Readability Issue {index + 1}</h4>
            </div>

            <div className="issue-content">
              <div
                className="text-sample"
                style={{
                  color: issue.textColor,
                  backgroundColor: issue.backgroundColor,
                  fontSize: issue.fontSize,
                  fontWeight: issue.fontWeight,
                  padding: "10px",
                  margin: "10px 0",
                  borderRadius: "4px",
                }}
              >
                {issue.text}
              </div>

              <table className="issue-details-table">
                <tbody>
                  <tr>
                    <th>Element Type:</th>
                    <td>
                      <span className="element-tag">{issue.path}</span>
                    </td>
                  </tr>
                  <tr>
                    <th>Contrast Ratio:</th>
                    <td>
                      <span
                        className={`contrast-ratio ${
                          issue.contrastRatio < (issue.isLargeText ? 3 : 4.5)
                            ? "failed"
                            : ""
                        }`}
                      >
                        {issue.contrastRatio.toFixed(2)}:1
                      </span>
                      {issue.isLargeText ? " (Large Text)" : " (Normal Text)"}
                    </td>
                  </tr>
                  <tr>
                    <th>Font Size:</th>
                    <td>{issue.fontSize}</td>
                  </tr>
                  <tr>
                    <th>Location:</th>
                    <td>
                      <code className="path-code">
                        {issue.isOverImage ? "Over image - " : ""}
                        {issue.path}
                      </code>
                    </td>
                  </tr>
                  <tr>
                    <th>Colors:</th>
                    <td>
                      <div className="color-info">
                        <span
                          className="color-sample"
                          style={{ backgroundColor: issue.textColor }}
                        ></span>
                        Text: {issue.textColor}
                      </div>
                      <div className="color-info">
                        <span
                          className="color-sample"
                          style={{ backgroundColor: issue.backgroundColor }}
                        ></span>
                        Background: {issue.backgroundColor}
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    );
  };

  //Head Tag Component
  const HeadTagsDisplay = ({ headTags }) => {
    if (!headTags || !headTags.checks) {
      return <p>No head tags information available</p>;
    }

    return (
      <div className="head-tags-container">
        <table className="tags-table">
          <thead>
            <tr className="tags-header">
              <th className="tag-name-col">Tag Name</th>
              <th className="tag-value-col">Value</th>
              <th className="tag-status-col">Status</th>
            </tr>
          </thead>
          <tbody>
            {headTags.checks.map((check, index) => (
              <tr key={index} className="tag-row">
                <td className="tag-name-col">{check.name}</td>
                <td className="tag-value-col">
                  {check.value || <span className="no-value">No value</span>}
                </td>
                <td className="tag-status-col">
                  <span
                    className={`tag-status ${
                      check.present ? "present" : "absent"
                    }`}
                  >
                    {check.present ? "Present" : "Absent"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  // URL Analysis Display Component
  const URLAnalysisDisplay = ({ urlAnalysis }) => {
    if (!urlAnalysis || !urlAnalysis.urlCheck) {
      return <p>No URL analysis available.</p>;
    }

    const { status, reasons } = urlAnalysis.urlCheck;

    return (
      <div className="url-analysis-container">
        <p>
          <strong>URL Check Status:</strong> {status}
        </p>
        {reasons.length > 0 && (
          <div className="url-analysis-reasons">
            <strong>Reasons for Failure:</strong>
            <ul>
              {reasons.map((reason, index) => (
                <li key={index}>{reason}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  // Broken Links Display Component
  const BrokenLinksDisplay = ({ brokenLinks }) => {
    if (!brokenLinks || brokenLinks.length === 0) {
      return <p>No broken links found.</p>;
    }

    return (
      <div className="broken-links-container">
        <p>
          <strong>Broken Links:</strong>
        </p>
        <ul>
          {brokenLinks.map((link, index) => (
            <li key={index}>
              <a href={link.url} target="_blank" rel="noopener noreferrer">
                {link.url}
              </a>{" "}
              - Status: {link.status}
            </li>
          ))}
        </ul>
      </div>
    );
  };

  console.log("Current state:", { loading, results, error });

  return (
    <div className="container">
      <header className="app-header">
        <h1 className="app-title">Web Accessibility Checker</h1>
        <p className="app-subtitle">
          Analyze websites for WCAG compliance and accessibility issues
        </p>
      </header>

      <div className="form-container">
        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Enter website URL (e.g., https://www.example.com)"
              className="input-field"
              required
              disabled={loading}
            />
            <button type="submit" className="submit-button" disabled={loading}>
              {loading ? "Analyzing..." : "Check Accessibility"}
            </button>
          </div>
        </form>
      </div>

      {loading && (
        <div className="loading-container">
          <Loader />
          <p className="loading-status">{loadingStatus}</p>
        </div>
      )}

      {error && (
        <div className="error-message">
          <strong>Error:</strong> {error}
        </div>
      )}

      {results && !loading && (
        <div className="results-container">
          <div className="results-header">
            <h2>Accessibility Report</h2>
            <div className="results-meta">
              <span>URL: {results.pageUrl}</span>
              <span>
                Scan Date: {new Date(results.timestamp).toLocaleString()}
              </span>
            </div>

            {/* Summary Section with Broken Links */}
            <div className="summary-section">
              <h3>Summary</h3>
              <ul>
                <li>Total H1 Tags: {results.summary.h1Count}</li>
                <hr />
                <li>Total Images: {results.summary.totalImages}</li>
                <li>
                  WebP Images:{" "}
                  {
                    results.categories.media.imageChecks.summary.implemented
                      .categories.webpFormat
                  }
                </li>
                <li>
                  Non-WebP Images:{" "}
                  {results.categories.media.imageChecks.totalImages -
                    results.categories.media.imageChecks.summary.implemented
                      .categories.webpFormat}
                </li>
                <li>
                  Large Images (Greater than 200KB):{" "}
                  {
                    results.categories.media.imageChecks.summary
                      .largeImagesCount
                  }
                </li>
                <li>
                  Images with Overlaid Text:{" "}
                  {
                    results.categories.media.imageChecks.summary
                      .overlaidTextCount
                  }
                  <span
                    className={
                      results.categories.media.imageChecks.summary
                        .overlaidTextCount === 0
                        ? "pass"
                        : "fail"
                    }
                  >
                    {results.categories.media.imageChecks.summary
                      .overlaidTextCount === 0
                      ? "PASS"
                      : "FAIL"}
                  </span>
                </li>
                <hr />
                <li>
                  Web Page URL Check:{" "}
                  <span
                    className={
                      results.summary.status.url === "PASS" ? "pass" : "fail"
                    }
                  >
                    {results.summary.status.url}
                  </span>
                </li>
                <li>
                  Images Check:{" "}
                  <span
                    className={
                      results.summary.status.images === "PASS" ? "pass" : "fail"
                    }
                  >
                    {results.summary.status.images}
                  </span>
                </li>
                <li>
                  Meta Tags:{" "}
                  <span
                    className={
                      results.summary.status.metaTags === "PASS"
                        ? "pass"
                        : "fail"
                    }
                  >
                    {results.summary.status.metaTags}
                  </span>
                </li>
                <li>
                  Broken Links: (404: {results.summary.brokenLinks404Count},
                  500: {results.summary.brokenLinks500Count})
                  <span
                    className={
                      results.summary.status.brokenLinks === "PASS"
                        ? "pass"
                        : "fail"
                    }
                  >
                    {results.summary.status.brokenLinks}
                  </span>
                </li>
                <hr />
                <li>
                  Issues Breakdown:
                  <ul className="issues-breakdown">
                    <li>
                      Low Contrast Text:{" "}
                      {
                        results.categories.textReadability.issues.filter(
                          (issue) =>
                            issue.contrastRatio < (issue.isLargeText ? 3 : 4.5)
                        ).length
                      }
                    </li>
                    <li>
                      Text Over Images:{" "}
                      {
                        results.categories.textReadability.issues.filter(
                          (issue) => issue.isOverImage
                        ).length
                      }
                    </li>
                    <li>
                      Text Readability
                      <span
                        className={`status-item ${
                          results.categories.textReadability.summary.status ===
                          "PASS"
                            ? "pass"
                            : "fail"
                        }`}
                      ></span>
                    </li>
                  </ul>
                </li>
              </ul>
            </div>
          </div>

          {/* Content Structure */}
          <Accordion
            title={`Content Structure (${results.summary.h1Count} H1 tags)`}
            className="level-1"
          >
            <Accordion title="Heading Hierarchy" className="level-2">
              {results.categories?.contentStructure?.headingHierarchy &&
                renderIssues(
                  results.categories.contentStructure.headingHierarchy
                )}
            </Accordion>
          </Accordion>

          {/* Images & Media */}
          <Accordion
            title={`Images & Media (${results.summary.totalImages} total images)`}
            className="level-1"
          >
            <Accordion title="Image Checks" className="level-2">
              {results.categories?.media?.imageChecks && (
                <ImageChecksDisplay
                  imageChecks={results.categories.media.imageChecks}
                />
              )}
            </Accordion>
            {/* New Accordion for Non-WebP Images */}
            <Accordion title="Non-WebP Images" className="level-2">
              {results.categories?.media?.imageChecks && (
                <NonWebpImagesDisplay
                  images={results.categories.media.imageChecks.analysis.filter(
                    (img) => !img.implementedChecks.webpFormat.status
                  )}
                />
              )}
            </Accordion>
            {/* Add new accordion for large images */}
            <Accordion title="Large Images (>200KB)" className="level-2">
              {results.categories?.media?.imageChecks && (
                <LargeImagesDisplay
                  images={results.categories.media.imageChecks.analysis}
                />
              )}
            </Accordion>
            <Accordion
              title={`Images with Overlaid Text (${results.categories.media.imageChecks.summary.overlaidTextCount})`}
              className="level-2"
            >
              {results.categories?.media?.imageChecks && (
                <OverlaidTextDisplay
                  images={results.categories.media.imageChecks.analysis}
                />
              )}
            </Accordion>
          </Accordion>

          {/* Head Tags */}
          {results.categories?.headTags?.headTagsChecks && (
            <Accordion title="Meta Tags & SEO Analysis" className="level-1">
              <Accordion title="Tags" className="level-2">
                <HeadTagsDisplay
                  headTags={results.categories.headTags.headTagsChecks}
                />
              </Accordion>
            </Accordion>
          )}

          {/* Text Readability */}
          <Accordion title="Text Readability Issues" className="level-1">
            <TextReadabilityDisplay
              issues={results.categories.textReadability.issues}
            />
          </Accordion>

          {/* URL Analysis */}
          <Accordion title="Web Page URL Check" className="level-1">
            {results.categories?.urlAnalysis && (
              <URLAnalysisDisplay
                urlAnalysis={results.categories.urlAnalysis}
              />
            )}
          </Accordion>

          {/* Broken Links */}
          <Accordion title="Broken Links" className="level-1">
            {results.categories?.links?.brokenLinks && (
              <BrokenLinksDisplay
                brokenLinks={results.categories.links.brokenLinks}
              />
            )}
          </Accordion>

          {/* Excel Export Section */}
          {/* <div className="excel-export-section">
            <button
              onClick={handleExportToExcel}
              disabled={!excelFilePath}
              className="export-button"
            >
              Export to Excel
            </button>
            {excelFilePath && <p>Excel file saved to: {excelFilePath}</p>}
            {excelError && (
              <p className="error-message">
                Error exporting to Excel: {excelError}
              </p>
            )}
          </div> */}
          <div className="excel-export-section">
            <button onClick={handleExportToExcel} className="export-button">
              Export Report to Excel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
