import { waffle } from "hardhat";
import { expect } from "chai";

import SynapseStakingArtifacts from "../../artifacts/contracts/SynapseStaking.sol/SynapseStaking.json";
import SynapseNetworkArtifacts from "../../artifacts/contracts/SynapseNetwork.sol/SynapseNetwork.json";
import ERC20MockArtifact from "../../artifacts/contracts/mocks/ERC20Mock.sol/ERC20Mock.json";

import { SynapseStaking, SynapseNetwork, ERC20Mock } from "../../typechain";
import { Wallet, utils } from "ethers";
import { getBigNumber, latest, advanceTimeAndBlock } from "../utilities";

const { provider, deployContract } = waffle;

const ERR_WITHDRAWING: string = "Cannot when withdrawing";
const ERR_SUPER_STAKER: string = "Already super staker";
const ERR_TOO_SOON: string = "Too soon";
const ERR_NO_STAKE: string = "Nothing staked";
const ERR_NO_RESTAKE: string = "Nothing to restake";
const ERR_NO_CLAIM: string = "Nothing to claim";
const ERR_ZERO_AMOUNT: string = "Zero Amount";
const ERR_UNSTAKE: string = "Cannot unstake";
const ERR_UNSTAKE_FIRST: string = "Unstake first";

const ERR_TRANSFER_FROM: string = "SafeERC20: TransferFrom failed";

