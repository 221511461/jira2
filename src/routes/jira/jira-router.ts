import { Router } from "express";
import { JiraConfigurationRouter } from "./configuration/jira-configuration-router";
import { JiraSyncPost } from "./jira-sync-post";
import { JiraAtlassianConnectGet } from "./jira-atlassian-connect-get";
import { JiraEventsRouter } from "./events/jira-events-router";
import { JiraSelectVersionRouter } from "./events/jira-select-version-router";
import { JiraContextJwtTokenMiddleware, JiraJwtTokenMiddleware } from "middleware/jira-jwt-middleware";
import { csrfMiddleware } from "middleware/csrf-middleware";

export const JiraRouter = Router();

JiraRouter.get("/atlassian-connect.json", JiraAtlassianConnectGet);
JiraRouter.use("/configuration", JiraConfigurationRouter);
JiraRouter.post("/sync", JiraContextJwtTokenMiddleware, JiraSyncPost);
JiraRouter.use("/events", JiraEventsRouter);
JiraRouter.use("/select-version", JiraSelectVersionRouter);
