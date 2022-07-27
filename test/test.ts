// reference: https://github.com/qbzzt/opengsn/blob/master/01_SimpleUse/test/testcontracts.js
import { GsnTestEnvironment } from "@opengsn/dev";
import { RelayProvider } from "@opengsn/provider";
import { use } from "chai";
import chaiAsPromised from "chai-as-promised";
import { BigNumber, constants, providers, Signer, utils, Wallet } from "ethers";
import { ethers, waffle } from "hardhat";
import CTFArtifact from "../artifacts/contracts/CaptureTheFlag.sol/CaptureTheFlag.json";
import MaskArtifact from "../artifacts/contracts/Mask.sol/MaskToken.json";
import PaymasterArtifact from "../artifacts/contracts/payMaster.sol/MaskPayMaster.json";
import WETHArtifact from "../artifacts/contracts/WETH.sol/WETH9.json";
import { CaptureTheFlag, MaskPayMaster, MaskToken, UniswapV2Router02, WETH9 } from "../types";
import { setUpMask, setUpUniswap } from "./setUp";
const { expect } = use(chaiAsPromised);
const Web3HttpProvider = require("web3-providers-http");
const { deployContract } = waffle;

describe("GSN basic testing", () => {
  let contractCreator: Signer;
  let creatorAddress: string;
  let testUniswapAcc: Signer;
  let testUniAddress: string;

  let paymaster: MaskPayMaster;
  let Mask: MaskToken;
  let Weth: WETH9;
  let pair: string;
  let router: UniswapV2Router02;
  let ctf: CaptureTheFlag;

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
    const uniswapSet = await setUpUniswap(contractCreator, Mask, Weth);
    pair = uniswapSet.pair;
    router = uniswapSet.router;

    ctf = (await deployContract(contractCreator, CTFArtifact, [forwarderAddress])) as CaptureTheFlag;

    //#region paymaster deployment and setup
    paymaster = (await deployContract(contractCreator, PaymasterArtifact, [
      pair,
      Mask.address,
      Weth.address,
      router.address,
    ])) as MaskPayMaster;

    await paymaster.setTarget(ctf.address);
    await paymaster.setRelayHub(relayHubAddress);
    await paymaster.setTrustedForwarder(forwarderAddress);
    await paymaster.setPostGasUsed(BigNumber.from("300000"));
    // #endregion

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
    const testAccBefore = await normalProvider.getBalance(testUniAddress);

    await Mask.connect(testUniswapAcc).approve(router.address, constants.MaxUint256);
    await router
      .connect(testUniswapAcc)
      .swapTokensForExactETH(
        utils.parseEther("1"),
        constants.MaxUint256,
        [Mask.address, Weth.address],
        testUniAddress,
        Math.floor(Date.now() / 1000) + 1800,
      );
    expect(await normalProvider.getBalance(testUniAddress)).to.be.gt(testAccBefore);
  });

  it("Test capture the flag works fine", async () => {
    let newAccount = generateEmptyWallet();
    caller = newAccount.address;
    await setUpMask(contractCreator, newAccount, Mask, paymaster.address, normalProvider);
    const MaskBalanceBefore = await Mask.balanceOf(caller);

    await ctf.connect(etherProvider.getSigner(caller)).captureFlag();

    const currentOwner = await ctf.flagHolder();
    const MaskBalanceAfter = await Mask.balanceOf(caller);
    expect(currentOwner).to.be.eq(caller);
    expect(MaskBalanceAfter).to.be.lt(MaskBalanceBefore);
  });

  const generateEmptyWallet = (): Wallet => {
    let emptyAcct = Wallet.createRandom().connect(normalProvider);
    // let emptyAcct = new Wallet(Buffer.from("1".repeat(64), "hex"), normalProvider);
    gsnProvider.addAccount(emptyAcct.privateKey);
    return emptyAcct;
  };
});
