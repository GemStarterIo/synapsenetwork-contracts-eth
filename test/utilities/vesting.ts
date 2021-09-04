import { BigNumber } from "ethers";

export async function countClaimable(
  currentBlockTime: BigNumber,
  vestingStartTime: BigNumber,
  vestingEndTime: BigNumber,
  vestingStartTokens: BigNumber,
  vestingTotalTokens: BigNumber,
  vestingClaimedTokens: BigNumber
): Promise<BigNumber> {
  if (vestingStartTime.gt(currentBlockTime)) {
    return BigNumber.from(0);
  }

  const ether: BigNumber = BigNumber.from(1).mul(BigNumber.from(10).pow(18));
  let canWithdraw: BigNumber;

  // we are somewhere in the middle
  if (currentBlockTime.lt(vestingEndTime)) {
    // how much time passed (as fraction * 10^18)
    const timeRatio: BigNumber = currentBlockTime.sub(vestingStartTime).mul(ether).div(vestingEndTime.sub(vestingStartTime));
    // how much tokens we can get in total to date
    canWithdraw = vestingTotalTokens.sub(vestingStartTokens).mul(timeRatio).div(ether).add(vestingStartTokens);
  }
  // time has passed, we can take all tokens
  else {
    canWithdraw = vestingTotalTokens;
  }
  // but maybe we take something earlier?
  canWithdraw = canWithdraw.sub(vestingClaimedTokens);

  return canWithdraw;
}

export const USD_AMOUNT_SEED: number[] = [27000, 25000, 15000, 500, 10000];
export const USD_AMOUNT_PRIVATE_A: number[] = [50000, 25000, 50000, 2500, 1000];
export const USD_AMOUNT_PRIVATE_B: number[] = [25000, 50000, 50000];
export const USD_AMOUNT_COMMUNITY_ETH: number[] = [25000, 50000, 50000, 550000, 250000, 35000];
export const USD_AMOUNT_COMMUNITY_BSC: number[] = [25000, 50000, 50000, 100000, 250000, 25000];
export const USD_AMOUNT_COMMUNITY_POLYGON: number[] = [25000, 50000, 50000];
export const USD_AMOUNT_PUBLIC: number[] = [50000, 25000, 50000, 2500, 100000];
