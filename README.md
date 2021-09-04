# Synapse Network Contract

Mainnet addresses:

- SynapseNetwork: [0x6911F552842236bd9E8ea8DDBB3fb414e2C5FA9d](https://etherscan.io/address/0x6911f552842236bd9e8ea8ddbb3fb414e2c5fa9d)
- SynapseVesting: [0xDf3E63507100DFdeD269Ee113D6C8Fb9Dc086546](https://etherscan.io/address/0xDf3E63507100DFdeD269Ee113D6C8Fb9Dc086546)
- SynapseStaking: [0xe60F6b54F6Ac0a41caf41B324c2B7e8280fCf749](https://etherscan.io/address/0xe60f6b54f6ac0a41caf41b324c2b7e8280fcf749)

## Tools

- [Hardhat](https://github.com/nomiclabs/hardhat): compile and run the smart contracts on a local development network
- [TypeChain](https://github.com/ethereum-ts/TypeChain): generate TypeScript types for smart contracts
- [Ethers](https://github.com/ethers-io/ethers.js/): renowned Ethereum library and wallet implementation
- [Waffle](https://github.com/EthWorks/Waffle): tooling for writing comprehensive smart contract tests
- [Solhint](https://github.com/protofire/solhint): linter
- [Solcover](https://github.com/sc-forks/solidity-coverage) code coverage
- [Prettier Plugin Solidity](https://github.com/prettier-solidity/prettier-plugin-solidity): code formatter

## Usage

### Pre Requisites

Before running any command, make sure to install dependencies:

```sh
$ yarn install
```

### Deploy

Deploy to Ethereum network:

```sh
$ yarn deploy:mainnet "Tag"
```

### Compile

Compile the smart contracts with Hardhat:

```sh
$ yarn compile
```

### TypeChain

Compile the smart contracts and generate TypeChain artifacts:

```sh
$ yarn build
```

### Lint Solidity

Lint the Solidity code:

```sh
$ yarn lint:sol
```

### Lint TypeScript

Lint the TypeScript code:

```sh
$ yarn lint:ts
```

### Test

Run the Mocha tests:

```sh
$ yarn test
```

### Coverage

Generate the code coverage report:

```sh
$ yarn coverage
```

### Clean

Delete the smart contract artifacts, the coverage reports and the Hardhat cache:

```sh
$ yarn clean
```
