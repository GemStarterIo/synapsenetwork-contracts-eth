import { waffle } from "hardhat";
import { expect } from "chai";

import CrossSaleDataArtifacts from "../../artifacts/contracts/crosssale/CrossSaleData.sol/CrossSaleData.json";

import { CrossSaleData } from "../../typechain";
import { Wallet } from "ethers";
import { USD_AMOUNT_COMMUNITY_BSC } from "../utilities";

const { provider, deployContract } = waffle;

describe("Cross Sale Data", () => {
  const [deployer, alice] = provider.getWallets() as Wallet[];
  const [user1, user2, user3, user4, user5, user6] = provider.getWallets() as Wallet[];

  let crossSaleData: CrossSaleData;

  beforeEach(async () => {
    crossSaleData = (await deployContract(deployer, CrossSaleDataArtifacts, [])) as CrossSaleData;
  });

  describe("initialization", () => {
    it("should initialize as expected", async function () {
      expect(await crossSaleData.owner()).to.be.equal(deployer.address);
    });
  });

  describe("onlyOwner", () => {
    it("should revert if restricted function's caller is not owner", async () => {
      await expect(crossSaleData.connect(alice).addUser(alice.address, 2500000)).to.be.revertedWith("caller is not the owner");
      await expect(crossSaleData.connect(alice).massAddUsers([alice.address], [2500000])).to.be.revertedWith("caller is not the owner");
    });
  });

  describe("massAddUsers", () => {
    it("should correctly add users in bulk", async () => {
      await crossSaleData.massAddUsers(
        [user1.address, user2.address, user3.address, user4.address, user5.address, user6.address],
        USD_AMOUNT_COMMUNITY_BSC
      );

      expect(await crossSaleData.balanceOf(user1.address)).to.be.equal(25000);
      expect(await crossSaleData.balanceOf(user2.address)).to.be.equal(50000);
      expect(await crossSaleData.balanceOf(user3.address)).to.be.equal(50000);
      expect(await crossSaleData.balanceOf(user4.address)).to.be.equal(100000);
      expect(await crossSaleData.balanceOf(user5.address)).to.be.equal(250000);
      expect(await crossSaleData.balanceOf(user6.address)).to.be.equal(25000);
    });

    it("should revert with data mismatch ", async () => {
      await expect(
        crossSaleData.massAddUsers([user1.address, user2.address, user3.address, user4.address, user5.address], USD_AMOUNT_COMMUNITY_BSC)
      ).to.be.revertedWith("Data size mismatch");
    });
  });

  describe("AddUsers", () => {
    it("should correctly add single user", async () => {
      await crossSaleData.addUser(user1.address, 250000);
      await crossSaleData.addUser(user2.address, 550000);

      expect(await crossSaleData.balanceOf(user1.address)).to.be.equal(250000);
      expect(await crossSaleData.balanceOf(user2.address)).to.be.equal(550000);
    });

    it("should change user balance when overridden", async () => {
      await crossSaleData.addUser(user1.address, 250000);

      expect(await crossSaleData.balanceOf(user1.address)).to.be.equal(250000);

      await crossSaleData.addUser(user1.address, 550000);

      expect(await crossSaleData.balanceOf(user1.address)).to.be.equal(550000);
    });
  });
});
