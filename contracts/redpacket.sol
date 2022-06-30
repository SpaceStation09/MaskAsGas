//SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@opengsn/contracts/src/BaseRelayRecipient.sol";

contract RedPacket is Initializable, BaseRelayRecipient {
    using SafeERC20Upgradeable for IERC20Upgradeable;
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
    mapping(bytes32 => Packet) internal redPacketById;
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

    function initialize(address _forwarder) public initializer {
        _setTrustedForwarder(_forwarder);
        seed = keccak256(abi.encodePacked("Former NBA Commissioner David St", block.timestamp, _msgSender()));
    }

    function createRedPacket(
        address _publicKey,
        uint256 _number,
        bool _ifrandom,
        uint256 _duration,
        bytes32 _seed,
        string memory _message,
        string memory _name,
        uint256 _tokenType,
        address _tokenAddr,
        uint256 _totalTokens
    ) public payable {
        nonce++;
        require(_totalTokens >= _number, "#tokens > #packets");
        require(_number > 0, "At least 1 recipient");
        require(_number < 256, "At most 255 recipients");
        require(_tokenType == 0 || _tokenType == 1, "Unrecognizable token type");

        uint256 receivedAmount = _totalTokens;
        if (_tokenType == 0) require(msg.value >= _totalTokens, "No enough ETH");
        else if (_tokenType == 1) {
            uint256 balanceBeforeTransfer = IERC20Upgradeable(_tokenAddr).balanceOf(address(this));
            IERC20Upgradeable(_tokenAddr).safeTransferFrom(_msgSender(), address(this), _totalTokens);
            uint256 balanceAfterTransfer = IERC20Upgradeable(_tokenAddr).balanceOf(address(this));
            receivedAmount = balanceAfterTransfer - balanceBeforeTransfer;
            require(receivedAmount >= _number, "#received > #packets");
        }

        bytes32 _id = keccak256(abi.encodePacked(_msgSender(), block.timestamp, nonce, seed, _seed));
        {
            uint256 _randomType = _ifrandom ? 1 : 0;
            Packet storage rp = redPacketById[_id];
            rp.packed.packed1 = _wrap1(receivedAmount, _duration);
            rp.packed.packed2 = _wrap2(_tokenAddr, _number, _tokenType, _randomType);
            rp.publicKey = _publicKey;
            rp.creator = _msgSender();
        }
        {
            uint256 number = _number;
            bool ifrandom = _ifrandom;
            uint256 duration = _duration;
            emit CreationSuccess(
                receivedAmount,
                _id,
                _name,
                _message,
                _msgSender(),
                block.timestamp,
                _tokenAddr,
                number,
                ifrandom,
                duration
            );
        }
    }

    function claim(
        bytes32 id,
        bytes memory signedMsg,
        address payable recipient
    ) public {
        Packet storage rp = redPacketById[id];
        DataPack memory packed = rp.packed;

        require(_unbox(packed.packed1, 224, 32) > block.timestamp, "Expired");
        uint256 totalNumber = _unbox(packed.packed2, 239, 15);
        uint256 claimedNumber = _unbox(packed.packed2, 224, 15);
        require(claimedNumber < totalNumber, "Out of stock");

        address publicKey = rp.publicKey;
        require(_verify(signedMsg, publicKey), "Verification failed");

        uint256 claimedTokens;
        uint256 tokenType = _unbox(packed.packed2, 254, 1);
        uint256 ifrandom = _unbox(packed.packed2, 255, 1);
        uint256 remainingTokens = _unbox(packed.packed1, 128, 96);
        if (totalNumber - claimedNumber == 1) {
            claimedTokens = remainingTokens;
        } else {
            if (ifrandom == 1) {
                claimedTokens = _random(seed, nonce) % ((remainingTokens * 2) / (totalNumber - claimedNumber));
                if (claimedTokens == 0) claimedTokens = 1;
            } else {
                claimedTokens = remainingTokens / (totalNumber - claimedNumber);
            }
        }
        rp.packed.packed1 = _rewriteBox(packed.packed1, 128, 96, remainingTokens - claimedTokens);

        require(rp.claimedList[_msgSender()] == 0, "Already claimed");

        rp.claimedList[_msgSender()] = claimedTokens;
        rp.packed.packed2 = _rewriteBox(packed.packed2, 224, 15, claimedNumber + 1);

        address tokenAddress = address(uint160(_unbox(packed.packed2, 64, 160)));
        if (tokenType == 0) recipient.transfer(claimedTokens);
        else if (tokenType == 1) IERC20Upgradeable(tokenAddress).safeTransfer(recipient, claimedTokens);
        emit ClaimSuccess(id, recipient, claimedTokens, tokenAddress);
    }

    function versionRecipient() external pure override returns (string memory) {
        return "1.0.0";
    }

    function checkAvailability(bytes32 id)
        external
        view
        returns (
            address tokenAddr,
            uint256 balance,
            uint256 total,
            uint256 claimed,
            bool expired,
            uint256 claimedAmount
        )
    {
        Packet storage rp = redPacketById[id];
        DataPack memory packed = rp.packed;
        return (
            address(uint160(_unbox(packed.packed2, 64, 160))),
            _unbox(packed.packed1, 128, 96),
            _unbox(packed.packed2, 239, 15),
            _unbox(packed.packed2, 224, 15),
            block.timestamp > _unbox(packed.packed1, 224, 32),
            rp.claimedList[_msgSender()]
        );
    }

    function refund(bytes32 id) public {
        Packet storage rp = redPacketById[id];
        DataPack memory packed = rp.packed;
        address creator = rp.creator;
        require(creator == _msgSender(), "Creator Only");
        require(_unbox(packed.packed1, 224, 32) <= block.timestamp, "Not expired yet");
        uint256 remainingTokens = _unbox(packed.packed1, 128, 96);
        require(remainingTokens != 0, "None left in this redpacket");

        uint256 tokenType = _unbox(packed.packed2, 254, 1);
        address tokenAddress = address(uint160(_unbox(packed.packed2, 64, 160)));

        rp.packed.packed1 = _rewriteBox(packed.packed1, 128, 96, 0);

        if (tokenType == 0) payable(_msgSender()).transfer(remainingTokens);
        else IERC20Upgradeable(tokenAddress).safeTransfer(_msgSender(), remainingTokens);

        emit RefundSuccess(id, tokenAddress, remainingTokens);
    }

    function _verify(bytes memory _signedMsg, address _publicKey) private view returns (bool verified) {
        bytes memory prefix = "\x19Ethereum Signed Message:\n20";
        bytes32 prefixedHash = keccak256(abi.encodePacked(prefix, _msgSender()));
        address calculatedPublicKey = ECDSA.recover(prefixedHash, _signedMsg);
        return (calculatedPublicKey == _publicKey);
    }

    function _wrap1(uint256 _totalTokens, uint256 _duration) internal view returns (uint256 packed1) {
        uint256 _packed1 = 0;
        _packed1 |= _box(128, 96, _totalTokens);
        _packed1 |= _box(224, 32, (block.timestamp + _duration));
        return _packed1;
    }

    function _wrap2(
        address _tokenAddr,
        uint256 _number,
        uint256 _tokenType,
        uint256 _ifrandom
    ) internal pure returns (uint256 packed2) {
        uint256 _packed2 = 0;
        _packed2 |= _box(64, 160, uint160(_tokenAddr));
        _packed2 |= _box(224, 15, 0);
        _packed2 |= _box(239, 15, _number);
        _packed2 |= _box(254, 1, _tokenType);
        _packed2 |= _box(255, 1, _ifrandom);
        return _packed2;
    }

    function _box(
        uint16 position,
        uint16 size,
        uint256 data
    ) internal pure returns (uint256 boxed) {
        require(_validRange(size, data), "Value out of range BOX");
        assembly {
            // data << position
            boxed := shl(position, data)
        }
    }

    function _unbox(
        uint256 base,
        uint16 position,
        uint16 size
    ) internal pure returns (uint256 unboxed) {
        require(_validRange(256, base), "Value out of range UNBOX");
        assembly {
            // (((1 << size) - 1) & base >> position)
            unboxed := and(sub(shl(size, 1), 1), shr(position, base))
        }
    }

    function _rewriteBox(
        uint256 box,
        uint16 position,
        uint16 size,
        uint256 data
    ) internal pure returns (uint256 boxed) {
        assembly {
            // mask = ~((1 << size - 1) << position)
            // _box = (mask & _box) | ()data << position)
            boxed := or(and(box, not(shl(position, sub(shl(size, 1), 1)))), shl(position, data))
        }
    }

    function _random(bytes32 _seed, uint32 _nonceRand) internal view returns (uint256 rand) {
        return uint256(keccak256(abi.encodePacked(_nonceRand, _msgSender(), _seed, block.timestamp))) + 1;
    }

    function _validRange(uint16 size, uint256 data) internal pure returns (bool ifValid) {
        assembly {
            // 2^size > data or size ==256
            ifValid := or(eq(size, 256), gt(shl(size, 1), data))
        }
    }
}
