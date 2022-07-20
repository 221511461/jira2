import { Router } from "express";
import { JiraJwtTokenMiddleware } from "middleware/jira-jwt-middleware";
import { csrfMiddleware } from "middleware/csrf-middleware";
import { JiraConnectEnterpriseGet } from "./jira-connect-enterprise-get";
import { JiraConnectEnterprisePost } from "routes/jira/enterprise/jira-connect-enterprise-post";
import { JiraConnectEnterpriseServerAppRouter } from "routes/jira/enterprise/app-for-server/jira-connect-enterprise-server-app-router";
import { JiraConnectEnterpriseAppRouter } from "routes/jira/enterprise/app/jira-connect-enterprise-app-router";

export const JiraConnectEnterpriseRouter = Router();

JiraConnectEnterpriseRouter.use(csrfMiddleware);
JiraConnectEnterpriseRouter.use(JiraJwtTokenMiddleware);

JiraConnectEnterpriseRouter.route("/")
	.get(JiraConnectEnterpriseGet)
	.post(JiraConnectEnterprisePost);

JiraConnectEnterpriseRouter.use("/:serverUrl/app", JiraConnectEnterpriseServerAppRouter);

JiraConnectEnterpriseRouter.use("/app", JiraConnectEnterpriseAppRouter);