import { initializeMonitoring, captureReactError } from "./monitoring";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { App } from "./App";
import "./styles.css";

initializeMonitoring();

const root = document.getElementById("root");
if (!root) throw new Error("Application root element was not found");
const router = createBrowserRouter([{ path: "*", element: <App /> }]);


createRoot(root, { onUncaughtError: captureReactError, onCaughtError: captureReactError }).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
