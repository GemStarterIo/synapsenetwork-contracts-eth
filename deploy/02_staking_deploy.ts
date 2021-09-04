import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { chainName, displayResult, dim, cyan, green } from "../utilities/utils";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, deployments, getChainId } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const chainId = parseInt(await getChainId());

  // 31337 is unit testing, 1337 is for coverage
  const isTestEnvironment = chainId === 31337 || chainId === 1337;

  dim("\n~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~");
  dim("            SynapseStaking - Deploy");
  dim("~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\n");

  dim(`network: ${chainName(chainId)} (${isTestEnvironment ? "local" : "remote"})`);
  dim(`deployer: ${deployer}`);

  cyan("\nDeploying SynapseStaking Contract...");

  const timeToSuper: number = 2592000; //  30 days
  const timeToUnstake: number = 604800; //  7 days

  const stakingResult = await deploy("SynapseStaking", {
    from: deployer,
    args: [timeToSuper, timeToUnstake],
    skipIfAlreadyDeployed: true,
  });

  displayResult("SynapseStaking", stakingResult);
  green(`Done!`);
};

export default func;
func.tags = ["Staking"];
