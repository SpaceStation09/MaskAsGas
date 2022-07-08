import { Signer, utils } from "ethers";
import { waffle } from "hardhat";
const { deployContract } = waffle;

import UniswapFactoryArtifact from "../artifacts/contracts/Uniswap/UniswapV2Factory.sol/UniswapV2Factory.json";
import RouterArtifact from "../artifacts/contracts/Uniswap/UniswapV2Router02.sol/UniswapV2Router02.json";
import { MaskToken, UniswapV2Factory, UniswapV2Router02, WETH9 } from "../types";

interface UniswapToolKit {
  factory: UniswapV2Factory;
  router: UniswapV2Router02;
  pair: string;
}

export const setUpUniswap = async (contractCreator: Signer, Mask: MaskToken, Weth: WETH9): Promise<UniswapToolKit> => {
  const creatorAddress = await contractCreator.getAddress();
  const factory = (await deployContract(contractCreator, UniswapFactoryArtifact, [creatorAddress])) as UniswapV2Factory;
  const router = (await deployContract(contractCreator, RouterArtifact, [
    factory.address,
    Weth.address,
  ])) as UniswapV2Router02;

  await Mask.approve(router.address, utils.parseEther("300"));
  await Weth.approve(router.address, utils.parseEther("300"));

  await router.addLiquidity(
    Mask.address,
    Weth.address,
    utils.parseEther("100"),
    utils.parseEther("100"),
    0,
    0,
    creatorAddress,
    Math.floor(Date.now() / 1000) + 1800,
  );
  const pair = await factory.getPair(Mask.address, Weth.address);
  return {
    factory,
    router,
    pair,
  };
};
