import React from "react";
import "./categorySummary.css";

const CategorySummary = ({ category, issues }) => {
  const totalIssues = Object.values(issues).flat().length;
  const errorCount = Object.values(issues)
    .flat()
    .filter((i) => i.type === "error").length;
  const warningCount = Object.values(issues)
    .flat()
    .filter((i) => i.type === "warning").length;
  const noticeCount = Object.values(issues)
    .flat()
    .filter((i) => i.type === "notice").length;

  const getSeverityLevel = () => {
    if (errorCount > 0) return "high";
    if (warningCount > 0) return "medium";
    if (noticeCount > 0) return "low";
    return "none";
  };

  return (
    <div className="category-summary">
      <div className="summary-header">
        <span className="category-name">{category}</span>
        <span className={`severity-indicator ${getSeverityLevel()}`}>
          {getSeverityLevel().toUpperCase()}
        </span>
      </div>
      <div className="issue-counts">
        <span className="count error">
          <strong>{errorCount}</strong> Errors
        </span>
        <span className="count warning">
          <strong>{warningCount}</strong> Warnings
        </span>
        <span className="count notice">
          <strong>{noticeCount}</strong> Notices
        </span>
      </div>
      <div className="total-issues">Total Issues: {totalIssues}</div>
    </div>
  );
};

export default CategorySummary;
