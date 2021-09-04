import { waffle } from "hardhat";
import { expect } from "chai";

import SynapseNetworkTokenArtifacts from "../../artifacts/contracts/SynapseNetwork.sol/SynapseNetwork.json";

import { SynapseNetwork } from "../../typechain";
import { Wallet, BigNumber, utils } from "ethers";
import { getBigNumber, latest, advanceTimeAndBlock } from "../utilities";

import { fromRpcSig, toBuffer } from "ethereumjs-util";
import { signTypedData_v4 } from "eth-sig-util";
import { EIP712Domain } from "../utilities/epi712";

const { provider, deployContract } = waffle;

// keccak256("Transfer(address owner,address to,uint256 value,uint256 nonce,uint256 deadline)");
const TRANSFER_TYPEHASH = utils.id("Transfer(address owner,address to,uint256 value,uint256 nonce,uint256 deadline)");

const Transfer = [
  { name: "owner", type: "address" },
  { name: "to", type: "address" },
  { name: "value", type: "uint256" },
  { name: "nonce", type: "uint256" },
  { name: "deadline", type: "uint256" },
];

describe("Synapse Network Anti-bot", () => {
  const [deployer, alice, bob, carol, fee, uniswap] = provider.getWallets() as Wallet[];

  let synapseToken: SynapseNetwork;

  let chainId: number;

  const name = "Synapse Network";
  const version = "1";

  const FIVE_HUNDRED_MILLION_TOKENS: BigNumber = getBigNumber(500_000_000);
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const one_hundred = getBigNumber(100);

  // keccak256("Transfer(address owner,address to,uint256 value,uint256 nonce,uint256 deadline)");
  const buildData = (chainId, verifyingContract, owner, to, value, nonce, deadline) => ({
    primaryType: "Transfer" as const,
    types: { EIP712Domain, Transfer },
    domain: { name, version, chainId, verifyingContract },
    message: { owner, to, value, nonce, deadline },
  });

  async function makeSUT() {
    return (await deployContract(deployer, SynapseNetworkTokenArtifacts, [deployer.address])) as SynapseNetwork;
  }

  before(async () => {
    chainId = (await deployer.provider.getNetwork()).chainId;
  });

  beforeEach(async () => {
    synapseToken = await makeSUT();
  });

  describe("onlyOwner", () => {
    it("should revert if restricted function's caller is not owner", async () => {
      await expect(synapseToken.connect(alice).setTradingStart(1)).to.be.revertedWith("caller is not the owner");
      await expect(synapseToken.connect(alice).setMaxTransferAmount(1)).to.be.revertedWith("caller is not the owner");
      await expect(synapseToken.connect(alice).whitelistAccount(alice.address, true)).to.be.revertedWith("caller is not the owner");
    });
  });

  describe("Before trading time", () => {
    describe("transfer", () => {
      it("transfer should revert when executed before trading time and transaction is not from or to the owner", async function () {
        await expect(synapseToken.connect(alice).transfer(bob.address, one_hundred)).to.be.revertedWith("Protection: Transfers disabled");
      });

      it("transfer should be executed if transaction is to or from the owner address", async function () {
        await expect(synapseToken.transfer(alice.address, one_hundred))
          .to.emit(synapseToken, "Transfer")
          .withArgs(deployer.address, alice.address, one_hundred);

        await expect(synapseToken.connect(alice).transfer(deployer.address, one_hundred))
          .to.emit(synapseToken, "Transfer")
          .withArgs(alice.address, deployer.address, one_hundred);
      });
    });

    describe("transferFrom", () => {
      it("transferFrom should be reverted when executed before trading time and transaction is not from or to the owner", async function () {
        await synapseToken.transfer(alice.address, one_hundred);
        await synapseToken.connect(alice).approve(bob.address, one_hundred);

        await expect(synapseToken.connect(bob).transferFrom(alice.address, bob.address, one_hundred)).to.be.revertedWith(
          "Protection: Transfers disabled"
        );
      });

      it("transferFrom should be executed if transaction is to or from the owner address", async function () {
        await synapseToken.approve(bob.address, one_hundred);
        await expect(synapseToken.connect(bob).transferFrom(deployer.address, bob.address, one_hundred))
          .to.emit(synapseToken, "Transfer")
          .withArgs(deployer.address, bob.address, one_hundred);
      });
    });

    describe("transferWithPermit", () => {
      it("transferWithPermit should revert when executed before trading time and transaction is not from or to the owner", async function () {
        const nonce: number = await (await synapseToken.nonces(alice.address)).toNumber();
        const deadline = (await latest()) + 100;

        const data = buildData(chainId, synapseToken.address, alice.address, bob.address, one_hundred.toString(), nonce, deadline);
        const signature = signTypedData_v4(toBuffer(alice.privateKey), { data: data });
        const { v, r, s } = fromRpcSig(signature);

        await expect(
          synapseToken.connect(alice).transferWithPermit(alice.address, bob.address, one_hundred, deadline, v, r, s)
        ).to.be.revertedWith("Protection: Transfers disabled");
      });

      it("transferWithPermit should be executed if transaction is to or from the owner address", async function () {
        await synapseToken.transfer(alice.address, one_hundred);

        const nonce: number = await (await synapseToken.nonces(alice.address)).toNumber();
        const deadline = (await latest()) + 100;

        const data = buildData(chainId, synapseToken.address, alice.address, deployer.address, one_hundred.toString(), nonce, deadline);
        const signature = signTypedData_v4(toBuffer(alice.privateKey), { data: data });
        const { v, r, s } = fromRpcSig(signature);

        await expect(synapseToken.connect(alice).transferWithPermit(alice.address, deployer.address, one_hundred, deadline, v, r, s))
          .to.emit(synapseToken, "Transfer")
          .withArgs(alice.address, deployer.address, one_hundred);
      });
    });
  });

  describe("During restriction time", () => {
    beforeEach(async () => {
      await advanceTimeAndBlock(3 * 24 * 3600);
    });

    it("transfer should revert when amount exceeds max limit", async function () {
      // transfer
      await expect(synapseToken.transfer(alice.address, getBigNumber(150000))).to.be.revertedWith("Protection: Limit exceeded");

      // transferFrom
      await synapseToken.approve(fee.address, getBigNumber(150000));
      await expect(synapseToken.connect(fee).transferFrom(deployer.address, fee.address, getBigNumber(150000))).to.be.revertedWith(
        "Protection: Limit exceeded"
      );

      // transferWithPermit
      const nonce: number = await (await synapseToken.nonces(deployer.address)).toNumber();
      const deadline = (await latest()) + 100;

      const data = buildData(chainId, synapseToken.address, deployer.address, bob.address, getBigNumber(150000).toString(), nonce, deadline);
      const signature = signTypedData_v4(toBuffer(deployer.privateKey), { data: data });
      const { v, r, s } = fromRpcSig(signature);

      await expect(
        synapseToken.connect(alice).transferWithPermit(deployer.address, bob.address, getBigNumber(150000), deadline, v, r, s)
      ).to.be.revertedWith("Protection: Limit exceeded");
    });

    it("should transfer correctly when amount under max limit", async function () {
      // transfer
      await expect(synapseToken.transfer(alice.address, getBigNumber(50000)))
        .to.emit(synapseToken, "Transfer")
        .withArgs(deployer.address, alice.address, getBigNumber(50000));

      // prevents 1 tx per 1 min limit
      await advanceTimeAndBlock(60);

      // transferFrom
      await synapseToken.connect(alice).approve(bob.address, getBigNumber(50000));
      await expect(synapseToken.connect(bob).transferFrom(alice.address, bob.address, getBigNumber(50000)))
        .to.emit(synapseToken, "Transfer")
        .withArgs(alice.address, bob.address, getBigNumber(50000));

      // prevents 1 tx per 1 min limit
      await advanceTimeAndBlock(60);

      // transferWithPermit
      const nonce: number = await (await synapseToken.nonces(bob.address)).toNumber();
      const deadline = (await latest()) + 100;

      const data = buildData(chainId, synapseToken.address, bob.address, carol.address, getBigNumber(15000).toString(), nonce, deadline);
      const signature = signTypedData_v4(toBuffer(bob.privateKey), { data: data });
      const { v, r, s } = fromRpcSig(signature);

      await expect(synapseToken.connect(alice).transferWithPermit(bob.address, carol.address, getBigNumber(15000), deadline, v, r, s))
        .to.emit(synapseToken, "Transfer")
        .withArgs(bob.address, carol.address, getBigNumber(15000));
    });

    it("should should revert when more then one transfer per min for the same address when not whitelisted", async function () {
      await synapseToken.transfer(alice.address, getBigNumber(50000));
      await synapseToken.connect(alice).approve(bob.address, getBigNumber(50000));

      await expect(synapseToken.connect(bob).transferFrom(alice.address, bob.address, getBigNumber(50000))).to.be.revertedWith(
        "Protection: 1 tx/min allowed"
      );
    });

    it("whitelisted account should transfer to different accounts without transaction limits", async function () {
      await synapseToken.whitelistAccount(uniswap.address, true);
      await synapseToken.transfer(uniswap.address, getBigNumber(50000));

      await expect(synapseToken.connect(uniswap).transfer(alice.address, getBigNumber(1000)))
        .to.emit(synapseToken, "Transfer")
        .withArgs(uniswap.address, alice.address, getBigNumber(1000));

      await expect(synapseToken.connect(uniswap).transfer(bob.address, getBigNumber(1000)))
        .to.emit(synapseToken, "Transfer")
        .withArgs(uniswap.address, bob.address, getBigNumber(1000));

      await synapseToken.connect(uniswap).approve(carol.address, getBigNumber(10000));
      await expect(synapseToken.connect(carol).transferFrom(uniswap.address, carol.address, getBigNumber(10000)))
        .to.emit(synapseToken, "Transfer")
        .withArgs(uniswap.address, carol.address, getBigNumber(10000));
    });

    it("whitelisted account should receive from different accounts without transaction limits", async function () {
      await synapseToken.transfer(alice.address, getBigNumber(1000));
      await advanceTimeAndBlock(60);
      await synapseToken.transfer(bob.address, getBigNumber(1000));
      await advanceTimeAndBlock(60);
      await synapseToken.transfer(carol.address, getBigNumber(1000));
      await advanceTimeAndBlock(60);

      await synapseToken.whitelistAccount(uniswap.address, true);

      // transfer
      await expect(synapseToken.connect(alice).transfer(uniswap.address, getBigNumber(1000)))
        .to.emit(synapseToken, "Transfer")
        .withArgs(alice.address, uniswap.address, getBigNumber(1000));

      // transferFrom
      await synapseToken.connect(bob).approve(uniswap.address, getBigNumber(1000));
      await expect(synapseToken.connect(uniswap).transferFrom(bob.address, uniswap.address, getBigNumber(1000)))
        .to.emit(synapseToken, "Transfer")
        .withArgs(bob.address, uniswap.address, getBigNumber(1000));

      // transferWithPermit
      const nonce: number = await (await synapseToken.nonces(carol.address)).toNumber();
      const deadline = (await latest()) + 100;

      const data = buildData(chainId, synapseToken.address, carol.address, uniswap.address, getBigNumber(1000).toString(), nonce, deadline);
      const signature = signTypedData_v4(toBuffer(carol.privateKey), { data: data });
      const { v, r, s } = fromRpcSig(signature);

      await expect(synapseToken.connect(alice).transferWithPermit(carol.address, uniswap.address, getBigNumber(1000), deadline, v, r, s))
        .to.emit(synapseToken, "Transfer")
        .withArgs(carol.address, uniswap.address, getBigNumber(1000));
    });

    it("transfers between whitelisted accounts should not be restricted by amount of transactions per min", async function () {
      await synapseToken.whitelistAccount(deployer.address, true);
      await synapseToken.whitelistAccount(uniswap.address, true);

      // transfer
      await expect(synapseToken.transfer(uniswap.address, getBigNumber(1000)))
        .to.emit(synapseToken, "Transfer")
        .withArgs(deployer.address, uniswap.address, getBigNumber(1000));

      // transferFrom
      await synapseToken.connect(uniswap).approve(deployer.address, getBigNumber(1000));
      await expect(synapseToken.connect(deployer).transferFrom(uniswap.address, deployer.address, getBigNumber(1000)))
        .to.emit(synapseToken, "Transfer")
        .withArgs(uniswap.address, deployer.address, getBigNumber(1000));
    });

    it("sender to the whitelisted account should be restricted by amount of transactions per min", async function () {
      await synapseToken.transfer(alice.address, getBigNumber(10000));
      await advanceTimeAndBlock(60);

      await synapseToken.whitelistAccount(uniswap.address, true);

      // transfer 1
      await expect(synapseToken.connect(alice).transfer(uniswap.address, getBigNumber(1000)))
        .to.emit(synapseToken, "Transfer")
        .withArgs(alice.address, uniswap.address, getBigNumber(1000));

      // transfer 2
      await expect(synapseToken.connect(alice).transfer(uniswap.address, getBigNumber(1000))).to.be.revertedWith("Protection: 1 tx/min allowed");
    });

    it("receiver from the whitelisted account should be restricted by amount of transactions per min", async function () {
      await synapseToken.whitelistAccount(uniswap.address, true);
      await synapseToken.transfer(uniswap.address, getBigNumber(10000));

      // transfer 1
      await expect(synapseToken.connect(uniswap).transfer(alice.address, getBigNumber(1000)))
        .to.emit(synapseToken, "Transfer")
        .withArgs(uniswap.address, alice.address, getBigNumber(1000));

      // transfer 2
      await expect(synapseToken.connect(uniswap).transfer(alice.address, getBigNumber(1000))).to.be.revertedWith("Protection: 1 tx/min allowed");
    });
  });

  describe("After restriction time", () => {
    beforeEach(async () => {
      await advanceTimeAndBlock(3 * 24 * 3600 + 30 * 60);
    });

    it("should transfer correctly without any limits", async function () {
      await synapseToken.setRestrictionActive(false);
      // transfer
      await expect(synapseToken.transfer(alice.address, getBigNumber(1000000)))
        .to.emit(synapseToken, "Transfer")
        .withArgs(deployer.address, alice.address, getBigNumber(1000000));

      // transferFrom
      await synapseToken.connect(alice).approve(fee.address, getBigNumber(1000000));
      await expect(synapseToken.connect(fee).transferFrom(alice.address, fee.address, getBigNumber(1000000)))
        .to.emit(synapseToken, "Transfer")
        .withArgs(alice.address, fee.address, getBigNumber(1000000));

      // transferWithPermit
      const nonce: number = await (await synapseToken.nonces(fee.address)).toNumber();
      const deadline = (await latest()) + 100;

      const data = buildData(chainId, synapseToken.address, fee.address, bob.address, getBigNumber(150000).toString(), nonce, deadline);
      const signature = signTypedData_v4(toBuffer(fee.privateKey), { data: data });
      const { v, r, s } = fromRpcSig(signature);

      await expect(synapseToken.connect(alice).transferWithPermit(fee.address, bob.address, getBigNumber(150000), deadline, v, r, s))
        .to.emit(synapseToken, "Transfer")
        .withArgs(fee.address, bob.address, getBigNumber(150000));
    });
  });

  describe("setTradingStart", () => {
    it("should change trading time and restriction lift time correctly", async function () {
      const currentTradingTimeEnd: BigNumber = (await latest()).add(3 * 24 * 3600);

      await synapseToken.transfer(alice.address, getBigNumber(200000));
      await expect(synapseToken.connect(alice).transfer(bob.address, getBigNumber(200000))).to.be.revertedWith("Protection: Transfers disabled");

      await expect(synapseToken.setTradingStart(currentTradingTimeEnd.add(24 * 3600)))
        .to.emit(synapseToken, "TradingTimeChanged")
        .withArgs(currentTradingTimeEnd.add(24 * 3600))
        .and.to.emit(synapseToken, "RestrictionEndTimeChanged")
        .withArgs(currentTradingTimeEnd.add(24 * 3600).add(30 * 60));

      // time after initial trading and restriction lift time
      await advanceTimeAndBlock(3 * 24 * 3600);
      // should still be disabled
      await expect(synapseToken.connect(alice).transfer(bob.address, getBigNumber(200000))).to.be.revertedWith("Protection: Transfers disabled");

      await advanceTimeAndBlock(24 * 3600);
      // should be in new transfer restriction period
      await expect(synapseToken.connect(alice).transfer(bob.address, getBigNumber(200000))).to.be.revertedWith("Protection: Limit exceeded");

      await advanceTimeAndBlock(30 * 60);
      // should transfer correctly
      await expect(synapseToken.connect(alice).transfer(bob.address, getBigNumber(200000)))
        .to.emit(synapseToken, "Transfer")
        .withArgs(alice.address, bob.address, getBigNumber(200000));
    });

    it("it should revert when trading time already started", async function () {
      await advanceTimeAndBlock(3 * 24 * 3600);
      await expect(synapseToken.setTradingStart(1000)).to.be.revertedWith("To late");
    });
  });

  describe("setMaxTransferAmount", () => {
    it("it should correctly change max restriction amount", async function () {
      await synapseToken.transfer(alice.address, getBigNumber(200000));
      await advanceTimeAndBlock(3 * 24 * 3600);

      await expect(synapseToken.connect(alice).transfer(bob.address, getBigNumber(200000))).to.be.revertedWith("Protection: Limit exceeded");

      await expect(synapseToken.setMaxTransferAmount(getBigNumber(200000)))
        .to.emit(synapseToken, "MaxTransferAmountChanged")
        .withArgs(getBigNumber(200000));

      await expect(synapseToken.connect(alice).transfer(bob.address, getBigNumber(200000)))
        .to.emit(synapseToken, "Transfer")
        .withArgs(alice.address, bob.address, getBigNumber(200000));
    });
  });

  describe("whitelistAccount", () => {
    it("should revert if address zero is passed as account argument", async function () {
      await expect(synapseToken.whitelistAccount(ZERO_ADDRESS, true)).to.be.revertedWith("Zero address");
      await expect(synapseToken.whitelistAccount(ZERO_ADDRESS, false)).to.be.revertedWith("Zero address");
    });

    it("should correctly add and remove user from whitelist and correctly emit event", async function () {
      await expect(synapseToken.whitelistAccount(uniswap.address, true))
        .to.emit(synapseToken, "MarkedWhitelisted")
        .withArgs(uniswap.address, true);
      await expect(synapseToken.whitelistAccount(uniswap.address, false))
        .to.emit(synapseToken, "MarkedWhitelisted")
        .withArgs(uniswap.address, false);
    });
  });
});
