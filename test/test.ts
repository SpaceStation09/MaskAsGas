// reference: https://github.com/qbzzt/opengsn/blob/master/01_SimpleUse/test/testcontracts.js
import { ethers, upgrades } from "hardhat";
import { BigNumber, Signer, utils, providers, Contract, Wallet } from "ethers";
import { RelayProvider } from "@opengsn/provider";
import { GsnTestEnvironment } from "@opengsn/dev";
import { use } from "chai";
import chaiAsPromised from "chai-as-promised";
const { expect } = use(chaiAsPromised);
const Web3HttpProvider = require("web3-providers-http");

import redPacketArtifact from "../artifacts/contracts/RedPacket.sol/RedPacket.json";
import paymasterAddr from "../build/gsn/Paymaster.json";
// import forwarderAddr from "../build/gsn/Forwarder.json";
// import relayHubrAddr from "../build/gsn/RelayHub.json";

describe("RedPacket testing", () => {
  let contractCreator: Signer;
  let signer2: Signer;
  let acct: Wallet;
  let targetContract: Contract;
  let paymasterContract: Contract;
  let maskToken: Contract;
  let weth: Contract;
  let router: Contract;

  let pair: string;

  let provider: providers.Web3Provider;

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

    // GSN
    let env = await GsnTestEnvironment.startGsn("localhost");
    const { forwarderAddress, relayHubAddress } = env.contractsDeployment;

    // const factory = await ethers.getContractFactory("RedPacket");
    // const proxy = await upgrades.deployProxy(factory, [forwarderAddress], { unsafeAllow: ["delegatecall"] });
    // targetContract = new ethers.Contract(proxy.address, redPacketArtifact.abi, contractCreator);

    const ctfFactory = await ethers.getContractFactory("CaptureTheFlag");
    targetContract = await ctfFactory.deploy(forwarderAddress);
    await targetContract.deployed();
    const paymasterFactory = await ethers.getContractFactory("AcceptAllPayMaster");
    paymasterContract = await paymasterFactory.deploy();
    await paymasterContract.deployed();

    await paymasterContract.setTarget(targetContract.address);
    await paymasterContract.setRelayHub(relayHubAddress);
    await paymasterContract.setTrustedForwarder(forwarderAddress);
    // if only paying for whitelisted contracts
    // await paymasterContract.setTarget(redPacketContract.address);
    let conf = { paymasterAddress: paymasterContract.address };
    const web3provider: any = new Web3HttpProvider("http://localhost:8545");
    let gsnProvider = await RelayProvider.newProvider({ provider: web3provider, config: conf }).init();
    acct = ethers.Wallet.createRandom();
    gsnProvider.addAccount(acct.privateKey);
    provider = new ethers.providers.Web3Provider(gsnProvider);

    let tx = await contractCreator.sendTransaction({
      to: paymasterAddr.address,
      value: utils.parseEther("1.0"), // Sends exactly 1.0 ether
    });
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

  it("GSN", async () => {
    acct = new ethers.Wallet(acct.privateKey, provider);
    expect(await acct.getBalance()).to.be.eq(BigNumber.from(0));
    targetContract.connect(provider.getSigner(acct.address));
    await targetContract.captureFlag();
  });
});

async function deployContract(_name, ..._args): Promise<Contract> {
  let contractFactory = await ethers.getContractFactory(_name);
  let contractObject = await contractFactory.deploy(..._args);
  await contractObject.deployed();
  return contractObject;
}
