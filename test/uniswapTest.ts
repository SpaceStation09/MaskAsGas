import { ethers, upgrades } from "hardhat";
import { BigNumber, Signer, utils, providers, Contract, Wallet } from "ethers";
import { use } from "chai";
import chaiAsPromised from "chai-as-promised";
const { expect } = use(chaiAsPromised);

describe("Uniswap testing", () => {
  let contractCreator: Signer;
  let signer2: Signer;
  let maskToken: Contract;
  let weth: Contract;
  let router: Contract;

  let pair: string;

  before(async () => {
    let signers = await ethers.getSigners();
    contractCreator = signers[0];
    signer2 = signers[1];

    // uniswap
    maskToken = await deployContract("MaskToken");
    weth = await deployContract("WETH9");
    await weth.deposit({ value: utils.parseEther("600") });
    let factory = await deployContract("UniswapV2Factory", await contractCreator.getAddress());
    router = await deployContract("UniswapV2Router02", factory.address, weth.address);

    await maskToken.approve(router.address, utils.parseEther("300"));
    await weth.approve(router.address, utils.parseEther("300"));

    await router.addLiquidity(
      maskToken.address,
      weth.address,
      utils.parseEther("100"),
      utils.parseEther("100"),
      0,
      0,
      await contractCreator.getAddress(),
      Math.floor(Date.now() / 1000) + 1800,
    );
    pair = await factory.getPair(maskToken.address, weth.address);
    expect(await maskToken.balanceOf(pair)).to.be.eq(utils.parseEther("100"));
    expect(await weth.balanceOf(pair)).to.be.eq(utils.parseEther("100"));
  });

  it("uniswap", async () => {
    await maskToken.transfer(await signer2.getAddress(), utils.parseEther("100"));
    expect(await maskToken.balanceOf(await signer2.getAddress())).to.be.eq(utils.parseEther("100"));
    await maskToken.connect(signer2).approve(pair, ethers.constants.MaxUint256);
    await maskToken.connect(signer2).approve(router.address, ethers.constants.MaxUint256);
    await router
      .connect(signer2)
      .swapTokensForExactTokens(
        utils.parseEther("10"),
        ethers.constants.MaxUint256,
        [maskToken.address, weth.address],
        await signer2.getAddress(),
        Math.floor(Date.now() / 1000) + 1800,
      );
    expect(await weth.balanceOf(await signer2.getAddress())).to.be.eq(utils.parseEther("10"));
  });
});

async function deployContract(_name, ..._args): Promise<Contract> {
  let contractFactory = await ethers.getContractFactory(_name);
  let contractObject = await contractFactory.deploy(..._args);
  await contractObject.deployed();
  return contractObject;
}
