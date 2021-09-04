import { waffle } from "hardhat";
import { expect } from "chai";
import { Wallet, BigNumber, constants } from "ethers";

import SynapseNetworkTokenArtifacts from "../../artifacts/contracts/SynapseNetwork.sol/SynapseNetwork.json";
import { SynapseNetwork } from "../../typechain";
import { getBigNumber, advanceTimeAndBlock } from "../utilities";

const { provider, deployContract } = waffle;
const { MaxUint256 } = constants;

describe("Synapse Network ERC20", () => {
  const [deployer, alice, bob, staking] = provider.getWallets() as Wallet[];

  let synapseToken: SynapseNetwork;

  const FIVE_HUNDRED_MILLION_TOKENS: BigNumber = getBigNumber(500_000_000);
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const one_hundred = getBigNumber(100);

  async function makeSUT() {
    return (await deployContract(deployer, SynapseNetworkTokenArtifacts, [deployer.address])) as SynapseNetwork;
  }

  beforeEach(async () => {
    synapseToken = await makeSUT();
    await advanceTimeAndBlock(3 * 24 * 3600 + 30 * 60);
    await synapseToken.setRestrictionActive(false);
  });

  it("should initialize as expected", async function () {
    expect(await synapseToken.name()).to.be.equal("Synapse Network");
    expect(await synapseToken.symbol()).to.be.equal("SNP");
    expect(await synapseToken.decimals()).to.be.equal(18);
    expect(await synapseToken.totalSupply()).to.be.equal(FIVE_HUNDRED_MILLION_TOKENS);
  });

  it("should distribute tokens correctly", async function () {
    expect(await synapseToken.balanceOf(deployer.address)).to.be.equal(FIVE_HUNDRED_MILLION_TOKENS);
  });

  describe("balanceOf", () => {
    it("should correctly return user balance", async function () {
      await synapseToken.transfer(alice.address, 1007);

      expect(await synapseToken.balanceOf(alice.address)).to.be.equal(1007);
      expect(await synapseToken.balanceOf(deployer.address)).to.be.equal(FIVE_HUNDRED_MILLION_TOKENS.sub(1007));
    });
  });

  describe("transfer", () => {
    it("should revert if transfer to the zero address", async function () {
      await expect(synapseToken.transfer(ZERO_ADDRESS, getBigNumber(200))).to.be.revertedWith("ERC20: transfer to the zero address");
    });

    it("should revert if transfer amount exceeds balance", async function () {
      await expect(synapseToken.connect(alice).transfer(alice.address, 1007)).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });

    it("should revert if amount is 0", async function () {
      await expect(synapseToken.transfer(alice.address, 0)).to.be.revertedWith("Transfer amount is 0");
    });

    it("should transfer correctly with emit events", async function () {
      await expect(synapseToken.transfer(alice.address, getBigNumber(200)))
        .to.emit(synapseToken, "Transfer")
        .withArgs(deployer.address, alice.address, getBigNumber(200));
    });
  });

  describe("transferFrom", () => {
    it("should revert when amount exceeds allowance", async function () {
      await synapseToken.transfer(alice.address, getBigNumber(200));
      await synapseToken.connect(alice).approve(bob.address, getBigNumber(100));

      await expect(synapseToken.connect(bob).transferFrom(alice.address, bob.address, getBigNumber(150))).to.be.revertedWith(
        "ERC20: transfer amount exceeds allowance"
      );
    });

    it("should not decrease allowance after transferFrom when allowance set to MaxUint256", async function () {
      await synapseToken.approve(alice.address, MaxUint256);
      await synapseToken.connect(alice).transferFrom(deployer.address, alice.address, one_hundred);

      expect(await synapseToken.allowance(deployer.address, alice.address)).to.be.equal(MaxUint256);
    });

    it("should decrease allowance after transferFrom when allowance not set to MaxUint256", async function () {
      await synapseToken.approve(alice.address, MaxUint256.sub(1));
      await synapseToken.connect(alice).transferFrom(deployer.address, alice.address, one_hundred);

      expect(await synapseToken.allowance(deployer.address, alice.address)).to.be.equal(MaxUint256.sub(1).sub(one_hundred));
    });

    it("should correctly transferFrom and emit events", async function () {
      await synapseToken.transfer(alice.address, getBigNumber(200));
      await synapseToken.connect(alice).approve(staking.address, getBigNumber(200));

      await expect(synapseToken.connect(staking).transferFrom(alice.address, staking.address, getBigNumber(100)))
        .to.emit(synapseToken, "Transfer")
        .withArgs(alice.address, staking.address, getBigNumber(100))
        .and.to.emit(synapseToken, "Approval")
        .withArgs(alice.address, staking.address, getBigNumber(100));

      expect(await synapseToken.balanceOf(alice.address)).to.be.equal(getBigNumber(100));

      await expect(synapseToken.connect(staking).transferFrom(alice.address, bob.address, getBigNumber(50)))
        .to.emit(synapseToken, "Transfer")
        .withArgs(alice.address, bob.address, getBigNumber(50))
        .and.to.emit(synapseToken, "Approval")
        .withArgs(alice.address, staking.address, getBigNumber(50));

      expect(await synapseToken.balanceOf(alice.address)).to.be.equal(getBigNumber(50));
    });
  });

  describe("approve", () => {
    it("should revert when approve to the zero address", async function () {
      await expect(synapseToken.approve(ZERO_ADDRESS, getBigNumber(200))).to.be.revertedWith("ERC20: approve to the zero address");
    });

    it("should correctly update allowance", async function () {
      await expect(synapseToken.connect(alice).approve(staking.address, getBigNumber(100)))
        .to.emit(synapseToken, "Approval")
        .withArgs(alice.address, staking.address, getBigNumber(100));
      expect(await synapseToken.allowance(alice.address, staking.address)).to.be.equal(getBigNumber(100));

      await expect(synapseToken.connect(alice).approve(staking.address, getBigNumber(40)))
        .to.emit(synapseToken, "Approval")
        .withArgs(alice.address, staking.address, getBigNumber(40));
      expect(await synapseToken.allowance(alice.address, staking.address)).to.be.equal(getBigNumber(40));
    });
  });

  describe("increaseAllowance", () => {
    it("should correctly increase allowance", async function () {
      await synapseToken.connect(alice).approve(staking.address, getBigNumber(100));
      await synapseToken.connect(alice).increaseAllowance(staking.address, getBigNumber(40));

      expect(await synapseToken.allowance(alice.address, staking.address)).to.be.equal(getBigNumber(140));
    });
  });

  describe("decreaseAllowance", () => {
    it("should revert if amount to decrease is greater than allowance", async function () {
      await synapseToken.connect(alice).approve(staking.address, getBigNumber(100));

      await expect(synapseToken.connect(alice).decreaseAllowance(staking.address, getBigNumber(110))).to.be.revertedWith(
        "ERC20: decreased allowance below zero"
      );
    });

    it("should correctly decrease allowance", async function () {
      await synapseToken.connect(alice).approve(staking.address, getBigNumber(100));
      await synapseToken.connect(alice).decreaseAllowance(staking.address, getBigNumber(40));

      expect(await synapseToken.allowance(alice.address, staking.address)).to.be.equal(getBigNumber(60));
    });
  });
});
