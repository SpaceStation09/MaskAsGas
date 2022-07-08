import { BigNumber, constants, utils, Wallet } from "ethers";

const testWallet = Wallet.createRandom();
export const testPrivateKey = testWallet.privateKey;
const testAddress = testWallet.address;
export const passwd = "password";
const ethAddress = constants.AddressZero;
const seed = utils.sha256(utils.toUtf8Bytes("lajsdklfjaskldfhaikl"));

export const ftCreationParam: FtCreationParamType = {
  publicKey: testAddress,
  number: 3,
  ifrandom: true,
  duration: 1000,
  seed,
  message: "hi",
  name: "test",
  tokenType: 0,
  tokenAddr: ethAddress,
  totalTokens: 100000000,
  txParameters: {
    gasLimit: BigNumber.from("6000000"),
    value: BigNumber.from("100000000"),
  },
};

export interface FtCreationParamType {
  publicKey: string;
  number: number;
  ifrandom: boolean;
  duration: number;
  seed: string;
  message: string;
  name: string;
  tokenType: number;
  tokenAddr: string;
  totalTokens: number;
  txParameters?: TxParameter;
}

interface TxParameter {
  gasLimit?: BigNumber;
  value?: BigNumber;
}
