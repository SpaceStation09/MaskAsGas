//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@opengsn/contracts/src/BaseRelayRecipient.sol";

contract CaptureTheFlag is BaseRelayRecipient {
    string public override versionRecipient = "2.2.0";

    event FlagCaptured(address _from, address _to);

    address flagHolder = address(0);

    // Get the forwarder address for the network
    // you are using from
    // https://docs.opengsn.org/gsn-provider/networks.html
    constructor(address _forwarder) {
        _setTrustedForwarder(_forwarder);
    }

    function captureFlag() external {
        address previous = flagHolder;

        // The real sender. If you are using GSN, this
        // is not the same as msg.sender.
        flagHolder = _msgSender();

        emit FlagCaptured(previous, flagHolder);
    }
}
