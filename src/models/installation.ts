import crypto from "crypto";
import Sequelize from "sequelize";
import Subscription from "./subscription";

// TODO: this should not be there.  Should only check once a function is called
if (!process.env.STORAGE_SECRET) {
	throw new Error("STORAGE_SECRET is not defined.");
}

export const getHashedKey = (clientKey: string): string => {
	const keyHash = crypto.createHmac("sha256", process.env.STORAGE_SECRET || "");
	keyHash.update(clientKey);
	return keyHash.digest("hex");
};

export default class Installation extends Sequelize.Model {
	id: number;
	jiraHost: string;
	secrets: string;
	sharedSecret: string;
	clientKey: string;
	updatedAt: Date;
	createdAt: Date;

	static async getForClientKey(
		clientKey: string
	): Promise<Installation | null> {
		return Installation.findOne({
			where: {
				clientKey: getHashedKey(clientKey)
			}
		});
	}

	static async getForHost(host: string): Promise<Installation | null> {
		return Installation.findOne( {
			where: {
				jiraHost: host,
			},
			order: [["id", "DESC"]]
		});
	}

	static async getAllForHost(host: string): Promise<Installation[]> {
		return Installation.findAll({
			where: {
				jiraHost: host,
			},
			order: [["id", "DESC"]]
		});
	}

	/**
	 * Create a new Installation object from a Jira Webhook
	 *
	 * @param {{host: string, clientKey: string, secret: string}} payload
	 * @returns {Installation}
	 */
	static async install(payload: InstallationPayload): Promise<Installation> {
		const [installation, created] = await Installation.findOrCreate({
			where: {
				clientKey: getHashedKey(payload.clientKey)
			},
			defaults: {
				jiraHost: payload.host,
				sharedSecret: payload.sharedSecret
			}
		});

		if (!created) {
			await installation
				.update({
					sharedSecret: payload.sharedSecret,
					jiraHost: payload.host
				})
				.then(async (record) => {
					const subscriptions = await Subscription.getAllForClientKey(
						record.clientKey
					);
					await Promise.all(
						subscriptions.map((subscription) =>
							subscription.update({ jiraHost: record.jiraHost })
						)
					);

					return installation;
				});
		}

		return installation;
	}

	async uninstall(): Promise<void> {
		await this.destroy();
	}

	async subscriptions(): Promise<Subscription[]> {
		return Subscription.getAllForClientKey(this.clientKey);
	}
}

export interface InstallationPayload {
	host: string;
	clientKey: string;
	// secret: string;
	sharedSecret: string;
}
