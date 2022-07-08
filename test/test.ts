// reference: https://github.com/qbzzt/opengsn/blob/master/01_SimpleUse/test/testcontracts.js
import { GsnTestEnvironment } from "@opengsn/dev";
import { RelayProvider } from "@opengsn/provider";
import { use } from "chai";
import chaiAsPromised from "chai-as-promised";
import { constants, providers, Signer, utils, Wallet } from "ethers";
import { ethers, waffle } from "hardhat";
import { ftCreationParam } from "./constants";
import { revertToSnapShot, takeSnapshot } from "./helper";
import { setUpUniswap } from "./setUpUniswap";
const { expect } = use(chaiAsPromised);
const Web3HttpProvider = require("web3-providers-http");
const { deployContract } = waffle;

import MaskArtifact from "../artifacts/contracts/Mask.sol/MaskToken.json";
import PaymasterArtifact from "../artifacts/contracts/payMaster.sol/MaskPayMaster.json";
import RedPacketArtifact from "../artifacts/contracts/RedPacket.sol/RedPacket.json";
import WETHArtifact from "../artifacts/contracts/WETH.sol/WETH9.json";
import { MaskPayMaster, MaskToken, RedPacket, UniswapV2Router02, WETH9 } from "../types";

describe("GSN basic testing", () => {
  let contractCreator: Signer;
  let creatorAddress: string;
  let testUniswapAcc: Signer;
  let testUniAddress: string;

  let redpacket: RedPacket;
  let paymaster: MaskPayMaster;
  let Mask: MaskToken;
  let Weth: WETH9;
  let pair: string;
  let router: UniswapV2Router02;

  let etherProvider: providers.Web3Provider;
  let gsnProvider: RelayProvider;
  let caller: string;
  let snapshotId: string;

  before(async () => {
    let env = await GsnTestEnvironment.startGsn("localhost");
    const { forwarderAddress, relayHubAddress } = env.contractsDeployment;
    if (!forwarderAddress || !relayHubAddress) throw "gsn start failed";
    const web3provider = new Web3HttpProvider("http://localhost:8545");
    const deploymentProvider = new ethers.providers.Web3Provider(web3provider);
    contractCreator = deploymentProvider.getSigner();
    testUniswapAcc = deploymentProvider.getSigner(1);
    creatorAddress = await contractCreator.getAddress();
    testUniAddress = await testUniswapAcc.getAddress();

    redpacket = (await deployContract(contractCreator, RedPacketArtifact)) as RedPacket;
    paymaster = (await deployContract(contractCreator, PaymasterArtifact)) as MaskPayMaster;
    Mask = (await deployContract(contractCreator, MaskArtifact)) as MaskToken;
    Weth = (await deployContract(contractCreator, WETHArtifact)) as WETH9;

    await Weth.deposit({ value: utils.parseEther("600") });
    const uniswapSet = await setUpUniswap(contractCreator, Mask, Weth);
    pair = uniswapSet.pair;
    router = uniswapSet.router;

    await paymaster.setTarget(redpacket.address);
    await paymaster.setRelayHub(relayHubAddress);
    await paymaster.setTrustedForwarder(forwarderAddress);

    let conf = { paymasterAddress: paymaster.address };
    gsnProvider = await RelayProvider.newProvider({
      provider: web3provider,
      config: conf,
    }).init();

    await contractCreator.sendTransaction({
      to: paymaster.address,
      value: utils.parseEther("1.0"),
    });

    etherProvider = new ethers.providers.Web3Provider(gsnProvider);
  });

  beforeEach(async () => {
    snapshotId = await takeSnapshot();
  });

  afterEach(async () => {
    await revertToSnapShot(snapshotId);
  });

  it("test uniswap works fine", async () => {
    await Mask.transfer(testUniAddress, utils.parseEther("100"));
    expect(await Mask.balanceOf(testUniAddress)).to.be.eq(utils.parseEther("100"));

    await Mask.connect(testUniswapAcc).approve(pair, constants.MaxUint256);
    await Mask.connect(testUniswapAcc).approve(router.address, constants.MaxUint256);

    await router
      .connect(testUniswapAcc)
      .swapTokensForExactETH(
        utils.parseEther("10"),
        constants.MaxUint256,
        [Mask.address, Weth.address],
        testUniAddress,
        Math.floor(Date.now() / 1000) + 1800,
      );

    expect(await Weth.balanceOf(testUniAddress)).to.be.eq(utils.parseEther("10"));
  });

  it("Create redpacket works fine", async () => {
    let empty_acct = Wallet.createRandom();
    redpacket = connectContract(empty_acct);
    redpacket.createRedPacket.apply(null, Object.values(ftCreationParam));
  });

  const connectContract = (acct: Wallet): RedPacket => {
    gsnProvider.addAccount(acct.privateKey);
    caller = acct.address;
    return redpacket.connect(etherProvider.getSigner(caller));
  };
});
