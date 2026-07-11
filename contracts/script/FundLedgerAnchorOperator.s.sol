// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";

/// @notice One-off: sends a small gas budget from the deployer to the
///         Claim Ledger anchor operator (one anchor tx/day ≈ 0.000003 ETH;
///         0.002 ETH covers roughly two years). Reads PRIVATE_KEY and
///         LEDGER_ANCHOR_OPERATOR from env — no keys on argv.
contract FundLedgerAnchorOperator is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address payable operator = payable(vm.envAddress("LEDGER_ANCHOR_OPERATOR"));

        vm.startBroadcast(deployerKey);
        (bool ok, ) = operator.call{value: 0.002 ether}("");
        require(ok, "transfer failed");
        vm.stopBroadcast();

        console.log("funded operator:", operator);
        console.log("operator balance:", operator.balance);
    }
}
