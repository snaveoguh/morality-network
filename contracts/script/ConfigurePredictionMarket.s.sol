// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {MoralityPredictionMarket} from "../src/MoralityPredictionMarket.sol";

contract ConfigurePredictionMarket is Script {
    // Nouns Governor Bravo (Ethereum mainnet)
    address internal constant DEFAULT_NOUNS_GOVERNOR = 0x6f3E6272A167e8AcCb32072d08E0957F9c79223d;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address marketAddress = vm.envAddress("PREDICTION_MARKET_ADDRESS");
        address nounsGovernor = vm.envOr("NOUNS_GOVERNOR", DEFAULT_NOUNS_GOVERNOR);

        vm.startBroadcast(deployerKey);

        MoralityPredictionMarket market = MoralityPredictionMarket(payable(marketAddress));

        // Phase 1: enable deterministic onchain resolution for Nouns only.
        market.setDaoResolver("nouns", nounsGovernor, true);
        market.setDaoResolver("lil-nouns", address(0), false);

        vm.stopBroadcast();

        console2.log("Configured prediction market:", marketAddress);
        console2.log("Enabled resolver for dao=nouns, governor=", nounsGovernor);
        console2.log("Disabled resolver for dao=lil-nouns");
    }
}
