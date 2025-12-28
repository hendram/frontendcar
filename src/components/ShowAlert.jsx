import React, { useState } from "react";
import ReactDOM from "react-dom";
import "./ShowAlert.css";

let alertContainer = null;

export const showAlert = (message) => {
  if (!alertContainer) {
    alertContainer = document.createElement("div");
    document.body.appendChild(alertContainer);
  }
  ReactDOM.render(<Alert message={message} />, alertContainer);
};

const hideAlert = () => {
  if (alertContainer) {
    ReactDOM.unmountComponentAtNode(alertContainer);
  }
};

const Alert = ({ message }) => {
  return (
    <div className="alert-overlay" onClick={hideAlert}>
      <div className="alert-box" onClick={(e) => e.stopPropagation()}>
        <p>{message}</p>
        <button className="alert-btn" onClick={hideAlert}>
          OK
        </button>
      </div>
    </div>
  );
};
