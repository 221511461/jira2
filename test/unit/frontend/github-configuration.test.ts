import Keygrip from "keygrip";
import supertest from "supertest";
import testTracking from "../../setup/tracking";

describe("Frontend", () => {
  let subject;
  const authenticatedUserResponse = { login: "test-user" };
  const adminUserResponse = { login: "admin-user" };
  const organizationMembershipResponse = { role: "member" };
  const organizationAdminResponse = { role: "admin" };
  const userInstallationsResponse = {
    total_count: 2,
    installations: [
      {
        account: {
          login: "test-org"
        },
        id: 1,
        target_type: "Organization"
      },
      {
        id: 3
      }
    ]
  };

  function getCookieHeader(payload): string[] {
    const cookie = Buffer.from(JSON.stringify(payload)).toString("base64");
    const keygrip = Keygrip([process.env.GITHUB_CLIENT_SECRET]);

    return [
      `session=${cookie};session.sig=${keygrip.sign(`session=${cookie}`)};`
    ];
  }

  let getHashedKey;
  let setIsDisabled;
  let originalDisabledState;

  beforeEach(async () => {
    getHashedKey = (await import("../../../src/models/installation")).getHashedKey;
    const tracking = (await import("../../../src/tracking"));
    setIsDisabled = tracking.setIsDisabled;
    originalDisabledState = tracking.isDisabled();
    const Frontend = (await import("../../../src/frontend/app")).default;
    subject = Frontend(app.app);
  });

  afterEach(() => {
    setIsDisabled(originalDisabledState);
  });

  describe("GitHub Configuration", () => {
    describe("#post", () => {
      it("should return a 401 if no GitHub token present in session", () => supertest(subject)
        .post("/github/configuration")
        .send({})
        .set("Cookie", getCookieHeader({
          jiraHost: "test-jira-host"
        }))
        .expect(401));

      it("should return a 401 if no Jira host present in session", () => supertest(subject)
        .post("/github/configuration")
        .send({})
        .set("Cookie", getCookieHeader({
          githubToken: "test-github-token"
        }))
        .expect(401));

      it("should return a 401 if the user doesn't have access to the requested installation ID", () => {
        nock("https://api.github.com").get("/user/installations").reply(200, userInstallationsResponse);
        return supertest(subject)
          .post("/github/configuration")
          .send({
            installationId: 2
          })
          .type("form")
          .set("Cookie", getCookieHeader({
            githubToken: "test-github-token",
            jiraHost: "test-jira-host"
          }))
          .expect(401);
      });

      it("should return a 401 if the user is not an admin of the Org", () => {
        nock("https://api.github.com").get("/user/installations").reply(200, userInstallationsResponse);
        nock("https://api.github.com").get("/user").reply(200, authenticatedUserResponse);
        nock("https://api.github.com").get("/orgs/test-org/memberships/test-user").reply(200, organizationMembershipResponse);
        return supertest(subject)
          .post("/github/configuration")
          .send({
            installationId: 1
          })
          .type("form")
          .set("Cookie", getCookieHeader({
            githubToken: "test-github-token",
            jiraHost: "test-jira-host"
          }))
          .expect(401);
      });

      it("should return a 400 if no installationId is present in the body", () => supertest(subject)
        .post("/github/configuration")
        .send({})
        .set("Cookie", getCookieHeader({
          githubToken: "test-github-token",
          jiraHost: "test-jira-host"
        }))
        .expect(400));

      it("should return a 200 and install a Subscription", async () => {
        const jiraHost = "test-jira-host";

        const installation = {
          id: 19,
          jiraHost,
          clientKey: "abc123",
          enabled: true,
          secrets: "def234",
          sharedSecret: "ghi345"
        };
        nock("https://api.github.com").get("/user/installations").reply(200, userInstallationsResponse);
        nock("https://api.github.com").get("/user").reply(200, adminUserResponse);
        nock("https://api.github.com").get("/orgs/test-org/memberships/admin-user").reply(200, organizationAdminResponse);
        await testTracking();

        td.when(models.Installation.getForHost(jiraHost))
          // Allows us to modify installation before it's finally called
          .thenResolve(installation);

        const jiraClientKey = "a-unique-client-key";
        await supertest(subject)
          .post("/github/configuration")
          .send({
            installationId: 1,
            clientKey: jiraClientKey
          })
          .type("form")
          .set("Cookie", getCookieHeader({
            githubToken: "test-github-token",
            jiraHost
          }))
          .expect(200);

        td.verify(models.Subscription.install({
          installationId: "1",
          host: jiraHost,
          clientKey: getHashedKey(jiraClientKey)
        }));
      });
    });
  });
});
