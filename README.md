# Mask As Gas

This is a demo project to implement a system where we can interact with an contract and pay the gas fee with $MASK instead of ETH. The example recipient contract is [`redpacket.sol`](./contracts/redpacket.sol).

## Overview

This demo adopted an existing solution to achieve the goal of using $MASK to pay for the gas fee. The solution is [Gas Station Network (GSN)](https://docs.opengsn.org/#the-problem). Sometimes, some users are lack of $ETH, but they may have some $MASK just because they have participated in our former activities. In the past period, they can interact with their $MASK or other smart contracts only when they have enough $ETH to pay for the transaction fee. With GSN, gasless users are able to interact with our smart contracts even if they only have some $MASK.

> Ethereum Gas Station Network (GSN) abstracts away gas to minimize onboarding & UX friction for dapps. The GSN is a decentralized system that improves dapp usability without sacrificing security.

If you want to dive deep into GSN, you can check the detail at their [official doc](https://docs.opengsn.org/).
In the following part of this doc, we'll only focus on how we adopted GSN in our demo.

## Components

We mainly implemented two contracts: [`Paymaster`](contracts/PayMaster.sol) and the recipient contract [`Redpacket`](contracts/redpacket.sol).

### Paymaster

We customized paymaster for taking $MASK as payment token. The role of `Paymaster`:

- Maintain a small balance of ETH gas prepayment deposit in RelayHub. The Paymaster owner(i.e. us) is responsible for ensuring sufficient balance for the next transactions.

- Implement a `preRelayedCall()` function to revert if it is NOT willing to accept current transaction and pay for it. `preRelayedCall()` is called by `RelayHub` before making the actual call forward. In our `Paymaster`, it :

  - Get $MASK price from Uniswap contracts.
  - Call `RelayHub` to calculate the precharge $MASK amount.
  - Transfer $MASK to `Paymaster` from client.

- Implement a `postRelayedCall`. This function is called after a transaction is relayed. In our `Paymaster`, it:

  - Call `RelayHub` to calculate the actual $MASK amount that needs to be charged.
  - Get $MASK price from Uniswap contracts.
  - Refund client the unused $MASK.
  - Swap $MASK for ETH using Uniswap.
  - Deposit ETH in `RelayHub` to pay for relayed transaction.

### Recipient Contract

In this demo, we modified our [redpacket contract](https://github.com/DimensionDev/RedPacket) to fit in gsn system. The adaption is stated following:

- Set & know the address of `Forwarder` and trust it to provide information about the transaction.

- Use `_msgSender()` and `_msgData()` instead of `msg.sender` and msg.data everywhere since recipient will get these information from `Forwarder`.

## Details

- Check the detailed workflow of the entire system at [Workflow](DOC/Workflow.md)

- API of [Paymaster](./DOC/PayMasterAPI.md).

## Contribute

Any contribution is welcomed to make it better.

If you have any questions, please create an [issue](https://github.com/SpaceStation09/MaskAsGas/issues).

## LICENSE

[MIT LICENSE](LICENSE)
