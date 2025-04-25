import React, { useState, useEffect } from "react";
import "./App.css";
import Loader from "./loader";

const { ipcRenderer } = window.require("electron");

function App() {
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(0); // Progress percentage
  const [startTime, setStartTime] = useState(null);
  const [endTime, setEndTime] = useState(null);
  const [totalLinks, setTotalLinks] = useState(0);
  const [brokenLinksCount, setBrokenLinksCount] = useState(0);
  const [crawledLinks, setCrawledLinks] = useState([]);

  useEffect(() => {
    if (results) {
      setBrokenLinksCount(
        results.reduce(
          (count, page) =>
            count + (page.brokenLinks ? page.brokenLinks.length : 0),
          0
        )
      );
    }
  }, [results]);

  const handleFileSelect = async () => {
    try {
      const result = await ipcRenderer.invoke("select-file");
      if (
        result &&
        !result.canceled &&
        result.filePaths &&
        result.filePaths.length > 0
      ) {
        // Add this check
        setIsLoading(true);
        setError(null);
        setStartTime(new Date());
        setProgress(0);
        setResults(null); // Clear previous results
        setTotalLinks(0);
        setCrawledLinks([]);

        const checkResult = await ipcRenderer.invoke(
          "check-broken-links",
          result.filePaths[0]
        );

        if (checkResult.success) {
          setResults(checkResult.data);
          setTotalLinks(checkResult.totalLinksCrawled);
          setCrawledLinks(checkResult.crawledLinks);
          console.log("Received crawledLinks:", checkResult.crawledLinks);
        } else {
          setError(checkResult.error);
        }
        setEndTime(new Date());
      } else if (result && result.error) {
        setError(`File selection error: ${result.error}`); // Handle errors from main.js
      } else {
        console.log("File selection canceled or no file selected.");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = async () => {
    if (results) {
      console.log("Exporting with crawledLinks:", crawledLinks); // Add this line for debugging
      const exportResult = await ipcRenderer.invoke("export-report", {
        results: results,
        crawledLinks: crawledLinks,
      });
      if (exportResult.success) {
        alert("Report exported successfully!");
      } else {
        alert("Failed to export report: " + exportResult.error);
      }
    }
  };

  const elapsedTime = endTime && startTime ? (endTime - startTime) / 1000 : 0;

  return (
    <div className="container">
      <header className="header">
        <h1>Broken Links Checker</h1>
      </header>

      <div className="actions">
        <button onClick={handleFileSelect} disabled={isLoading}>
          Select Excel File
        </button>
        {results && (
          <button onClick={handleExport} disabled={isLoading}>
            Export Report
          </button>
        )}
      </div>

      {error && <div className="error">{error}</div>}

      {isLoading && (
        <div className="progress-container">
          <div className="progress-bar" style={{ width: `${progress}%` }}></div>
        </div>
      )}

      {isLoading && <Loader />}

      {results && !isLoading && (
        <div className="results">
          <h2>Results</h2>
          <p>Total Links Checked: {totalLinks}</p>
          <p>Broken Links Found: {brokenLinksCount}</p>
          <p>Time Elapsed: {elapsedTime} seconds</p>

          {results.map((page, index) => (
            <div key={index} className="page-result">
              <h3>{page.pageUrl}</h3>
              {page.error ? (
                <div className="error">Error: {page.error}</div>
              ) : (
                <div>
                  {page.brokenLinks.length === 0 ? (
                    <p className="success">No broken links found</p>
                  ) : (
                    <table>
                      <thead>
                        <tr>
                          <th>Broken Link</th>
                          <th>Status</th>
                          <th>Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        {page.brokenLinks.map((link, linkIndex) => (
                          <tr key={linkIndex}>
                            <td>{link.url}</td>
                            <td>{link.status}</td>
                            <td>{getHttpStatusDescription(link.status)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <footer className="footer">
        &copy; {new Date().getFullYear()} Broken Links Checker
      </footer>
    </div>
  );
}

// Helper function to get HTTP status description
function getHttpStatusDescription(statusCode) {
  switch (statusCode) {
    case 400:
      return "Bad Request";
    case 404:
      return "Not Found";
    case 500:
      return "Internal Server Error";
    default:
      return "Unknown Error";
  }
}

export default App;
