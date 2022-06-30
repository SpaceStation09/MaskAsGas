// reference: https://github.com/qbzzt/opengsn/blob/master/01_SimpleUse/test/testcontracts.js
import { ethers, upgrades } from "hardhat";
import { BigNumber, Signer, utils, providers, Contract } from "ethers";
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

describe("GSN basic testing", () => {
  let contractCreator: Signer;

  let targetContract: Contract;
  let paymasterContract: Contract;

  let provider: providers.Web3Provider;

  before(async () => {
    let signers = await ethers.getSigners();
    contractCreator = signers[0];
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
    provider = new ethers.providers.Web3Provider(gsnProvider);
    let tx = await contractCreator.sendTransaction({
      to: paymasterAddr.address,
      value: utils.parseEther("1.0"), // Sends exactly 1.0 ether
    });
  });

  it("setups", async () => {
    let acct = ethers.Wallet.createRandom(provider);
    acct = new ethers.Wallet(acct.privateKey, provider);

    expect(await acct.getBalance()).to.be.eq(BigNumber.from(0));
    await targetContract.connect(acct).captureFlag();
  });

  // it("setups", async () => {
  // });
});
