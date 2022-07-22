import { RelayProvider } from "@opengsn/provider";

interface Tindow {
  ethereum: any;
  location: any;
}

let theContract;
let provider;
let window: Tindow;

async function initContract() {
  console.log("init");
  if (!window.ethereum) {
    throw new Error("provider not found");
  }
  let account = await window.ethereum.request({ method: "eth_requestAccounts" }).catch((error) => {
    console.error(error);
  });
  window.ethereum.on("accountsChanged", () => {
    window.location.reload();
    console.log("acct");
  });
  window.ethereum.on("chainChanged", () => {
    window.location.reload();
    console.log("chainChained");
  });
  const networkId = await window.ethereum.request({ method: "net_version" });

  const gsnProvider = await RelayProvider.newProvider({
    provider: window.ethereum,
    config: {
      //loggerConfiguration: { logLevel: 'error' },
      paymasterAddress: "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707",
    },
  }).init();

  // provider = new ethers.providers.Web3Provider(gsnProvider);
}
