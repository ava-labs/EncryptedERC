import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "hardhat-gas-reporter";

const config: HardhatUserConfig = {
	solidity: {
		version: "0.8.27",
		settings: {
			viaIR: true,
			optimizer: {
				enabled: true,
				runs: 200,
			},
		},
	},
	gasReporter: {
		enabled: true,
		// L1: "avalanche",
		darkMode: true,
	},
};

export default config;
