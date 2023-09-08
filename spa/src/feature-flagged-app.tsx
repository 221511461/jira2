import "@atlaskit/css-reset";
import { withLDProvider } from "launchdarkly-react-client-sdk";
import createHashWithSharedSecret from "./services/encryptor";
import App from "./app";

// TODO: Find out how these values are being set for current app and use similar approach
const LD_SDK_KEY_DEV = "XXXX";

// Getting the jiraHost name from the iframe URL
const getJiraHost = (): string => {
	const jiraHostFromUrl = new URLSearchParams(location.search).get("xdm_e");
	return jiraHostFromUrl ? createHashWithSharedSecret(jiraHostFromUrl.toString()) : "global";
};

const FeatureFlaggedApp = withLDProvider({
	clientSideID: LD_SDK_KEY_DEV,
	user: {
		key: getJiraHost()
	},
})(App);

export default FeatureFlaggedApp;
