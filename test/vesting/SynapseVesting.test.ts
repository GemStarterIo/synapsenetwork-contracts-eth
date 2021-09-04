import { waffle } from "hardhat";
import { expect } from "chai";

import SynapseVestingArtifacts from "../../artifacts/contracts/SynapseVesting.sol/SynapseVesting.json";
import SynapseNetworkArtifacts from "../../artifacts/contracts/SynapseNetwork.sol/SynapseNetwork.json";
import ERC20MockArtifact from "../../artifacts/contracts/mocks/ERC20Mock.sol/ERC20Mock.json";

import { SynapseVesting, SynapseNetwork, ERC20Mock } from "../../typechain";
import { Wallet, BigNumber } from "ethers";
import { getBigNumber, latest, duration, advanceTime, advanceTimeAndBlock, countClaimable } from "../utilities";

const { provider, deployContract } = waffle;

describe("Synapse Vesting", () => {
  const [deployer, alice, bob, carol, don] = provider.getWallets() as Wallet[];

  let synapseVesting: SynapseVesting;
  let synapseToken: SynapseNetwork;

  let now: BigNumber;

  let timestamp: BigNumber;
  let claimed: BigNumber;

  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

  beforeEach(async () => {
    synapseToken = (await deployContract(deployer, SynapseNetworkArtifacts, [deployer.address])) as SynapseNetwork;
    await advanceTimeAndBlock(3 * 24 * 3600 + 30 * 60);
    await synapseToken.setRestrictionActive(false);
    synapseVesting = (await deployContract(deployer, SynapseVestingArtifacts, [])) as SynapseVesting;
    await synapseVesting.init(synapseToken.address);
    now = await latest();
  });

  describe("init", () => {
    it("should revert when token address is 0", async function () {
      await expect(synapseVesting.init(ZERO_ADDRESS)).to.be.revertedWith("_token address cannot be 0");
    });

    it("should revert when already initialized", async function () {
      await expect(synapseVesting.init(synapseToken.address)).to.be.revertedWith("Init already done");
    });
  });

  describe("initialization", () => {
    it("should initialize as expected", async function () {
      expect(await synapseVesting.snpToken()).to.be.equal(synapseToken.address);
      expect(await synapseVesting.owner()).to.be.equal(deployer.address);
      expect(await synapseVesting.totalVested()).to.be.equal(0);
      expect(await synapseVesting.totalClaimed()).to.be.equal(0);
    });
  });

  describe("onlyOwner", () => {
    it("should revert if restricted function's caller is not owner", async () => {
      const _synapseVesting = (await deployContract(deployer, SynapseVestingArtifacts, [])) as SynapseVesting;
      await expect(synapseVesting.connect(alice).massAddHolders([], [], [], 1, 2)).to.be.revertedWith("caller is not the owner");
      await expect(_synapseVesting.connect(alice).init(synapseToken.address)).to.be.revertedWith("caller is not the owner");
    });
  });

  describe("whenNotLocked", () => {
    it("should revert if function is locked", async () => {
      await synapseVesting.lock();
      await expect(synapseVesting.massAddHolders([], [], [], 1, 2)).to.be.revertedWith("Lockable: locked");
    });
  });

  describe("massAddHolders", () => {
    it("should revert with incorrect arrays lengths", async function () {
      await expect(synapseVesting.massAddHolders([alice.address, bob.address], [100], [1000], 1, 2)).to.be.revertedWith("data size mismatch");
      await expect(synapseVesting.massAddHolders([alice.address], [100, 100], [1000], 1, 2)).to.be.revertedWith("data size mismatch");
      await expect(synapseVesting.massAddHolders([alice.address, bob.address], [100], [1000, 1000], 1, 2)).to.be.revertedWith(
        "data size mismatch"
      );
      await expect(synapseVesting.massAddHolders([alice.address], [100], [1000, 1000], 1, 2)).to.be.revertedWith("data size mismatch");
    });

    it("should revert when endDate is before startDate", async function () {
      await expect(synapseVesting.massAddHolders([alice.address], [100], [1000], 2, 1)).to.be.revertedWith("startDate cannot exceed endDate");
    });

    it("should revert when user address is 0", async function () {
      await expect(synapseVesting.massAddHolders([ZERO_ADDRESS], [100], [1000], 1, 2)).to.be.revertedWith("user address cannot be 0");
    });

    it("should allow to add single vesting", async function () {
      await expect(synapseVesting.massAddHolders([alice.address], [100], [1000], 1, 2))
        .to.emit(synapseVesting, "Vested")
        .withArgs(alice.address, 1000, 2);
    });

    it("should allow to add multiple vestings", async function () {
      await expect(synapseVesting.massAddHolders([alice.address, bob.address, carol.address], [100, 200, 300], [1000, 2000, 3000], 150, 350))
        .to.emit(synapseVesting, "Vested")
        .withArgs(alice.address, 1000, 350)
        .and.to.emit(synapseVesting, "Vested")
        .withArgs(bob.address, 2000, 350)
        .and.to.emit(synapseVesting, "Vested")
        .withArgs(carol.address, 3000, 350);
    });

    it("should correctly track totalVested", async function () {
      await synapseVesting.massAddHolders([alice.address, bob.address, carol.address], [100, 200, 300], [1000, 2000, 3000], 150, 350);

      let totalVested = await synapseVesting.totalVested();
      expect(totalVested).to.be.equal(6000);

      await synapseVesting.massAddHolders([alice.address, bob.address, carol.address], [100, 200, 300], [2000, 5000, 8000], 150, 350);

      totalVested = await synapseVesting.totalVested();
      expect(totalVested).to.be.equal(21000);
    });
  });

  describe("claim", () => {
    it("should revert if nothing to claim when no vestings", async function () {
      await expect(synapseVesting.claim()).to.be.revertedWith("No vestings for user");
    });

    it("should revert if nothing to claim when before start time", async function () {
      await synapseVesting.massAddHolders([alice.address], [100], [1000], now.add(duration.days(1)), now.add(duration.days(2)));
      await expect(synapseVesting.connect(alice).claim()).to.be.revertedWith("Nothing to claim");
    });

    it("should claim startTokens when block timestamp = startDate", async function () {
      await synapseToken.transfer(synapseVesting.address, 100);
      await synapseVesting.massAddHolders([alice.address], [100], [1000], now.add(3), now.add(duration.days(2)));
      await expect(synapseVesting.connect(alice).claim()).to.emit(synapseVesting, "Claimed").withArgs(alice.address, 100);
    });

    it("should claim correctly every 100 sec with minimal amount", async function () {
      await synapseToken.transfer(synapseVesting.address, 11);
      await synapseVesting.massAddHolders([alice.address], [1], [11], now.add(3), now.add(1003));

      await expect(synapseVesting.connect(alice).claim()).to.emit(synapseVesting, "Claimed").withArgs(alice.address, 1);
      await advanceTimeAndBlock(199);
      await expect(synapseVesting.connect(alice).claim()).to.emit(synapseVesting, "Claimed").withArgs(alice.address, 2);
      await advanceTimeAndBlock(1300);
      await expect(synapseVesting.connect(alice).claim()).to.emit(synapseVesting, "Claimed").withArgs(alice.address, 8);

      await expect(synapseVesting.connect(alice).claim()).to.be.revertedWith("Nothing to claim");
      expect(await synapseVesting.totalVested()).to.be.equal(11);
      expect(await synapseToken.balanceOf(alice.address)).to.be.equal(11);
    });

    it("should claim correctly every 100 sec with normal amount", async function () {
      await synapseToken.transfer(synapseVesting.address, getBigNumber(55000));
      await synapseVesting.massAddHolders([alice.address], [getBigNumber(5000)], [getBigNumber(55000)], now.add(3), now.add(1003));

      await advanceTimeAndBlock(300);
      await expect(synapseVesting.connect(alice).claim()).to.emit(synapseVesting, "Claimed").withArgs(alice.address, getBigNumber(20000));
      await advanceTimeAndBlock(99);
      await expect(synapseVesting.connect(alice).claim()).to.emit(synapseVesting, "Claimed").withArgs(alice.address, getBigNumber(5000));
      await advanceTimeAndBlock(850);
      await expect(synapseVesting.connect(alice).claim()).to.emit(synapseVesting, "Claimed").withArgs(alice.address, getBigNumber(30000));

      await expect(synapseVesting.connect(alice).claim()).to.be.revertedWith("Nothing to claim");
      expect(await synapseVesting.totalVested()).to.be.equal(getBigNumber(55000));
      expect(await synapseToken.balanceOf(alice.address)).to.be.equal(getBigNumber(55000));
    });

    it("should claim correctly withing 10 days with normal amount", async function () {
      await synapseToken.transfer(synapseVesting.address, getBigNumber(550000));
      await synapseVesting.massAddHolders(
        [alice.address],
        [getBigNumber(50000)],
        [getBigNumber(550000)],
        now.add(duration.days(1)).add(2),
        now.add(duration.days(11)).add(2)
      );

      await advanceTimeAndBlock(duration.days(2).toNumber() - 1);
      await expect(synapseVesting.connect(alice).claim()).to.emit(synapseVesting, "Claimed").withArgs(alice.address, getBigNumber(100000));
      await advanceTimeAndBlock(duration.days(4).toNumber() - 1);
      await expect(synapseVesting.connect(alice).claim()).to.emit(synapseVesting, "Claimed").withArgs(alice.address, getBigNumber(200000));
      await advanceTimeAndBlock(duration.days(5).toNumber() - 1);
      await expect(synapseVesting.connect(alice).claim()).to.emit(synapseVesting, "Claimed").withArgs(alice.address, getBigNumber(250000));

      await expect(synapseVesting.connect(alice).claim()).to.be.revertedWith("Nothing to claim");
      expect(await synapseVesting.totalVested()).to.be.equal(getBigNumber(550000));
      expect(await synapseToken.balanceOf(alice.address)).to.be.equal(getBigNumber(550000));
    });

    it("should claim correctly every 100 sec with totalSupply", async function () {
      await synapseToken.transfer(synapseVesting.address, getBigNumber(500000000));
      await synapseVesting.massAddHolders([alice.address], [getBigNumber(100000000)], [getBigNumber(500000000)], now.add(3), now.add(1003));

      await expect(synapseVesting.connect(alice).claim()).to.emit(synapseVesting, "Claimed").withArgs(alice.address, getBigNumber(100000000));
      await advanceTimeAndBlock(99);
      await expect(synapseVesting.connect(alice).claim()).to.emit(synapseVesting, "Claimed").withArgs(alice.address, getBigNumber(40000000));
      await advanceTimeAndBlock(299);
      await expect(synapseVesting.connect(alice).claim()).to.emit(synapseVesting, "Claimed").withArgs(alice.address, getBigNumber(120000000));
      await advanceTimeAndBlock(599);
      await expect(synapseVesting.connect(alice).claim()).to.emit(synapseVesting, "Claimed").withArgs(alice.address, getBigNumber(240000000));

      await expect(synapseVesting.connect(alice).claim()).to.be.revertedWith("Nothing to claim");
    });

    it("should claim correctly from all vestings", async function () {
      await synapseToken.transfer(synapseVesting.address, getBigNumber(10000));

      await synapseVesting.massAddHolders(
        [alice.address],
        [getBigNumber(100)],
        [getBigNumber(1100)],
        now.add(duration.days(1)).add(4),
        now.add(duration.days(11)).add(4)
      ); // 100 per day

      await synapseVesting.massAddHolders(
        [alice.address],
        [getBigNumber(200)],
        [getBigNumber(2200)],
        now.add(duration.days(2)).add(4),
        now.add(duration.days(22)).add(4)
      ); // 100 per day

      await synapseVesting.massAddHolders(
        [alice.address],
        [getBigNumber(400)],
        [getBigNumber(4400)],
        now.add(duration.days(4)).add(4),
        now.add(duration.days(44)).add(4)
      ); // 100 per day

      await advanceTimeAndBlock(duration.days(2).toNumber() - 1); // day 2
      await expect(synapseVesting.connect(alice).claim()).to.emit(synapseVesting, "Claimed").withArgs(alice.address, getBigNumber(400));
      await advanceTimeAndBlock(duration.days(2).toNumber() - 1); // day 4
      await expect(synapseVesting.connect(alice).claim()).to.emit(synapseVesting, "Claimed").withArgs(alice.address, getBigNumber(800));
      await advanceTimeAndBlock(duration.days(1).toNumber() - 1); // day 5
      await expect(synapseVesting.connect(alice).claim()).to.emit(synapseVesting, "Claimed").withArgs(alice.address, getBigNumber(300));

      await advanceTimeAndBlock(duration.days(6).toNumber() - 1); // day 11 - V1 is over
      await expect(synapseVesting.connect(alice).claim()).to.emit(synapseVesting, "Claimed").withArgs(alice.address, getBigNumber(1800));
      await advanceTimeAndBlock(duration.days(1).toNumber() - 1); // day 12
      await expect(synapseVesting.connect(alice).claim()).to.emit(synapseVesting, "Claimed").withArgs(alice.address, getBigNumber(200));

      await advanceTimeAndBlock(duration.days(10).toNumber() - 1); // day 22 - V2 is over
      await expect(synapseVesting.connect(alice).claim()).to.emit(synapseVesting, "Claimed").withArgs(alice.address, getBigNumber(2000));
      await advanceTimeAndBlock(duration.days(1).toNumber() - 1); // day 23
      await expect(synapseVesting.connect(alice).claim()).to.emit(synapseVesting, "Claimed").withArgs(alice.address, getBigNumber(100));

      await advanceTimeAndBlock(duration.days(21).toNumber() - 1); // day 44 - V3 is over
      await advanceTimeAndBlock(duration.days(1).toNumber() - 1); // day 45
      await expect(synapseVesting.connect(alice).claim()).to.emit(synapseVesting, "Claimed").withArgs(alice.address, getBigNumber(2100));

      await expect(synapseVesting.connect(alice).claim()).to.be.revertedWith("Nothing to claim");
      expect(await synapseVesting.totalVested()).to.be.equal(getBigNumber(7700));
    });
  });

  describe("claimTo", () => {
    it("should revert if claim to zero address", async function () {
      await expect(synapseVesting.claimTo(ZERO_ADDRESS)).to.be.revertedWith("Claim, then burn");
    });

    it("should revert if no vestings for user", async function () {
      await expect(synapseVesting.claimTo(bob.address)).to.be.revertedWith("No vestings for user");
    });

    it("should revert if nothing to claim when before start time", async function () {
      await synapseVesting.massAddHolders([alice.address], [100], [1000], now.add(duration.days(1)), now.add(duration.days(2)));
      await expect(synapseVesting.connect(alice).claimTo(bob.address)).to.be.revertedWith("Nothing to claim");
    });

    it("should claim correctly to external address", async function () {
      await synapseToken.transfer(synapseVesting.address, getBigNumber(550000));

      await synapseVesting.massAddHolders(
        [alice.address],
        [getBigNumber(50000)],
        [getBigNumber(550000)],
        now.add(duration.days(1)).add(2),
        now.add(duration.days(11)).add(2)
      );

      await advanceTime(duration.days(6).toNumber());
      await expect(synapseVesting.connect(alice).claimTo(bob.address))
        .to.emit(synapseVesting, "Claimed")
        .withArgs(alice.address, getBigNumber(300000))
        .and.to.emit(synapseToken, "Transfer")
        .withArgs(synapseVesting.address, bob.address, getBigNumber(300000));

      await advanceTime(duration.days(5).toNumber());
      await expect(synapseVesting.connect(alice).claim()).to.emit(synapseVesting, "Claimed").withArgs(alice.address, getBigNumber(250000));

      await expect(synapseVesting.connect(alice).claim()).to.be.revertedWith("Nothing to claim");

      expect(await synapseVesting.totalVested()).to.be.equal(getBigNumber(550000));
      expect(await synapseToken.balanceOf(alice.address)).to.be.equal(getBigNumber(250000));
      expect(await synapseToken.balanceOf(bob.address)).to.be.equal(getBigNumber(300000));
    });
  });

  describe("getClaimable", () => {
    it("should return claimable for given parameters", async function () {
      timestamp = await latest();

      await synapseVesting.massAddHolders(
        [alice.address],
        [123451],
        [12345611],
        timestamp.add(duration.days(1)),
        timestamp.add(duration.days(7))
      ); // 100 per day

      await synapseVesting.massAddHolders(
        [bob.address],
        [2345673],
        [23456783],
        timestamp.add(duration.days(2)),
        timestamp.add(duration.days(13))
      ); // 100 per day

      await synapseVesting.massAddHolders(
        [carol.address],
        [3456789],
        [34567890],
        timestamp.add(duration.days(4)),
        timestamp.add(duration.days(27))
      ); // 100 per day

      claimed = BigNumber.from(0);
      let actual: number;
      let expected: number;

      await advanceTimeAndBlock(duration.days(5).toNumber() - 3);

      actual = (await synapseVesting.getClaimable(alice.address, 0)).toNumber();
      expected = (
        await countClaimable(
          timestamp.add(duration.days(5)),
          timestamp.add(duration.days(1)),
          timestamp.add(duration.days(7)),
          BigNumber.from(123451),
          BigNumber.from(12345611),
          claimed
        )
      ).toNumber();

      expect(actual).to.be.closeTo(expected, 100);

      actual = (await synapseVesting.getClaimable(bob.address, 0)).toNumber();
      expected = (
        await countClaimable(
          timestamp.add(duration.days(5)),
          timestamp.add(duration.days(2)),
          timestamp.add(duration.days(13)),
          BigNumber.from(2345673),
          BigNumber.from(23456783),
          claimed
        )
      ).toNumber();

      expect(actual).to.be.closeTo(expected, 100);

      actual = (await synapseVesting.getClaimable(carol.address, 0)).toNumber();
      expected = (
        await countClaimable(
          timestamp.add(duration.days(5)),
          timestamp.add(duration.days(4)),
          timestamp.add(duration.days(27)),
          BigNumber.from(3456789),
          BigNumber.from(34567890),
          claimed
        )
      ).toNumber();

      expect(actual).to.be.closeTo(expected, 100);
    });
  });

  describe("getAllClaimable", () => {
    it("should return 0 if nothing to claim", async function () {
      const actual = (await synapseVesting.getAllClaimable(alice.address)).toNumber();
      expect(actual).to.be.equal(0);
    });

    it("should return all claimable for given address", async function () {
      timestamp = await latest();

      await synapseVesting.massAddHolders(
        [alice.address],
        [123451],
        [12345611],
        timestamp.add(duration.days(1)),
        timestamp.add(duration.days(7))
      );

      await synapseVesting.massAddHolders(
        [alice.address],
        [2345673],
        [23456783],
        timestamp.add(duration.days(2)),
        timestamp.add(duration.days(13))
      );

      await synapseVesting.massAddHolders(
        [alice.address],
        [3456789],
        [34567890],
        timestamp.add(duration.days(4)),
        timestamp.add(duration.days(27))
      );

      claimed = BigNumber.from(0);
      let actual: number;

      actual = (await synapseVesting.getAllClaimable(alice.address)).toNumber();
      expect(actual).to.be.equal(0);

      await advanceTimeAndBlock(duration.days(5).toNumber() - 3);

      actual = (await synapseVesting.getAllClaimable(alice.address)).toNumber();

      const expected: number =
        (
          await countClaimable(
            timestamp.add(duration.days(5)),
            timestamp.add(duration.days(1)),
            timestamp.add(duration.days(7)),
            BigNumber.from(123451),
            BigNumber.from(12345611),
            claimed
          )
        ).toNumber() +
        (
          await countClaimable(
            timestamp.add(duration.days(5)),
            timestamp.add(duration.days(2)),
            timestamp.add(duration.days(13)),
            BigNumber.from(2345673),
            BigNumber.from(23456783),
            claimed
          )
        ).toNumber() +
        (
          await countClaimable(
            timestamp.add(duration.days(5)),
            timestamp.add(duration.days(4)),
            timestamp.add(duration.days(27)),
            BigNumber.from(3456789),
            BigNumber.from(34567890),
            claimed
          )
        ).toNumber();

      expect(actual).to.be.closeTo(expected, 100);
    });
  });

  describe("getVestings & getVestingsCount & getVestingByIndex & getVestingsByRange", () => {
    beforeEach(async () => {
      timestamp = await latest();

      await synapseVesting.massAddHolders(
        [alice.address, alice.address, bob.address, carol.address, carol.address],
        [123451, 1233, 2333, 4444, 5555],
        [12345611, 6666, 7777, 8888, 9999],
        timestamp.add(duration.days(1)),
        timestamp.add(duration.days(7))
      );

      await synapseVesting.massAddHolders(
        [alice.address, bob.address, carol.address, carol.address, bob.address, carol.address, carol.address],
        [2345673, 2, 3, 4, 5, 6, 7],
        [23456783, 22, 44, 55, 66, 77, 88],
        timestamp.add(duration.days(2)),
        timestamp.add(duration.days(13))
      );

      await synapseVesting.massAddHolders(
        [alice.address, alice.address, bob.address, carol.address, carol.address, bob.address, carol.address],
        [3456789, 22, 33, 44, 55, 66, 77],
        [34567890, 333, 555, 666, 777, 888, 111],
        timestamp.add(duration.days(4)),
        timestamp.add(duration.days(27))
      );
    });

    describe("getVestings", () => {
      it("should return 0 if no vestings", async function () {
        const array: unknown[] = await synapseVesting.getVestings(don.address);
        expect(array).to.be.lengthOf(0);
      });

      it("should return correct number of vestings for given address", async function () {
        let array: unknown[] = await synapseVesting.getVestings(alice.address);
        expect(array).to.be.lengthOf(5);

        array = await synapseVesting.getVestings(bob.address);
        expect(array).to.be.lengthOf(5);

        array = await synapseVesting.getVestings(carol.address);
        expect(array).to.be.lengthOf(9);
      });
    });

    describe("getVestingsCount", () => {
      it("should return number of vestings", async function () {
        const number = await synapseVesting.getVestingsCount();
        expect(number).to.be.equal(19);
      });
    });

    describe("getVestingByIndex", () => {
      it("should revert if outside of range", async function () {
        await expect(synapseVesting.getVestingByIndex(19)).to.be.reverted;
      });

      it("should correctly return vesting by index", async function () {
        expect(await synapseVesting.getVestingByIndex(16)).to.exist;
      });
    });

    describe("getVestingsByRange", () => {
      it("should revert if incorrect range", async function () {
        await expect(synapseVesting.getVestingsByRange(3, 2)).to.be.reverted;
      });

      it("should revert if outside of range", async function () {
        await expect(synapseVesting.getVestingsByRange(2, 19)).to.be.revertedWith("range error");
      });

      it("should correctly return vestings array", async function () {
        expect(await synapseVesting.getVestingsByRange(12, 17)).to.be.lengthOf(6);
      });
    });
  });

  describe("recoverETH", () => {
    it("should recover ETH correctly", async function () {
      await expect(synapseVesting.connect(alice).recoverETH()).to.not.be.reverted;
      await expect(synapseVesting.recoverETH()).to.not.be.reverted;
    });
  });

  describe("recoverErc20", () => {
    it("should revert if token is SNP", async function () {
      await expect(synapseVesting.connect(alice).recoverErc20(synapseToken.address)).to.be.revertedWith("Not permitted");
    });

    it("should revert if nothing to recover", async function () {
      const token = (await deployContract(deployer, ERC20MockArtifact, ["Token", "TK", 18, 100000])) as ERC20Mock;
      await expect(synapseVesting.connect(alice).recoverErc20(token.address)).to.be.revertedWith("Nothing to recover");
    });

    it("should correctly recover ERC20 to owner address", async function () {
      const token = (await deployContract(bob, ERC20MockArtifact, ["Token", "TK", 18, 100000])) as ERC20Mock;
      await token.connect(bob).transfer(synapseVesting.address, 1000);

      await expect(synapseVesting.connect(alice).recoverErc20(token.address))
        .to.emit(token, "Transfer")
        .withArgs(synapseVesting.address, deployer.address, 1000);
      expect(await token.balanceOf(deployer.address)).to.be.equal(1000);
    });
  });
});
