import React from "react";
import "./filter.css";

const Filter = ({ filters, onFilterChange }) => {
  return (
    <div className="filter-container">
      <div className="filter-group">
        <label>Severity:</label>
        <select
          value={filters.severity}
          onChange={(e) => onFilterChange("severity", e.target.value)}
        >
          <option value="all">All Severities</option>
          <option value="error">Errors Only</option>
          <option value="warning">Warnings Only</option>
          <option value="notice">Notices Only</option>
        </select>
      </div>

      <div className="filter-group">
        <label>Category:</label>
        <select
          value={filters.category}
          onChange={(e) => onFilterChange("category", e.target.value)}
        >
          <option value="all">All Categories</option>
          <option value="contentStructure">Content Structure</option>
          <option value="navigation">Navigation & Keyboard</option>
          <option value="media">Images & Media</option>
          <option value="forms">Forms & Interactive</option>
          <option value="color">Color & Contrast</option>
        </select>
      </div>

      <div className="filter-group">
        <button
          className="clear-filters"
          onClick={() => onFilterChange("clear")}
        >
          Clear Filters
        </button>
      </div>
    </div>
  );
};

export default Filter;
