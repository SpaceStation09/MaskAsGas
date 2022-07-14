import { constants, Signer, utils } from "ethers";
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

  await Mask.approve(router.address, utils.parseEther("200"));
  await Weth.approve(router.address, utils.parseEther("20"));

  await router.addLiquidity(
    Mask.address,
    Weth.address,
    utils.parseEther("200"),
    utils.parseEther("20"),
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

export const setUpMask = async (
  contractCreator: Signer,
  testAccount: Signer,
  Mask: MaskToken,
  paymasterAddress: string,
) => {
  const testAddress = await testAccount.getAddress();
  await Mask.connect(contractCreator).transfer(testAddress, utils.parseEther("1000"));
  await contractCreator.sendTransaction({
    to: testAddress,
    value: utils.parseEther("0.0005"),
  });
  await Mask.connect(testAccount).approve(paymasterAddress, constants.MaxUint256);
};
