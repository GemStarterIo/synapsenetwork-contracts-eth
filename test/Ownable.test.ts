import { waffle } from "hardhat";
import { expect } from "chai";

import OwnableMockArtifacts from "../artifacts/contracts/mocks/OwnableMock.sol/OwnableMock.json";

import { OwnableMock } from "../typechain";
import { Wallet } from "ethers";

const { provider, deployContract } = waffle;

describe("Ownable", () => {
  const [deployer, alice] = provider.getWallets() as Wallet[];

  let ownable: OwnableMock;

  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

  beforeEach(async () => {
    ownable = (await deployContract(deployer, OwnableMockArtifacts, [])) as OwnableMock;
  });

  describe("initialization", () => {
    it("should initialize as expected", async function () {
      expect(await ownable.owner()).to.be.equal(deployer.address);
      expect(await ownable.pendingOwner()).to.be.equal(ZERO_ADDRESS);
    });
  });

  describe("onlyOwner", () => {
    it("should revert when onlyOwner function not executed by the owner", async function () {
      await expect(ownable.connect(alice).transferOwnership(alice.address, true)).to.be.revertedWith("caller is not the owner");
    });
  });

  describe("transferOwnership", () => {
    it("should revert when transfer directly to zero address", async function () {
      await expect(ownable.transferOwnership(ZERO_ADDRESS, true)).to.be.revertedWith("zero address");
    });

    it("should transfer ownership directly", async function () {
      await expect(ownable.transferOwnership(alice.address, true))
        .to.emit(ownable, "OwnershipTransferred")
        .withArgs(deployer.address, alice.address);
      expect(await ownable.owner()).to.be.equal(alice.address);
    });

    it("should assign pending owner correctly", async function () {
      await ownable.transferOwnership(alice.address, false);
      expect(await ownable.owner()).to.be.equal(deployer.address);
      expect(await ownable.pendingOwner()).to.be.equal(alice.address);
    });
  });

  describe("claimOwnership", () => {
    it("should revert when claimed by not the pending owner", async function () {
      await expect(ownable.connect(alice).claimOwnership()).to.be.revertedWith("caller != pending owner");
    });

    it("should claim pending ownership correctly", async function () {
      await ownable.transferOwnership(alice.address, false);
      await expect(ownable.connect(alice).claimOwnership()).to.emit(ownable, "OwnershipTransferred").withArgs(deployer.address, alice.address);
    });
  });
});
