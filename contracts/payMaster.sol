//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "@opengsn/contracts/src/BasePaymaster.sol";
import "@opengsn/contracts/src/interfaces/IPaymaster.sol";

import "./interfaces/IUniswapV2Router.sol";
import "./interfaces/IUniswapV2Pair.sol";

contract MaskPayMaster is BasePaymaster {
    IUniswapV2Pair public uniswapPair;
    IUniswapV2Router public uniswapRouter;
    IERC20 public mask;
    IERC20 public weth;
    address public ourTarget; // The target contract we are willing to pay for

    uint256 public gasUsedByPost;

    event Received(uint256 ethAmount);
    // allow the owner to set ourTarget
    event TargetSet(address target);
    event TokensCharged(
        uint256 gasUsedWithoutPost,
        uint256 gasOnlyPost,
        uint256 ethActualCharge,
        uint256 tokenActualCharge
    );

    constructor(
        IUniswapV2Pair _uniswapPair,
        IERC20 _mask,
        IERC20 _weth,
        IUniswapV2Router _uniswapRouter
    ) {
        uniswapPair = _uniswapPair;
        uniswapRouter = _uniswapRouter;
        mask = _mask;
        weth = _weth;
    }

    receive() external payable override {
        require(address(relayHub) != address(0), "relay hub address not set");
        relayHub.depositFor{value: msg.value}(address(this));
        emit Received(msg.value);
    }

    function setTarget(address target) external onlyOwner {
        ourTarget = target;
        emit TargetSet(target);
    }

    /**
     * set gas amount used by postRelayedCall, for more precise gas calculation
     */
    function setPostGasUsed(uint256 _gasUsedByPost) external onlyOwner {
        gasUsedByPost = _gasUsedByPost;
    }

    function getGasAndDataLimits() public view virtual override returns (IPaymaster.GasAndDataLimits memory limits) {
        uint256 newPostRelayedCallGasLimit = 300000;
        return
            IPaymaster.GasAndDataLimits(
                PAYMASTER_ACCEPTANCE_BUDGET,
                PRE_RELAYED_CALL_GAS_LIMIT,
                newPostRelayedCallGasLimit,
                CALLDATA_SIZE_LIMIT
            );
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
    ) external override relayHubOnly returns (bytes memory context, bool revertOnRecipientRevert) {
        (signature, approvalData);
        _verifyForwarder(relayRequest);
        require(relayRequest.request.to == ourTarget, "Not supported contract");
        (IERC20 payToken, IUniswapV2Pair decodedUniswapPair) = _getToken(relayRequest.relayData.paymasterData);
        (address payer, uint256 tokenPrecharge) = _calculatePrecharge(
            payToken,
            decodedUniswapPair,
            relayRequest,
            maxPossibleGas
        );
        payToken.transferFrom(payer, address(this), tokenPrecharge);
        return (abi.encode(payer, tokenPrecharge, payToken, decodedUniswapPair), true);
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
    ) external override relayHubOnly {
        (success);
        (address payer, uint256 tokenPrecharge, IERC20 payToken, IUniswapV2Pair decodedUniswapPair) = abi.decode(
            context,
            (address, uint256, IERC20, IUniswapV2Pair)
        );
        _postRelayedCallInternal(payer, tokenPrecharge, 0, gasUseWithoutPost, relayData, payToken, decodedUniswapPair);
    }

    function getPayer(GsnTypes.RelayRequest calldata relayRequest) external view virtual returns (address) {
        return relayRequest.request.from;
    }

    function versionPaymaster() external view virtual override returns (string memory) {
        return "2.2.0";
    }

    function _getToken(bytes memory paymasterData)
        internal
        view
        returns (IERC20 payToken, IUniswapV2Pair decodedUniswapPair)
    {
        if (paymasterData.length != 0) {
            decodedUniswapPair = abi.decode(paymasterData, (IUniswapV2Pair));
            require(decodedUniswapPair == uniswapPair, "Unsupported uniswap router");
        } else {
            decodedUniswapPair = uniswapPair;
        }
        payToken = IERC20(decodedUniswapPair.token1());
        require(payToken == mask, "Unsupported pay token");
    }

    function _calculatePrecharge(
        IERC20 _payToken,
        IUniswapV2Pair _uniswapPair,
        GsnTypes.RelayRequest calldata relayRequest,
        uint256 maxPossibleGas
    ) internal view returns (address payer, uint256 tokenPrecharge) {
        (_payToken);
        payer = this.getPayer(relayRequest);
        uint256 ethMaxCharge = relayHub.calculateCharge(maxPossibleGas, relayRequest.relayData);
        ethMaxCharge += relayRequest.request.value;
        // reserve0: ETH, reserve1: MASK
        (uint112 reserve0, uint112 reserve1, ) = _uniswapPair.getReserves();
        //TODO: Check the token order
        //return the calculated $MASK amount needed to pay for max possible gas
        tokenPrecharge = uniswapRouter.getAmountIn(ethMaxCharge, reserve1, reserve0);
    }

    function _postRelayedCallInternal(
        address payer,
        uint256 tokenPrecharge,
        uint256 valueRequested,
        uint256 gasUsedWithoutPost,
        GsnTypes.RelayData calldata relayData,
        IERC20 payToken,
        IUniswapV2Pair decodedUniswapPair
    ) internal {
        uint256 ethActualCharge = relayHub.calculateCharge(gasUsedWithoutPost, relayData);
        // reserve0: ETH, reserve1: MASK
        (uint112 reserve0, uint112 reserve1, ) = decodedUniswapPair.getReserves();
        //TODO: Check the token order
        //return the calculated $MASK amount needed to pay for actually used gas
        uint256 tokenActualCharge = uniswapRouter.getAmountIn(ethActualCharge + valueRequested, reserve1, reserve0);
        uint256 tokenRefund = tokenPrecharge - tokenActualCharge;
        require(payToken.transfer(payer, tokenRefund), "Refund Failed");
        _depositProceedsToHub(ethActualCharge);
        emit TokensCharged(gasUsedWithoutPost, gasUsedByPost, ethActualCharge, tokenActualCharge);
    }

    /**
     * This method is used to pay relayHub for the transaction feee in ETH.
     *
     * @param ethActualCharge - Actual ETH amount charged for transaction fee.
     *
     */
    function _depositProceedsToHub(uint256 ethActualCharge) private {
        address[] memory path = new address[](2);
        path[0] = address(mask);
        path[1] = address(weth);

        //FIXME: Unsafe! Take Care!
        mask.approve(address(uniswapRouter), type(uint256).max);
        uniswapRouter.swapTokensForExactETH(
            ethActualCharge,
            type(uint256).max,
            path,
            address(this),
            block.timestamp + 1800
        );
    }
}
