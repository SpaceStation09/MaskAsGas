# API Explanation For PayMaster

## receive

The `receive()` function in this contract will emit an event.

```solidity
  Received(uint256 ethAmount);
```

## setPostGasUsed

```solidity
function setPostGasUsed(uint256 _gasUsedByPost) external onlyOwner {}

```

- Parameters:

  - `_gasUsedByPost`: the total gas amount used by `postRelayedCall()`

- Requirements:

  - The function can only be called by the contract owner.

- Return:

  - N/A

- Events:
  - N/A

## preRelayedCall

```solidity
function preRelayedCall(
  GsnTypes.RelayRequest calldata relayRequest,
  bytes calldata signature,
  bytes calldata approvalData,
  uint256 maxPossibleGas
) external relayHubOnly returns (bytes memory context, bool revertOnRecipientRevert) {}

```

- Parameters:

  - `relayRequest`: the full relay request structure. The relay request structure is described in [`GsnTypes.md`](GsnTypes.md).
  - `signature`: user's EIP712-compatible signature of the `relayRequest`.
  - `approvalData`: extra dapp-specific data (e.g. signature from trusted party).
  - `maxPossibleGas`: based on values returned from `getGasAndDataLimits`. Defines the absolute maximum the entire operation may cost to the `Paymaster`.

- Requirements:

  - The function can only be called by `relayHub`.

- Return:

  - `context`: contains info about `payer`, `tokenPrecharge`, `pay token`, and `precharged token amount`.
  - `revertOnRecipientRevert`: If set to `true`, this flag allows your `Paymaster` to delegate the decision of whether to pay for the relayed call or not to the `Recipient`.

- Events:
  - N/A

## postRelayedCall

```solidity
function postRelayedCall(
  bytes calldata context,
  bool success,
  uint256 gasUseWithoutPost,
  GsnTypes.RelayData calldata relayData
) external relayHubOnly {}

```

- Parameters:

  - `context`: the call context, as returned by the `preRelayedCall()`.
  - `success`: true if the relayed call succeeded, false if it reverted.
  - `gasUseWithoutPost`: the actual amount of gas used by the entire transaction, **EXCEPT** the gas used by the postRelayedCall itself.
  - `relayData`: the relay params of the request. can be used by relayHub.calculateCharge().

- Requirements:

  - The function can only be called by `relayHub`.

- Return:

  - N/A

- Events

```solidity
  event TokensCharged(
    uint256 gasUsedWithoutPost,
    uint256 gasOnlyPost,
    uint256 ethActualCharge,
    uint256 tokenActualCharge
  )
```

## getPayer

```solidity
function getPayer(GsnTypes.RelayRequest calldata relayRequest) external view virtual returns (address) {}

```

- Parameters:

  - `relayRequest`: the full relay request structure. The relay request structure is described in [`GsnTypes.md`](GsnTypes.md).

- Requirements:

  - N/A

- Return:

  - return the payer of this request. For account-based target, this is the target account.

- Events:
  - N/A

## versionPaymaster

```solidity
function versionPaymaster() external view virtual override returns (string memory) {}

```

- Parameters:

  - N/A

- Requirements:

  - N/A

- Return:

  - The version info of current `Paymaster`.

- Events:

  - N/A
