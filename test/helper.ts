import { providers } from "ethers";
import { ethers, network } from "hardhat";

export async function advanceTime(time: number) {
  await network.provider.send("evm_increaseTime", [time]);
}

export async function advanceBlock() {
  await network.provider.send("evm_mine", []);
}

export async function advanceTimeAndBlock(time: number): Promise<providers.Block> {
  await advanceTime(time);
  await advanceBlock();
  return Promise.resolve(ethers.provider.getBlock("latest"));
}

export async function takeSnapshot() {
  return network.provider.send("evm_snapshot", []);
}

export async function revertToSnapShot(id: string) {
  await network.provider.send("evm_revert", [id]);
}
