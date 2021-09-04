import { waffle } from "hardhat";
import { expect } from "chai";
import { Wallet } from "ethers";

import SynapseNetworkTokenArtifacts from "../../artifacts/contracts/SynapseNetwork.sol/SynapseNetwork.json";

import { SynapseNetwork } from "../../typechain";
import { getBigNumber, advanceTimeAndBlock } from "../utilities";

const { provider, deployContract } = waffle;

describe("Synapse Network Fee", () => {
  const [deployer, alice, bob, fee] = provider.getWallets() as Wallet[];

  let synapseToken: SynapseNetwork;

  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const one_hundred = getBigNumber(100);

  async function makeSUT() {
    return (await deployContract(deployer, SynapseNetworkTokenArtifacts, [deployer.address])) as SynapseNetwork;
  }

  beforeEach(async () => {
    synapseToken = await makeSUT();
    await synapseToken.changeFeeContract(fee.address);
    await synapseToken.setExcludedFromFees(fee.address, true);
    await advanceTimeAndBlock(3 * 24 * 3600 + 30 * 60);
    await synapseToken.setRestrictionActive(false);
  });

  describe("onlyOwner", () => {
    it("should revert if restricted function's caller is not owner", async () => {
      await expect(synapseToken.connect(alice).setExcludedFromFees(alice.address, true)).to.be.revertedWith("caller is not the owner");
      await expect(synapseToken.connect(alice).setTransferFeeBasisPoints(50)).to.be.revertedWith("caller is not the owner");
      await expect(synapseToken.connect(alice).changeFeeContract(alice.address)).to.be.revertedWith("caller is not the owner");
    });
  });

  describe("isExcludedFromFees", () => {
    it("should exclude only deployer address from fees when deployed", async function () {
      const _synapseToken: SynapseNetwork = await makeSUT();

      expect(await _synapseToken.isExcludedFromFees(deployer.address)).to.be.equal(true);
      expect(await _synapseToken.isExcludedFromFees(fee.address)).to.be.equal(false);
    });
  });

  describe("setExcludedFromFees", () => {
    it("should revert if address zero is passed as account argument", async function () {
      await expect(synapseToken.setExcludedFromFees(ZERO_ADDRESS, true)).to.be.revertedWith("Zero address");
      await expect(synapseToken.setExcludedFromFees(ZERO_ADDRESS, false)).to.be.revertedWith("Zero address");
    });

    it("should exclude and include address from fees and emit events", async function () {
      expect(await synapseToken.isExcludedFromFees(alice.address)).to.be.equal(false);

      await expect(synapseToken.connect(deployer).setExcludedFromFees(alice.address, true))
        .to.emit(synapseToken, "MarkedExcluded")
        .withArgs(alice.address, true);

      expect(await synapseToken.isExcludedFromFees(alice.address)).to.be.equal(true);

      await expect(synapseToken.connect(deployer).setExcludedFromFees(alice.address, false))
        .to.emit(synapseToken, "MarkedExcluded")
        .withArgs(alice.address, false);

      expect(await synapseToken.isExcludedFromFees(alice.address)).to.be.equal(false);
    });
  });

  describe("transfer without fee", () => {
    it("it should transfer without fee from address that is excluded", async function () {
      await expect(synapseToken.transfer(alice.address, one_hundred))
        .to.emit(synapseToken, "Transfer")
        .withArgs(deployer.address, alice.address, one_hundred);

      expect(await synapseToken.balanceOf(fee.address)).to.be.equal(0);
      expect(await synapseToken.balanceOf(alice.address)).to.be.equal(one_hundred);
      expect(await synapseToken.balanceOf(deployer.address)).to.be.equal(getBigNumber(499999900));
    });

    it("it should transfer without fee to address that is excluded", async function () {
      await synapseToken.transfer(alice.address, one_hundred);
      await synapseToken.connect(deployer).setExcludedFromFees(bob.address, true);

      await expect(synapseToken.connect(alice).transfer(bob.address, one_hundred))
        .to.emit(synapseToken, "Transfer")
        .withArgs(alice.address, bob.address, one_hundred);

      expect(await synapseToken.balanceOf(fee.address)).to.be.equal(0);
      expect(await synapseToken.balanceOf(alice.address)).to.be.equal(0);
      expect(await synapseToken.balanceOf(bob.address)).to.be.equal(one_hundred);
    });

    it("it should transfer without fee when both addresses are excluded", async function () {
      await expect(synapseToken.transfer(fee.address, one_hundred))
        .to.emit(synapseToken, "Transfer")
        .withArgs(deployer.address, fee.address, one_hundred);

      expect(await synapseToken.balanceOf(fee.address)).to.be.equal(one_hundred);
      expect(await synapseToken.balanceOf(deployer.address)).to.be.equal(getBigNumber(499999900));
    });

    it("it should transfer without fee when fee is set to 0", async function () {
      await synapseToken.connect(deployer).setTransferFeeBasisPoints(0);
      await synapseToken.transfer(alice.address, one_hundred);

      await expect(synapseToken.connect(alice).transfer(bob.address, one_hundred))
        .to.emit(synapseToken, "Transfer")
        .withArgs(alice.address, bob.address, one_hundred);

      expect(await synapseToken.balanceOf(fee.address)).to.be.equal(0);
      expect(await synapseToken.balanceOf(alice.address)).to.be.equal(0);
      expect(await synapseToken.balanceOf(bob.address)).to.be.equal(one_hundred);
    });

    it("it should transfer without fee if feeContract is zero address", async function () {
      const _synapseToken: SynapseNetwork = await makeSUT();
      await advanceTimeAndBlock(3 * 24 * 3600 + 30 * 60);
      await _synapseToken.setRestrictionActive(false);
      await _synapseToken.transfer(alice.address, one_hundred);

      await expect(_synapseToken.connect(alice).transfer(bob.address, one_hundred))
        .to.emit(_synapseToken, "Transfer")
        .withArgs(alice.address, bob.address, one_hundred);

      expect(await _synapseToken.balanceOf(fee.address)).to.be.equal(0);
      expect(await _synapseToken.balanceOf(alice.address)).to.be.equal(0);
      expect(await _synapseToken.balanceOf(bob.address)).to.be.equal(one_hundred);
    });
  });

  describe("transferFrom without fee", () => {
    it("it should transferFrom without fee from address that is excluded", async function () {
      await synapseToken.approve(alice.address, one_hundred);

      await expect(synapseToken.connect(alice).transferFrom(deployer.address, bob.address, one_hundred))
        .to.emit(synapseToken, "Transfer")
        .withArgs(deployer.address, bob.address, one_hundred);

      expect(await synapseToken.balanceOf(fee.address)).to.be.equal(0);
      expect(await synapseToken.balanceOf(bob.address)).to.be.equal(one_hundred);
      expect(await synapseToken.balanceOf(deployer.address)).to.be.equal(getBigNumber(499999900));
    });
  });

  describe("transfer with fee", () => {
    it("it should transfer with fee when address is not excluded", async function () {
      await synapseToken.setExcludedFromFees(deployer.address, false);

      await expect(synapseToken.transfer(alice.address, one_hundred))
        .to.emit(synapseToken, "Transfer")
        .withArgs(deployer.address, alice.address, getBigNumber(995, 17))
        .and.to.emit(synapseToken, "Transfer")
        .withArgs(deployer.address, fee.address, getBigNumber(5, 17));

      expect(await synapseToken.balanceOf(alice.address)).to.be.equal(getBigNumber(995, 17));
      expect(await synapseToken.balanceOf(fee.address)).to.be.equal(getBigNumber(5, 17));
      expect(await synapseToken.balanceOf(deployer.address)).to.be.equal(getBigNumber(499999900));

      await expect(synapseToken.transfer(bob.address, getBigNumber(200)))
        .to.emit(synapseToken, "Transfer")
        .withArgs(deployer.address, bob.address, getBigNumber(199))
        .and.to.emit(synapseToken, "Transfer")
        .withArgs(deployer.address, fee.address, getBigNumber(1));

      expect(await synapseToken.balanceOf(bob.address)).to.be.equal(getBigNumber(199));
      expect(await synapseToken.balanceOf(fee.address)).to.be.equal(getBigNumber(15, 17));
      expect(await synapseToken.balanceOf(deployer.address)).to.be.equal(getBigNumber(499999700));
    });
  });

  describe("setTransferFeeBasisPoints", () => {
    it("it should revert when new fee exceed a limit", async function () {
      await expect(synapseToken.setTransferFeeBasisPoints(1002)).to.be.revertedWith("Fee is outside of range 0-1000");
    });

    it("it should correctly change the fee basis points", async function () {
      await expect(synapseToken.setTransferFeeBasisPoints(100)).to.emit(synapseToken, "FeeBasisPoints").withArgs(100);
    });

    it("it should use new fee correctly on fee-on-transfer transaction", async function () {
      await synapseToken.setTransferFeeBasisPoints(70);
      await synapseToken.setExcludedFromFees(deployer.address, false);

      await expect(synapseToken.transfer(alice.address, one_hundred))
        .to.emit(synapseToken, "Transfer")
        .withArgs(deployer.address, alice.address, getBigNumber(993, 17))
        .and.to.emit(synapseToken, "Transfer")
        .withArgs(deployer.address, fee.address, getBigNumber(7, 17));
    });
  });

  describe("changeFeeContract", () => {
    it("it should correctly change the fee contract address", async function () {
      await synapseToken.setExcludedFromFees(deployer.address, false);

      await expect(synapseToken.changeFeeContract(alice.address)).to.emit(synapseToken, "FeeContractChanged").withArgs(alice.address);
      expect(await synapseToken.feeContract()).to.be.equal(alice.address);

      await expect(synapseToken.transfer(bob.address, one_hundred))
        .to.emit(synapseToken, "Transfer")
        .withArgs(deployer.address, bob.address, getBigNumber(995, 17))
        .and.to.emit(synapseToken, "Transfer")
        .withArgs(deployer.address, alice.address, getBigNumber(5, 17));
    });
  });
});
