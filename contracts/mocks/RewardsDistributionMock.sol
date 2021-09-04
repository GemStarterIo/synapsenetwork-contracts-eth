// SPDX-License-Identifier: MIT

pragma solidity 0.8.6;

import { RewardsDistribution } from "../abstract/RewardsDistribution.sol";

contract RewardsDistributionMock is RewardsDistribution {
    function distribute() external onlyRewardsDistributor {}
}
