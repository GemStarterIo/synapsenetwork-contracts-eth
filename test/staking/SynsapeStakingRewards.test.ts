import { waffle } from "hardhat";
import { expect } from "chai";

import SynapseStakingArtifacts from "../../artifacts/contracts/SynapseStaking.sol/SynapseStaking.json";
import SynapseNetworkArtifacts from "../../artifacts/contracts/SynapseNetwork.sol/SynapseNetwork.json";
import ERC20MockArtifact from "../../artifacts/contracts/mocks/ERC20Mock.sol/ERC20Mock.json";

import { SynapseStaking, SynapseNetwork, ERC20Mock } from "../../typechain";
import { Wallet, utils, BigNumber } from "ethers";
import { getBigNumber, latest, advanceTimeAndBlock } from "../utilities";

const { provider, deployContract } = waffle;

const ERR_WITHDRAWING: string = "Cannot when withdrawing";
const ERR_SUPER_STAKER: string = "Already super staker";
const ERR_TRANSFER: string = "ERC20 transfer error";
const ERR_TOO_SOON: string = "Too soon";
const ERR_NO_STAKE: string = "Nothing staked";
const ERR_NO_RESTAKE: string = "Nothing to restake";
const ERR_NO_CLAIM: string = "Nothing to claim";
const ERR_ZERO_AMOUNT: string = "Zero Amount";
const ERR_REWARDER: string = "Exclude rewarder from fee";
const ERR_UNSTAKE: string = "Cannot unstake";
const ERR_UNSTAKE_FIRST: string = "Unstake first";

const ERR_TRANSFER_FROM: string = "SafeERC20: TransferFrom failed";

