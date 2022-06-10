//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "@opengsn/contracts/src/BasePaymaster.sol";

import "./interfaces/IUniswap.sol";

contract MaskPayMaster is BasePaymaster {
    function versionPaymaster() external view virtual override returns (string memory) {
        return "1.0.0-Mask.paymaster";
    }

    IUniswap public uniswap;
    IERC20 public token;

    uint256 public gasUsedByPost;

    event Received(uint256 ethAmount);

    constructor(IUniswap _uniswap) {
        uniswap = _uniswap;
        token = IERC20(_uniswap.tokenAddress());
    }

    receive() external payable override {
        emit Received(msg.value);
    }

    /**
     * set gas used by postRelayedCall, for more precise gas calculation
     *
     */
    function setPostGasUsage(uint256 _gasUsedByPost) external onlyOwner {
        gasUsedByPost = _gasUsedByPost;
    }

    function getPayer(GsnTypes.RelayRequest calldata relayRequest) public view virtual returns (address) {
        return relayRequest.request.to;
    }

    /**
     * Use this func to make the decision whether to pay for a transaction or no
     * The `rejectOnRecipientRevert` value that the function returns
     * allows the Paymaster to delegate the decision to the recipient itself.
     */
    function preRelayedCall(
        GsnTypes.RelayRequest calldata relayRequest,
        bytes calldata signature,
        bytes calldata approvalData,
        uint256 maxPossibleGas
    ) public virtual returns (bytes memory context, bool revertOnRecipientRevert) {
        (IERC20 requestToken, IUniswap requestUniswap) = _getToken(relayRequest.relayData.paymasterData);
        (address payer, uint256 tokenPrecharge) = _calculatePreCharge(
            requestToken,
            requestUniswap,
            relayRequest,
            maxPossibleGas
        );
        requestToken.transferFrom(payer, address(this), tokenPrecharge);
        return (abi.encode(payer, tokenPrecharge, requestToken, requestUniswap), false);
    }

    function _getToken(bytes memory paymasterData)
        internal
        view
        returns (IERC20 requestToken, IUniswap requestUniswap)
    {
        requestUniswap = abi.decode(paymasterData, (IUniswap));
        require(uniswap == requestUniswap, "Unsupported token uniswap");
        requestToken = IERC20(uniswap.tokenAddress());
    }

    function _calculatePreCharge(
        IERC20 requestToken,
        IUniswap requestUniswap,
        GsnTypes.RelayRequest calldata relayRequest,
        uint256 maxPossibleGas
    ) internal view returns (address payer, uint256 tokenPrecharge) {
        payer = this.getPayer(relayRequest);
        uint256 ethMaxCharge = relayHub.calculateCharge(maxPossibleGas, relayRequest.relayData);
        ethMaxCharge += relayRequest.request.value;
        tokenPrecharge = uniswap.getTokenToEthOutputPrice(ethMaxCharge);
    }
}
