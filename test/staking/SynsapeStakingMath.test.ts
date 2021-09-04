import { waffle } from "hardhat";
import { expect } from "chai";

import SynapseStakingArtifacts from "../../artifacts/contracts/SynapseStaking.sol/SynapseStaking.json";
import SynapseNetworkArtifacts from "../../artifacts/contracts/SynapseNetwork.sol/SynapseNetwork.json";
import ERC20MockArtifact from "../../artifacts/contracts/mocks/ERC20Mock.sol/ERC20Mock.json";

import { SynapseStaking, SynapseNetwork, ERC20Mock } from "../../typechain";
import { Wallet, utils } from "ethers";
import { getBigNumber, advanceTimeAndBlock } from "../utilities";

const { provider, deployContract } = waffle;

describe("In staking contract", () => {
  const [deployer, alice, bob, carol, don, eva, fiona, vesting, fee] = provider.getWallets() as Wallet[];

  let staking: SynapseStaking;
  let synapseToken: SynapseNetwork;
  let lpToken: ERC20Mock;

  const one_day = 24 * 60 * 60;
  const seven_days = 7 * 24 * 60 * 60;
  const thirty_days = 30 * 24 * 60 * 60;

  beforeEach(async () => {
    synapseToken = (await deployContract(deployer, SynapseNetworkArtifacts, [deployer.address])) as SynapseNetwork;
    await advanceTimeAndBlock(3 * 24 * 3600 + 30 * 60);
    await synapseToken.setRestrictionActive(false);
    lpToken = (await deployContract(deployer, ERC20MockArtifact, ["SNP-ETH PAIR", "UNI-V2", 18, utils.parseEther("10000")])) as ERC20Mock;
    staking = (await deployContract(deployer, SynapseStakingArtifacts, [thirty_days, seven_days])) as SynapseStaking;

    await synapseToken.changeFeeContract(fee.address);

    // init
    await staking.init(synapseToken.address, lpToken.address, vesting.address);

    // update test account alice balance and allowances
    await synapseToken.transfer(alice.address, getBigNumber(1000));
    await lpToken.transfer(alice.address, getBigNumber(100));
    await synapseToken.connect(alice).approve(staking.address, getBigNumber(1000));
    await lpToken.connect(alice).approve(staking.address, getBigNumber(100));

    // update test account bob balance and allowances
    await synapseToken.transfer(bob.address, getBigNumber(1000));
    await lpToken.transfer(bob.address, getBigNumber(100));
    await synapseToken.connect(bob).approve(staking.address, getBigNumber(1000));
    await lpToken.connect(bob).approve(staking.address, getBigNumber(100));

    // update test account carol balance and allowances
    await synapseToken.transfer(carol.address, getBigNumber(1000));
    await lpToken.transfer(carol.address, getBigNumber(100));
    await synapseToken.connect(carol).approve(staking.address, getBigNumber(1000));
    await lpToken.connect(carol).approve(staking.address, getBigNumber(100));

    // update test account don balance and allowances
    await synapseToken.transfer(don.address, getBigNumber(1000));
    await lpToken.transfer(don.address, getBigNumber(100));
    await synapseToken.connect(don).approve(staking.address, getBigNumber(1000));
    await lpToken.connect(don).approve(staking.address, getBigNumber(100));

    // update test account eva balance and allowances
    await synapseToken.transfer(eva.address, getBigNumber(1000));
    await lpToken.transfer(eva.address, getBigNumber(100));
    await synapseToken.connect(eva).approve(staking.address, getBigNumber(1000));
    await lpToken.connect(eva).approve(staking.address, getBigNumber(100));

    // update test account fiona balance and allowances
    await synapseToken.transfer(fiona.address, getBigNumber(1000000));
    await lpToken.transfer(fiona.address, getBigNumber(100));
    await synapseToken.connect(fiona).approve(staking.address, getBigNumber(1000000));
    await lpToken.connect(fiona).approve(staking.address, getBigNumber(100));
  });

  describe("Math test", () => {
    it("it should work", async () => {
      await synapseToken.approve(staking.address, getBigNumber(66528));
      await synapseToken.setExcludedFromFees(deployer.address, false);
      await expect(staking.notifyRewardAmount(getBigNumber(6048), getBigNumber(60480))).to.be.reverted;

      // exclude staking from fees
      await synapseToken.changeFeeContract(staking.address);
      await synapseToken.setExcludedFromFees(staking.address, true);
      await synapseToken.setExcludedFromFees(deployer.address, true);

      await staking.notifyRewardAmount(getBigNumber(6048), getBigNumber(60480));

      await advanceTimeAndBlock(one_day);

      await staking.connect(alice).addTokenStake(getBigNumber(100));
      await staking.connect(bob).addTokenStake(getBigNumber(100));
      await staking.connect(carol).addLiquidityStake(getBigNumber(20));

      await staking.connect(carol).requestUnstakeLp();
      await staking.connect(carol).claim();
      await staking.connect(carol).unstakeWithFee();

      await staking.connect(carol).addLiquidityStake(getBigNumber(20));

      await expect(staking.connect(carol).requestUnstake()).to.be.reverted;

      await advanceTimeAndBlock(one_day);

      await staking.connect(don).addTokenStake(getBigNumber(100));
      await staking.connect(eva).addTokenStake(getBigNumber(100));
      await staking.connect(fiona).addTokenStake(getBigNumber(200));

      await advanceTimeAndBlock(one_day);

      await staking.connect(don).addLiquidityStake(getBigNumber(10));
      await staking.connect(eva).addLiquidityStake(getBigNumber(10));
      await staking.connect(fiona).addLiquidityStake(getBigNumber(20));

      await advanceTimeAndBlock(one_day);

      await staking.connect(alice).requestUnstake();
      await staking.connect(fiona).requestUnstakeLp();

      await advanceTimeAndBlock(one_day);

      await expect(staking.connect(alice).addTokenStake(getBigNumber(100))).to.be.reverted;

      await staking.connect(bob).claim();
      await staking.connect(carol).requestUnstakeLp();
      await staking.connect(carol).claim();
      await expect(staking.connect(carol).restake()).to.be.reverted;

      await staking.connect(don).claim();
      await staking.connect(fiona).restake();

      await advanceTimeAndBlock(one_day);

      await staking.connect(fiona).addTokenStake(getBigNumber(200));
      await staking.connect(bob).addLiquidityStake(getBigNumber(20));

      await staking.connect(eva).addLiquidityStake(getBigNumber(10));

      await advanceTimeAndBlock(one_day);

      await synapseToken.transfer(staking.address, getBigNumber(10000));
      await synapseToken.approve(staking.address, getBigNumber(66528));
      await staking.notifyRewardAmount(getBigNumber(6048), getBigNumber(60480));

      await advanceTimeAndBlock(one_day);

      await staking.connect(bob).claim();

      await staking.connect(don).claim();
      await staking.connect(fiona).restake();

      await staking.connect(don).addLiquidityStake(getBigNumber(10));
      await staking.connect(eva).addLiquidityStake(getBigNumber(10));

      await advanceTimeAndBlock(one_day);

      await staking.connect(fiona).requestUnstake();

      await advanceTimeAndBlock(one_day);

      await staking.connect(eva).restake();

      await expect(staking.connect(alice).unstake()).to.be.reverted;

      await advanceTimeAndBlock(one_day);
      await advanceTimeAndBlock(one_day);

      await expect(staking.connect(alice).unstakeWithFee()).to.be.reverted;
      await staking.connect(alice).unstake();
      await staking.connect(fiona).unstake();
      await staking.connect(carol).unstake();

      await advanceTimeAndBlock(one_day);
      await advanceTimeAndBlock(one_day);
      await advanceTimeAndBlock(one_day);

      await synapseToken.transfer(staking.address, getBigNumber(10000));
      await synapseToken.approve(staking.address, getBigNumber(66528));
      await staking.notifyRewardAmount(getBigNumber(6048), getBigNumber(60480));

      await staking.connect(alice).addTokenStake(getBigNumber(100));
      await staking.connect(bob).addTokenStake(getBigNumber(100));
      await staking.connect(carol).addTokenStake(getBigNumber(100));
      await staking.connect(don).addTokenStake(getBigNumber(100));
      await staking.connect(eva).addTokenStake(getBigNumber(100));

      await staking.connect(alice).addLiquidityStake(getBigNumber(10));
      await staking.connect(bob).addLiquidityStake(getBigNumber(10));
      await staking.connect(carol).addLiquidityStake(getBigNumber(10));
      await staking.connect(don).addLiquidityStake(getBigNumber(10));
      await staking.connect(eva).addLiquidityStake(getBigNumber(10));

      await advanceTimeAndBlock(one_day);

      await staking.connect(fiona).claim();
      await staking.connect(fiona).unstake();
      await expect(staking.connect(fiona).claim()).to.be.reverted;
      await expect(staking.connect(fiona).restake()).to.be.reverted;

      await staking.connect(alice).claimTo(bob.address);
      await staking.connect(bob).restake();
      await staking.connect(carol).restake();
      await staking.connect(don).restake();
      await staking.connect(eva).restake();

      // + 20000 SNP
      await staking.connect(fiona).addTokenStake(getBigNumber(200000));
      await staking.connect(fiona).requestUnstake();
      await staking.connect(fiona).unstakeWithFee();

      await advanceTimeAndBlock(seven_days);

      await synapseToken.approve(staking.address, getBigNumber(66528));
      await staking.notifyRewardAmount(getBigNumber(6048), getBigNumber(60480));

      await staking.connect(alice).restake();
      await staking.connect(bob).restake();
      await staking.connect(carol).restake();
      await staking.connect(don).restake();
      await staking.connect(eva).restake();

      await advanceTimeAndBlock(seven_days);

      await synapseToken.approve(staking.address, getBigNumber(66528));
      await staking.notifyRewardAmount(getBigNumber(6048), getBigNumber(60480));

      await staking.connect(alice).claim();
      await staking.connect(bob).claim();
      await staking.connect(carol).claim();
      await staking.connect(don).claim();
      await staking.connect(eva).claim();
      await staking.connect(fiona).addLiquidityStake(getBigNumber(10));
      await staking.connect(fiona).restake();

      await expect(staking.connect(alice).setSuperToken()).to.be.reverted;
      await expect(staking.connect(alice).setSuperLp()).to.be.reverted;

      await staking.connect(alice).claim();
      await staking.connect(bob).claim();
      await staking.connect(carol).claim();
      await staking.connect(don).claim();
      await staking.connect(eva).claim();
      await staking.connect(fiona).claim();

      await advanceTimeAndBlock(one_day);
      await advanceTimeAndBlock(one_day);
      await advanceTimeAndBlock(one_day);

      await staking.connect(alice).claim();
      await staking.connect(bob).claim();
      await staking.connect(carol).claim();
      await staking.connect(don).claim();
      await staking.connect(eva).claim();
      await staking.connect(fiona).claim();

      await synapseToken.approve(staking.address, getBigNumber(66528));
      await staking.notifyRewardAmount(getBigNumber(6048), getBigNumber(60480));

      await staking.connect(alice).requestUnstake();
      await staking.connect(alice).requestUnstakeLp();

      await synapseToken.transfer(staking.address, getBigNumber(20000));

      await expect(staking.connect(alice).setSuperToken()).to.be.reverted;
      await expect(staking.connect(alice).setSuperLp()).to.be.reverted;

      await advanceTimeAndBlock(seven_days);

      await expect(staking.connect(alice).addTokenStake(getBigNumber(10))).to.be.reverted;
      await expect(staking.connect(alice).addLiquidityStake(getBigNumber(10))).to.be.reverted;

      await staking.canSetSuper(bob.address);

      await staking.connect(bob).setSuperToken();
      await staking.connect(bob).setSuperLp();
      await expect(staking.connect(bob).setSuperToken()).to.be.reverted;
      await expect(staking.connect(bob).setSuperLp()).to.be.reverted;
      await expect(staking.connect(bob).addTokenStake(0)).to.be.reverted;
      await expect(staking.connect(bob).addLiquidityStake(0)).to.be.reverted;
      await staking.connect(bob).addTokenStake(getBigNumber(10));
      await staking.connect(bob).addLiquidityStake(getBigNumber(10));

      await staking.connect(eva).setSuperToken();
      await staking.connect(eva).requestUnstake();
      await expect(staking.connect(eva).requestUnstake()).to.be.reverted;

      await staking.connect(eva).claim();
      await expect(staking.connect(eva).claim()).to.be.reverted;
      await expect(staking.connect(eva).restake()).to.be.reverted;

      await staking.connect(don).setSuperLp();
      await staking.connect(don).requestUnstakeLp();
      await expect(staking.connect(don).requestUnstakeLp()).to.be.reverted;

      await advanceTimeAndBlock(one_day);
      await advanceTimeAndBlock(one_day);

      await staking.connect(bob).restake();

      await staking.canSetSuper(bob.address);
      await staking.claimable(don.address);
      await staking.claimable(eva.address);

      await staking.connect(alice).unstake();
      await staking.connect(alice).addTokenStake(getBigNumber(10));
      await staking.connect(alice).addLiquidityStake(getBigNumber(10));
      await staking.connect(alice).requestUnstake();
      await staking.connect(alice).requestUnstakeLp();
      await staking.connect(alice).unstakeWithFee();

      await advanceTimeAndBlock(seven_days);

      await staking.connect(bob).claim();
      await staking.connect(carol).claim();
      await staking.connect(don).claim();
      await staking.connect(fiona).claim();

      await advanceTimeAndBlock(thirty_days);

      await expect(staking.connect(alice).requestUnstake()).to.be.reverted;
      await staking.connect(bob).requestUnstake();
      await staking.connect(carol).requestUnstake();
      await staking.connect(don).requestUnstake();
      await expect(staking.connect(eva).requestUnstake()).to.be.reverted;
      await staking.connect(fiona).requestUnstake();
      await expect(staking.connect(alice).requestUnstakeLp()).to.be.reverted;
      await staking.connect(bob).requestUnstakeLp();
      await staking.connect(carol).requestUnstakeLp();
      await expect(staking.connect(don).requestUnstakeLp()).to.be.reverted;
      await staking.connect(eva).requestUnstakeLp();
      await staking.connect(fiona).requestUnstakeLp();

      await advanceTimeAndBlock(seven_days);

      await expect(staking.connect(alice).unstake()).to.be.reverted;
      await staking.connect(bob).unstake();
      await staking.connect(carol).unstake();
      await staking.connect(don).unstake();
      await staking.connect(eva).unstake();
      await staking.connect(fiona).unstake();

      const tokenStaking = await staking.tokenStaking();
      const lpStaking = await staking.lpStaking();

      expect(tokenStaking["stakedTokens"]).to.be.equal(0);
      expect(tokenStaking["stakedSuperTokens"]).to.be.equal(0);

      expect(lpStaking["stakedTokens"]).to.be.equal(0);
      expect(lpStaking["stakedSuperTokens"]).to.be.equal(0);

      const data = await staking.data();

      expect(data["depositedTokens"]).to.be.equal(0);
      expect(data["depositedLiquidity"]).to.be.equal(0);
      expect(data["totalRewardsAdded"]).to.be.equal(getBigNumber(399168));
      expect(data["totalRewardsClaimed"]).to.be.lte(getBigNumber(459169)).and.to.be.gt(getBigNumber(459168));
      expect(data["totalRewardsFromFees"]).to.be.equal(getBigNumber(60001));
    });
  });
});
