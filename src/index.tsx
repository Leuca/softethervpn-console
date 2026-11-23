import React from "react";
import ReactDOM from "react-dom/client";
import { createConsoleRouter } from "@app/index";
import { RouterProvider } from "react-router-dom";

const root = ReactDOM.createRoot(document.getElementById("root") as Element);

root.render(
  <React.StrictMode>
    <RouterProvider router={createConsoleRouter()} />
  </React.StrictMode>,
);
