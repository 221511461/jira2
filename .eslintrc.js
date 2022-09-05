module.exports = {
	env: {
		browser: false,
		es6: true,
		node: true
	},
	parser: "@typescript-eslint/parser",
	parserOptions: {
		project: "./tsconfig.json",
		tsconfigRootDir: __dirname,
		sourceType: "module"
	},
	plugins: [
		"@typescript-eslint",
		"import"
	],
	extends: [
		"eslint:recommended",
		"plugin:import/recommended",
		"plugin:import/typescript",
		"plugin:@typescript-eslint/eslint-recommended",
		"plugin:@typescript-eslint/recommended"
	],
	settings: {
		"import/parsers": {
			"@typescript-eslint/parser": [
				".ts",
				".tsx"
			]
		},
		"import/resolver": {
			typescript: {
				alwaysTryTypes: true
			}
		}
	},
	rules: {
		"@typescript-eslint/explicit-module-boundary-types": "off",
		"@typescript-eslint/no-var-requires": "error",
		"@typescript-eslint/no-unused-vars": "error",
		"no-unused-vars": "off",
		"no-console": "warn",
		quotes: [
			"warn",
			"double",
			{
				avoidEscape: true,
				allowTemplateLiterals: true
			}
		],
		indent: ["error", "tab", {
			SwitchCase: 1
		}],
		"@import/no-unresolved": "off",
		"object-curly-spacing": ["error", "always"],
		semi: ["error", "always"],
		"no-trailing-spaces": "error",
		"comma-dangle": "error",
		"keyword-spacing": "error",
		"space-in-parens": ["error", "never"],
		"func-style" : ["warn", "expression"],
		"require-await": "off",
		"@typescript-eslint/no-floating-promises": ["error"],
		overrides: [
		{
			files: ["**/*.test.ts"],
			plugins: [
				"jest"
			],
			extends: [
				"plugin:jest/recommended"
			]
		}
	]
	}
}
