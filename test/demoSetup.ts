// reference: https://github.com/qbzzt/opengsn/blob/master/01_SimpleUse/test/testcontracts.js
import { RelayProvider } from "@opengsn/provider";
import { use } from "chai";
import chaiAsPromised from "chai-as-promised";
import { BigNumber, providers, Signer, utils, Wallet } from "ethers";
import { writeFileSync } from "fs";
import { ethers, waffle } from "hardhat";
import CTFArtifact from "../artifacts/contracts/CaptureTheFlag.sol/CaptureTheFlag.json";
import MaskArtifact from "../artifacts/contracts/Mask.sol/MaskToken.json";
import PaymasterArtifact from "../artifacts/contracts/payMaster.sol/MaskPayMaster.json";
import WETHArtifact from "../artifacts/contracts/WETH.sol/WETH9.json";
import forwarder from "../build/gsn/Forwarder.json";
import relayHub from "../build/gsn/RelayHub.json";
import { CaptureTheFlag, MaskPayMaster, MaskToken, UniswapV2Router02, WETH9 } from "../types";
import { setUpMask, setUpUniswap } from "./setUp";
const { expect } = use(chaiAsPromised);
const Web3HttpProvider = require("web3-providers-http");
const { deployContract } = waffle;

describe("GSN setup", () => {
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
    let forwarderAddress = forwarder.address;
    let relayHubAddress = relayHub.address;
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
    let contractAddresses = {
      ctf: ctf.address,
      mask: Mask.address,
      paymaster: paymaster.address,
    };
    var json = JSON.stringify(contractAddresses);
    console.log(json);
    writeFileSync("./build/gsn/ContractAddresses.json", json, { flag: "w" });

    console.log("\nctf address: ", ctf.address);
    console.log("mask address: ", Mask.address);
    console.log("paymaster address: ", paymaster.address);

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

  it("Account setup", async () => {
    // let newAccount = generateEmptyWallet();
    let newAccount = new Wallet("0ae9051f39a93b704fc1c08f569e481e69a30c5edd73442466734fb09e2ff786", etherProvider);
    caller = newAccount.address;
    await setUpMask(contractCreator, newAccount, Mask, paymaster.address);
    const MaskBalanceBefore = await Mask.balanceOf(caller);
    console.log(MaskBalanceBefore.toString(), caller);
  });
});