describe("In staking contract without rewards", () => {
  const [deployer, alice, bob, carol, vesting] = provider.getWallets() as Wallet[];

  let staking: SynapseStaking;
  let synapseToken: SynapseNetwork;
  let lpToken: ERC20Mock;

  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

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

  describe("init", () => {
    it("should revert when _token address is 0", async function () {
      const _staking = (await deployContract(deployer, SynapseStakingArtifacts, [thirty_days, seven_days])) as SynapseStaking;
      await expect(_staking.init(ZERO_ADDRESS, lpToken.address, vesting.address)).to.be.revertedWith("_token address cannot be 0");
    });

    it("should revert when _liquidity address is 0", async function () {
      const _staking = (await deployContract(deployer, SynapseStakingArtifacts, [thirty_days, seven_days])) as SynapseStaking;
      await expect(_staking.init(synapseToken.address, ZERO_ADDRESS, vesting.address)).to.be.revertedWith("_liquidity address cannot be 0");
    });

    it("should revert when _vesting address is 0", async function () {
      const _staking = (await deployContract(deployer, SynapseStakingArtifacts, [thirty_days, seven_days])) as SynapseStaking;
      await expect(_staking.init(synapseToken.address, lpToken.address, ZERO_ADDRESS)).to.be.revertedWith("_vesting address cannot be 0");
    });

    it("should revert when already initialized", async function () {
      await expect(staking.init(synapseToken.address, lpToken.address, vesting.address)).to.be.revertedWith("Init already done");
    });
  });

  describe("when initialized", () => {
    it("contract should have expected values", async function () {
      expect(await staking.tokenAddress()).to.be.equal(synapseToken.address);
      expect(await staking.liquidityAddress()).to.be.equal(lpToken.address);
      const timeToSuper = await staking.timeToSuper();
      expect(timeToSuper["value"]).to.be.equal(thirty_days);
      const timeToUnstake = await staking.timeToUnstake();
      expect(timeToUnstake["value"]).to.be.equal(seven_days);
      const unstakeFee = await staking.unstakeFee();
      expect(unstakeFee["value"]).to.be.equal(1000);
    });
  });

  describe("notifyRewardAmount", () => {
    it("should revert if not executed by rewards distributor", async () => {
      await expect(staking.connect(alice).notifyRewardAmount(getBigNumber(6048), getBigNumber(60480))).to.be.revertedWith(
        "caller is not reward distributor"
      );
    });

    it("rewards distributor should add rewards correctly", async () => {
      await synapseToken.approve(staking.address, getBigNumber(66528));
      await expect(staking.notifyRewardAmount(getBigNumber(6048), getBigNumber(60480)))
        .to.emit(staking, "Recalculation")
        .withArgs(getBigNumber(6048), getBigNumber(60480));
    });
  });

  describe("when adding tokens to stake", () => {
    it("addTokenStake should revert when insufficient allowance is set", async () => {
      await expect(staking.connect(alice).addTokenStake(getBigNumber(2000))).to.be.revertedWith(ERR_TRANSFER_FROM);
    });

    it("addTokenStake should revert when insufficient balance", async () => {
      await synapseToken.connect(alice).approve(staking.address, getBigNumber(2000));
      await expect(staking.connect(alice).addTokenStake(getBigNumber(2000))).to.be.revertedWith(ERR_TRANSFER_FROM);
    });

    it("addTokenStake should revert with 0 amount", async () => {
      await expect(staking.connect(alice).addTokenStake(0)).to.be.revertedWith(ERR_ZERO_AMOUNT);
    });

    it("addTokenStake should revert when withdrawing", async () => {
      await staking.connect(alice).addTokenStake(getBigNumber(1));
      await staking.connect(alice).requestUnstake();
      await expect(staking.connect(alice).addTokenStake(getBigNumber(1))).to.be.revertedWith(ERR_WITHDRAWING);
    });
  });

  describe("when adding liquidity stake", () => {
    it("addLiquidityStake should revert when insufficient allowance is set", async () => {
      await expect(staking.connect(alice).addLiquidityStake(getBigNumber(200))).to.be.revertedWith(ERR_TRANSFER_FROM);
    });

    it("addLiquidityStake should revert when insufficient balance", async () => {
      await lpToken.connect(alice).approve(staking.address, getBigNumber(200));
      await expect(staking.connect(alice).addLiquidityStake(getBigNumber(200))).to.be.revertedWith(ERR_TRANSFER_FROM);
    });

    it("addLiquidityStake should revert with 0 amount", async () => {
      await expect(staking.connect(alice).addLiquidityStake(0)).to.be.revertedWith(ERR_ZERO_AMOUNT);
    });

    it("addLiquidityStake should revert when withdrawing", async () => {
      await staking.connect(alice).addLiquidityStake(getBigNumber(1));
      await staking.connect(alice).requestUnstakeLp();
      await expect(staking.connect(alice).addLiquidityStake(getBigNumber(1))).to.be.revertedWith(ERR_WITHDRAWING);
    });
  });

  describe("without any stake", () => {
    it("requesting claim should revert", async () => {
      await expect(staking.connect(alice).claim()).to.be.revertedWith(ERR_NO_STAKE);
    });

    it("requesting restake should revert", async () => {
      await expect(staking.connect(alice).restake()).to.be.revertedWith(ERR_NO_STAKE);
    });

    it("requesting unstake should revert", async () => {
      await expect(staking.connect(alice).unstake()).to.be.revertedWith(ERR_NO_STAKE);
    });

    it("requesting unstakeWithFee should revert", async () => {
      await expect(staking.connect(alice).unstakeWithFee()).to.be.revertedWith(ERR_NO_STAKE);
    });

    it("requesting requestUnstake should revert", async () => {
      await expect(staking.connect(alice).requestUnstake()).to.be.revertedWith(ERR_NO_STAKE);
    });

    it("requesting requestUnstakeLp should revert", async () => {
      await expect(staking.connect(alice).requestUnstakeLp()).to.be.revertedWith(ERR_NO_STAKE);
    });

    it("requesting setSuperToken should revert", async () => {
      await expect(staking.connect(alice).setSuperToken()).to.be.revertedWith(ERR_NO_STAKE);
    });

    it("requesting setSuperLp should revert", async () => {
      await expect(staking.connect(alice).setSuperLp()).to.be.revertedWith(ERR_NO_STAKE);
    });

    it("canSetSuper should correctly return if user can be a super staker for token or lp stake", async () => {
      const canSetSuper = await staking.canSetSuper(alice.address);
      expect(canSetSuper["token"]).to.be.equal(false);
      expect(canSetSuper["lp"]).to.be.equal(false);
    });
  });

  /***************************************
                BEFORE START
  ****************************************/

  describe("Before staking start - when no rewards are added", () => {
    /***************************************
                  ONLY TOKEN
    ****************************************/

    describe("when adding token stake", () => {
      it("user can add token stake correctly but rewards will not be counted", async () => {
        const start = await latest();
        await expect(staking.connect(alice).addTokenStake(getBigNumber(100)))
          .to.emit(staking, "StakeAdded")
          .withArgs(alice.address, getBigNumber(100))
          .and.to.emit(synapseToken, "Transfer")
          .withArgs(alice.address, staking.address, getBigNumber(100));

        const aliceStake = await staking.tokenStake(alice.address);
        expect(aliceStake["tokens"]).to.be.equal(getBigNumber(100));
        expect(aliceStake["stakeStart"]).to.be.equal(start.add(1));

        const tokenStaking = await staking.tokenStaking();
        expect(tokenStaking["stakedTokens"]).to.be.equal(getBigNumber(100));
        expect(tokenStaking["rewardRate"]).to.be.equal(0);
        expect(tokenStaking["rewardPerTokenStored"]).to.be.equal(0);

        const data = await staking.data();
        expect(data["depositedTokens"]).to.be.equal(getBigNumber(100));
        expect(data["totalRewardsAdded"]).to.be.equal(0);
      });
    });

    describe("after adding only token stake", () => {
      beforeEach(async () => {
        await staking.connect(alice).addTokenStake(getBigNumber(100));
        await staking.connect(bob).addTokenStake(getBigNumber(100));
        await staking.connect(carol).addTokenStake(getBigNumber(100));
      });

      it("claimable should return 0 as there are no rewards", async () => {
        const claimable = await staking.claimable(alice.address);
        expect(claimable["token"]).to.be.equal(0);
      });

      it("user can add new tokens to token stake but rewards still not be counted", async () => {
        await expect(staking.connect(alice).addTokenStake(getBigNumber(100)))
          .to.emit(staking, "StakeAdded")
          .withArgs(alice.address, getBigNumber(100))
          .and.to.emit(synapseToken, "Transfer")
          .withArgs(alice.address, staking.address, getBigNumber(100));

        const aliceStake = await staking.tokenStake(alice.address);
        expect(aliceStake["tokens"]).to.be.equal(getBigNumber(200));

        const tokenStaking = await staking.tokenStaking();
        expect(tokenStaking["stakedTokens"]).to.be.equal(getBigNumber(400));
        expect(tokenStaking["rewardRate"]).to.be.equal(0);
        expect(tokenStaking["rewardPerTokenStored"]).to.be.equal(0);
      });

      it("should revert on restake as there are no tokens to restake", async () => {
        await expect(staking.connect(alice).restake()).to.be.revertedWith(ERR_NO_RESTAKE);
      });

      it("should revert on claim as there are no tokens to claim", async () => {
        await expect(staking.connect(alice).claim()).to.be.revertedWith(ERR_NO_CLAIM);
      });

      it("should revert on setSuperToken as it is to soon to claim super staker for token stake", async () => {
        await expect(staking.connect(alice).setSuperToken()).to.be.revertedWith(ERR_TOO_SOON);
      });

      it("unstakeWithFee should do nothing if not withdrawing", async () => {
        await expect(staking.connect(alice).unstakeWithFee())
          .to.not.emit(staking, "StakeLiquidityRemoved")
          .and.to.not.emit(staking, "StakeRemoved");
      });

      it("canSetSuper should correctly return if user can be a super staker for token stake", async () => {
        const canSetSuper = await staking.canSetSuper(alice.address);
        expect(canSetSuper["token"]).to.be.equal(false);
      });

      describe("while requesting unstake", () => {
        it("should correctly request unstake but rewards will not be counted", async () => {
          const start = await latest();
          await expect(staking.connect(alice).requestUnstake()).to.emit(staking, "StakeRemoveRequested").withArgs(alice.address);

          const aliceStake = await staking.tokenStake(alice.address);
          expect(aliceStake["tokens"]).to.be.equal(getBigNumber(100));
          expect(aliceStake["rewards"]).to.be.equal(0);
          expect(aliceStake["isWithdrawing"]).to.be.equal(true);
          expect(aliceStake["withdrawalPossibleAt"]).to.be.equal(start.add(1).add(seven_days));
        });

        describe("after request unstake", () => {
          beforeEach(async () => {
            await staking.connect(alice).requestUnstake();
          });

          it("claimable should return 0 as there were no rewards", async () => {
            const claimable = await staking.claimable(alice.address);
            expect(claimable["token"]).to.be.equal(0);
          });

          it("should revert on restake as user is withdrawing", async () => {
            await expect(staking.connect(alice).restake()).to.be.revertedWith(ERR_WITHDRAWING);
          });

          it("should revert on next requestUnstake as user is already withdrawing", async () => {
            await expect(staking.connect(alice).requestUnstake()).to.be.revertedWith(ERR_WITHDRAWING);
          });

          it("should revert on setSuperToken as user is withdrawing", async () => {
            await expect(staking.connect(alice).setSuperToken()).to.be.revertedWith(ERR_WITHDRAWING);
          });

          describe("before 7 days of unstake period", () => {
            it("should revert when requesting unstake", async () => {
              await expect(staking.connect(alice).unstake()).to.be.revertedWith(ERR_UNSTAKE);
            });

            it("unstakeWithFee should correctly unstake tokens with 10% fee", async () => {
              await expect(staking.connect(alice).unstakeWithFee())
                .to.emit(staking, "StakeRemoved")
                .withArgs(alice.address, getBigNumber(100))
                .and.to.emit(synapseToken, "Transfer")
                .withArgs(staking.address, alice.address, getBigNumber(90));

              const aliceStake = await staking.tokenStake(alice.address);
              expect(aliceStake["tokens"]).to.be.equal(0);
              expect(aliceStake["stakeStart"]).to.be.equal(0);

              const tokenStaking = await staking.tokenStaking();
              expect(tokenStaking["stakedTokens"]).to.be.equal(getBigNumber(200));
              expect(tokenStaking["rewardRate"]).to.be.equal(0);
              expect(tokenStaking["rewardPerTokenStored"]).to.be.equal(0);

              const data = await staking.data();
              expect(data["depositedTokens"]).to.be.equal(getBigNumber(200));
              expect(data["totalRewardsClaimed"]).to.be.equal(0);

              expect(await synapseToken.balanceOf(staking.address)).to.be.equal(getBigNumber(210));
            });
          });

          describe("after 7 days of unstake period", () => {
            beforeEach(async () => {
              await advanceTimeAndBlock(seven_days);
            });

            it("unstake should correctly withdraw staked tokens without any rewards", async () => {
              await expect(staking.connect(alice).unstake())
                .to.emit(staking, "StakeRemoved")
                .withArgs(alice.address, getBigNumber(100))
                .and.to.emit(synapseToken, "Transfer")
                .withArgs(staking.address, alice.address, getBigNumber(100));

              const aliceStake = await staking.tokenStake(alice.address);
              expect(aliceStake["tokens"]).to.be.equal(0);
              expect(aliceStake["stakeStart"]).to.be.equal(0);

              const tokenStaking = await staking.tokenStaking();
              expect(tokenStaking["stakedTokens"]).to.be.equal(getBigNumber(200));
              expect(tokenStaking["rewardRate"]).to.be.equal(0);
              expect(tokenStaking["rewardPerTokenStored"]).to.be.equal(0);

              const data = await staking.data();
              expect(data["depositedTokens"]).to.be.equal(getBigNumber(200));
              expect(data["totalRewardsClaimed"]).to.be.equal(0);

              expect(await synapseToken.balanceOf(staking.address)).to.be.equal(getBigNumber(200));
            });

            it("unstakeWithFee should revert as there is an option to unstake without fee", async () => {
              await expect(staking.connect(alice).unstakeWithFee()).to.be.revertedWith(ERR_UNSTAKE_FIRST);
            });
          });
        });
      });

      describe("after 30 days of token stake", () => {
        beforeEach(async () => {
          await advanceTimeAndBlock(thirty_days);
        });

        it("canSetSuper should correctly return if user can be a super staker for token stake", async () => {
          const canSetSuper = await staking.canSetSuper(alice.address);
          expect(canSetSuper["token"]).to.be.equal(true);
        });

        it("user can claim super staker status for token stake and super rewards will be 0 without fee deposited", async () => {
          const timestamp = await latest();
          await expect(staking.connect(alice).setSuperToken()).to.emit(staking, "SuperRecalculation").withArgs(0, 0);

          const aliceStake = await staking.tokenStake(alice.address);
          expect(aliceStake["isSuperStaker"]).to.be.equal(true);
          expect(aliceStake["superRewardPerTokenPaid"]).to.be.equal(0);

          const tokenStaking = await staking.tokenStaking();
          expect(tokenStaking["stakedTokens"]).to.be.equal(getBigNumber(300));
          expect(tokenStaking["stakedSuperTokens"]).to.be.equal(getBigNumber(100));
          expect(tokenStaking["superRewardRate"]).to.be.equal(0);
          expect(tokenStaking["superRewardPerTokenStored"]).to.be.equal(0);
          expect(tokenStaking["lastSuperUpdateTime"]).to.be.equal(timestamp.add(1));

          const data = await staking.data();
          expect(data["depositedTokens"]).to.be.equal(getBigNumber(300));
          expect(data["totalRewardsAdded"]).to.be.equal(0);
          expect(data["totalRewardsFromFees"]).to.be.equal(0);
        });

        describe("after request unstake", () => {
          beforeEach(async () => {
            await staking.connect(alice).requestUnstake();
          });

          it("canSetSuper should correctly return if user can be a super staker for token stake", async () => {
            const canSetSuper = await staking.canSetSuper(alice.address);
            expect(canSetSuper["token"]).to.be.equal(false);
          });
        });

        describe("after claiming super staker for token stake", () => {
          beforeEach(async () => {
            await staking.connect(alice).setSuperToken();
            await staking.connect(bob).setSuperToken();
          });

          it("canSetSuper should correctly return if user can be a super staker for token stake", async () => {
            const canSetSuper = await staking.canSetSuper(alice.address);
            expect(canSetSuper["token"]).to.be.equal(false);
          });

          it("setSuperToken should revert when executed after status super staker was claimed", async () => {
            await expect(staking.connect(alice).setSuperToken()).to.be.revertedWith(ERR_SUPER_STAKER);
          });

          it("claimable should return 0 as there still no rewards", async () => {
            const claimable = await staking.claimable(alice.address);
            expect(claimable["token"]).to.be.equal(0);
          });

          it("adding new tokens to token stake should also correctly update data in super token stake", async () => {
            await expect(staking.connect(alice).addTokenStake(getBigNumber(100)))
              .to.emit(staking, "StakeAdded")
              .withArgs(alice.address, getBigNumber(100))
              .and.to.emit(synapseToken, "Transfer")
              .withArgs(alice.address, staking.address, getBigNumber(100));

            const aliceStake = await staking.tokenStake(alice.address);
            expect(aliceStake["tokens"]).to.be.equal(getBigNumber(200));
            expect(aliceStake["isSuperStaker"]).to.be.equal(true);

            const tokenStaking = await staking.tokenStaking();
            expect(tokenStaking["stakedTokens"]).to.be.equal(getBigNumber(400));
            expect(tokenStaking["stakedSuperTokens"]).to.be.equal(getBigNumber(300));

            const data = await staking.data();
            expect(data["depositedTokens"]).to.be.equal(getBigNumber(400));
          });

          it("requestUnstake should remove user from super token and token stake and remove his super staker status", async () => {
            const timestamp = await latest();
            await expect(staking.connect(alice).requestUnstake()).to.emit(staking, "StakeRemoveRequested").withArgs(alice.address);

            const aliceStake = await staking.tokenStake(alice.address);
            expect(aliceStake["tokens"]).to.be.equal(getBigNumber(100));
            expect(aliceStake["isSuperStaker"]).to.be.equal(false);
            expect(aliceStake["isWithdrawing"]).to.be.equal(true);
            expect(aliceStake["withdrawalPossibleAt"]).to.be.equal(timestamp.add(1).add(seven_days));

            const tokenStaking = await staking.tokenStaking();
            expect(tokenStaking["stakedTokens"]).to.be.equal(getBigNumber(200));
            expect(tokenStaking["stakedSuperTokens"]).to.be.equal(getBigNumber(100));

            const data = await staking.data();
            expect(data["depositedTokens"]).to.be.equal(getBigNumber(300));
          });
        });
      });
    });

    /***************************************
                  ONLY LIQUIDITY
    ****************************************/

    describe("when adding liquidity stake", () => {
      it("user can add liquidity stake correctly but rewards will not be counted", async () => {
        const start = await latest();
        await expect(staking.connect(alice).addLiquidityStake(getBigNumber(10)))
          .to.emit(staking, "StakeLiquidityAdded")
          .withArgs(alice.address, getBigNumber(10))
          .and.to.emit(lpToken, "Transfer")
          .withArgs(alice.address, staking.address, getBigNumber(10));

        const aliceLpStake = await staking.liquidityStake(alice.address);
        expect(aliceLpStake["tokens"]).to.be.equal(getBigNumber(10));
        expect(aliceLpStake["stakeStart"]).to.be.equal(start.add(1));

        const lpStaking = await staking.lpStaking();
        expect(lpStaking["stakedTokens"]).to.be.equal(getBigNumber(10));
        expect(lpStaking["rewardRate"]).to.be.equal(0);
        expect(lpStaking["rewardPerTokenStored"]).to.be.equal(0);

        const data = await staking.data();
        expect(data["depositedLiquidity"]).to.be.equal(getBigNumber(10));
        expect(data["totalRewardsAdded"]).to.be.equal(0);
      });
    });

    describe("after adding only liquidity stake", () => {
      beforeEach(async () => {
        await staking.connect(alice).addLiquidityStake(getBigNumber(10));
        await staking.connect(bob).addLiquidityStake(getBigNumber(10));
        await staking.connect(carol).addLiquidityStake(getBigNumber(10));
      });

      it("claimable should return 0 as there are no rewards", async () => {
        const claimable = await staking.claimable(alice.address);
        expect(claimable["lp"]).to.be.equal(0);
      });

      it("user can add new liquidity to liquidity stake but rewards still not be counted", async () => {
        await expect(staking.connect(alice).addLiquidityStake(getBigNumber(10)))
          .to.emit(staking, "StakeLiquidityAdded")
          .withArgs(alice.address, getBigNumber(10))
          .and.to.emit(lpToken, "Transfer")
          .withArgs(alice.address, staking.address, getBigNumber(10));

        const aliceLpStake = await staking.liquidityStake(alice.address);
        expect(aliceLpStake["tokens"]).to.be.equal(getBigNumber(20));

        const lpStaking = await staking.lpStaking();
        expect(lpStaking["stakedTokens"]).to.be.equal(getBigNumber(40));
        expect(lpStaking["rewardRate"]).to.be.equal(0);
        expect(lpStaking["rewardPerTokenStored"]).to.be.equal(0);
      });

      it("should revert on restake as there are no tokens to restake", async () => {
        await expect(staking.connect(alice).restake()).to.be.revertedWith(ERR_NO_RESTAKE);
      });

      it("should revert on claim as there are no tokens to claim", async () => {
        await expect(staking.connect(alice).claim()).to.be.revertedWith(ERR_NO_CLAIM);
      });

      it("should revert on setSuperLp as it is to soon to claim super staker for lp stake", async () => {
        await expect(staking.connect(alice).setSuperLp()).to.be.revertedWith(ERR_TOO_SOON);
      });

      it("canSetSuper should correctly return if user can be a super staker for lp stake", async () => {
        const canSetSuper = await staking.canSetSuper(alice.address);
        expect(canSetSuper["lp"]).to.be.equal(false);
      });

      it("unstakeWithFee should do nothing if not withdrawing", async () => {
        await expect(staking.connect(alice).unstakeWithFee())
          .to.not.emit(staking, "StakeLiquidityRemoved")
          .and.to.not.emit(staking, "StakeRemoved");
      });

      describe("while requesting unstake lp", () => {
        it("should correctly request unstake lp but rewards will not be counted", async () => {
          const start = await latest();
          await expect(staking.connect(alice).requestUnstakeLp()).to.emit(staking, "StakeLiquidityRemoveRequested").withArgs(alice.address);

          const aliceLpStake = await staking.liquidityStake(alice.address);
          expect(aliceLpStake["tokens"]).to.be.equal(getBigNumber(10));
          expect(aliceLpStake["rewards"]).to.be.equal(0);
          expect(aliceLpStake["isWithdrawing"]).to.be.equal(true);
          expect(aliceLpStake["withdrawalPossibleAt"]).to.be.equal(start.add(1).add(seven_days));
        });

        describe("after request unstake LP", () => {
          beforeEach(async () => {
            await staking.connect(alice).requestUnstakeLp();
          });

          it("claimable should return 0 as there were no rewards", async () => {
            const claimable = await staking.claimable(alice.address);
            expect(claimable["lp"]).to.be.equal(0);
          });

          it("should revert on next requestUnstakeLp as user is already withdrawing", async () => {
            await expect(staking.connect(alice).requestUnstakeLp()).to.be.revertedWith(ERR_WITHDRAWING);
          });

          it("should revert on setSuperLp as user is withdrawing", async () => {
            await expect(staking.connect(alice).setSuperLp()).to.be.revertedWith(ERR_WITHDRAWING);
          });

          describe("before 7 days of unstake period", () => {
            it("should revert when requesting unstake", async () => {
              await expect(staking.connect(alice).unstake()).to.be.revertedWith(ERR_UNSTAKE);
            });

            it("unstakeWithFee should correctly unstake LP with 10% fee", async () => {
              await expect(staking.connect(alice).unstakeWithFee())
                .to.emit(staking, "StakeLiquidityRemoved")
                .withArgs(alice.address, getBigNumber(10))
                .and.to.emit(lpToken, "Transfer")
                .withArgs(staking.address, alice.address, getBigNumber(9));

              const aliceLpStake = await staking.liquidityStake(alice.address);
              expect(aliceLpStake["tokens"]).to.be.equal(0);
              expect(aliceLpStake["stakeStart"]).to.be.equal(0);

              const lpStaking = await staking.lpStaking();
              expect(lpStaking["stakedTokens"]).to.be.equal(getBigNumber(20));
              expect(lpStaking["rewardRate"]).to.be.equal(0);
              expect(lpStaking["rewardPerTokenStored"]).to.be.equal(0);

              const data = await staking.data();
              expect(data["depositedLiquidity"]).to.be.equal(getBigNumber(20));
              expect(data["totalRewardsClaimed"]).to.be.equal(0);

              expect(await lpToken.balanceOf(staking.address)).to.be.equal(getBigNumber(21));
            });
          });

          describe("after 7 days of unstake period", () => {
            beforeEach(async () => {
              await advanceTimeAndBlock(seven_days);
            });

            it("unstake should correctly withdraw staked LP without any rewards", async () => {
              await expect(staking.connect(alice).unstake())
                .to.emit(staking, "StakeLiquidityRemoved")
                .withArgs(alice.address, getBigNumber(10))
                .and.to.emit(lpToken, "Transfer")
                .withArgs(staking.address, alice.address, getBigNumber(10));

              const aliceLpStake = await staking.liquidityStake(alice.address);
              expect(aliceLpStake["tokens"]).to.be.equal(0);
              expect(aliceLpStake["stakeStart"]).to.be.equal(0);

              const lpStaking = await staking.lpStaking();
              expect(lpStaking["stakedTokens"]).to.be.equal(getBigNumber(20));
              expect(lpStaking["rewardRate"]).to.be.equal(0);
              expect(lpStaking["rewardPerTokenStored"]).to.be.equal(0);

              const data = await staking.data();
              expect(data["depositedLiquidity"]).to.be.equal(getBigNumber(20));
              expect(data["totalRewardsClaimed"]).to.be.equal(0);

              expect(await lpToken.balanceOf(staking.address)).to.be.equal(getBigNumber(20));
            });

            it("unstakeWithFee should revert as there is an option to unstake without fee", async () => {
              await expect(staking.connect(alice).unstakeWithFee()).to.be.revertedWith(ERR_UNSTAKE_FIRST);
            });
          });
        });
      });

      describe("after 30 days of LP stake", () => {
        beforeEach(async () => {
          await advanceTimeAndBlock(thirty_days);
        });

        it("canSetSuper should correctly return if user can be a super staker for lp stake", async () => {
          const canSetSuper = await staking.canSetSuper(alice.address);
          expect(canSetSuper["lp"]).to.be.equal(true);
        });

        it("user can claim super staker status for lp stake and super rewards will be 0 without fee deposited", async () => {
          const timestamp = await latest();
          await expect(staking.connect(alice).setSuperLp()).to.emit(staking, "SuperRecalculation").withArgs(0, 0);

          const aliceLpStake = await staking.liquidityStake(alice.address);
          expect(aliceLpStake["isSuperStaker"]).to.be.equal(true);
          expect(aliceLpStake["superRewardPerTokenPaid"]).to.be.equal(0);

          const lpStaking = await staking.lpStaking();
          expect(lpStaking["stakedTokens"]).to.be.equal(getBigNumber(30));
          expect(lpStaking["stakedSuperTokens"]).to.be.equal(getBigNumber(10));
          expect(lpStaking["superRewardRate"]).to.be.equal(0);
          expect(lpStaking["superRewardPerTokenStored"]).to.be.equal(0);
          expect(lpStaking["lastSuperUpdateTime"]).to.be.equal(timestamp.add(1));

          const data = await staking.data();
          expect(data["depositedLiquidity"]).to.be.equal(getBigNumber(30));
          expect(data["totalRewardsAdded"]).to.be.equal(0);
          expect(data["totalRewardsFromFees"]).to.be.equal(0);
        });

        describe("after request unstake LP", () => {
          beforeEach(async () => {
            await staking.connect(alice).requestUnstakeLp();
          });

          it("canSetSuper should correctly return if user can be a super staker for LP stake", async () => {
            const canSetSuper = await staking.canSetSuper(alice.address);
            expect(canSetSuper["lp"]).to.be.equal(false);
          });
        });

        describe("after claiming super staker for LP stake", () => {
          beforeEach(async () => {
            await staking.connect(alice).setSuperLp();
            await staking.connect(bob).setSuperLp();
          });

          it("canSetSuper should correctly return if user can be a super staker for token stake", async () => {
            const canSetSuper = await staking.canSetSuper(alice.address);
            expect(canSetSuper["lp"]).to.be.equal(false);
          });

          it("setSuperLp should revert when executed after status super staker was claimed", async () => {
            await expect(staking.connect(alice).setSuperLp()).to.be.revertedWith(ERR_SUPER_STAKER);
          });

          it("claimable should return 0 as there still no rewards", async () => {
            const claimable = await staking.claimable(alice.address);
            expect(claimable["lp"]).to.be.equal(0);
          });

          it("adding new LPs to LP stake should also correctly update data in super LP stake", async () => {
            await expect(staking.connect(alice).addLiquidityStake(getBigNumber(10)))
              .to.emit(staking, "StakeLiquidityAdded")
              .withArgs(alice.address, getBigNumber(10))
              .and.to.emit(lpToken, "Transfer")
              .withArgs(alice.address, staking.address, getBigNumber(10));

            const aliceLpStake = await staking.liquidityStake(alice.address);
            expect(aliceLpStake["tokens"]).to.be.equal(getBigNumber(20));
            expect(aliceLpStake["isSuperStaker"]).to.be.equal(true);

            const lpStaking = await staking.lpStaking();
            expect(lpStaking["stakedTokens"]).to.be.equal(getBigNumber(40));
            expect(lpStaking["stakedSuperTokens"]).to.be.equal(getBigNumber(30));

            const data = await staking.data();
            expect(data["depositedLiquidity"]).to.be.equal(getBigNumber(40));
          });

          it("requestUnstakeLp should remove user from super LP and LP stake and remove his super staker status", async () => {
            const timestamp = await latest();
            await expect(staking.connect(alice).requestUnstakeLp()).to.emit(staking, "StakeLiquidityRemoveRequested").withArgs(alice.address);

            const aliceLpStake = await staking.liquidityStake(alice.address);
            expect(aliceLpStake["tokens"]).to.be.equal(getBigNumber(10));
            expect(aliceLpStake["isSuperStaker"]).to.be.equal(false);
            expect(aliceLpStake["isWithdrawing"]).to.be.equal(true);
            expect(aliceLpStake["withdrawalPossibleAt"]).to.be.equal(timestamp.add(1).add(seven_days));

            const lpStaking = await staking.lpStaking();
            expect(lpStaking["stakedTokens"]).to.be.equal(getBigNumber(20));
            expect(lpStaking["stakedSuperTokens"]).to.be.equal(getBigNumber(10));

            const data = await staking.data();
            expect(data["depositedLiquidity"]).to.be.equal(getBigNumber(30));
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
        await staking.connect(carol).addTokenStake(getBigNumber(100));
        await staking.connect(carol).addLiquidityStake(getBigNumber(10));
      });

      it("claimable should return 0 as there are no rewards", async () => {
        const claimable = await staking.claimable(alice.address);
        expect(claimable["token"]).to.be.equal(0);
        expect(claimable["lp"]).to.be.equal(0);
      });

      it("should revert on restake as there are no tokens to restake", async () => {
        await expect(staking.connect(alice).restake()).to.be.revertedWith(ERR_NO_RESTAKE);
      });

      it("should revert on claim as there are no tokens to claim", async () => {
        await expect(staking.connect(alice).claim()).to.be.revertedWith(ERR_NO_CLAIM);
      });

      it("canSetSuper should correctly return if user can be a super staker for lp stake", async () => {
        const canSetSuper = await staking.canSetSuper(alice.address);
        expect(canSetSuper["token"]).to.be.equal(false);
        expect(canSetSuper["lp"]).to.be.equal(false);
      });

      it("unstakeWithFee should do nothing if not withdrawing", async () => {
        await expect(staking.connect(alice).unstakeWithFee())
          .to.not.emit(staking, "StakeLiquidityRemoved")
          .and.to.not.emit(staking, "StakeRemoved");
      });

      describe("while requesting unstake", () => {
        it("should correctly request unstake but not affect LP stake", async () => {
          const start = await latest();
          await expect(staking.connect(alice).requestUnstake()).to.emit(staking, "StakeRemoveRequested").withArgs(alice.address);

          const aliceLpStake = await staking.liquidityStake(alice.address);
          expect(aliceLpStake["tokens"]).to.be.equal(getBigNumber(10));
          expect(aliceLpStake["rewards"]).to.be.equal(0);
          expect(aliceLpStake["isWithdrawing"]).to.be.equal(false);

          const aliceStake = await staking.tokenStake(alice.address);
          expect(aliceStake["tokens"]).to.be.equal(getBigNumber(100));
          expect(aliceStake["rewards"]).to.be.equal(0);
          expect(aliceStake["isWithdrawing"]).to.be.equal(true);
          expect(aliceStake["withdrawalPossibleAt"]).to.be.equal(start.add(1).add(seven_days));
        });

        describe("after request unstake", () => {
          beforeEach(async () => {
            await staking.connect(alice).requestUnstake();
          });

          it("claimable should return 0 as there were no rewards", async () => {
            const claimable = await staking.claimable(alice.address);
            expect(claimable["token"]).to.be.equal(0);
            expect(claimable["lp"]).to.be.equal(0);
          });

          it("user can request unstake LP correctly", async () => {
            const start = await latest();
            await expect(staking.connect(alice).requestUnstakeLp()).to.emit(staking, "StakeLiquidityRemoveRequested").withArgs(alice.address);

            const aliceLpStake = await staking.liquidityStake(alice.address);
            expect(aliceLpStake["tokens"]).to.be.equal(getBigNumber(10));
            expect(aliceLpStake["rewards"]).to.be.equal(0);
            expect(aliceLpStake["isWithdrawing"]).to.be.equal(true);
            expect(aliceLpStake["withdrawalPossibleAt"]).to.be.equal(start.add(1).add(seven_days));
          });

          describe("after request unstake LP - both request unstake", () => {
            beforeEach(async () => {
              await staking.connect(alice).requestUnstakeLp();
            });

            it("token staking and lp staking data should be correct", async () => {
              const tokenStaking = await staking.tokenStaking();
              expect(tokenStaking["stakedTokens"]).to.be.equal(getBigNumber(200));
              expect(tokenStaking["rewardRate"]).to.be.equal(0);
              expect(tokenStaking["rewardPerTokenStored"]).to.be.equal(0);

              const lpStaking = await staking.lpStaking();
              expect(lpStaking["stakedTokens"]).to.be.equal(getBigNumber(20));
              expect(lpStaking["rewardRate"]).to.be.equal(0);
              expect(lpStaking["rewardPerTokenStored"]).to.be.equal(0);
            });

            describe("before 7 days of unstake period", () => {
              it("should revert when requesting unstake", async () => {
                await expect(staking.connect(alice).unstake()).to.be.revertedWith(ERR_UNSTAKE);
              });

              it("unstakeWithFee should correctly unstake tokens and LPs with 10% fee", async () => {
                await expect(staking.connect(alice).unstakeWithFee())
                  .to.emit(staking, "StakeRemoved")
                  .withArgs(alice.address, getBigNumber(100))
                  .and.to.emit(staking, "StakeLiquidityRemoved")
                  .withArgs(alice.address, getBigNumber(10))
                  .and.to.emit(synapseToken, "Transfer")
                  .withArgs(staking.address, alice.address, getBigNumber(90))
                  .and.to.emit(lpToken, "Transfer")
                  .withArgs(staking.address, alice.address, getBigNumber(9));

                const aliceStake = await staking.tokenStake(alice.address);
                expect(aliceStake["tokens"]).to.be.equal(0);
                expect(aliceStake["stakeStart"]).to.be.equal(0);

                const aliceLpStake = await staking.liquidityStake(alice.address);
                expect(aliceLpStake["tokens"]).to.be.equal(0);
                expect(aliceLpStake["stakeStart"]).to.be.equal(0);

                const tokenStaking = await staking.tokenStaking();
                expect(tokenStaking["stakedTokens"]).to.be.equal(getBigNumber(200));
                expect(tokenStaking["rewardRate"]).to.be.equal(0);
                expect(tokenStaking["rewardPerTokenStored"]).to.be.equal(0);

                const lpStaking = await staking.lpStaking();
                expect(lpStaking["stakedTokens"]).to.be.equal(getBigNumber(20));
                expect(lpStaking["rewardRate"]).to.be.equal(0);
                expect(lpStaking["rewardPerTokenStored"]).to.be.equal(0);

                const data = await staking.data();
                expect(data["depositedTokens"]).to.be.equal(getBigNumber(200));
                expect(data["depositedLiquidity"]).to.be.equal(getBigNumber(20));
                expect(data["totalRewardsClaimed"]).to.be.equal(0);

                expect(await synapseToken.balanceOf(staking.address)).to.be.equal(getBigNumber(210));
                expect(await lpToken.balanceOf(staking.address)).to.be.equal(getBigNumber(21));
              });
            });

            describe("after 7 days of unstake period", () => {
              beforeEach(async () => {
                await advanceTimeAndBlock(seven_days);
              });

              it("unstake should correctly withdraw staked tokens and staked LPs without any rewards", async () => {
                await expect(staking.connect(alice).unstake())
                  .to.emit(staking, "StakeRemoved")
                  .withArgs(alice.address, getBigNumber(100))
                  .and.to.emit(staking, "StakeLiquidityRemoved")
                  .withArgs(alice.address, getBigNumber(10))
                  .and.to.emit(synapseToken, "Transfer")
                  .withArgs(staking.address, alice.address, getBigNumber(100))
                  .and.to.emit(lpToken, "Transfer")
                  .withArgs(staking.address, alice.address, getBigNumber(10));

                const aliceStake = await staking.tokenStake(alice.address);
                expect(aliceStake["tokens"]).to.be.equal(0);
                expect(aliceStake["stakeStart"]).to.be.equal(0);

                const aliceLpStake = await staking.liquidityStake(alice.address);
                expect(aliceLpStake["tokens"]).to.be.equal(0);
                expect(aliceLpStake["stakeStart"]).to.be.equal(0);

                const tokenStaking = await staking.tokenStaking();
                expect(tokenStaking["stakedTokens"]).to.be.equal(getBigNumber(200));
                expect(tokenStaking["rewardRate"]).to.be.equal(0);
                expect(tokenStaking["rewardPerTokenStored"]).to.be.equal(0);

                const lpStaking = await staking.lpStaking();
                expect(lpStaking["stakedTokens"]).to.be.equal(getBigNumber(20));
                expect(lpStaking["rewardRate"]).to.be.equal(0);
                expect(lpStaking["rewardPerTokenStored"]).to.be.equal(0);

                const data = await staking.data();
                expect(data["depositedTokens"]).to.be.equal(getBigNumber(200));
                expect(data["depositedLiquidity"]).to.be.equal(getBigNumber(20));
                expect(data["totalRewardsClaimed"]).to.be.equal(0);

                expect(await synapseToken.balanceOf(staking.address)).to.be.equal(getBigNumber(200));
                expect(await lpToken.balanceOf(staking.address)).to.be.equal(getBigNumber(20));
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
          const start = await latest();
          await expect(staking.connect(alice).requestUnstakeLp()).to.emit(staking, "StakeLiquidityRemoveRequested").withArgs(alice.address);

          const aliceLpStake = await staking.liquidityStake(alice.address);
          expect(aliceLpStake["tokens"]).to.be.equal(getBigNumber(10));
          expect(aliceLpStake["rewards"]).to.be.equal(0);
          expect(aliceLpStake["isWithdrawing"]).to.be.equal(true);
          expect(aliceLpStake["withdrawalPossibleAt"]).to.be.equal(start.add(1).add(seven_days));

          const aliceStake = await staking.tokenStake(alice.address);
          expect(aliceStake["tokens"]).to.be.equal(getBigNumber(100));
          expect(aliceStake["rewards"]).to.be.equal(0);
          expect(aliceStake["isWithdrawing"]).to.be.equal(false);
        });

        describe("after request unstake LP", () => {
          beforeEach(async () => {
            await staking.connect(alice).requestUnstakeLp();
          });

          it("user can request unstake correctly", async () => {
            const start = await latest();
            await expect(staking.connect(alice).requestUnstake()).to.emit(staking, "StakeRemoveRequested").withArgs(alice.address);

            const aliceStake = await staking.tokenStake(alice.address);
            expect(aliceStake["tokens"]).to.be.equal(getBigNumber(100));
            expect(aliceStake["rewards"]).to.be.equal(0);
            expect(aliceStake["isWithdrawing"]).to.be.equal(true);
            expect(aliceStake["withdrawalPossibleAt"]).to.be.equal(start.add(1).add(seven_days));
          });

          describe("after 7 days of unstake LP period and with new request unstake tokens", () => {
            beforeEach(async () => {
              await advanceTimeAndBlock(seven_days);
              await staking.connect(alice).requestUnstake();
            });

            it("unstake should correctly withdraw staked LP without any rewards and not be affected by requestUnstake", async () => {
              await expect(staking.connect(alice).unstake())
                .to.emit(staking, "StakeLiquidityRemoved")
                .withArgs(alice.address, getBigNumber(10))
                .and.to.emit(lpToken, "Transfer")
                .withArgs(staking.address, alice.address, getBigNumber(10));

              const aliceLpStake = await staking.liquidityStake(alice.address);
              expect(aliceLpStake["tokens"]).to.be.equal(0);
              expect(aliceLpStake["stakeStart"]).to.be.equal(0);

              const lpStaking = await staking.lpStaking();
              expect(lpStaking["stakedTokens"]).to.be.equal(getBigNumber(20));
              expect(lpStaking["rewardRate"]).to.be.equal(0);
              expect(lpStaking["rewardPerTokenStored"]).to.be.equal(0);

              const data = await staking.data();
              expect(data["depositedLiquidity"]).to.be.equal(getBigNumber(20));
              expect(data["totalRewardsClaimed"]).to.be.equal(0);

              expect(await lpToken.balanceOf(staking.address)).to.be.equal(getBigNumber(20));
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
                .withArgs(staking.address, alice.address, getBigNumber(90));

              const aliceStake = await staking.tokenStake(alice.address);
              expect(aliceStake["tokens"]).to.be.equal(0);
              expect(aliceStake["stakeStart"]).to.be.equal(0);

              const aliceLpStake = await staking.liquidityStake(alice.address);
              expect(aliceLpStake["tokens"]).to.be.equal(0);
              expect(aliceLpStake["stakeStart"]).to.be.equal(0);

              const tokenStaking = await staking.tokenStaking();
              expect(tokenStaking["stakedTokens"]).to.be.equal(getBigNumber(200));
              expect(tokenStaking["rewardRate"]).to.be.equal(0);
              expect(tokenStaking["rewardPerTokenStored"]).to.be.equal(0);

              const lpStaking = await staking.lpStaking();
              expect(lpStaking["stakedTokens"]).to.be.equal(getBigNumber(20));
              expect(lpStaking["rewardRate"]).to.be.equal(0);
              expect(lpStaking["rewardPerTokenStored"]).to.be.equal(0);

              const data = await staking.data();
              expect(data["depositedTokens"]).to.be.equal(getBigNumber(200));
              expect(data["depositedLiquidity"]).to.be.equal(getBigNumber(20));
              expect(data["totalRewardsClaimed"]).to.be.equal(0);

              expect(await synapseToken.balanceOf(staking.address)).to.be.equal(getBigNumber(210));
              expect(await lpToken.balanceOf(staking.address)).to.be.equal(getBigNumber(20));
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
