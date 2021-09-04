import { waffle } from "hardhat";
import { expect } from "chai";
import { Wallet, utils } from "ethers";

import SynapseNetworkTokenArtifacts from "../../artifacts/contracts/SynapseNetwork.sol/SynapseNetwork.json";

import { SynapseNetwork } from "../../typechain";
import { latest, advanceTimeAndBlock } from "../utilities";

import { fromRpcSig, toBuffer } from "ethereumjs-util";
import { signTypedData_v4 } from "eth-sig-util";
import { EIP712Domain, domainSeparator } from "../utilities/epi712";

const { provider, deployContract } = waffle;

// keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");
const PERMIT_TYPEHASH = utils.id("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");
// keccak256("Transfer(address owner,address to,uint256 value,uint256 nonce,uint256 deadline)");
const TRANSFER_TYPEHASH = utils.id("Transfer(address owner,address to,uint256 value,uint256 nonce,uint256 deadline)");

const Permit = [
  { name: "owner", type: "address" },
  { name: "spender", type: "address" },
  { name: "value", type: "uint256" },
  { name: "nonce", type: "uint256" },
  { name: "deadline", type: "uint256" },
];

const Transfer = [
  { name: "owner", type: "address" },
  { name: "to", type: "address" },
  { name: "value", type: "uint256" },
  { name: "nonce", type: "uint256" },
  { name: "deadline", type: "uint256" },
];

