import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";
import { HardhatUserConfig } from "hardhat/config";
import "./tasks/accounts";
import "./tasks/clean";

import "@nomiclabs/hardhat-waffle";
import "@nomiclabs/hardhat-etherscan";
import "@typechain/hardhat";
import "solidity-coverage";
import "hardhat-watcher";
import "hardhat-abi-exporter";
import "hardhat-contract-sizer";
import "hardhat-gas-reporter";
import "hardhat-deploy";
import "hardhat-deploy-ethers";

import networks from "./hardhat.network";

dotenvConfig({ path: resolve(__dirname, "./.env") });

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.6",
    settings: {
      optimizer: {
        enabled: true,
        runs: 999999,
      },
    },
  },
  defaultNetwork: "hardhat",
  networks,
  paths: {
    artifacts: "./artifacts",
    cache: "./cache",
    sources: "./contracts",
    tests: "./test",
  },
  namedAccounts: {
    deployer: {
      default: 0,
    },
  },
  typechain: {
    outDir: "typechain",
    target: "ethers-v5",
  },
  watcher: {
    compile: {
      tasks: ["compile"],
      files: ["./contracts"],
      verbose: true,
    },
    test: {
      tasks: [{ command: "test", params: { testFiles: ["{path}"] } }],
      files: ["./test/**/*"],
      verbose: true,
    },
  },
  abiExporter: {
    path: "./data/abi",
    clear: true,
    flat: true,
  },
  contractSizer: {
    alphaSort: true,
    disambiguatePaths: false,
  },
  gasReporter: {
    currency: "USD",
  },
  mocha: {
    timeout: 30000,
  },
  etherscan: {
    // apiKey: process.env.POLYGON_ETHERSCAN_API_KEY
    // apiKey: process.env.BSC_ETHERSCAN_API_KEY
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
};

export default config;
