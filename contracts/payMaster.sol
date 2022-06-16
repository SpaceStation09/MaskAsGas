//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "@opengsn/contracts/src/BasePaymaster.sol";

import "./interfaces/IUniswap.sol";

contract MaskPayMaster is BasePaymaster {
    IUniswap public uniswap;
    IERC20 public token;

    uint256 public gasUsedByPost;

    event Received(uint256 ethAmount);
    event TokensCharged(
        uint256 gasUseWithoutPost,
        uint256 gasJustPost,
        uint256 ethActualCharge,
        uint256 tokenActualCharge
    );

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

    /**
     * Use this func to make the decision whether to pay for a transaction or no
     * The `rejectOnRecipientRevert` value that the function returns
     * allows the Paymaster to delegate the decision to the recipient itself.
     *  @param relayRequest - the full relay request structure
     *  @param signature - user's EIP712-compatible signature of the {@link relayRequest}.
     *              Note that in most cases the paymaster shouldn't try use it at all. It is always checked
     *              by the forwarder immediately after preRelayedCall returns.
     *  @param approvalData - extra dapp-specific data (e.g. signature from trusted party)
     *  @param maxPossibleGas - based on values returned from {@link getGasAndDataLimits},
     */
    function preRelayedCall(
        GsnTypes.RelayRequest calldata relayRequest,
        bytes calldata signature,
        bytes calldata approvalData,
        uint256 maxPossibleGas
    ) external relayHubOnly returns (bytes memory context, bool revertOnRecipientRevert) {
        (signature, approvalData);
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

    /**
     * This method is called after the actual relayed function call.
     * It may be used to record the transaction (e.g. charge the caller by some contract logic) for this call.
     *
     * @param context - the call context, as returned by the preRelayedCall
     * @param success - true if the relayed call succeeded, false if it reverted
     * @param gasUseWithoutPost - the actual amount of gas used by the entire transaction, EXCEPT
     *  the gas used by the postRelayedCall itself.
     * @param relayData - the relay params of the request. can be used by relayHub.calculateCharge()
     *
     * Revert in this functions causes a revert of the client's relayed call (and preRelayedCall(), but the Paymaster
     * is still committed to pay the relay for the entire transaction.
     */

    function postRelayedCall(
        bytes calldata context,
        bool success,
        uint256 gasUseWithoutPost,
        GsnTypes.RelayData calldata relayData
    ) external relayHubOnly {
        (success);
        (address payer, uint256 tokenPrecharge, IERC20 chosenToken, IUniswap chosenUniswap) = abi.decode(
            context,
            (address, uint256, IERC20, IUniswap)
        );
        _postRelayedCallInternal(payer, tokenPrecharge, 0, gasUseWithoutPost, relayData, chosenToken, chosenUniswap);
    }

    function versionPaymaster() external view virtual override returns (string memory) {
        return "1.0.0-Mask.paymaster";
    }

    function getPayer(GsnTypes.RelayRequest calldata relayRequest) external view virtual returns (address) {
        return relayRequest.request.to;
    }

    function _postRelayedCallInternal(
        address payer,
        uint256 tokenPrecharge,
        uint256 valueRequested,
        uint256 gasUsedWithoutPost,
        GsnTypes.RelayData calldata relayData,
        IERC20 chosenToken,
        IUniswap chosenUniswap
    ) internal {
        uint256 ethActualCharge = relayHub.calculateCharge(gasUsedWithoutPost + gasUsedByPost, relayData);
        uint256 tokenActualCharge = chosenUniswap.getTokenToEthOutputPrice(ethActualCharge + valueRequested);
        uint256 tokenRefund = tokenPrecharge - tokenActualCharge;
        _refundPayer(payer, chosenToken, tokenRefund);
        _depositProceedsToHub(ethActualCharge, chosenUniswap);
        emit TokensCharged(gasUsedWithoutPost, gasUsedByPost, ethActualCharge, tokenActualCharge);
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
        (requestToken);
        payer = this.getPayer(relayRequest);
        uint256 ethMaxCharge = relayHub.calculateCharge(maxPossibleGas, relayRequest.relayData);
        ethMaxCharge += relayRequest.request.value;
        tokenPrecharge = requestUniswap.getTokenToEthOutputPrice(ethMaxCharge);
    }

    function _refundPayer(
        address payer,
        IERC20 chosenToken,
        uint256 tokenRefund
    ) private {
        require(chosenToken.transfer(payer, tokenRefund), "Refund Failed");
    }

    /**
     * This method is used to pay relayHub for the transaction feee in ETH.
     *
     * @param ethActualCharge - Actual ETH amount charged for transaction fee.
     * @param chosenUniswap - Corresponding uniswap pair for chosenToken-ETH
     *
     */
    function _depositProceedsToHub(uint256 ethActualCharge, IUniswap chosenUniswap) private {
        chosenUniswap.tokenToEthSwapOutput(ethActualCharge, type(uint256).max, block.timestamp + 60 * 15);
        relayHub.depositFor{value: ethActualCharge}(address(this));
    }
}
