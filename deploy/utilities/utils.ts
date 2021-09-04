import chalk from "chalk";
import { BigNumber } from "ethers";
import { DeployResult } from "hardhat-deploy/types";

export function getBigNumber(amount: number, decimals: number = 18): BigNumber {
  return BigNumber.from(amount).mul(BigNumber.from(10).pow(decimals));
}

export function dim(logMessage: string): void {
  console.log(chalk.dim(logMessage));
}

export function cyan(logMessage: string): void {
  console.log(chalk.cyan(logMessage));
}

export function yellow(logMessage: string): void {
  console.log(chalk.yellow(logMessage));
}

export function green(logMessage: string): void {
  console.log(chalk.green(logMessage));
}

export function displayResult(name: string, result: DeployResult): void {
  if (!result.newlyDeployed) {
    yellow(`Re-used existing ${name} at ${result.address}`);
  } else {
    green(`${name} deployed at ${result.address}`);
  }
}

export const chainName = (chainId: number): string => {
  switch (chainId) {
    case 1:
      return "Mainnet";
    case 4:
      return "Rinkeby";
    case 56:
      return "BSC";
    case 97:
      return "BSCTestnet";
    case 137:
      return "Polygon";
    case 80001:
      return "Mumbai";
    default:
      return "Rinkeby";
  }
};
