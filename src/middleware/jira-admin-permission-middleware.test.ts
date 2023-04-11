import { Request } from "express";
import { DatabaseStateCreator } from "test/utils/database-state-creator";
import { jiraAdminPermissionsMiddleware, setJiraAdminPrivileges } from "middleware/jira-admin-permission-middleware";

describe("jiraAdminPermissionsMiddleware", () => {
	let mockRequest;
	let mockResponse;
	let mockNext;

	beforeEach(() => {
		mockRequest = {
			session: undefined,
			log: { info: jest.fn() }
		};
		mockResponse = {
			status: jest.fn().mockReturnThis(),
			send: jest.fn()
		};
		mockNext = jest.fn();
	});

	test("should return 403 Forbidden if session is undefined", async () => {
		await jiraAdminPermissionsMiddleware(mockRequest, mockResponse, mockNext);
		expect(mockResponse.status).toHaveBeenCalledWith(403);
	});

	test("should return 403 Forbidden if hasAdminPermissions is false", async () => {
		mockRequest.session = "false";
		await jiraAdminPermissionsMiddleware(mockRequest, mockResponse, mockNext);
		expect(mockResponse.status).toHaveBeenCalledWith(403);
	});

	test("should call next() if user has Jira admin permissions", async () => {
		mockRequest.session = true;
		await jiraAdminPermissionsMiddleware(mockRequest, mockResponse, mockNext);
		expect(mockNext).toHaveBeenCalled();
	});
});


describe("setJiraAdminPrivileges",  () => {
	const mockRequest = {
		session: {},
		log: {
			info: jest.fn(),
			debug: jest.fn(),
			error: jest.fn()
		}
	} as unknown as Request;
	const mockClaims = { sub: "1111" };
	let installation;

	beforeEach(async () => {
		installation = (await new DatabaseStateCreator().create()).installation;
	});

	it("sets session isJiraAdmin to true if user has ADMINISTER permission", async () => {
		mockRequest.session.isJiraAdmin = undefined;
		const payload = {
			accountId: "1111",
			globalPermissions: [
				"ADMINISTER"
			]
		};
		jiraNock
			.post("/rest/api/latest/permissions/check", payload)
			.reply(200, { globalPermissions: ["ADMINISTER"] });

		await setJiraAdminPrivileges(mockRequest, mockClaims, installation);

		expect(mockRequest.session.isJiraAdmin).toBe(true);
	});

	it("sets session isJiraAdmin to false if user does not have ADMINISTER permission", async () => {
		mockClaims.sub = "2222";
		mockRequest.session.isJiraAdmin = undefined;
		const payload = {
			accountId: "2222",
			globalPermissions: [
				"ADMINISTER"
			]
		};
		jiraNock
			.post("/rest/api/latest/permissions/check", payload)
			.reply(200, { globalPermissions: [] });

		await setJiraAdminPrivileges(mockRequest, mockClaims, installation);

		expect(mockRequest.session.isJiraAdmin).toBe(false);
	});

	it("should exit early when claim has no sub", async () => {
		const mockClaimsNoSub = {};
		mockRequest.session.isJiraAdmin = undefined;

		await setJiraAdminPrivileges(mockRequest, mockClaimsNoSub, installation);

		expect(mockRequest.session.isJiraAdmin).toBe(undefined);
	});

	it("should return session value without JiraClient request if already exists", async () => {
		mockRequest.session.isJiraAdmin = "true";

		await setJiraAdminPrivileges(mockRequest, mockClaims, installation);

		expect(mockRequest.session.isJiraAdmin).toBe("true");
	});
});
