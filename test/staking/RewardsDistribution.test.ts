import { waffle } from "hardhat";
import { expect } from "chai";

import RewardsDistributionMockArtifacts from "../../artifacts/contracts/mocks/RewardsDistributionMock.sol/RewardsDistributionMock.json";

import { RewardsDistributionMock } from "../../typechain";
import { Wallet } from "ethers";

const { provider, deployContract } = waffle;

describe("RewardsDistribution", () => {
  const [deployer, alice] = provider.getWallets() as Wallet[];

  let rewardDistribution: RewardsDistributionMock;

  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

  beforeEach(async () => {
    rewardDistribution = (await deployContract(deployer, RewardsDistributionMockArtifacts, [])) as RewardsDistributionMock;
  });

  describe("initialization", () => {
    it("should initialize as expected", async function () {
      expect(await rewardDistribution.rewardsDistributor()).to.be.equal(deployer.address);
    });
  });

  describe("onlyRewardsDistributor", () => {
    it("should revert when onlyRewardsDistributor function not executed by the reward distributor", async function () {
      await expect(rewardDistribution.connect(alice).distribute()).to.be.revertedWith("caller is not reward distributor");
    });

    it("should execute onlyRewardsDistributor function correctly when called by reward distributor", async function () {
      await expect(rewardDistribution.distribute()).to.not.be.reverted;
    });
  });

  describe("setRewardsDistribution", () => {
    it("should revert if not called by the owner", async function () {
      await expect(rewardDistribution.connect(alice).setRewardsDistribution(alice.address)).to.be.revertedWith("caller is not the owner");
    });

    it("should revert if zero address passed as new reward distributor", async function () {
      await expect(rewardDistribution.setRewardsDistribution(ZERO_ADDRESS)).to.be.revertedWith("zero address");
    });

    it("owner should correctly set new reward distributor", async function () {
      await expect(rewardDistribution.setRewardsDistribution(alice.address))
        .to.emit(rewardDistribution, "RewardsDistributorChanged")
        .withArgs(deployer.address, alice.address);

      expect(await rewardDistribution.rewardsDistributor()).to.be.equal(alice.address);
    });
  });
});
