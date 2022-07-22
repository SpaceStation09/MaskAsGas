const ethers = require("ethers");
const { RelayProvider } = require("@opengsn/provider");

let CTFArtifact = require("../artifacts/contracts/CaptureTheFlag.sol/CaptureTheFlag.json");
let MaskArtifact = require("../artifacts/contracts/Mask.sol/MaskToken.json");
let ContractAddresses = require("../build/gsn/ContractAddresses.json");
// let contractAddress = "0xc6e7DF5E7b4f2A278906862b61205850344D4e7d";
// let maskAddress = "0x9A676e781A523b5d0C0e43731313A708CB607508";
// let paymasterAddress = "0x59b670e9fA9D0A427751Af201D676719a970857b";
let contractAddress = ContractAddresses.ctf;
let maskAddress = ContractAddresses.mask;
let paymasterAddress = ContractAddresses.paymaster;
let theContract;
let maskContract;
let provider;
let account;

async function initContract() {
  if (!window.ethereum) {
    throw new Error("provider not found");
  }
  account = await window.ethereum.request({ method: "eth_requestAccounts" }).catch((error) => {
    console.error(error);
  });
  console.log(account);
  window.ethereum.on("accountsChanged", () => {
    window.location.reload();
    console.log("acct");
  });
  window.ethereum.on("chainChanged", () => {
    window.location.reload();
    console.log("chainChained");
  });
  const networkId = await window.ethereum.request({ method: "net_version" });
  console.log(networkId);
  const gsnProvider = await RelayProvider.newProvider({
    provider: window.ethereum,
    config: {
      //loggerConfiguration: { logLevel: 'error' },
      paymasterAddress: paymasterAddress,
    },
  }).init();

  provider = new ethers.providers.Web3Provider(gsnProvider);
  theContract = new ethers.Contract(contractAddress, CTFArtifact.abi, provider);
  maskContract = new ethers.Contract(maskAddress, MaskArtifact.abi, provider);
  await updateTxt();
}

async function contractCall() {
  console.log("account[0]: ", account[0]);
  // await theContract.captureFlag();
  await theContract.connect(provider.getSigner(account[0])).captureFlag();
  await updateTxt();
  // const transaction = await theContract.captureTheFlag();
  // const hash = transaction.hash;
  // console.log(`Transaction ${hash} sent`);
  // const receipt = await provider.waitForTransaction(hash);
  // console.log(`Mined in block: ${receipt.blockNumber}`);
}

async function updateTxt() {
  const holderAddrElement = document.getElementById("holderAddr");
  holderAddrElement.innerHTML = await theContract.flagHolder();
  const maskBalElement = document.getElementById("maskBal");
  maskBalElement.innerHTML = await maskContract.balanceOf(account[0]);
}

function test() {
  console.log("test triggered");
}

window.app = {
  initContract,
  contractCall,
  test,
};