describe("Synapse Network EIP712", () => {
  const [deployer, alice, bob, carol, fee] = provider.getWallets() as Wallet[];

  let synapseToken: SynapseNetwork;

  let chainId: number;

  const name = "Synapse Network";
  const version = "1";

  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

  async function makeSUT() {
    return (await deployContract(deployer, SynapseNetworkTokenArtifacts, [deployer.address])) as SynapseNetwork;
  }

  before(async () => {
    chainId = (await deployer.provider.getNetwork()).chainId;
  });

  beforeEach(async () => {
    synapseToken = await makeSUT();
    await advanceTimeAndBlock(3 * 24 * 3600 + 30 * 60);
    await synapseToken.setRestrictionActive(false);
  });

  it("has the expected type hashes", async () => {
    expect(await synapseToken.PERMIT_TYPEHASH()).to.be.equal(PERMIT_TYPEHASH);
    expect(await synapseToken.TRANSFER_TYPEHASH()).to.be.equal(TRANSFER_TYPEHASH);
  });

  describe("Permit", () => {
    // keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");
    const buildData = (chainId, verifyingContract, owner, spender, value, nonce, deadline) => ({
      primaryType: "Permit" as const,
      types: { EIP712Domain, Permit },
      domain: { name, version, chainId, verifyingContract },
      message: { owner, spender, value, nonce, deadline },
    });

    it("should work correctly and emit events", async function () {
      const nonce: number = (await synapseToken.nonces(alice.address)).toNumber();
      const deadline = (await latest()) + 100;

      const data = buildData(chainId, synapseToken.address, alice.address, bob.address, 1, nonce, deadline);
      const signature = signTypedData_v4(toBuffer(alice.privateKey), { data: data });
      const { v, r, s } = fromRpcSig(signature);

      await expect(synapseToken.connect(bob).permit(alice.address, bob.address, 1, deadline, v, r, s))
        .to.emit(synapseToken, "Approval")
        .withArgs(alice.address, bob.address, 1);
      expect(await synapseToken.allowance(alice.address, bob.address)).to.be.equal(1);
      expect(await synapseToken.nonces(alice.address)).to.be.equal(1);
    });

    it("should return correct domain separator", async function () {
      expect(await synapseToken.DOMAIN_SEPARATOR()).to.be.equal(await domainSeparator(name, version, chainId, synapseToken.address));
    });

    it("should revert when address zero is passed as owner argument", async function () {
      const nonce: number = await (await synapseToken.nonces(carol.address)).toNumber();
      const deadline = (await latest()) + 10000;

      const data = buildData(chainId, synapseToken.address, ZERO_ADDRESS, bob.address, 1, nonce, deadline);
      const signature = signTypedData_v4(toBuffer(carol.privateKey), { data: data });
      const { v, r, s } = fromRpcSig(signature);

      await expect(synapseToken.connect(carol).permit(ZERO_ADDRESS, bob.address, 1, deadline, v, r, s)).to.be.revertedWith(
        "ERC20Permit: Permit from zero address"
      );
    });

    it("should revert when address zero is passed as spender argument", async function () {
      const nonce: number = await (await synapseToken.nonces(alice.address)).toNumber();
      const deadline = (await latest()) + 10000;

      const data = buildData(chainId, synapseToken.address, alice.address, ZERO_ADDRESS, 1, nonce, deadline);
      const signature = signTypedData_v4(toBuffer(alice.privateKey), { data: data });
      const { v, r, s } = fromRpcSig(signature);

      await expect(synapseToken.connect(bob).permit(alice.address, ZERO_ADDRESS, 1, deadline, v, r, s)).to.be.revertedWith(
        "ERC20: approve to the zero address"
      );
    });

    it("should revert when deadline is expire", async function () {
      const nonce: number = await (await synapseToken.nonces(alice.address)).toNumber();
      const deadline = (await latest()) - 100;

      const data = buildData(chainId, synapseToken.address, alice.address, bob.address, 1, nonce, deadline);
      const signature = signTypedData_v4(toBuffer(alice.privateKey), { data: data });
      const { v, r, s } = fromRpcSig(signature);

      await expect(synapseToken.connect(bob).permit(alice.address, bob.address, 1, deadline, v, r, s)).to.be.revertedWith(
        "ERC20Permit: expired deadline'"
      );
    });

    it("should revert with wrong signature when signed for different chain", async () => {
      const nonce: number = await (await synapseToken.nonces(alice.address)).toNumber();
      const deadline = (await latest()) + 100;

      const data = buildData(1, synapseToken.address, alice.address, bob.address, 1, nonce, deadline);
      const signature = signTypedData_v4(toBuffer(carol.privateKey), { data: data });
      const { v, r, s } = fromRpcSig(signature);

      await expect(synapseToken.connect(bob).permit(alice.address, bob.address, 1, deadline, v, r, s)).to.be.revertedWith(
        "ERC20Permit: invalid signature'"
      );
    });

    it("should revert with wrong signature when signed for different contract", async () => {
      const nonce: number = await (await synapseToken.nonces(alice.address)).toNumber();
      const deadline = (await latest()) + 100;

      const data = buildData(chainId, fee.address, alice.address, bob.address, 1, nonce, deadline);
      const signature = signTypedData_v4(toBuffer(carol.privateKey), { data: data });
      const { v, r, s } = fromRpcSig(signature);

      await expect(synapseToken.connect(bob).permit(alice.address, bob.address, 1, deadline, v, r, s)).to.be.revertedWith(
        "ERC20Permit: invalid signature'"
      );
    });

    it("should revert with wrong signature when signed with wrong privateKey", async () => {
      const nonce: number = await (await synapseToken.nonces(alice.address)).toNumber();
      const deadline = (await latest()) + 100;

      const data = buildData(chainId, synapseToken.address, alice.address, bob.address, 1, nonce, deadline);
      const signature = signTypedData_v4(toBuffer(carol.privateKey), { data: data });
      const { v, r, s } = fromRpcSig(signature);

      await expect(synapseToken.connect(bob).permit(alice.address, bob.address, 1, deadline, v, r, s)).to.be.revertedWith(
        "ERC20Permit: invalid signature'"
      );
    });

    it("should revert with wrong signature when signature does not match given parameters", async () => {
      const nonce: number = await (await synapseToken.nonces(alice.address)).toNumber();
      const deadline = (await latest()) + 100;

      const data = buildData(chainId, synapseToken.address, alice.address, bob.address, 1, nonce, deadline);
      const signature = signTypedData_v4(toBuffer(alice.privateKey), { data: data });
      const { v, r, s } = fromRpcSig(signature);

      // amount
      await expect(synapseToken.connect(alice).permit(alice.address, bob.address, 2, deadline, v, r, s)).to.be.revertedWith(
        "ERC20Permit: invalid signature'"
      );
      // spender
      await expect(synapseToken.connect(alice).permit(alice.address, carol.address, 1, deadline, v, r, s)).to.be.revertedWith(
        "ERC20Permit: invalid signature'"
      );
      // deadline
      await expect(synapseToken.connect(alice).permit(alice.address, bob.address, 1, deadline + 2, v, r, s)).to.be.revertedWith(
        "ERC20Permit: invalid signature'"
      );
    });
  });

  describe("TransferWithPermit", () => {
    // keccak256("Transfer(address owner,address to,uint256 value,uint256 nonce,uint256 deadline)");
    const buildData = (chainId, verifyingContract, owner, to, value, nonce, deadline) => ({
      primaryType: "Transfer" as const,
      types: { EIP712Domain, Transfer },
      domain: { name, version, chainId, verifyingContract },
      message: { owner, to, value, nonce, deadline },
    });

    it("transfer with permit should work correctly", async function () {
      const nonce: number = await (await synapseToken.nonces(deployer.address)).toNumber();
      const deadline = (await latest()) + 100;

      const data = buildData(chainId, synapseToken.address, deployer.address, bob.address, 10000, nonce, deadline);
      const signature = signTypedData_v4(toBuffer(deployer.privateKey), { data: data });
      const { v, r, s } = fromRpcSig(signature);

      await expect(synapseToken.connect(alice).transferWithPermit(deployer.address, bob.address, 10000, deadline, v, r, s))
        .to.emit(synapseToken, "Transfer")
        .withArgs(deployer.address, bob.address, 10000);
      expect(await synapseToken.balanceOf(bob.address)).to.be.equal(10000);
      expect(await synapseToken.nonces(deployer.address)).to.be.equal(1);
    });

    it("should revert when address zero is passed as owner argument", async function () {
      const nonce: number = await (await synapseToken.nonces(carol.address)).toNumber();
      const deadline = (await latest()) + 10000;

      const data = buildData(chainId, synapseToken.address, ZERO_ADDRESS, bob.address, 1, nonce, deadline);
      const signature = signTypedData_v4(toBuffer(carol.privateKey), { data: data });
      const { v, r, s } = fromRpcSig(signature);

      await expect(synapseToken.connect(carol).transferWithPermit(ZERO_ADDRESS, bob.address, 1, deadline, v, r, s)).to.be.revertedWith(
        "ERC20Permit: Zero address"
      );
    });

    it("should revert when address zero is passed as spender argument", async function () {
      const nonce: number = await (await synapseToken.nonces(alice.address)).toNumber();
      const deadline = (await latest()) + 10000;

      const data = buildData(chainId, synapseToken.address, alice.address, ZERO_ADDRESS, 1, nonce, deadline);
      const signature = signTypedData_v4(toBuffer(alice.privateKey), { data: data });
      const { v, r, s } = fromRpcSig(signature);

      await expect(synapseToken.connect(bob).transferWithPermit(alice.address, ZERO_ADDRESS, 1, deadline, v, r, s)).to.be.revertedWith(
        "ERC20Permit: Zero address"
      );
    });

    it("should revert when deadline is expire", async function () {
      const nonce: number = await (await synapseToken.nonces(alice.address)).toNumber();
      const deadline = (await latest()) - 100;

      const data = buildData(chainId, synapseToken.address, alice.address, bob.address, 1, nonce, deadline);
      const signature = signTypedData_v4(toBuffer(alice.privateKey), { data: data });
      const { v, r, s } = fromRpcSig(signature);

      await expect(synapseToken.connect(bob).transferWithPermit(alice.address, bob.address, 1, deadline, v, r, s)).to.be.revertedWith(
        "ERC20Permit: expired deadline'"
      );
    });

    it("should revert with wrong signature when signed for different chain", async () => {
      const nonce: number = await (await synapseToken.nonces(alice.address)).toNumber();
      const deadline = (await latest()) + 100;

      const data = buildData(1, synapseToken.address, alice.address, bob.address, 1, nonce, deadline);
      const signature = signTypedData_v4(toBuffer(carol.privateKey), { data: data });
      const { v, r, s } = fromRpcSig(signature);

      await expect(synapseToken.connect(bob).transferWithPermit(alice.address, bob.address, 1, deadline, v, r, s)).to.be.revertedWith(
        "ERC20Permit: invalid signature'"
      );
    });

    it("should revert with wrong signature when signed for different contract", async () => {
      const nonce: number = await (await synapseToken.nonces(alice.address)).toNumber();
      const deadline = (await latest()) + 100;

      const data = buildData(chainId, fee.address, alice.address, bob.address, 1, nonce, deadline);
      const signature = signTypedData_v4(toBuffer(carol.privateKey), { data: data });
      const { v, r, s } = fromRpcSig(signature);

      await expect(synapseToken.connect(bob).transferWithPermit(alice.address, bob.address, 1, deadline, v, r, s)).to.be.revertedWith(
        "ERC20Permit: invalid signature'"
      );
    });

    it("should revert with wrong signature when signed with wrong privateKey", async () => {
      const nonce: number = await (await synapseToken.nonces(alice.address)).toNumber();
      const deadline = (await latest()) + 100;

      const data = buildData(chainId, synapseToken.address, alice.address, bob.address, 1, nonce, deadline);
      const signature = signTypedData_v4(toBuffer(carol.privateKey), { data: data });
      const { v, r, s } = fromRpcSig(signature);

      await expect(synapseToken.connect(bob).transferWithPermit(alice.address, bob.address, 1, deadline, v, r, s)).to.be.revertedWith(
        "ERC20Permit: invalid signature'"
      );
    });

    it("should revert with wrong signature when signature does not match given parameters", async () => {
      const nonce: number = await (await synapseToken.nonces(alice.address)).toNumber();
      const deadline = (await latest()) + 100;

      const data = buildData(chainId, synapseToken.address, alice.address, bob.address, 1, nonce, deadline);
      const signature = signTypedData_v4(toBuffer(alice.privateKey), { data: data });
      const { v, r, s } = fromRpcSig(signature);

      // amount
      await expect(synapseToken.connect(alice).transferWithPermit(alice.address, bob.address, 2, deadline, v, r, s)).to.be.revertedWith(
        "ERC20Permit: invalid signature'"
      );
      // spender
      await expect(synapseToken.connect(alice).transferWithPermit(alice.address, carol.address, 1, deadline, v, r, s)).to.be.revertedWith(
        "ERC20Permit: invalid signature'"
      );
      // deadline
      await expect(synapseToken.connect(alice).transferWithPermit(alice.address, bob.address, 1, deadline + 2, v, r, s)).to.be.revertedWith(
        "ERC20Permit: invalid signature'"
      );
    });
  });
});
