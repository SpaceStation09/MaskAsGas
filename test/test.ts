// reference: https://github.com/qbzzt/opengsn/blob/master/01_SimpleUse/test/testcontracts.js
import { GsnTestEnvironment } from "@opengsn/dev";
import { RelayProvider } from "@opengsn/provider";
import { use } from "chai";
import chaiAsPromised from "chai-as-promised";
import { constants, providers, Signer, utils, Wallet } from "ethers";
import { ethers, upgrades, waffle } from "hardhat";
import MaskArtifact from "../artifacts/contracts/Mask.sol/MaskToken.json";
import PaymasterArtifact from "../artifacts/contracts/payMaster.sol/MaskPayMaster.json";
import RedPacketArtifact from "../artifacts/contracts/RedPacket.sol/RedPacket.json";
import WETHArtifact from "../artifacts/contracts/WETH.sol/WETH9.json";
import { MaskPayMaster, MaskToken, RedPacket, UniswapV2Router02, WETH9 } from "../types";
import { ftCreationParam } from "./constants";
import { setUpMask, setUpUniswap } from "./setUpUniswap";
const { expect } = use(chaiAsPromised);
const Web3HttpProvider = require("web3-providers-http");
const { deployContract } = waffle;

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
  let normalProvider: providers.Web3Provider;

  before(async () => {
    let env = await GsnTestEnvironment.startGsn("localhost");
    const { forwarderAddress, relayHubAddress } = env.contractsDeployment;
    if (!forwarderAddress || !relayHubAddress) throw "gsn start failed";
    const web3provider = new Web3HttpProvider("http://localhost:8545");
    normalProvider = new ethers.providers.Web3Provider(web3provider);
    contractCreator = normalProvider.getSigner();
    testUniswapAcc = normalProvider.getSigner(1);
    creatorAddress = await contractCreator.getAddress();
    testUniAddress = await testUniswapAcc.getAddress();

    Mask = (await deployContract(contractCreator, MaskArtifact)) as MaskToken;
    Weth = (await deployContract(contractCreator, WETHArtifact)) as WETH9;
    await Weth.deposit({ value: utils.parseEther("20") });
    const uniswapSet = await setUpUniswap(contractCreator, Mask, Weth);
    pair = uniswapSet.pair;
    router = uniswapSet.router;

    const factory = await ethers.getContractFactory("RedPacket");
    const proxy = await upgrades.deployProxy(factory, [forwarderAddress], { unsafeAllow: ["delegatecall"] });
    redpacket = new ethers.Contract(proxy.address, RedPacketArtifact.abi, contractCreator) as RedPacket;

    paymaster = (await deployContract(contractCreator, PaymasterArtifact, [
      pair,
      Mask.address,
      Weth.address,
      router.address,
    ])) as MaskPayMaster;

    await paymaster.setTarget(redpacket.address);
    await paymaster.setRelayHub(relayHubAddress);
    await paymaster.setTrustedForwarder(forwarderAddress);

    // AuditorCount is only for test usage. Please take care.
    let conf = { paymasterAddress: paymaster.address, auditorsCount: 0, logLevel: "error" };
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

  it("test uniswap works fine", async () => {
    await Mask.transfer(testUniAddress, utils.parseEther("100"));
    expect(await Mask.balanceOf(testUniAddress)).to.be.eq(utils.parseEther("100"));

    await Mask.connect(testUniswapAcc).approve(router.address, constants.MaxUint256);
    await router
      .connect(testUniswapAcc)
      .swapTokensForExactTokens(
        utils.parseEther("1"),
        constants.MaxUint256,
        [Mask.address, Weth.address],
        testUniAddress,
        Math.floor(Date.now() / 1000) + 1800,
      );
    expect(await Weth.balanceOf(testUniAddress)).to.be.eq(utils.parseEther("1"));
  });

  it("Create redpacket works fine", async () => {
    let emptyAcct = new Wallet(Buffer.from("1".repeat(64), "hex"), normalProvider);
    gsnProvider.addAccount(emptyAcct.privateKey);
    caller = emptyAcct.address;
    await setUpMask(contractCreator, emptyAcct, Mask, paymaster.address);

    await redpacket
      .connect(etherProvider.getSigner(caller))
      .createRedPacket.apply(null, Object.values(ftCreationParam));
  });
});
