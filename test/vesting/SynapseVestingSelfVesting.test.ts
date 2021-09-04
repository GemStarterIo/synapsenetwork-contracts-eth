import { waffle } from "hardhat";
import { expect } from "chai";

import SynapseVestingArtifacts from "../../artifacts/contracts/SynapseVesting.sol/SynapseVesting.json";
import SynapseNetworkArtifacts from "../../artifacts/contracts/SynapseNetwork.sol/SynapseNetwork.json";
import CrossSaleDataArtifacts from "../../artifacts/contracts/crosssale/CrossSaleData.sol/CrossSaleData.json";

import { SynapseVesting, SynapseNetwork, CrossSaleData } from "../../typechain";
import { Wallet, BigNumber } from "ethers";
import { getBigNumber, latest, duration, advanceTimeAndBlock } from "../utilities";
import {
  USD_AMOUNT_SEED,
  USD_AMOUNT_PRIVATE_A,
  USD_AMOUNT_PRIVATE_B,
  USD_AMOUNT_COMMUNITY_ETH,
  USD_AMOUNT_COMMUNITY_BSC,
  USD_AMOUNT_COMMUNITY_POLYGON,
  USD_AMOUNT_PUBLIC,
} from "../utilities";

const { provider, deployContract } = waffle;

describe("Synapse Vesting Self Vesting", () => {
  const [deployer, alice] = provider.getWallets() as Wallet[];
  const [user1, user2, user3, user4, user5, user6, user7, user8] = provider.getWallets() as Wallet[];

  let synapseVesting: SynapseVesting;
  let synapseToken: SynapseNetwork;
  const crossSaleData: CrossSaleData[] = [];

  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

  let start: BigNumber;

  beforeEach(async () => {
    synapseToken = (await deployContract(deployer, SynapseNetworkArtifacts, [deployer.address])) as SynapseNetwork;
    await advanceTimeAndBlock(3 * 24 * 3600 + 30 * 60);
    await synapseToken.setRestrictionActive(false);
    synapseVesting = (await deployContract(deployer, SynapseVestingArtifacts, [])) as SynapseVesting;
    await synapseVesting.init(synapseToken.address);
  });

  describe("onlyOwner", () => {
    it("should revert if restricted function's caller is not owner", async () => {
      await expect(synapseVesting.connect(alice).addSaleContract([], 1, 1, 1, 1, 2)).to.be.revertedWith("caller is not the owner");
      await expect(synapseVesting.connect(alice).setRefunded(alice.address, true)).to.be.revertedWith("caller is not the owner");
      await expect(synapseVesting.connect(alice).massSetRefunded([alice.address])).to.be.revertedWith("caller is not the owner");
    });
  });

  describe("whenNotLocked", () => {
    it("should revert if function is locked", async () => {
      await synapseVesting.lock();
      await expect(synapseVesting.addSaleContract([], 1, 1, 1, 1, 2)).to.be.revertedWith("Lockable: locked");
      await expect(synapseVesting.setRefunded(alice.address, true)).to.be.revertedWith("Lockable: locked");
      await expect(synapseVesting.massSetRefunded([alice.address])).to.be.revertedWith("Lockable: locked");
    });
  });

  describe("Self vesting", () => {
    beforeEach(async () => {
      crossSaleData[0] = (await deployContract(deployer, CrossSaleDataArtifacts, [])) as CrossSaleData; // Seed
      crossSaleData[1] = (await deployContract(deployer, CrossSaleDataArtifacts, [])) as CrossSaleData; // Private A
      crossSaleData[2] = (await deployContract(deployer, CrossSaleDataArtifacts, [])) as CrossSaleData; // Private B
      crossSaleData[3] = (await deployContract(deployer, CrossSaleDataArtifacts, [])) as CrossSaleData; // Community ETH
      crossSaleData[4] = (await deployContract(deployer, CrossSaleDataArtifacts, [])) as CrossSaleData; // Community BSC
      crossSaleData[5] = (await deployContract(deployer, CrossSaleDataArtifacts, [])) as CrossSaleData; // Community Polygon
      crossSaleData[6] = (await deployContract(deployer, CrossSaleDataArtifacts, [])) as CrossSaleData; // Public
      crossSaleData[7] = (await deployContract(deployer, CrossSaleDataArtifacts, [])) as CrossSaleData;

      await crossSaleData[0].massAddUsers([user1.address, user2.address, user3.address, user4.address, user5.address], USD_AMOUNT_SEED);
      await crossSaleData[1].massAddUsers([user1.address, user2.address, user3.address, user4.address, user5.address], USD_AMOUNT_PRIVATE_A);
      await crossSaleData[2].massAddUsers([user1.address, user2.address, user3.address], USD_AMOUNT_PRIVATE_B);
      await crossSaleData[3].massAddUsers(
        [user1.address, user2.address, user3.address, user4.address, user5.address, user6.address],
        USD_AMOUNT_COMMUNITY_ETH
      );
      await crossSaleData[4].massAddUsers(
        [user1.address, user2.address, user3.address, user4.address, user5.address, user6.address],
        USD_AMOUNT_COMMUNITY_BSC
      );
      await crossSaleData[5].massAddUsers([user1.address, user2.address, user3.address], USD_AMOUNT_COMMUNITY_POLYGON);
      await crossSaleData[6].massAddUsers([user1.address, user2.address, user3.address, user4.address, user5.address], USD_AMOUNT_PUBLIC);
      await crossSaleData[7].massAddUsers([user2.address], [25000]);

      start = await latest();
    });

    describe("getSaleContracts & getSaleContractsCount & getSaleContractByIndex", () => {
      beforeEach(async () => {
        await synapseVesting.addSaleContract([crossSaleData[0].address], getBigNumber(4, 17), 25000, 4, start, start.add(duration.weeks(48)));
        await synapseVesting.addSaleContract([crossSaleData[0].address], getBigNumber(4, 17), 25000, 4, start, start.add(duration.weeks(48)));
        await synapseVesting.addSaleContract([crossSaleData[0].address], getBigNumber(4, 17), 25000, 4, start, start.add(duration.weeks(48)));
        await synapseVesting.addSaleContract([crossSaleData[0].address], getBigNumber(4, 17), 25000, 4, start, start.add(duration.weeks(48)));
      });

      describe("getSaleContracts", () => {
        it("it should return correct number of vestings", async function () {
          const array: unknown[] = await synapseVesting.getSaleContracts();
          expect(array).to.be.lengthOf(4);
        });

        it("it should return 0 if no sale contracts", async function () {
          const _synapseVesting = (await deployContract(deployer, SynapseVestingArtifacts, [])) as SynapseVesting;
          const array: unknown[] = await _synapseVesting.getSaleContracts();
          expect(array).to.be.lengthOf(0);
        });
      });

      describe("getSaleContractsCount", () => {
        it("should return number of sale contracts", async function () {
          const number = await synapseVesting.getSaleContractsCount();
          expect(number).to.be.equal(4);
        });
      });

      describe("getSaleContractByIndex", () => {
        it("should revert if outside of range", async function () {
          await expect(synapseVesting.getSaleContractByIndex(5)).to.be.reverted;
        });

        it("should correctly return sale contract by index", async function () {
          expect(await synapseVesting.getSaleContractByIndex(3)).to.exist;
        });
      });
    });

    describe("addSaleContract", () => {
      it("it should revert if contract addresses data is missing", async function () {
        await expect(synapseVesting.addSaleContract([], getBigNumber(4, 17), 25000, 4, start, start.add(duration.weeks(48)))).to.be.revertedWith(
          "data is missing"
        );
      });

      it("should revert if endDate is before startDate", async function () {
        await expect(
          synapseVesting.addSaleContract([crossSaleData[0].address], getBigNumber(4, 17), 25000, 4, start.add(duration.days(2)), start)
        ).to.be.revertedWith("startDate cannot exceed endDate");
      });

      it("it should add sale contract correctly with single sale address", async function () {
        await synapseVesting.addSaleContract([crossSaleData[0].address], getBigNumber(4, 17), 25000, 4, start, start.add(duration.weeks(48)));

        const saleContractData = await synapseVesting.getSaleContractByIndex(0);
        expect(saleContractData["contractAddresses"]).to.be.lengthOf(1);
        expect(saleContractData["tokensPerCent"]).to.be.equal("400000000000000000");
        expect(saleContractData["maxAmount"]).to.be.equal(25000);
        expect(saleContractData["percentOnStart"]).to.be.equal(4);
      });

      it("it should add sale contract correctly with multi sale address", async function () {
        await synapseVesting.addSaleContract(
          [crossSaleData[3].address, crossSaleData[4].address, crossSaleData[5].address],
          getBigNumber(125, 15),
          366600,
          10,
          start,
          start.add(duration.weeks(18))
        );

        const saleContractData = await synapseVesting.getSaleContractByIndex(0);
        expect(saleContractData["contractAddresses"]).to.be.lengthOf(3);
        expect(saleContractData["tokensPerCent"]).to.be.equal("125000000000000000");
        expect(saleContractData["maxAmount"]).to.be.equal(366600);
        expect(saleContractData["percentOnStart"]).to.be.equal(10);
      });
    });

    describe("addVesting", () => {
      it("it should revert when vesting adding already done", async function () {
        await synapseVesting.addSaleContract([crossSaleData[0].address], getBigNumber(4, 17), 25000, 4, start, start.add(duration.weeks(48)));
        await expect(synapseVesting.addVesting(user1.address))
          .to.emit(synapseVesting, "Vested")
          .withArgs(user1.address, getBigNumber(10000), start.add(duration.weeks(48)));

        await expect(synapseVesting.addVesting(user1.address)).to.be.revertedWith("Already done");
      });

      it("it should revert when vesting adding already done without any vesting added", async function () {
        expect(await synapseVesting.vestingAdded(user1.address)).to.be.equal(false);
        await expect(synapseVesting.addVesting(user1.address)).to.not.emit(synapseVesting, "Vested");
        expect(await synapseVesting.vestingAdded(user1.address)).to.be.equal(true);
        await expect(synapseVesting.addVesting(user1.address)).to.be.revertedWith("Already done");
      });

      it("should revert if user address is 0", async function () {
        await expect(synapseVesting.addVesting(ZERO_ADDRESS)).to.be.revertedWith("User address cannot be 0");
      });

      it("it should revert when adding vesting for refunded user", async function () {
        await synapseVesting.setRefunded(user1.address, true);
        await expect(synapseVesting.addVesting(user1.address)).to.be.revertedWith("User refunded");
      });

      it("it should add vesting correctly for selected user", async function () {
        await synapseVesting.addSaleContract([crossSaleData[0].address], getBigNumber(4, 17), 25000, 4, start, start.add(duration.weeks(48)));
        await synapseVesting.addSaleContract([crossSaleData[1].address], getBigNumber(2, 17), 50000, 8, start, start.add(duration.weeks(46)));

        expect(await synapseVesting.vestingAdded(user1.address)).to.be.equal(false);

        await expect(synapseVesting.addVesting(user1.address))
          .to.emit(synapseVesting, "Vested")
          .withArgs(user1.address, getBigNumber(10000), start.add(duration.weeks(48)))
          .and.to.emit(synapseVesting, "Vested")
          .withArgs(user1.address, getBigNumber(10000), start.add(duration.weeks(46)));

        expect(await synapseVesting.vestingAdded(user1.address)).to.be.equal(true);
      });
    });

    describe("addMyVesting", () => {
      it("it should revert when vesting adding already done", async function () {
        await synapseVesting.addSaleContract([crossSaleData[0].address], getBigNumber(4, 17), 25000, 4, start, start.add(duration.weeks(48)));
        await expect(synapseVesting.connect(user1).addMyVesting())
          .to.emit(synapseVesting, "Vested")
          .withArgs(user1.address, getBigNumber(10000), start.add(duration.weeks(48)));

        await expect(synapseVesting.connect(user1).addMyVesting()).to.be.revertedWith("Already done");
      });

      it("it should revert when vesting adding already done without any vesting added", async function () {
        expect(await synapseVesting.vestingAdded(user1.address)).to.be.equal(false);
        await expect(synapseVesting.connect(user1).addMyVesting()).to.not.emit(synapseVesting, "Vested");
        expect(await synapseVesting.vestingAdded(user1.address)).to.be.equal(true);
        await expect(synapseVesting.connect(user1).addMyVesting()).to.be.revertedWith("Already done");
      });

      it("it should revert when adding vesting for refunded user", async function () {
        await synapseVesting.setRefunded(user1.address, true);
        await expect(synapseVesting.connect(user1).addMyVesting()).to.be.revertedWith("User refunded");
      });

      it("user should have 0 claimable amount when he did not participate in the sales", async function () {
        await synapseVesting.addSaleContract([crossSaleData[0].address], getBigNumber(4, 17), 25000, 4, start, start.add(duration.weeks(48)));
        await synapseVesting.addSaleContract([crossSaleData[1].address], getBigNumber(2, 17), 50000, 8, start, start.add(duration.weeks(46)));

        expect(await synapseVesting.vestingAdded(user6.address)).to.be.equal(false);

        await synapseVesting.connect(user6).addMyVesting();

        expect(await synapseVesting.vestingAdded(user6.address)).to.be.equal(true);
        expect(await synapseVesting.getAllClaimable(user6.address)).to.be.equal(0);
      });

      it("it should add vesting correctly for msg.sender for single address sales", async function () {
        await synapseVesting.addSaleContract([crossSaleData[0].address], getBigNumber(4, 17), 25000, 4, start, start.add(duration.weeks(48)));
        await synapseVesting.addSaleContract([crossSaleData[1].address], getBigNumber(2, 17), 50000, 8, start, start.add(duration.weeks(46)));

        expect(await synapseVesting.vestingAdded(user1.address)).to.be.equal(false);

        await expect(synapseVesting.connect(user1).addMyVesting())
          .to.emit(synapseVesting, "Vested")
          .withArgs(user1.address, getBigNumber(10000), start.add(duration.weeks(48)))
          .and.to.emit(synapseVesting, "Vested")
          .withArgs(user1.address, getBigNumber(10000), start.add(duration.weeks(46)));

        expect(await synapseVesting.vestingAdded(user1.address)).to.be.equal(true);
      });

      it("it should add vesting correctly for msg.sender for multi address sales", async function () {
        await synapseVesting.addSaleContract(
          [crossSaleData[3].address, crossSaleData[4].address, crossSaleData[5].address],
          getBigNumber(125, 15),
          366600,
          10,
          start.add(2),
          start.add(duration.weeks(18).add(2))
        );

        expect(await synapseVesting.vestingAdded(user1.address)).to.be.equal(false);

        await expect(synapseVesting.connect(user1).addMyVesting())
          .to.emit(synapseVesting, "Vested")
          .withArgs(user1.address, getBigNumber(9375), start.add(duration.weeks(18)).add(2));

        expect(await synapseVesting.vestingAdded(user1.address)).to.be.equal(true);
        expect(await synapseVesting.getAllClaimable(user1.address)).to.be.equal(getBigNumber(9375, 17));

        const saleContractData = await synapseVesting.getVestings(user1.address);
        expect(saleContractData[0]["startTokens"]).to.be.equal(getBigNumber(9375, 17));
      });

      it("it should add vesting correctly for msg.sender when max over allocation has been exceeded", async function () {
        await synapseVesting.addSaleContract(
          [crossSaleData[6].address],
          BigNumber.from("11764705882352941"),
          50000,
          50,
          start.add(2),
          start.add(duration.weeks(5)).add(2)
        );

        expect(await synapseVesting.vestingAdded(user5.address)).to.be.equal(false);

        await expect(synapseVesting.connect(user5).addMyVesting())
          .to.emit(synapseVesting, "Vested")
          .withArgs(user5.address, BigNumber.from("588235294117647050000"), start.add(duration.weeks(5)).add(2));

        expect(await synapseVesting.vestingAdded(user5.address)).to.be.equal(true);
        expect(await synapseVesting.getAllClaimable(user5.address)).to.be.equal(BigNumber.from("294117647058823525000"));

        const saleContractData = await synapseVesting.getVestings(user5.address);
        expect(saleContractData[0]["startTokens"]).to.be.equal(BigNumber.from("294117647058823525000"));
      });

      it("it should add vesting correctly when sum of cross-chain investments exceeded max over allocation", async function () {
        await synapseVesting.addSaleContract(
          [crossSaleData[3].address, crossSaleData[4].address, crossSaleData[5].address],
          getBigNumber(125, 15),
          366600,
          10,
          start.add(2),
          start.add(duration.weeks(18).add(2))
        );

        expect(await synapseVesting.vestingAdded(user5.address)).to.be.equal(false);

        await expect(synapseVesting.connect(user5).addMyVesting())
          .to.emit(synapseVesting, "Vested")
          .withArgs(user5.address, getBigNumber(45825), start.add(duration.weeks(18)).add(2));

        expect(await synapseVesting.vestingAdded(user5.address)).to.be.equal(true);
        expect(await synapseVesting.getAllClaimable(user5.address)).to.be.equal(getBigNumber(45825, 17));

        const saleContractData = await synapseVesting.getVestings(user5.address);
        expect(saleContractData[0]["startTokens"]).to.be.equal(getBigNumber(45825, 17));
      });
    });

    describe("init and claim", () => {
      it("should revert if no vestings for user", async function () {
        await synapseVesting.addSaleContract(
          [crossSaleData[3].address, crossSaleData[4].address, crossSaleData[5].address],
          getBigNumber(125, 15),
          366600,
          10,
          start.add(2),
          start.add(duration.weeks(18).add(2))
        );

        await expect(synapseVesting.connect(user7).claim()).to.be.revertedWith("No vestings for user");
      });

      it("should revert when no manual vesting for refunded user", async function () {
        await synapseVesting.setRefunded(user2.address, true);
        await synapseVesting.addSaleContract(
          [crossSaleData[3].address, crossSaleData[4].address, crossSaleData[5].address],
          getBigNumber(125, 15),
          366600,
          10,
          start.add(2),
          start.add(duration.weeks(18).add(2))
        );

        await expect(synapseVesting.connect(user2).claim()).to.be.revertedWith("No vestings for user");
      });

      it("refunded user should claim his manual vesting and not be able to initialize public sale vestings", async function () {
        await synapseToken.transfer(synapseVesting.address, getBigNumber(550000));
        await synapseVesting.setRefunded(user2.address, true);
        await synapseVesting.massAddHolders(
          [user2.address],
          [getBigNumber(100)],
          [getBigNumber(1000)],
          start.add(5),
          start.add(duration.days(2))
        );

        await synapseVesting.addSaleContract(
          [crossSaleData[3].address, crossSaleData[4].address, crossSaleData[5].address],
          getBigNumber(125, 15),
          366600,
          10,
          start.add(4),
          start.add(duration.weeks(18).add(2))
        );

        await expect(synapseVesting.connect(user2).claim()).to.emit(synapseVesting, "Claimed").withArgs(user2.address, getBigNumber(100));
      });

      it("should revert if nothing to claim after init", async function () {
        await synapseVesting.massAddHolders(
          [user7.address],
          [getBigNumber(100)],
          [getBigNumber(1000)],
          start.add(10),
          start.add(duration.days(2))
        );

        await synapseVesting.addSaleContract(
          [crossSaleData[3].address, crossSaleData[4].address, crossSaleData[5].address],
          getBigNumber(125, 15),
          366600,
          10,
          start.add(2),
          start.add(duration.weeks(18).add(2))
        );

        await expect(synapseVesting.connect(user7).claim()).to.be.revertedWith("Nothing to claim");
      });

      it("should add user vestings before the claim if add vestings were not executed earlier", async function () {
        await synapseToken.transfer(synapseVesting.address, getBigNumber(550000));
        start = await latest();

        // 100 on start
        await synapseVesting.massAddHolders(
          [user1.address],
          [getBigNumber(100)],
          [getBigNumber(1000)],
          start.add(5),
          start.add(duration.days(2))
        );

        // 400 on start
        await synapseVesting.addSaleContract(
          [crossSaleData[0].address],
          getBigNumber(4, 17),
          25000,
          4,
          start.add(5),
          start.add(duration.weeks(48))
        );

        // 0 vesting
        await synapseVesting.addSaleContract(
          [crossSaleData[7].address],
          getBigNumber(4, 17),
          25000,
          4,
          start.add(5),
          start.add(duration.weeks(48))
        );

        // 800 on start
        await synapseVesting.addSaleContract(
          [crossSaleData[1].address],
          getBigNumber(2, 17),
          50000,
          8,
          start.add(5),
          start.add(duration.weeks(46))
        );

        expect(await synapseVesting.vestingAdded(user1.address)).to.be.equal(false);

        // start - can claim 1300 after init
        await expect(synapseVesting.connect(user1).claim())
          .to.emit(synapseVesting, "Vested")
          .withArgs(user1.address, getBigNumber(10000), start.add(duration.weeks(48)))
          .and.to.emit(synapseVesting, "Vested")
          .withArgs(user1.address, getBigNumber(10000), start.add(duration.weeks(46)))
          .and.to.emit(synapseVesting, "Claimed")
          .withArgs(user1.address, getBigNumber(1300));

        expect(await synapseVesting.vestingAdded(user1.address)).to.be.equal(true);
      });

      it("should mark user as self vested when claiming", async function () {
        await synapseToken.transfer(synapseVesting.address, getBigNumber(550000));

        // 100 on start
        await synapseVesting.massAddHolders(
          [user1.address],
          [getBigNumber(100)],
          [getBigNumber(1000)],
          start.add(2),
          start.add(duration.days(2))
        );

        expect(await synapseVesting.vestingAdded(user1.address)).to.be.equal(false);
        await synapseVesting.connect(user1).claim();
        expect(await synapseVesting.vestingAdded(user1.address)).to.be.equal(true);
      });
    });

    describe("getAllClaimable for self vesting", () => {
      it("should correctly return all claimable amount before user add vestings from sale contracts", async function () {
        // 100 on start
        await synapseVesting.massAddHolders(
          [user1.address, user7.address],
          [getBigNumber(100), getBigNumber(100)],
          [getBigNumber(1000), getBigNumber(1000)],
          start.add(3),
          start.add(duration.days(2))
        );

        // 400 on start
        await synapseVesting.addSaleContract(
          [crossSaleData[0].address],
          getBigNumber(4, 17),
          25000,
          4,
          start.add(3),
          start.add(duration.weeks(48))
        );

        // 800 on start
        await synapseVesting.addSaleContract(
          [crossSaleData[1].address],
          getBigNumber(2, 17),
          50000,
          8,
          start.add(3),
          start.add(duration.weeks(46))
        );

        expect(await synapseVesting.vestingAdded(user1.address)).to.be.equal(false);
        expect(await synapseVesting.getAllClaimable(user1.address)).to.be.equal(getBigNumber(1300));

        expect(await synapseVesting.vestingAdded(user7.address)).to.be.equal(false);
        expect(await synapseVesting.getAllClaimable(user7.address)).to.be.equal(getBigNumber(100));
      });

      it("should correctly return all claimable amount for refunded user before user add vestings from sale contracts", async function () {
        await synapseVesting.massSetRefunded([user1.address, user2.address]);
        start = await latest();

        // 100 on start
        await synapseVesting.massAddHolders(
          [user1.address, user7.address],
          [getBigNumber(100), getBigNumber(100)],
          [getBigNumber(1000), getBigNumber(1000)],
          start.add(3),
          start.add(duration.days(2))
        );

        // 400 on start
        await synapseVesting.addSaleContract(
          [crossSaleData[0].address],
          getBigNumber(4, 17),
          25000,
          4,
          start.add(3),
          start.add(duration.weeks(48))
        );

        // 800 on start
        await synapseVesting.addSaleContract(
          [crossSaleData[1].address],
          getBigNumber(2, 17),
          50000,
          8,
          start.add(3),
          start.add(duration.weeks(46))
        );

        expect(await synapseVesting.vestingAdded(user1.address)).to.be.equal(false);
        expect(await synapseVesting.getAllClaimable(user1.address)).to.be.equal(getBigNumber(100));

        expect(await synapseVesting.vestingAdded(user2.address)).to.be.equal(false);
        expect(await synapseVesting.getAllClaimable(user2.address)).to.be.equal(0);

        expect(await synapseVesting.vestingAdded(user7.address)).to.be.equal(false);
        expect(await synapseVesting.getAllClaimable(user7.address)).to.be.equal(getBigNumber(100));
      });

      it("should correctly return all claimable amount before user add vestings from multi address sale contract", async function () {
        await synapseVesting.addSaleContract(
          [crossSaleData[3].address, crossSaleData[4].address, crossSaleData[5].address],
          getBigNumber(125, 15),
          366600,
          10,
          start.add(1),
          start.add(duration.weeks(18).add(2))
        );

        expect(await synapseVesting.vestingAdded(user1.address)).to.be.equal(false);
        expect(await synapseVesting.getAllClaimable(user1.address)).to.be.equal(getBigNumber(9375, 17));
      });

      it("it should correctly return all claimable before user add vestings and when sum of cross-chain investments exceeded max over allocation", async function () {
        await synapseVesting.addSaleContract(
          [crossSaleData[3].address, crossSaleData[4].address, crossSaleData[5].address],
          getBigNumber(125, 15),
          366600,
          10,
          start.add(1),
          start.add(duration.weeks(18).add(1))
        );

        expect(await synapseVesting.vestingAdded(user5.address)).to.be.equal(false);
        expect(await synapseVesting.getAllClaimable(user5.address)).to.be.equal(getBigNumber(45825, 17));

        await expect(synapseVesting.connect(user5).addMyVesting())
          .to.emit(synapseVesting, "Vested")
          .withArgs(user5.address, BigNumber.from("45825000000000000000000"), start.add(duration.weeks(18)).add(1));

        expect(await synapseVesting.vestingAdded(user5.address)).to.be.equal(true);
        expect(await synapseVesting.getAllClaimable(user5.address)).to.be.equal(BigNumber.from("4582503788442460291905"));

        const saleContractData = await synapseVesting.getVestings(user5.address);
        expect(saleContractData[0]["startTokens"]).to.be.equal(BigNumber.from("4582500000000000000000"));
      });
    });

    describe("getVestings", () => {
      beforeEach(async () => {
        await synapseVesting.massAddHolders(
          [user1.address, user7.address],
          [getBigNumber(100), getBigNumber(100)],
          [getBigNumber(1000), getBigNumber(1000)],
          start.add(3),
          start.add(duration.days(2))
        );

        await synapseVesting.addSaleContract(
          [crossSaleData[0].address],
          getBigNumber(4, 17),
          25000,
          4,
          start.add(4),
          start.add(duration.weeks(48))
        );

        await synapseVesting.addSaleContract(
          [crossSaleData[2].address],
          getBigNumber(2, 17),
          50000,
          8,
          start.add(5),
          start.add(duration.weeks(46))
        );

        await synapseVesting.addSaleContract(
          [crossSaleData[3].address],
          getBigNumber(2, 17),
          50000,
          8,
          start.add(5),
          start.add(duration.weeks(46))
        );

        await synapseVesting.addSaleContract(
          [crossSaleData[4].address],
          getBigNumber(2, 17),
          50000,
          8,
          start.add(5),
          start.add(duration.weeks(46))
        );
      });

      it("should return 0 if no vestings", async function () {
        const array: unknown[] = await synapseVesting.getVestings(user8.address);
        expect(array).to.be.lengthOf(0);
      });

      it("should return vestings without refunded vestings", async function () {
        await synapseVesting.massSetRefunded([user1.address, user2.address]);

        let array: unknown[] = await synapseVesting.getVestings(user1.address);
        expect(array).to.be.lengthOf(1);

        array = await synapseVesting.getVestings(user2.address);
        expect(array).to.be.lengthOf(0);

        array = await synapseVesting.getVestings(user7.address);
        expect(array).to.be.lengthOf(1);
      });

      it("should return correct number of vestings for given address", async function () {
        let array: unknown[] = await synapseVesting.getVestings(user1.address);
        expect(array).to.be.lengthOf(5);

        array = await synapseVesting.getVestings(user2.address);
        expect(array).to.be.lengthOf(4);

        array = await synapseVesting.getVestings(user7.address);
        expect(array).to.be.lengthOf(1);

        array = await synapseVesting.getVestings(user6.address);
        expect(array).to.be.lengthOf(2);
      });

      it("should return correct number of vestings after init for given address", async function () {
        await synapseVesting.addVesting(user1.address);
        let array: unknown[] = await synapseVesting.getVestings(user1.address);
        expect(array).to.be.lengthOf(5);

        await synapseVesting.addVesting(user2.address);
        array = await synapseVesting.getVestings(user2.address);
        expect(array).to.be.lengthOf(4);

        await synapseVesting.addVesting(user7.address);
        array = await synapseVesting.getVestings(user7.address);
        expect(array).to.be.lengthOf(1);

        await synapseVesting.addVesting(user8.address);
        array = await synapseVesting.getVestings(user6.address);
        expect(array).to.be.lengthOf(2);
      });

      it("should return correct vestings for given address before init", async function () {
        const vestings = await synapseVesting.getVestings(user1.address);

        expect(vestings[0]["dateStart"]).to.be.equal(start.add(3));
        expect(vestings[0]["dateEnd"]).to.be.equal(start.add(duration.days(2)));
        expect(vestings[0]["totalTokens"]).to.be.equal(getBigNumber(1000));
        expect(vestings[0]["startTokens"]).to.be.equal(getBigNumber(100));

        expect(vestings[1]["dateStart"]).to.be.equal(start.add(4));
        expect(vestings[1]["dateEnd"]).to.be.equal(start.add(duration.weeks(48)));
        expect(vestings[1]["totalTokens"]).to.be.equal(getBigNumber(10000));
        expect(vestings[1]["startTokens"]).to.be.equal(getBigNumber(400));

        expect(vestings[2]["dateStart"]).to.be.equal(start.add(5));
        expect(vestings[2]["dateEnd"]).to.be.equal(start.add(duration.weeks(46)));
        expect(vestings[2]["totalTokens"]).to.be.equal(getBigNumber(5000));
        expect(vestings[2]["startTokens"]).to.be.equal(getBigNumber(400));
      });

      it("should return correct vestings for given address after init", async function () {
        await synapseVesting.addVesting(user1.address);
        const vestings = await synapseVesting.getVestings(user1.address);

        expect(vestings[0]["dateStart"]).to.be.equal(start.add(3));
        expect(vestings[0]["dateEnd"]).to.be.equal(start.add(duration.days(2)));
        expect(vestings[0]["totalTokens"]).to.be.equal(getBigNumber(1000));
        expect(vestings[0]["startTokens"]).to.be.equal(getBigNumber(100));

        expect(vestings[1]["dateStart"]).to.be.equal(start.add(4));
        expect(vestings[1]["dateEnd"]).to.be.equal(start.add(duration.weeks(48)));
        expect(vestings[1]["totalTokens"]).to.be.equal(getBigNumber(10000));
        expect(vestings[1]["startTokens"]).to.be.equal(getBigNumber(400));

        expect(vestings[2]["dateStart"]).to.be.equal(start.add(5));
        expect(vestings[2]["dateEnd"]).to.be.equal(start.add(duration.weeks(46)));
        expect(vestings[2]["totalTokens"]).to.be.equal(getBigNumber(5000));
        expect(vestings[2]["startTokens"]).to.be.equal(getBigNumber(400));
      });
    });

    describe("setRefunded", () => {
      it("should revert if address zero is passed", async function () {
        await expect(synapseVesting.setRefunded(ZERO_ADDRESS, true)).to.be.revertedWith("user address cannot be 0");
      });

      it("should set refunded on user", async function () {
        await synapseVesting.setRefunded(alice.address, true);
        expect(await synapseVesting.refunded(alice.address)).to.be.equal(true);
        await synapseVesting.setRefunded(alice.address, false);
        expect(await synapseVesting.refunded(alice.address)).to.be.equal(false);
      });
    });

    describe("massSetRefunded", () => {
      it("should revert if address zero is passed", async function () {
        await expect(synapseVesting.massSetRefunded([ZERO_ADDRESS])).to.be.revertedWith("user address cannot be 0");
      });

      it("should set mass refunded users correctly", async function () {
        await synapseVesting.massSetRefunded([user1.address, user2.address]);
        expect(await synapseVesting.refunded(user1.address)).to.be.equal(true);
        expect(await synapseVesting.refunded(user2.address)).to.be.equal(true);
      });
    });
  });
});
