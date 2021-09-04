import { waffle } from "hardhat";
import { expect } from "chai";

import SynapseStakingArtifacts from "../../artifacts/contracts/SynapseStaking.sol/SynapseStaking.json";
import SynapseNetworkArtifacts from "../../artifacts/contracts/SynapseNetwork.sol/SynapseNetwork.json";
import SynapseVestingArtifacts from "../../artifacts/contracts/SynapseVesting.sol/SynapseVesting.json";
import ERC20MockArtifact from "../../artifacts/contracts/mocks/ERC20Mock.sol/ERC20Mock.json";

import { SynapseStaking, SynapseNetwork, SynapseVesting, ERC20Mock } from "../../typechain";
import { Wallet, utils, BigNumber } from "ethers";
import { getBigNumber, latest, duration, advanceTimeAndBlock } from "../utilities";

const { provider, deployContract } = waffle;

describe("Synapse Staking Claim And Stake", () => {
  const [deployer, alice, bob, carol] = provider.getWallets() as Wallet[];

  let staking: SynapseStaking;
  let vesting: SynapseVesting;
  let synapseToken: SynapseNetwork;
  let lpToken: ERC20Mock;

  const tokenRewardPerSec: BigNumber = getBigNumber(1, 16);

  const seven_days = 7 * 24 * 60 * 60;
  const thirty_days = 30 * 24 * 60 * 60;

  beforeEach(async () => {
    synapseToken = (await deployContract(deployer, SynapseNetworkArtifacts, [deployer.address])) as SynapseNetwork;
    await advanceTimeAndBlock(3 * 24 * 3600 + 30 * 60);
    await synapseToken.setRestrictionActive(false);
    vesting = (await deployContract(deployer, SynapseVestingArtifacts, [])) as SynapseVesting;
    lpToken = (await deployContract(deployer, ERC20MockArtifact, ["SNP-ETH PAIR", "UNI-V2", 18, utils.parseEther("10000")])) as ERC20Mock;
    staking = (await deployContract(deployer, SynapseStakingArtifacts, [thirty_days, seven_days])) as SynapseStaking;

    await synapseToken.changeFeeContract(staking.address);

    // exclude from fees
    await synapseToken.setExcludedFromFees(staking.address, true);
    await synapseToken.setExcludedFromFees(vesting.address, true);

    // set staking address
    await vesting.setStakingAddress(staking.address);

    // init
    await vesting.init(synapseToken.address);
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

    // add vesting
    const timestamp = await latest();
    await synapseToken.transfer(vesting.address, getBigNumber(10000));
    await vesting.massAddHolders(
      [alice.address, alice.address, bob.address, carol.address, carol.address, bob.address, carol.address],
      [3456789, 22, 33, 44, 55, 66, 77],
      [34567890, 333, 555, 666, 777, 888, 111],
      timestamp.add(duration.days(4)),
      timestamp.add(duration.days(27))
    );

    await advanceTimeAndBlock(seven_days);
  });

  describe("after adding rewards", () => {
    beforeEach(async () => {
      await synapseToken.approve(staking.address, getBigNumber(66528));
      await staking.notifyRewardAmount(getBigNumber(6048), getBigNumber(60480));
      await staking.connect(bob).addTokenStake(getBigNumber(100));
    });

    describe("onClaimToStake", () => {
      it("should add token stake correctly from claim and update rewards", async () => {
        const claimed_amount: number = 7514914;
        await vesting.connect(alice).claimAndStake();

        const timestamp = await latest();
        const aliceStake = await staking.tokenStake(alice.address);
        expect(aliceStake["tokens"]).to.be.equal(claimed_amount);
        expect(aliceStake["rewards"]).to.be.equal(0);
        expect(aliceStake["rewardPerTokenPaid"]).to.be.equal(getBigNumber(2, 14)); // 2 block for solo Bob staking

        const tokenStaking = await staking.tokenStaking();
        expect(tokenStaking["stakedTokens"]).to.be.equal(getBigNumber(100).add(claimed_amount));
        expect(tokenStaking["rewardRate"]).to.be.equal(tokenRewardPerSec);
        expect(tokenStaking["rewardPerTokenStored"]).to.be.equal(getBigNumber(2, 14));
        expect(tokenStaking["lastUpdateTime"]).to.be.equal(timestamp);

        const data = await staking.data();
        expect(data["depositedTokens"]).to.be.equal(getBigNumber(100).add(claimed_amount));
        expect(data["totalRewardsClaimed"]).to.be.equal(0);

        await advanceTimeAndBlock(9);

        const claimableAlice = await staking.claimable(alice.address);
        expect(claimableAlice["token"]).to.be.equal(6763);
      });
    });
  });

  describe("before adding rewards", () => {
    beforeEach(async () => {
      await staking.connect(bob).addTokenStake(getBigNumber(100));
      await vesting.connect(alice).claimAndStake();
    });

    describe("after adding new rewards", () => {
      beforeEach(async () => {
        await synapseToken.approve(staking.address, getBigNumber(66528));
        await staking.notifyRewardAmount(getBigNumber(6048), getBigNumber(60480));
      });

      describe("onClaimToStake", () => {
        it("should add token stake correctly from claim and update rewards", async () => {
          const claimed_amount: number = 7514883;

          const timestamp = await latest();
          const aliceStake = await staking.tokenStake(alice.address);
          expect(aliceStake["tokens"]).to.be.equal(claimed_amount);
          expect(aliceStake["rewards"]).to.be.equal(0);
          expect(aliceStake["rewardPerTokenPaid"]).to.be.equal(0);

          const tokenStaking = await staking.tokenStaking();
          expect(tokenStaking["stakedTokens"]).to.be.equal(getBigNumber(100).add(claimed_amount));
          expect(tokenStaking["rewardRate"]).to.be.equal(tokenRewardPerSec);
          expect(tokenStaking["rewardPerTokenStored"]).to.be.equal(0);
          expect(tokenStaking["lastUpdateTime"]).to.be.equal(timestamp);

          const data = await staking.data();
          expect(data["depositedTokens"]).to.be.equal(getBigNumber(100).add(claimed_amount));
          expect(data["totalRewardsClaimed"]).to.be.equal(0);

          await advanceTimeAndBlock(9);

          const claimableAlice = await staking.claimable(alice.address);
          expect(claimableAlice["token"]).to.be.equal(6763);
        });
      });
    });
  });
});
