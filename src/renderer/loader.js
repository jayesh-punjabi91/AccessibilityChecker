import React from "react";
import "./loader.css";

const Loader = () => (
  <div className="loader-container">
    <div className="loader"></div>
    <p className="loader-text">Checking for broken links...</p>
  </div>
);

export default Loader;
