import { constants, providers, Signer, utils } from "ethers";
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

  await Mask.approve(router.address, utils.parseEther("1000"));

  await router.addLiquidityETH(
    Mask.address,
    utils.parseEther("1000"),
    0,
    0,
    creatorAddress,
    Math.floor(Date.now() / 1000) + 1800,
    { value: utils.parseEther("1000") },
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
  normalProvider: providers.Web3Provider,
) => {
  const testAddress = await testAccount.getAddress();
  const creatorAddress = await contractCreator.getAddress();
  await Mask.connect(contractCreator).transfer(testAddress, utils.parseEther("1000"));
  await contractCreator.sendTransaction({
    to: testAddress,
    value: utils.parseEther("0.5"),
  });
  await Mask.connect(testAccount).approve(paymasterAddress, constants.MaxUint256);

  const currentBalance = await normalProvider.getBalance(testAddress);
  const gasValue = utils.parseUnits("42000", "gwei");
  await testAccount.sendTransaction({
    to: creatorAddress,
    value: currentBalance.sub(gasValue),
  });
};
