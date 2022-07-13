import { GsnTestEnvironment } from "@opengsn/dev";
import { RelayProvider } from "@opengsn/provider";
import { use } from "chai";
import chaiAsPromised from "chai-as-promised";
import { providers, Signer, utils, Wallet } from "ethers";
import { ethers, waffle } from "hardhat";
const { expect } = use(chaiAsPromised);
const Web3HttpProvider = require("web3-providers-http");
const { deployContract } = waffle;

import { AcceptAllPayMaster, CaptureTheFlag } from "../types";

describe("GSN basic testing", () => {
  let contractCreator: Signer;
  let creatorAddress: string;

  let paymaster: AcceptAllPayMaster;
  let ctf: CaptureTheFlag;

  let etherProvider: providers.Web3Provider;
  let gsnProvider: RelayProvider;
  let caller: string;

  before(async () => {
    let env = await GsnTestEnvironment.startGsn("localhost");
    const { forwarderAddress, relayHubAddress } = env.contractsDeployment;
    if (!forwarderAddress || !relayHubAddress) throw "gsn start failed";
    const web3provider = new Web3HttpProvider("http://127.0.0.1:8545");
    const deploymentProvider = new ethers.providers.Web3Provider(web3provider);
    contractCreator = deploymentProvider.getSigner();
    creatorAddress = await contractCreator.getAddress();

    const ctfFactory = await ethers.getContractFactory("CaptureTheFlag", contractCreator);
    ctf = (await ctfFactory.deploy(forwarderAddress)) as CaptureTheFlag;
    await ctf.deployed();

    const paymasterFactory = await ethers.getContractFactory("AcceptAllPayMaster", contractCreator);
    paymaster = (await paymasterFactory.deploy()) as AcceptAllPayMaster;
    await paymaster.deployed();

    await paymaster.setTarget(ctf.address);
    await paymaster.setRelayHub(relayHubAddress);
    await paymaster.setTrustedForwarder(forwarderAddress);

    let config = { paymasterAddress: paymaster.address };
    gsnProvider = await RelayProvider.newProvider({
      provider: web3provider,
      config,
    }).init();

    await contractCreator.sendTransaction({
      to: paymaster.address,
      value: utils.parseEther("1.0"),
    });

    etherProvider = new ethers.providers.Web3Provider(gsnProvider);
  });

  it("setUp", async () => {
    let empty_acct = Wallet.createRandom();
    gsnProvider.addAccount(empty_acct.privateKey);
    caller = empty_acct.address;
    console.log("\nCaller: ", caller);
    ctf = ctf.connect(etherProvider.getSigner(caller));
    await ctf.captureFlag();
    expect(empty_acct.address).to.be.eq(await ctf.flagHolder());
  });
});
