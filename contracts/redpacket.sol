//SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@opengsn/contracts/src/BaseRelayRecipient.sol";

contract RedPacket is Initializable, BaseRelayRecipient {
    struct Packet {
        DataPack packed;
        mapping(address => uint256) claimedList;
        address publicKey;
        address creator;
    }

    struct DataPack {
        uint256 packed1;
        uint256 packed2;
    }

    uint32 internal nonce;
    mapping(bytes32 => Packet) internal redpacketById;
    bytes32 private seed;

    event CreationSuccess(
        uint256 total,
        bytes32 id,
        string name,
        string message,
        address creator,
        uint256 creationTime,
        address tokenAddress,
        uint256 number,
        bool ifRandom,
        uint256 duration
    );

    event ClaimSuccess(bytes32 id, address claimer, uint256 claimedValue, address tokenAddress);
    event RefundSuccess(bytes32 id, address tokenAddress, uint256 remainingBalance);

    using SafeERC20Upgradeable for IERC20Upgradeable;

    function initialize() public initializer {
        seed = keccak256(abi.encodePacked("Former NBA Commissioner David St", block.timestamp, _msgSender()));
    }

    function versionRecipient() external pure override returns (string memory) {
        return "1.0.0";
    }
}
