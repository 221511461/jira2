import fs from "fs";
import { STATE_PATH, TestDataRole } from "test/e2e/constants";

export const clearState = () => {
	fs.existsSync(STATE_PATH) && fs.rmdirSync(STATE_PATH, { recursive: true });
};

export const stateExists = (role: TestDataRole): boolean => {
	if (role.storage) {
		return fs.existsSync(role.storage);
	}
	return true;
};
