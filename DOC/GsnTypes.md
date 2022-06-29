# Gsn Types

## RelayRequest

- `IForwarder.ForwardRequest` request (see [`ForwardRequest`](#forwardrequest))
- `RelayData` relayData (see [`RelayData`](#relaydata))

## RelayData

- `uint256` gasPrice
- `uint256` pctRelayFee
- `uint256` baseRelayFee
- `address` relayWorker
- `address` paymaster
- `address` forwarder
- `bytes` paymasterData
- `uint256` clientId

## ForwardRequest

- `address` from
- `address` to
- `uint256` value
- `uint256` gas
- `uint256` nonce
- `bytes` data
- `uint256` validUntil