describe("In staking contract", () => {
  const [deployer, alice, bob, carol, vesting] = provider.getWallets() as Wallet[];

  let staking: SynapseStaking;
  let synapseToken: SynapseNetwork;
  let lpToken: ERC20Mock;

  const tokenRewardPerSec: BigNumber = getBigNumber(1, 16);
  const lpRewardPerSec: BigNumber = getBigNumber(1, 17);

  const seven_days = 7 * 24 * 60 * 60;
  const thirty_days = 30 * 24 * 60 * 60;

  beforeEach(async () => {
    synapseToken = (await deployContract(deployer, SynapseNetworkArtifacts, [deployer.address])) as SynapseNetwork;
    await advanceTimeAndBlock(3 * 24 * 3600 + 30 * 60);
    await synapseToken.setRestrictionActive(false);
    lpToken = (await deployContract(deployer, ERC20MockArtifact, ["SNP-ETH PAIR", "UNI-V2", 18, utils.parseEther("10000")])) as ERC20Mock;
    staking = (await deployContract(deployer, SynapseStakingArtifacts, [thirty_days, seven_days])) as SynapseStaking;

    await synapseToken.changeFeeContract(staking.address);

    // exclude staking from fees
    await synapseToken.setExcludedFromFees(staking.address, true);

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
  });

  describe("Before staking start - when no rewards were added", () => {
    /***************************************
                  ONLY TOKEN
    ****************************************/

    describe("after adding rewards", () => {
      beforeEach(async () => {
        await synapseToken.approve(staking.address, getBigNumber(66528));
        await staking.notifyRewardAmount(getBigNumber(6048), getBigNumber(60480));
      });

      it("claimable should return token reward amount in first second of staking", async () => {
        await staking.connect(carol).addTokenStake(getBigNumber(100));
        await staking.connect(alice).addTokenStake(getBigNumber(100));
        await advanceTimeAndBlock(1);
        const claimableAlice = await staking.claimable(alice.address);
        const claimableCarol = await staking.claimable(carol.address);
        expect(claimableAlice["token"]).to.be.equal(getBigNumber(500, 13));
        expect(claimableCarol["token"]).to.be.equal(getBigNumber(2500, 13));
      });
    });

    describe("after adding only token stake", () => {
      beforeEach(async () => {
        await staking.connect(alice).addTokenStake(getBigNumber(100));
        await staking.connect(bob).addTokenStake(getBigNumber(100));
        await staking.connect(carol).addTokenStake(getBigNumber(200));
      });

      describe("after adding new rewards", () => {
        beforeEach(async () => {
          await synapseToken.approve(staking.address, getBigNumber(66528));
          await staking.notifyRewardAmount(getBigNumber(6048), getBigNumber(60480));
        });

        it("global data should be in initial state", async () => {
          const data = await staking.data();
          expect(data["depositedTokens"]).to.be.equal(getBigNumber(400));
          expect(data["depositedLiquidity"]).to.be.equal(0);
          expect(data["totalRewardsAdded"]).to.be.equal(getBigNumber(66528));
          expect(data["totalRewardsClaimed"]).to.be.equal(0);
          expect(data["totalRewardsFromFees"]).to.be.equal(0);
        });

        it("tokenStaking data should be in initial state", async () => {
          const timestamp = await latest();
          const tokenStaking = await staking.tokenStaking();
          expect(tokenStaking["rewardRate"]).to.be.equal(tokenRewardPerSec);
          expect(tokenStaking["superRewardRate"]).to.be.equal(0);
          expect(tokenStaking["lastUpdateTime"]).to.be.equal(timestamp);
          expect(tokenStaking["lastSuperUpdateTime"]).to.be.equal(0);
          expect(tokenStaking["rewardPerTokenStored"]).to.be.equal(0);
          expect(tokenStaking["superRewardPerTokenStored"]).to.be.equal(0);
          expect(tokenStaking["stakedTokens"]).to.be.equal(getBigNumber(400));
          expect(tokenStaking["stakedSuperTokens"]).to.be.equal(0);
        });

        it("lpStaking data should be in initial state", async () => {
          const timestamp = await latest();
          const lpStaking = await staking.lpStaking();
          expect(lpStaking["rewardRate"]).to.be.equal(lpRewardPerSec);
          expect(lpStaking["superRewardRate"]).to.be.equal(0);
          expect(lpStaking["lastUpdateTime"]).to.be.equal(timestamp);
          expect(lpStaking["lastSuperUpdateTime"]).to.be.equal(0);
          expect(lpStaking["rewardPerTokenStored"]).to.be.equal(0);
          expect(lpStaking["superRewardPerTokenStored"]).to.be.equal(0);
          expect(lpStaking["stakedTokens"]).to.be.equal(0);
          expect(lpStaking["stakedSuperTokens"]).to.be.equal(0);
        });

        it("claimable should return token reward amount in first second of staking", async () => {
          await advanceTimeAndBlock(1);
          const claimableAlice = await staking.claimable(alice.address);
          const claimableCarol = await staking.claimable(carol.address);
          expect(claimableAlice["token"]).to.be.equal(getBigNumber(250, 13));
          expect(claimableCarol["token"]).to.be.equal(getBigNumber(500, 13));
        });

        it("user can add new tokens to token stake and rewards will be updated", async () => {
          await advanceTimeAndBlock(9);
          await expect(staking.connect(alice).addTokenStake(getBigNumber(100)))
            .to.emit(staking, "StakeAdded")
            .withArgs(alice.address, getBigNumber(100))
            .and.to.emit(synapseToken, "Transfer")
            .withArgs(alice.address, staking.address, getBigNumber(100));

          const timestamp = await latest();
          const aliceStake = await staking.tokenStake(alice.address);
          expect(aliceStake["tokens"]).to.be.equal(getBigNumber(200));
          expect(aliceStake["rewards"]).to.be.equal(getBigNumber(250, 14));
          expect(aliceStake["rewardPerTokenPaid"]).to.be.equal(getBigNumber(250, 12));

          const tokenStaking = await staking.tokenStaking();
          expect(tokenStaking["stakedTokens"]).to.be.equal(getBigNumber(500));
          expect(tokenStaking["rewardRate"]).to.be.equal(tokenRewardPerSec);
          expect(tokenStaking["rewardPerTokenStored"]).to.be.equal(getBigNumber(250, 12));
          expect(tokenStaking["lastUpdateTime"]).to.be.equal(timestamp);

          const data = await staking.data();
          expect(data["depositedTokens"]).to.be.equal(getBigNumber(500));
          expect(data["totalRewardsClaimed"]).to.be.equal(0);

          const claimableAlice = await staking.claimable(alice.address);
          const claimableBob = await staking.claimable(bob.address);
          expect(claimableAlice["token"]).to.be.equal(getBigNumber(250, 14));
          expect(claimableBob["token"]).to.be.equal(getBigNumber(250, 14));
        });

        it("user can claim tokens from token stake and rewards will be updated", async () => {
          await advanceTimeAndBlock(9);
          await expect(staking.connect(alice).claim()).to.emit(staking, "Claimed").withArgs(alice.address, getBigNumber(250, 14));

          const timestamp = await latest();
          const aliceStake = await staking.tokenStake(alice.address);
          expect(aliceStake["tokens"]).to.be.equal(getBigNumber(100));
          expect(aliceStake["rewards"]).to.be.equal(0);
          expect(aliceStake["rewardPerTokenPaid"]).to.be.equal(getBigNumber(250, 12));

          const tokenStaking = await staking.tokenStaking();
          expect(tokenStaking["stakedTokens"]).to.be.equal(getBigNumber(400));
          expect(tokenStaking["rewardRate"]).to.be.equal(tokenRewardPerSec);
          expect(tokenStaking["rewardPerTokenStored"]).to.be.equal(getBigNumber(250, 12));
          expect(tokenStaking["lastUpdateTime"]).to.be.equal(timestamp);

          const data = await staking.data();
          expect(data["depositedTokens"]).to.be.equal(getBigNumber(400));
          expect(data["totalRewardsClaimed"]).to.be.equal(getBigNumber(250, 14));

          const claimableAlice = await staking.claimable(alice.address);
          const claimableBob = await staking.claimable(bob.address);
          expect(claimableAlice["token"]).to.be.equal(0);
          expect(claimableBob["token"]).to.be.equal(getBigNumber(250, 14));
        });

        it("user can restake tokens to token stake and rewards will be updated", async () => {
          await advanceTimeAndBlock(9);
          await expect(staking.connect(alice).restake()).to.emit(staking, "StakeAdded").withArgs(alice.address, getBigNumber(250, 14));

          const timestamp = await latest();
          const aliceStake = await staking.tokenStake(alice.address);
          expect(aliceStake["tokens"]).to.be.equal(getBigNumber(100025, 15));
          expect(aliceStake["rewards"]).to.be.equal(0);
          expect(aliceStake["rewardPerTokenPaid"]).to.be.equal(getBigNumber(250, 12));

          const tokenStaking = await staking.tokenStaking();
          expect(tokenStaking["stakedTokens"]).to.be.equal(getBigNumber(400025, 15));
          expect(tokenStaking["rewardRate"]).to.be.equal(tokenRewardPerSec);
          expect(tokenStaking["rewardPerTokenStored"]).to.be.equal(getBigNumber(250, 12));
          expect(tokenStaking["lastUpdateTime"]).to.be.equal(timestamp);

          const data = await staking.data();
          expect(data["depositedTokens"]).to.be.equal(getBigNumber(400025, 15));
          expect(data["totalRewardsClaimed"]).to.be.equal(getBigNumber(250, 14));

          const claimableAlice = await staking.claimable(alice.address);
          const claimableBob = await staking.claimable(bob.address);
          expect(claimableAlice["token"]).to.be.equal(0);
          expect(claimableBob["token"]).to.be.equal(getBigNumber(250, 14));
        });

        describe("while requesting unstake", () => {
          it("should correctly request unstake and rewards will be counted", async () => {
            await advanceTimeAndBlock(99);
            await expect(staking.connect(alice).requestUnstake()).to.emit(staking, "StakeRemoveRequested").withArgs(alice.address);

            const timestamp = await latest();
            const aliceStake = await staking.tokenStake(alice.address);
            expect(aliceStake["tokens"]).to.be.equal(getBigNumber(100));
            expect(aliceStake["rewards"]).to.be.equal(getBigNumber(250, 15));
            expect(aliceStake["isWithdrawing"]).to.be.equal(true);
            expect(aliceStake["withdrawalPossibleAt"]).to.be.equal(timestamp.add(seven_days));
          });

          describe("after request unstake and after 1000 sec", () => {
            beforeEach(async () => {
              await advanceTimeAndBlock(999);
              await staking.connect(alice).requestUnstake();
            });

            it("claimable should return amount of collected rewards", async () => {
              const claimable = await staking.claimable(alice.address);
              expect(claimable["token"]).to.be.equal(getBigNumber(250, 16));
            });

            it("claimable should return 0 when rewards claimed after request unstake", async () => {
              await staking.connect(alice).claim();
              const claimable = await staking.claimable(alice.address);
              expect(claimable["token"]).to.be.equal(0);
            });

            it("should revert on restake as user is withdrawing", async () => {
              await expect(staking.connect(alice).restake()).to.be.revertedWith(ERR_WITHDRAWING);
            });

            it("user can claim collected rewards but new rewards will not be calculated for him", async () => {
              await advanceTimeAndBlock(999);
              await expect(staking.connect(alice).claim()).to.emit(staking, "Claimed").withArgs(alice.address, getBigNumber(250, 16));

              const timestamp = await latest();
              const aliceStake = await staking.tokenStake(alice.address);
              expect(aliceStake["tokens"]).to.be.equal(getBigNumber(100));
              expect(aliceStake["rewards"]).to.be.equal(0);
              expect(aliceStake["rewardPerTokenPaid"]).to.be.equal(getBigNumber(250, 14));

              const tokenStaking = await staking.tokenStaking();
              expect(tokenStaking["stakedTokens"]).to.be.equal(getBigNumber(300));
              expect(tokenStaking["rewardRate"]).to.be.equal(tokenRewardPerSec);
              expect(tokenStaking["rewardPerTokenStored"]).to.be.equal(BigNumber.from("58333333333333333"));
              expect(tokenStaking["lastUpdateTime"]).to.be.equal(timestamp);

              const data = await staking.data();
              expect(data["depositedTokens"]).to.be.equal(getBigNumber(400));
              expect(data["totalRewardsClaimed"]).to.be.equal(getBigNumber(250, 16));

              const claimableAlice = await staking.claimable(alice.address);
              const claimableBob = await staking.claimable(bob.address);
              expect(claimableAlice["token"]).to.be.equal(0);
              expect(claimableBob["token"]).to.be.equal(BigNumber.from("5833333333333333300"));
            });

            describe("before 7 days of unstake period", () => {
              it("should revert when requesting unstake", async () => {
                await expect(staking.connect(alice).unstake()).to.be.revertedWith(ERR_UNSTAKE);
              });

              it("unstakeWithFee should correctly unstake tokens with 10% fee and transfer reward", async () => {
                await expect(staking.connect(alice).unstakeWithFee())
                  .to.emit(staking, "StakeRemoved")
                  .withArgs(alice.address, getBigNumber(100))
                  .and.to.emit(synapseToken, "Transfer")
                  .withArgs(staking.address, alice.address, getBigNumber(925, 17))
                  .and.to.emit(staking, "Claimed")
                  .withArgs(alice.address, getBigNumber(25, 17));

                const aliceStake = await staking.tokenStake(alice.address);
                expect(aliceStake["tokens"]).to.be.equal(0);
                expect(aliceStake["stakeStart"]).to.be.equal(0);

                const tokenStaking = await staking.tokenStaking();
                expect(tokenStaking["stakedTokens"]).to.be.equal(getBigNumber(300));
                expect(tokenStaking["rewardPerTokenStored"]).to.be.equal(getBigNumber(250, 14));

                const data = await staking.data();
                expect(data["depositedTokens"]).to.be.equal(getBigNumber(300));
                expect(data["totalRewardsClaimed"]).to.be.equal(getBigNumber(250, 16));
              });
            });

            describe("after 7 days of unstake period", () => {
              beforeEach(async () => {
                await advanceTimeAndBlock(seven_days);
              });

              it("unstake should correctly withdraw staked tokens and claim rewards", async () => {
                await expect(staking.connect(alice).unstake())
                  .to.emit(staking, "StakeRemoved")
                  .withArgs(alice.address, getBigNumber(100))
                  .and.to.emit(synapseToken, "Transfer")
                  .withArgs(staking.address, alice.address, getBigNumber(1025, 17))
                  .and.to.emit(staking, "Claimed")
                  .withArgs(alice.address, getBigNumber(25, 17));

                const aliceStake = await staking.tokenStake(alice.address);
                expect(aliceStake["tokens"]).to.be.equal(0);
                expect(aliceStake["stakeStart"]).to.be.equal(0);

                const tokenStaking = await staking.tokenStaking();
                expect(tokenStaking["stakedTokens"]).to.be.equal(getBigNumber(300));
                expect(tokenStaking["rewardPerTokenStored"]).to.be.equal(getBigNumber(250, 14));

                const data = await staking.data();
                expect(data["depositedTokens"]).to.be.equal(getBigNumber(300));
                expect(data["totalRewardsClaimed"]).to.be.equal(getBigNumber(250, 16));
              });

              it("unstakeWithFee should revert as there is an option to unstake without fee", async () => {
                await expect(staking.connect(alice).unstakeWithFee()).to.be.revertedWith(ERR_UNSTAKE_FIRST);
              });
            });
          });
        });

        describe("after 30 days of token stake and with fees collected", () => {
          beforeEach(async () => {
            await synapseToken.transfer(staking.address, getBigNumber(259200));
            await advanceTimeAndBlock(thirty_days);
          });

          it("user can claim super staker status for token stake and super rewards will be calculated", async () => {
            const timestamp = await latest();
            await expect(staking.connect(alice).setSuperToken())
              .to.emit(staking, "SuperRecalculation")
              .withArgs(getBigNumber(129600), getBigNumber(129600));

            const aliceStake = await staking.tokenStake(alice.address);
            expect(aliceStake["isSuperStaker"]).to.be.equal(true);
            expect(aliceStake["superRewardPerTokenPaid"]).to.be.equal(0);

            const tokenStaking = await staking.tokenStaking();
            expect(tokenStaking["stakedTokens"]).to.be.equal(getBigNumber(400));
            expect(tokenStaking["stakedSuperTokens"]).to.be.equal(getBigNumber(100));
            expect(tokenStaking["superRewardRate"]).to.be.equal(getBigNumber(5, 16));
            expect(tokenStaking["superRewardPerTokenStored"]).to.be.equal(0);
            expect(tokenStaking["lastSuperUpdateTime"]).to.be.equal(timestamp.add(1));

            const lpStaking = await staking.lpStaking();
            expect(lpStaking["superRewardRate"]).to.be.equal(getBigNumber(5, 16));

            const data = await staking.data();
            expect(data["depositedTokens"]).to.be.equal(getBigNumber(400));
            expect(data["totalRewardsAdded"]).to.be.equal(getBigNumber(66528));
            expect(data["totalRewardsFromFees"]).to.be.equal(getBigNumber(259200));
          });

          describe("after claiming super staker for token stake", () => {
            beforeEach(async () => {
              await staking.connect(bob).setSuperToken();
              await staking.connect(alice).setSuperToken();
              await advanceTimeAndBlock(119);
            });

            it("claimable should return sum of rewards from token stake and super token stake", async () => {
              await advanceTimeAndBlock(1);
              const claimable = await staking.claimable(alice.address);
              // 6048/4 + 3
              expect(claimable["token"]).to.be.equal(getBigNumber(1515));
            });

            it("user can claim rewards from token and super token stake and super rewards will be updated", async () => {
              await expect(staking.connect(alice).claim())
                .to.emit(staking, "Claimed")
                .withArgs(alice.address, getBigNumber(1515))
                .and.to.emit(synapseToken, "Transfer")
                .withArgs(staking.address, alice.address, getBigNumber(1515));

              const timestamp = await latest();
              const aliceStake = await staking.tokenStake(alice.address);
              expect(aliceStake["tokens"]).to.be.equal(getBigNumber(100));
              expect(aliceStake["rewards"]).to.be.equal(0);
              expect(aliceStake["rewardPerTokenPaid"]).to.be.equal(getBigNumber(1512, 16));
              expect(aliceStake["superRewardPerTokenPaid"]).to.be.equal(getBigNumber(305, 14));

              const tokenStaking = await staking.tokenStaking();
              expect(tokenStaking["stakedSuperTokens"]).to.be.equal(getBigNumber(200));
              expect(tokenStaking["superRewardRate"]).to.be.equal(getBigNumber(5, 16));
              expect(tokenStaking["superRewardPerTokenStored"]).to.be.equal(getBigNumber(305, 14));
              expect(tokenStaking["lastSuperUpdateTime"]).to.be.equal(timestamp);

              const data = await staking.data();
              expect(data["depositedTokens"]).to.be.equal(getBigNumber(400));
              expect(data["totalRewardsClaimed"]).to.be.equal(getBigNumber(1515));

              const claimableAlice = await staking.claimable(alice.address);
              const claimableBob = await staking.claimable(bob.address);
              expect(claimableAlice["token"]).to.be.equal(0);
              expect(claimableBob["token"]).to.be.equal(getBigNumber(151505, 16));
            });

            it("user can restake all rewards to token stake and super rewards will be updated", async () => {
              await expect(staking.connect(alice).restake())
                .to.emit(staking, "StakeAdded")
                .withArgs(alice.address, getBigNumber(1515))
                .and.to.emit(staking, "Claimed")
                .withArgs(alice.address, getBigNumber(1515));

              const timestamp = await latest();
              const aliceStake = await staking.tokenStake(alice.address);
              expect(aliceStake["tokens"]).to.be.equal(getBigNumber(1615));
              expect(aliceStake["rewards"]).to.be.equal(0);
              expect(aliceStake["rewardPerTokenPaid"]).to.be.equal(getBigNumber(1512, 16));
              expect(aliceStake["superRewardPerTokenPaid"]).to.be.equal(getBigNumber(305, 14));

              const tokenStaking = await staking.tokenStaking();
              expect(tokenStaking["stakedSuperTokens"]).to.be.equal(getBigNumber(1715));
              expect(tokenStaking["superRewardRate"]).to.be.equal(getBigNumber(5, 16));
              expect(tokenStaking["superRewardPerTokenStored"]).to.be.equal(getBigNumber(305, 14));
              expect(tokenStaking["lastSuperUpdateTime"]).to.be.equal(timestamp);

              const data = await staking.data();
              expect(data["depositedTokens"]).to.be.equal(getBigNumber(1915));
              expect(data["totalRewardsClaimed"]).to.be.equal(getBigNumber(1515));

              const claimableAlice = await staking.claimable(alice.address);
              const claimableBob = await staking.claimable(bob.address);
              expect(claimableAlice["token"]).to.be.equal(0);
              expect(claimableBob["token"]).to.be.equal(getBigNumber(151505, 16));
            });

            it("requestUnstake should remove user from super token and token stake and remove his super staker status and count his rewards correctly", async () => {
              await expect(staking.connect(alice).requestUnstake()).to.emit(staking, "StakeRemoveRequested").withArgs(alice.address);

              const timestamp = await latest();
              const aliceStake = await staking.tokenStake(alice.address);
              expect(aliceStake["tokens"]).to.be.equal(getBigNumber(100));
              expect(aliceStake["rewards"]).to.be.equal(getBigNumber(1515));
              expect(aliceStake["isSuperStaker"]).to.be.equal(false);
              expect(aliceStake["isWithdrawing"]).to.be.equal(true);
              expect(aliceStake["withdrawalPossibleAt"]).to.be.equal(timestamp.add(seven_days));

              const tokenStaking = await staking.tokenStaking();
              expect(tokenStaking["stakedTokens"]).to.be.equal(getBigNumber(300));
              expect(tokenStaking["stakedSuperTokens"]).to.be.equal(getBigNumber(100));

              const data = await staking.data();
              expect(data["depositedTokens"]).to.be.equal(getBigNumber(400));
            });
          });
        });
      });
    });

    /***************************************
                  ONLY LIQUIDITY
    ****************************************/

    describe("after adding only liquidity stake", () => {
      beforeEach(async () => {
        await staking.connect(alice).addLiquidityStake(getBigNumber(10));
        await staking.connect(bob).addLiquidityStake(getBigNumber(10));
        await staking.connect(carol).addLiquidityStake(getBigNumber(20));
      });

      describe("after adding new rewards", () => {
        beforeEach(async () => {
          await synapseToken.approve(staking.address, getBigNumber(66528));
          await staking.notifyRewardAmount(getBigNumber(6048), getBigNumber(60480));
        });

        it("global data should be in initial state", async () => {
          const data = await staking.data();
          expect(data["depositedTokens"]).to.be.equal(0);
          expect(data["depositedLiquidity"]).to.be.equal(getBigNumber(40));
          expect(data["totalRewardsAdded"]).to.be.equal(getBigNumber(66528));
          expect(data["totalRewardsClaimed"]).to.be.equal(0);
          expect(data["totalRewardsFromFees"]).to.be.equal(0);
        });

        it("tokenStaking data should be in initial state", async () => {
          const timestamp = await latest();
          const tokenStaking = await staking.tokenStaking();
          expect(tokenStaking["rewardRate"]).to.be.equal(tokenRewardPerSec);
          expect(tokenStaking["superRewardRate"]).to.be.equal(0);
          expect(tokenStaking["lastUpdateTime"]).to.be.equal(timestamp);
          expect(tokenStaking["lastSuperUpdateTime"]).to.be.equal(0);
          expect(tokenStaking["rewardPerTokenStored"]).to.be.equal(0);
          expect(tokenStaking["superRewardPerTokenStored"]).to.be.equal(0);
          expect(tokenStaking["stakedTokens"]).to.be.equal(0);
          expect(tokenStaking["stakedSuperTokens"]).to.be.equal(0);
        });

        it("lpStaking data should be in initial state", async () => {
          const timestamp = await latest();
          const lpStaking = await staking.lpStaking();
          expect(lpStaking["rewardRate"]).to.be.equal(lpRewardPerSec);
          expect(lpStaking["superRewardRate"]).to.be.equal(0);
          expect(lpStaking["lastUpdateTime"]).to.be.equal(timestamp);
          expect(lpStaking["lastSuperUpdateTime"]).to.be.equal(0);
          expect(lpStaking["rewardPerTokenStored"]).to.be.equal(0);
          expect(lpStaking["superRewardPerTokenStored"]).to.be.equal(0);
          expect(lpStaking["stakedTokens"]).to.be.equal(getBigNumber(40));
          expect(lpStaking["stakedSuperTokens"]).to.be.equal(0);
        });

        it("claimable should return reward amount in first second of staking", async () => {
          await advanceTimeAndBlock(1);
          const claimableAlice = await staking.claimable(alice.address);
          const claimableCarol = await staking.claimable(carol.address);
          expect(claimableAlice["lp"]).to.be.equal(getBigNumber(25, 15));
          expect(claimableCarol["lp"]).to.be.equal(getBigNumber(50, 15));
        });

        it("user can add new liquidity to liquidity stake and rewards will be updated", async () => {
          await advanceTimeAndBlock(9);
          await expect(staking.connect(alice).addLiquidityStake(getBigNumber(10)))
            .to.emit(staking, "StakeLiquidityAdded")
            .withArgs(alice.address, getBigNumber(10))
            .and.to.emit(lpToken, "Transfer")
            .withArgs(alice.address, staking.address, getBigNumber(10));

          const aliceLpStake = await staking.liquidityStake(alice.address);
          expect(aliceLpStake["tokens"]).to.be.equal(getBigNumber(20));
          expect(aliceLpStake["rewards"]).to.be.equal(getBigNumber(25, 16));
          expect(aliceLpStake["rewardPerTokenPaid"]).to.be.equal(getBigNumber(25, 15));

          const lpStaking = await staking.lpStaking();
          expect(lpStaking["stakedTokens"]).to.be.equal(getBigNumber(50));
          expect(lpStaking["rewardRate"]).to.be.equal(getBigNumber(1, 17));
          expect(lpStaking["rewardPerTokenStored"]).to.be.equal(getBigNumber(25, 15));

          const data = await staking.data();
          expect(data["depositedLiquidity"]).to.be.equal(getBigNumber(50));
          expect(data["totalRewardsClaimed"]).to.be.equal(0);

          const claimableAlice = await staking.claimable(alice.address);
          const claimableBob = await staking.claimable(bob.address);
          expect(claimableAlice["lp"]).to.be.equal(getBigNumber(25, 16));
          expect(claimableBob["lp"]).to.be.equal(getBigNumber(25, 16));
        });

        it("user can claim tokens from lp stake and rewards will be updated", async () => {
          await advanceTimeAndBlock(9);
          await expect(staking.connect(carol).claim())
            .to.emit(staking, "Claimed")
            .withArgs(carol.address, getBigNumber(50, 16))
            .and.to.emit(synapseToken, "Transfer")
            .withArgs(staking.address, carol.address, getBigNumber(50, 16));

          const timestamp = await latest();
          const carolLpStake = await staking.liquidityStake(carol.address);
          expect(carolLpStake["tokens"]).to.be.equal(getBigNumber(20));
          expect(carolLpStake["rewards"]).to.be.equal(0);
          expect(carolLpStake["rewardPerTokenPaid"]).to.be.equal(getBigNumber(25, 15));

          const lpStaking = await staking.lpStaking();
          expect(lpStaking["stakedTokens"]).to.be.equal(getBigNumber(40));
          expect(lpStaking["rewardRate"]).to.be.equal(lpRewardPerSec);
          expect(lpStaking["rewardPerTokenStored"]).to.be.equal(getBigNumber(25, 15));
          expect(lpStaking["lastUpdateTime"]).to.be.equal(timestamp);

          const data = await staking.data();
          expect(data["depositedLiquidity"]).to.be.equal(getBigNumber(40));
          expect(data["totalRewardsClaimed"]).to.be.equal(getBigNumber(50, 16));

          const claimableCarol = await staking.claimable(carol.address);
          const claimableBob = await staking.claimable(bob.address);
          expect(claimableCarol["lp"]).to.be.equal(0);
          expect(claimableBob["lp"]).to.be.equal(getBigNumber(25, 16));
        });

        it("user can restake rewards from lp stake into token stake", async () => {
          await advanceTimeAndBlock(9);
          await expect(staking.connect(carol).restake())
            .to.emit(staking, "StakeAdded")
            .withArgs(carol.address, getBigNumber(50, 16))
            .and.to.emit(staking, "Claimed")
            .withArgs(carol.address, getBigNumber(50, 16));

          const timestamp = await latest();

          const carolStake = await staking.tokenStake(carol.address);
          expect(carolStake["tokens"]).to.be.equal(getBigNumber(50, 16));
          expect(carolStake["rewards"]).to.be.equal(0);
          expect(carolStake["rewardPerTokenPaid"]).to.be.equal(0);

          const carolLpStake = await staking.liquidityStake(carol.address);
          expect(carolLpStake["tokens"]).to.be.equal(getBigNumber(20));
          expect(carolLpStake["rewards"]).to.be.equal(0);
          expect(carolLpStake["rewardPerTokenPaid"]).to.be.equal(getBigNumber(25, 15));

          const tokenStaking = await staking.tokenStaking();
          expect(tokenStaking["stakedTokens"]).to.be.equal(getBigNumber(50, 16));
          expect(tokenStaking["rewardPerTokenStored"]).to.be.equal(0);

          const lpStaking = await staking.lpStaking();
          expect(lpStaking["stakedTokens"]).to.be.equal(getBigNumber(40));
          expect(lpStaking["rewardPerTokenStored"]).to.be.equal(getBigNumber(25, 15));
          expect(lpStaking["lastUpdateTime"]).to.be.equal(timestamp);

          const data = await staking.data();
          expect(data["depositedTokens"]).to.be.equal(getBigNumber(50, 16));
          expect(data["depositedLiquidity"]).to.be.equal(getBigNumber(40));
          expect(data["totalRewardsClaimed"]).to.be.equal(getBigNumber(50, 16));
        });

        describe("while requesting unstakeLp", () => {
          it("should correctly requestUnstakeLp and rewards will be counted", async () => {
            await advanceTimeAndBlock(99);
            await expect(staking.connect(carol).requestUnstakeLp()).to.emit(staking, "StakeLiquidityRemoveRequested").withArgs(carol.address);

            const timestamp = await latest();
            const carolLpStake = await staking.liquidityStake(carol.address);
            expect(carolLpStake["tokens"]).to.be.equal(getBigNumber(20));
            expect(carolLpStake["rewards"]).to.be.equal(getBigNumber(50, 17));
            expect(carolLpStake["isWithdrawing"]).to.be.equal(true);
            expect(carolLpStake["withdrawalPossibleAt"]).to.be.equal(timestamp.add(seven_days));
          });

          describe("after requestUnstakeLp and after 1000 sec", () => {
            beforeEach(async () => {
              await advanceTimeAndBlock(999);
              await staking.connect(carol).requestUnstakeLp();
            });

            it("claimable should return amount of collected rewards", async () => {
              const claimable = await staking.claimable(carol.address);
              expect(claimable["lp"]).to.be.equal(getBigNumber(50));
            });

            it("claimable should return 0 when rewards claimed after request unstake", async () => {
              await staking.connect(carol).claim();
              const claimable = await staking.claimable(carol.address);
              expect(claimable["lp"]).to.be.equal(0);
            });

            it("user can claim collected rewards but new rewards will not be calculated for him", async () => {
              await advanceTimeAndBlock(999);
              await expect(staking.connect(carol).claim()).to.emit(staking, "Claimed").withArgs(carol.address, getBigNumber(50));

              const timestamp = await latest();
              const carolLpStake = await staking.liquidityStake(carol.address);
              expect(carolLpStake["tokens"]).to.be.equal(getBigNumber(20));
              expect(carolLpStake["rewards"]).to.be.equal(0);
              expect(carolLpStake["rewardPerTokenPaid"]).to.be.equal(getBigNumber(25, 17));

              const lpStaking = await staking.lpStaking();
              expect(lpStaking["stakedTokens"]).to.be.equal(getBigNumber(20));
              expect(lpStaking["rewardPerTokenStored"]).to.be.equal(getBigNumber(75, 17));
              expect(lpStaking["lastUpdateTime"]).to.be.equal(timestamp);

              const data = await staking.data();
              expect(data["depositedLiquidity"]).to.be.equal(getBigNumber(40));
              expect(data["totalRewardsClaimed"]).to.be.equal(getBigNumber(50));

              const claimableCarol = await staking.claimable(carol.address);
              const claimableBob = await staking.claimable(bob.address);
              expect(claimableCarol["lp"]).to.be.equal(0);
              expect(claimableBob["lp"]).to.be.equal(getBigNumber(75));
            });

            it("user can restake collected rewards in LP unstake period", async () => {
              await advanceTimeAndBlock(999);
              await expect(staking.connect(carol).restake())
                .to.emit(staking, "StakeAdded")
                .withArgs(carol.address, getBigNumber(50))
                .and.to.emit(staking, "Claimed")
                .withArgs(carol.address, getBigNumber(50));

              const timestamp = await latest();
              const carolLpStake = await staking.liquidityStake(carol.address);
              expect(carolLpStake["tokens"]).to.be.equal(getBigNumber(20));
              expect(carolLpStake["rewards"]).to.be.equal(0);
              expect(carolLpStake["rewardPerTokenPaid"]).to.be.equal(getBigNumber(25, 17));

              const carolStake = await staking.tokenStake(carol.address);
              expect(carolStake["tokens"]).to.be.equal(getBigNumber(50));
              expect(carolStake["rewards"]).to.be.equal(0);
              expect(carolStake["rewardPerTokenPaid"]).to.be.equal(0);

              const lpStaking = await staking.lpStaking();
              expect(lpStaking["stakedTokens"]).to.be.equal(getBigNumber(20));
              expect(lpStaking["rewardPerTokenStored"]).to.be.equal(getBigNumber(75, 17));
              expect(lpStaking["lastUpdateTime"]).to.be.equal(timestamp);

              const data = await staking.data();
              expect(data["depositedTokens"]).to.be.equal(getBigNumber(50));
              expect(data["depositedLiquidity"]).to.be.equal(getBigNumber(40));
              expect(data["totalRewardsClaimed"]).to.be.equal(getBigNumber(50));

              const claimableCarol = await staking.claimable(carol.address);
              const claimableBob = await staking.claimable(bob.address);
              expect(claimableCarol["lp"]).to.be.equal(0);
              expect(claimableBob["lp"]).to.be.equal(getBigNumber(75));
            });

            describe("before 7 days of unstake period", () => {
              it("should revert when requesting unstake", async () => {
                await expect(staking.connect(carol).unstake()).to.be.revertedWith(ERR_UNSTAKE);
              });

              it("unstakeWithFee should correctly unstake LP with 10% fee", async () => {
                await expect(staking.connect(carol).unstakeWithFee())
                  .to.emit(staking, "StakeLiquidityRemoved")
                  .withArgs(carol.address, getBigNumber(20))
                  .and.to.emit(lpToken, "Transfer")
                  .withArgs(staking.address, carol.address, getBigNumber(18))
                  .and.to.emit(synapseToken, "Transfer")
                  .withArgs(staking.address, carol.address, getBigNumber(50))
                  .and.to.emit(staking, "Claimed")
                  .withArgs(carol.address, getBigNumber(50));

                const carolLpStake = await staking.liquidityStake(carol.address);
                expect(carolLpStake["tokens"]).to.be.equal(0);
                expect(carolLpStake["stakeStart"]).to.be.equal(0);

                const lpStaking = await staking.lpStaking();
                expect(lpStaking["stakedTokens"]).to.be.equal(getBigNumber(20));
                expect(lpStaking["rewardPerTokenStored"]).to.be.equal(getBigNumber(25, 17));

                const data = await staking.data();
                expect(data["depositedLiquidity"]).to.be.equal(getBigNumber(20));
                expect(data["totalRewardsClaimed"]).to.be.equal(getBigNumber(50));

                expect(await lpToken.balanceOf(staking.address)).to.be.equal(getBigNumber(22));
              });
            });

            describe("after 7 days of unstake period", () => {
              beforeEach(async () => {
                await advanceTimeAndBlock(seven_days);
              });

              it("unstake should correctly withdraw staked LP and claim rewards", async () => {
                await expect(staking.connect(carol).unstake())
                  .to.emit(staking, "StakeLiquidityRemoved")
                  .withArgs(carol.address, getBigNumber(20))
                  .and.to.emit(lpToken, "Transfer")
                  .withArgs(staking.address, carol.address, getBigNumber(20))
                  .and.to.emit(synapseToken, "Transfer")
                  .withArgs(staking.address, carol.address, getBigNumber(50))
                  .and.to.emit(staking, "Claimed")
                  .withArgs(carol.address, getBigNumber(50));

                const carolLpStake = await staking.liquidityStake(carol.address);
                expect(carolLpStake["tokens"]).to.be.equal(0);
                expect(carolLpStake["stakeStart"]).to.be.equal(0);

                const lpStaking = await staking.lpStaking();
                expect(lpStaking["stakedTokens"]).to.be.equal(getBigNumber(20));
                expect(lpStaking["rewardPerTokenStored"]).to.be.equal(getBigNumber(25, 17));

                const data = await staking.data();
                expect(data["depositedLiquidity"]).to.be.equal(getBigNumber(20));
                expect(data["totalRewardsClaimed"]).to.be.equal(getBigNumber(50));

                expect(await lpToken.balanceOf(staking.address)).to.be.equal(getBigNumber(20));
              });

              it("unstakeWithFee should revert as there is an option to unstake without fee", async () => {
                await expect(staking.connect(carol).unstakeWithFee()).to.be.revertedWith(ERR_UNSTAKE_FIRST);
              });
            });
          });
        });

        describe("after 30 days of token stake and with fees collected", () => {
          beforeEach(async () => {
            await synapseToken.transfer(staking.address, getBigNumber(259200));
            await advanceTimeAndBlock(thirty_days);
          });

          it("user can claim super staker status for lp stake and super rewards will be 0 without fee deposited", async () => {
            const timestamp = await latest();
            await expect(staking.connect(carol).setSuperLp())
              .to.emit(staking, "SuperRecalculation")
              .withArgs(getBigNumber(129600), getBigNumber(129600));

            const carolLpStake = await staking.liquidityStake(carol.address);
            expect(carolLpStake["isSuperStaker"]).to.be.equal(true);
            expect(carolLpStake["superRewardPerTokenPaid"]).to.be.equal(0);

            const lpStaking = await staking.lpStaking();
            expect(lpStaking["stakedTokens"]).to.be.equal(getBigNumber(40));
            expect(lpStaking["stakedSuperTokens"]).to.be.equal(getBigNumber(20));
            expect(lpStaking["superRewardRate"]).to.be.equal(getBigNumber(5, 16));
            expect(lpStaking["superRewardPerTokenStored"]).to.be.equal(0);
            expect(lpStaking["lastSuperUpdateTime"]).to.be.equal(timestamp.add(1));

            const data = await staking.data();
            expect(data["depositedLiquidity"]).to.be.equal(getBigNumber(40));
            expect(data["totalRewardsAdded"]).to.be.equal(getBigNumber(66528));
            expect(data["totalRewardsFromFees"]).to.be.equal(getBigNumber(259200));
          });

          describe("after claiming super staker for LP stake", () => {
            beforeEach(async () => {
              await staking.connect(bob).setSuperLp();
              await staking.connect(alice).setSuperLp();
              await advanceTimeAndBlock(1199);
            });

            it("claimable should return sum of rewards from token stake and super token stake", async () => {
              await advanceTimeAndBlock(1);
              const claimable = await staking.claimable(alice.address);
              // 60480/4 + 30
              expect(claimable["lp"]).to.be.equal(getBigNumber(15150));
            });

            it("user can claim rewards from lp and super lp stake and super rewards will be updated", async () => {
              await expect(staking.connect(alice).claim())
                .to.emit(staking, "Claimed")
                .withArgs(alice.address, getBigNumber(15150))
                .and.to.emit(synapseToken, "Transfer")
                .withArgs(staking.address, alice.address, getBigNumber(15150));

              const timestamp = await latest();
              const aliceLpStake = await staking.liquidityStake(alice.address);
              expect(aliceLpStake["tokens"]).to.be.equal(getBigNumber(10));
              expect(aliceLpStake["rewards"]).to.be.equal(0);
              expect(aliceLpStake["rewardPerTokenPaid"]).to.be.equal(getBigNumber(1512));
              expect(aliceLpStake["superRewardPerTokenPaid"]).to.be.equal(getBigNumber(3005, 15));

              const lpStaking = await staking.lpStaking();
              expect(lpStaking["stakedSuperTokens"]).to.be.equal(getBigNumber(20));
              expect(lpStaking["superRewardRate"]).to.be.equal(getBigNumber(5, 16));
              expect(lpStaking["superRewardPerTokenStored"]).to.be.equal(getBigNumber(3005, 15));
              expect(lpStaking["lastSuperUpdateTime"]).to.be.equal(timestamp);

              const data = await staking.data();
              expect(data["depositedLiquidity"]).to.be.equal(getBigNumber(40));
              expect(data["totalRewardsClaimed"]).to.be.equal(getBigNumber(15150));

              const claimableAlice = await staking.claimable(alice.address);
              const claimableBob = await staking.claimable(bob.address);
              expect(claimableAlice["lp"]).to.be.equal(0);
              expect(claimableBob["lp"]).to.be.equal(getBigNumber(1515005, 16));
            });

            it("user can restake all rewards from lp stakes to token stake and super rewards will be updated", async () => {
              await expect(staking.connect(alice).restake())
                .to.emit(staking, "StakeAdded")
                .withArgs(alice.address, getBigNumber(15150))
                .and.to.emit(staking, "Claimed")
                .withArgs(alice.address, getBigNumber(15150));

              const aliceStake = await staking.tokenStake(alice.address);
              expect(aliceStake["tokens"]).to.be.equal(getBigNumber(15150));
              expect(aliceStake["rewards"]).to.be.equal(0);
              expect(aliceStake["rewardPerTokenPaid"]).to.be.equal(0);
              expect(aliceStake["superRewardPerTokenPaid"]).to.be.equal(0);

              const tokenStaking = await staking.tokenStaking();
              expect(tokenStaking["stakedTokens"]).to.be.equal(getBigNumber(15150));

              const data = await staking.data();
              expect(data["depositedTokens"]).to.be.equal(getBigNumber(15150));
              expect(data["depositedLiquidity"]).to.be.equal(getBigNumber(40));
              expect(data["totalRewardsClaimed"]).to.be.equal(getBigNumber(15150));

              const claimableAlice = await staking.claimable(alice.address);
              const claimableBob = await staking.claimable(bob.address);
              expect(claimableAlice["lp"]).to.be.equal(0);
              expect(claimableBob["lp"]).to.be.equal(getBigNumber(1515005, 16));
            });

            it("requestUnstakeLp should remove user from super lp and lp stake and remove his super staker status and count his rewards correctly", async () => {
              await expect(staking.connect(alice).requestUnstakeLp()).to.emit(staking, "StakeLiquidityRemoveRequested").withArgs(alice.address);

              const timestamp = await latest();
              const aliceLpStake = await staking.liquidityStake(alice.address);
              expect(aliceLpStake["tokens"]).to.be.equal(getBigNumber(10));
              expect(aliceLpStake["rewards"]).to.be.equal(getBigNumber(15150));
              expect(aliceLpStake["isSuperStaker"]).to.be.equal(false);
              expect(aliceLpStake["isWithdrawing"]).to.be.equal(true);
              expect(aliceLpStake["withdrawalPossibleAt"]).to.be.equal(timestamp.add(seven_days));

              const lpStaking = await staking.lpStaking();
              expect(lpStaking["stakedTokens"]).to.be.equal(getBigNumber(30));
              expect(lpStaking["stakedSuperTokens"]).to.be.equal(getBigNumber(10));

              const data = await staking.data();
              expect(data["depositedLiquidity"]).to.be.equal(getBigNumber(40));
            });
          });
        });
      });
    });

    /***************************************
                  TOKEN + LP
    ****************************************/

    describe("after adding to token and liquidity stakes", () => {
      beforeEach(async () => {
        await staking.connect(alice).addTokenStake(getBigNumber(100));
        await staking.connect(alice).addLiquidityStake(getBigNumber(10));
        await staking.connect(bob).addTokenStake(getBigNumber(100));
        await staking.connect(bob).addLiquidityStake(getBigNumber(10));
        await staking.connect(carol).addTokenStake(getBigNumber(200));
        await staking.connect(carol).addLiquidityStake(getBigNumber(20));
      });

      describe("after adding new rewards", () => {
        beforeEach(async () => {
          await synapseToken.approve(staking.address, getBigNumber(66528));
          await staking.notifyRewardAmount(getBigNumber(6048), getBigNumber(60480));
        });

        it("global data should be in initial state", async () => {
          const data = await staking.data();
          expect(data["depositedTokens"]).to.be.equal(getBigNumber(400));
          expect(data["depositedLiquidity"]).to.be.equal(getBigNumber(40));
          expect(data["totalRewardsAdded"]).to.be.equal(getBigNumber(66528));
          expect(data["totalRewardsClaimed"]).to.be.equal(0);
          expect(data["totalRewardsFromFees"]).to.be.equal(0);
        });

        it("tokenStaking and lpStaking data should be in initial state", async () => {
          const timestamp = await latest();
          const tokenStaking = await staking.tokenStaking();
          const lpStaking = await staking.lpStaking();

          expect(tokenStaking["rewardRate"]).to.be.equal(tokenRewardPerSec);
          expect(tokenStaking["lastUpdateTime"]).to.be.equal(timestamp);

          expect(lpStaking["rewardRate"]).to.be.equal(lpRewardPerSec);
          expect(lpStaking["lastUpdateTime"]).to.be.equal(timestamp);
        });

        it("claimable should return reward amount in first second of staking", async () => {
          await advanceTimeAndBlock(1);
          const claimableAlice = await staking.claimable(alice.address);
          const claimableCarol = await staking.claimable(carol.address);
          expect(claimableAlice["token"]).to.be.equal(getBigNumber(25, 14));
          expect(claimableAlice["lp"]).to.be.equal(getBigNumber(25, 15));
          expect(claimableCarol["token"]).to.be.equal(getBigNumber(50, 14));
          expect(claimableCarol["lp"]).to.be.equal(getBigNumber(50, 15));
        });

        it("user can claim and rewards will be updated", async () => {
          await advanceTimeAndBlock(9);
          await expect(staking.connect(carol).claim())
            .to.emit(staking, "Claimed")
            .withArgs(carol.address, getBigNumber(55, 16))
            .and.to.emit(synapseToken, "Transfer")
            .withArgs(staking.address, carol.address, getBigNumber(55, 16));

          const carolStake = await staking.tokenStake(carol.address);
          expect(carolStake["tokens"]).to.be.equal(getBigNumber(200));
          expect(carolStake["rewards"]).to.be.equal(0);
          expect(carolStake["rewardPerTokenPaid"]).to.be.equal(getBigNumber(25, 13));

          const carolLpStake = await staking.liquidityStake(carol.address);
          expect(carolLpStake["tokens"]).to.be.equal(getBigNumber(20));
          expect(carolLpStake["rewards"]).to.be.equal(0);
          expect(carolLpStake["rewardPerTokenPaid"]).to.be.equal(getBigNumber(25, 15));

          const data = await staking.data();
          expect(data["totalRewardsClaimed"]).to.be.equal(getBigNumber(55, 16));

          const claimableCarol = await staking.claimable(carol.address);
          expect(claimableCarol["token"]).to.be.equal(0);
          expect(claimableCarol["lp"]).to.be.equal(0);
        });

        it("user can restake rewards from lp stake into token stake", async () => {
          await advanceTimeAndBlock(9);
          await expect(staking.connect(carol).restake())
            .to.emit(staking, "StakeAdded")
            .withArgs(carol.address, getBigNumber(55, 16))
            .and.to.emit(staking, "Claimed")
            .withArgs(carol.address, getBigNumber(55, 16));

          const carolStake = await staking.tokenStake(carol.address);
          expect(carolStake["tokens"]).to.be.equal(getBigNumber(20055, 16));

          const carolLpStake = await staking.liquidityStake(carol.address);
          expect(carolLpStake["tokens"]).to.be.equal(getBigNumber(20));

          const tokenStaking = await staking.tokenStaking();
          expect(tokenStaking["stakedTokens"]).to.be.equal(getBigNumber(40055, 16));

          const lpStaking = await staking.lpStaking();
          expect(lpStaking["stakedTokens"]).to.be.equal(getBigNumber(40));

          const data = await staking.data();
          expect(data["depositedTokens"]).to.be.equal(getBigNumber(40055, 16));
          expect(data["depositedLiquidity"]).to.be.equal(getBigNumber(40));
          expect(data["totalRewardsClaimed"]).to.be.equal(getBigNumber(55, 16));
        });

        describe("while requesting unstake", () => {
          it("should correctly request unstake but not affect LP stake", async () => {
            await expect(staking.connect(alice).requestUnstake()).to.emit(staking, "StakeRemoveRequested").withArgs(alice.address);

            const timestamp = await latest();

            const aliceLpStake = await staking.liquidityStake(alice.address);
            expect(aliceLpStake["tokens"]).to.be.equal(getBigNumber(10));
            expect(aliceLpStake["rewards"]).to.be.equal(0);
            expect(aliceLpStake["isWithdrawing"]).to.be.equal(false);

            const aliceStake = await staking.tokenStake(alice.address);
            expect(aliceStake["tokens"]).to.be.equal(getBigNumber(100));
            expect(aliceStake["rewards"]).to.be.equal(getBigNumber(25, 14));
            expect(aliceStake["isWithdrawing"]).to.be.equal(true);
            expect(aliceStake["withdrawalPossibleAt"]).to.be.equal(timestamp.add(seven_days));
          });

          describe("after request unstake and after 1000 sec", () => {
            beforeEach(async () => {
              await advanceTimeAndBlock(999);
              await staking.connect(alice).requestUnstake();
            });

            it("claimable should return amount of collected rewards", async () => {
              const claimable = await staking.claimable(alice.address);
              expect(claimable["token"]).to.be.equal(getBigNumber(25, 17));
              expect(claimable["lp"]).to.be.equal(getBigNumber(25));
            });

            it("claimable should return 0 when rewards claimed after request unstake", async () => {
              await staking.connect(alice).claim();
              const claimable = await staking.claimable(alice.address);
              expect(claimable["token"]).to.be.equal(0);
              expect(claimable["lp"]).to.be.equal(0);
            });

            it("user can claim collected rewards but new rewards will not be calculated for token stake", async () => {
              await expect(staking.connect(alice).claim()).to.emit(staking, "Claimed").withArgs(alice.address, getBigNumber(27525, 15));

              const data = await staking.data();
              expect(data["totalRewardsClaimed"]).to.be.equal(getBigNumber(27525, 15));

              await advanceTimeAndBlock(1000);

              const claimableAlice = await staking.claimable(alice.address);
              expect(claimableAlice["token"]).to.be.equal(0);
              expect(claimableAlice["lp"]).to.be.equal(getBigNumber(250, 17));
            });

            it("it should revert on restake", async () => {
              await expect(staking.connect(alice).restake()).to.be.revertedWith(ERR_WITHDRAWING);
            });

            it("user can request unstake LP correctly", async () => {
              await expect(staking.connect(alice).requestUnstakeLp()).to.emit(staking, "StakeLiquidityRemoveRequested").withArgs(alice.address);

              const timestamp = await latest();
              const aliceLpStake = await staking.liquidityStake(alice.address);

              expect(aliceLpStake["tokens"]).to.be.equal(getBigNumber(10));
              expect(aliceLpStake["rewards"]).to.be.equal(getBigNumber(25025, 15));
              expect(aliceLpStake["isWithdrawing"]).to.be.equal(true);
              expect(aliceLpStake["withdrawalPossibleAt"]).to.be.equal(timestamp.add(seven_days));
            });

            describe("after request unstake LP - both request unstake", () => {
              beforeEach(async () => {
                await staking.connect(alice).requestUnstakeLp();
              });

              describe("before 7 days of unstake period", () => {
                it("should revert when requesting unstake", async () => {
                  await expect(staking.connect(alice).unstake()).to.be.revertedWith(ERR_UNSTAKE);
                });

                it("unstakeWithFee should correctly unstake tokens and LPs with 10% fee and transfer reward", async () => {
                  await expect(staking.connect(alice).unstakeWithFee())
                    .to.emit(staking, "StakeRemoved")
                    .withArgs(alice.address, getBigNumber(100))
                    .and.to.emit(staking, "StakeLiquidityRemoved")
                    .withArgs(alice.address, getBigNumber(10))
                    .and.to.emit(synapseToken, "Transfer")
                    .withArgs(staking.address, alice.address, getBigNumber(90).add(getBigNumber(27525, 15)))
                    .and.to.emit(lpToken, "Transfer")
                    .withArgs(staking.address, alice.address, getBigNumber(9))
                    .and.to.emit(staking, "Claimed")
                    .withArgs(alice.address, getBigNumber(27525, 15));

                  const aliceStake = await staking.tokenStake(alice.address);
                  expect(aliceStake["tokens"]).to.be.equal(0);
                  expect(aliceStake["stakeStart"]).to.be.equal(0);

                  const aliceLpStake = await staking.liquidityStake(alice.address);
                  expect(aliceLpStake["tokens"]).to.be.equal(0);
                  expect(aliceLpStake["stakeStart"]).to.be.equal(0);

                  const tokenStaking = await staking.tokenStaking();
                  expect(tokenStaking["stakedTokens"]).to.be.equal(getBigNumber(300));

                  const lpStaking = await staking.lpStaking();
                  expect(lpStaking["stakedTokens"]).to.be.equal(getBigNumber(30));

                  const data = await staking.data();
                  expect(data["depositedTokens"]).to.be.equal(getBigNumber(300));
                  expect(data["depositedLiquidity"]).to.be.equal(getBigNumber(30));
                  expect(data["totalRewardsClaimed"]).to.be.equal(getBigNumber(27525, 15));

                  expect(await synapseToken.balanceOf(staking.address)).to.be.equal(
                    getBigNumber(310).add(getBigNumber(66528)).sub(getBigNumber(27525, 15))
                  );
                  expect(await lpToken.balanceOf(staking.address)).to.be.equal(getBigNumber(31));
                });
              });

              describe("after 7 days of unstake period", () => {
                beforeEach(async () => {
                  await advanceTimeAndBlock(seven_days);
                });

                it("unstake should correctly withdraw staked tokens and staked LPs without and transfer reward", async () => {
                  await expect(staking.connect(alice).unstake())
                    .to.emit(staking, "StakeRemoved")
                    .withArgs(alice.address, getBigNumber(100))
                    .and.to.emit(staking, "StakeLiquidityRemoved")
                    .withArgs(alice.address, getBigNumber(10))
                    .and.to.emit(synapseToken, "Transfer")
                    .withArgs(staking.address, alice.address, getBigNumber(100).add(getBigNumber(27525, 15)))
                    .and.to.emit(lpToken, "Transfer")
                    .withArgs(staking.address, alice.address, getBigNumber(10))
                    .and.to.emit(staking, "Claimed")
                    .withArgs(alice.address, getBigNumber(27525, 15));

                  const aliceStake = await staking.tokenStake(alice.address);
                  expect(aliceStake["tokens"]).to.be.equal(0);
                  expect(aliceStake["stakeStart"]).to.be.equal(0);

                  const aliceLpStake = await staking.liquidityStake(alice.address);
                  expect(aliceLpStake["tokens"]).to.be.equal(0);
                  expect(aliceLpStake["stakeStart"]).to.be.equal(0);

                  const tokenStaking = await staking.tokenStaking();
                  expect(tokenStaking["stakedTokens"]).to.be.equal(getBigNumber(300));

                  const lpStaking = await staking.lpStaking();
                  expect(lpStaking["stakedTokens"]).to.be.equal(getBigNumber(30));

                  const data = await staking.data();
                  expect(data["depositedTokens"]).to.be.equal(getBigNumber(300));
                  expect(data["depositedLiquidity"]).to.be.equal(getBigNumber(30));
                  expect(data["totalRewardsClaimed"]).to.be.equal(getBigNumber(27525, 15));

                  expect(await synapseToken.balanceOf(staking.address)).to.be.equal(
                    getBigNumber(300).add(getBigNumber(66528)).sub(getBigNumber(27525, 15))
                  );
                  expect(await lpToken.balanceOf(staking.address)).to.be.equal(getBigNumber(30));
                });

                it("unstakeWithFee should revert as there is an option to unstake without fee", async () => {
                  await expect(staking.connect(alice).unstakeWithFee()).to.be.revertedWith(ERR_UNSTAKE_FIRST);
                });
              });
            });
          });
        });

        describe("while requesting unstake lp", () => {
          it("should correctly request unstake lp but not affect token stake", async () => {
            await expect(staking.connect(alice).requestUnstakeLp()).to.emit(staking, "StakeLiquidityRemoveRequested").withArgs(alice.address);

            const start = await latest();

            const aliceLpStake = await staking.liquidityStake(alice.address);
            expect(aliceLpStake["tokens"]).to.be.equal(getBigNumber(10));
            expect(aliceLpStake["rewards"]).to.be.equal(getBigNumber(25, 15));
            expect(aliceLpStake["isWithdrawing"]).to.be.equal(true);
            expect(aliceLpStake["withdrawalPossibleAt"]).to.be.equal(start.add(seven_days));

            const aliceStake = await staking.tokenStake(alice.address);
            expect(aliceStake["tokens"]).to.be.equal(getBigNumber(100));
            expect(aliceStake["rewards"]).to.be.equal(0);
            expect(aliceStake["isWithdrawing"]).to.be.equal(false);
          });

          describe("after request unstake LP and after 1000 sec", () => {
            beforeEach(async () => {
              await advanceTimeAndBlock(999);
              await staking.connect(alice).requestUnstakeLp();
            });

            it("claimable should return amount of collected rewards", async () => {
              const claimable = await staking.claimable(alice.address);
              expect(claimable["token"]).to.be.equal(getBigNumber(25, 17));
              expect(claimable["lp"]).to.be.equal(getBigNumber(25));
            });

            it("claimable should return 0 when rewards claimed after request unstake lp", async () => {
              await staking.connect(alice).claim();
              const claimable = await staking.claimable(alice.address);
              expect(claimable["token"]).to.be.equal(0);
              expect(claimable["lp"]).to.be.equal(0);
            });

            it("user can claim collected rewards but new rewards will not be calculated for lp stake", async () => {
              await expect(staking.connect(alice).claim()).to.emit(staking, "Claimed").withArgs(alice.address, getBigNumber(275025, 14));

              const data = await staking.data();
              expect(data["totalRewardsClaimed"]).to.be.equal(getBigNumber(275025, 14));

              await advanceTimeAndBlock(1000);

              const claimableAlice = await staking.claimable(alice.address);
              expect(claimableAlice["token"]).to.be.equal(getBigNumber(250, 16));
              expect(claimableAlice["lp"]).to.be.equal(0);
            });

            it("user can request unstake correctly", async () => {
              await expect(staking.connect(alice).requestUnstake()).to.emit(staking, "StakeRemoveRequested").withArgs(alice.address);

              const start = await latest();

              const aliceStake = await staking.tokenStake(alice.address);
              expect(aliceStake["tokens"]).to.be.equal(getBigNumber(100));
              expect(aliceStake["rewards"]).to.be.equal(getBigNumber(25025, 14));
              expect(aliceStake["isWithdrawing"]).to.be.equal(true);
              expect(aliceStake["withdrawalPossibleAt"]).to.be.equal(start.add(seven_days));
            });

            it("user can restake collected rewards in LP unstake period", async () => {
              await expect(staking.connect(alice).restake())
                .to.emit(staking, "StakeAdded")
                .withArgs(alice.address, getBigNumber(275025, 14))
                .and.to.emit(staking, "Claimed")
                .withArgs(alice.address, getBigNumber(275025, 14));

              const aliceLpStake = await staking.liquidityStake(alice.address);
              expect(aliceLpStake["tokens"]).to.be.equal(getBigNumber(10));
              expect(aliceLpStake["rewards"]).to.be.equal(0);
              expect(aliceLpStake["rewardPerTokenPaid"]).to.be.equal(getBigNumber(25, 17));

              const aliceStake = await staking.tokenStake(alice.address);
              expect(aliceStake["tokens"]).to.be.equal(getBigNumber(1275025, 14));
              expect(aliceStake["rewards"]).to.be.equal(0);
              expect(aliceStake["rewardPerTokenPaid"]).to.be.equal(getBigNumber(25025, 12));

              const data = await staking.data();
              expect(data["depositedTokens"]).to.be.equal(getBigNumber(4275025, 14));
              expect(data["depositedLiquidity"]).to.be.equal(getBigNumber(40));
              expect(data["totalRewardsClaimed"]).to.be.equal(getBigNumber(275025, 14));
            });

            describe("after 7 days of unstake LP period and with new request unstake tokens", () => {
              beforeEach(async () => {
                await advanceTimeAndBlock(seven_days);
                await staking.connect(alice).requestUnstake();
              });

              it("unstake should correctly withdraw staked LP with rewards and not be affected by requestUnstake", async () => {
                await expect(staking.connect(alice).unstake())
                  .to.emit(staking, "StakeLiquidityRemoved")
                  .withArgs(alice.address, getBigNumber(10))
                  .and.to.emit(lpToken, "Transfer")
                  .withArgs(staking.address, alice.address, getBigNumber(10))
                  .and.to.emit(staking, "Claimed")
                  .withArgs(alice.address, getBigNumber(25));

                const aliceLpStake = await staking.liquidityStake(alice.address);
                expect(aliceLpStake["tokens"]).to.be.equal(0);
                expect(aliceLpStake["stakeStart"]).to.be.equal(0);

                const aliceStake = await staking.tokenStake(alice.address);
                expect(aliceStake["tokens"]).to.be.equal(getBigNumber(100));
                expect(aliceStake["rewards"]).to.be.equal(getBigNumber(1512));
                expect(aliceStake["isWithdrawing"]).to.be.equal(true);

                const lpStaking = await staking.lpStaking();
                expect(lpStaking["stakedTokens"]).to.be.equal(getBigNumber(30));

                const tokenStaking = await staking.tokenStaking();
                expect(tokenStaking["stakedTokens"]).to.be.equal(getBigNumber(300));

                const data = await staking.data();
                expect(data["depositedTokens"]).to.be.equal(getBigNumber(400));
                expect(data["depositedLiquidity"]).to.be.equal(getBigNumber(30));
                expect(data["totalRewardsClaimed"]).to.be.equal(getBigNumber(25));

                expect(await lpToken.balanceOf(staking.address)).to.be.equal(getBigNumber(30));
              });

              it("unstakeWithFee should revert as there is an option to unstake without fee first", async () => {
                await expect(staking.connect(alice).unstakeWithFee()).to.be.revertedWith(ERR_UNSTAKE_FIRST);
              });

              it("unstakeWithFee should correctly unstake tokens with 10% fee after LPs normal unstake", async () => {
                await staking.connect(alice).unstake();

                await expect(staking.connect(alice).unstakeWithFee())
                  .to.emit(staking, "StakeRemoved")
                  .withArgs(alice.address, getBigNumber(100))
                  .and.to.emit(synapseToken, "Transfer")
                  .withArgs(staking.address, alice.address, getBigNumber(1602))
                  .and.to.emit(staking, "Claimed")
                  .withArgs(alice.address, getBigNumber(1512));

                const aliceStake = await staking.tokenStake(alice.address);
                expect(aliceStake["tokens"]).to.be.equal(0);
                expect(aliceStake["stakeStart"]).to.be.equal(0);

                const aliceLpStake = await staking.liquidityStake(alice.address);
                expect(aliceLpStake["tokens"]).to.be.equal(0);
                expect(aliceLpStake["stakeStart"]).to.be.equal(0);

                const tokenStaking = await staking.tokenStaking();
                expect(tokenStaking["stakedTokens"]).to.be.equal(getBigNumber(300));

                const lpStaking = await staking.lpStaking();
                expect(lpStaking["stakedTokens"]).to.be.equal(getBigNumber(30));

                const data = await staking.data();
                expect(data["depositedTokens"]).to.be.equal(getBigNumber(300));
                expect(data["depositedLiquidity"]).to.be.equal(getBigNumber(30));
                expect(data["totalRewardsClaimed"]).to.be.equal(getBigNumber(1512).add(getBigNumber(25)));
              });
            });
          });
        });

        describe("after 30 days of token and liquidity stake", () => {
          beforeEach(async () => {
            await advanceTimeAndBlock(thirty_days);
          });

          it("canSetSuper should correctly return if user can be a super staker for lp stake", async () => {
            const canSetSuper = await staking.canSetSuper(alice.address);
            expect(canSetSuper["token"]).to.be.equal(true);
            expect(canSetSuper["lp"]).to.be.equal(true);
          });

          describe("after request unstake LP", () => {
            beforeEach(async () => {
              await staking.connect(alice).requestUnstakeLp();
            });

            it("canSetSuper should correctly return if user can be a super staker", async () => {
              const canSetSuper = await staking.canSetSuper(alice.address);
              expect(canSetSuper["token"]).to.be.equal(true);
              expect(canSetSuper["lp"]).to.be.equal(false);
            });
          });

          describe("after request unstake", () => {
            beforeEach(async () => {
              await staking.connect(alice).requestUnstake();
            });

            it("canSetSuper should correctly return if user can be a super staker", async () => {
              const canSetSuper = await staking.canSetSuper(alice.address);
              expect(canSetSuper["token"]).to.be.equal(false);
              expect(canSetSuper["lp"]).to.be.equal(true);
            });
          });

          describe("after claiming super staker for token stake", () => {
            beforeEach(async () => {
              await staking.connect(alice).setSuperToken();
              await staking.connect(bob).setSuperToken();
            });

            it("canSetSuper should correctly return if user can be a super staker", async () => {
              const canSetSuper = await staking.canSetSuper(alice.address);
              expect(canSetSuper["token"]).to.be.equal(false);
              expect(canSetSuper["lp"]).to.be.equal(true);
            });

            it("user should correctly claim super staker status for LP stake", async () => {
              await staking.connect(alice).setSuperLp();

              const aliceLpStake = await staking.liquidityStake(alice.address);
              expect(aliceLpStake["isSuperStaker"]).to.be.equal(true);
            });
          });

          describe("after claiming super staker for LP stake", () => {
            beforeEach(async () => {
              await staking.connect(alice).setSuperLp();
              await staking.connect(bob).setSuperLp();
            });

            it("canSetSuper should correctly return if user can be a super staker", async () => {
              const canSetSuper = await staking.canSetSuper(alice.address);
              expect(canSetSuper["token"]).to.be.equal(true);
              expect(canSetSuper["lp"]).to.be.equal(false);
            });

            it("user should correctly claim super staker status for token stake", async () => {
              await staking.connect(alice).setSuperToken();

              const aliceStake = await staking.tokenStake(alice.address);
              expect(aliceStake["isSuperStaker"]).to.be.equal(true);
            });
          });
        });
      });
    });
  });
});
