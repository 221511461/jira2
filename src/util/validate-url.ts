interface UrlValidationResult {
	isValidUrl: boolean,
	reason?: string
}

const ALLOWED_PORTS = [80, 8080, 443, 6017, 8443, 8444, 7990, 8090, 8085, 8060, 8900, 9900];

export const validateUrl = (url: string): UrlValidationResult => {
	try {
		const { protocol, port } = new URL(url);
		if (port && !ALLOWED_PORTS.includes(parseInt(port))) {
			return {
				isValidUrl: false,
				reason: "only the following ports are allowed: " + ALLOWED_PORTS.join(", ")
			};
		}
		if  (!(/^https?:$/.test(protocol))) {
			return {
				isValidUrl: false,
				reason: "unsupported protocol, only HTTP and HTTPS are allowed"
			};
		}
		if (url.includes("?")) {
			return {
				isValidUrl: false,
				reason: "query parameters are not allowed"
			};
		}
	} catch (err) {
		return {
			isValidUrl: false
		};
	}
	return {
		isValidUrl: true
	};
};
