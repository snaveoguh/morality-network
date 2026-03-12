// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {MoralityPredictionMarket} from "../src/MoralityPredictionMarket.sol";

/// @notice Deploy PredictionMarket on Ethereum mainnet for trustless Nouns resolution.
///         governor.state() works natively since NounsDAOV4 is on the same chain.
contract DeployPredictionMarketL1 is Script {
    address internal constant NOUNS_GOVERNOR = 0x6f3E6272A167e8AcCb32072d08E0957F9c79223d;
    address internal constant LIL_NOUNS_GOVERNOR = 0x5d2C31ce16924C2a71D317e5BbFd5ce387854039;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerKey);

        // Deploy implementation + proxy
        MoralityPredictionMarket market = MoralityPredictionMarket(payable(address(new ERC1967Proxy(
            address(new MoralityPredictionMarket()),
            abi.encodeCall(MoralityPredictionMarket.initialize, ())
        ))));

        // Configure Nouns + Lil Nouns governors for trustless onchain resolution
        market.setDaoResolver("nouns", NOUNS_GOVERNOR, true);
        market.setDaoResolver("lil-nouns", LIL_NOUNS_GOVERNOR, true);

        vm.stopBroadcast();

        console2.log("MoralityPredictionMarket (proxy):", address(market));
        console2.log("Nouns governor:", NOUNS_GOVERNOR);
        console2.log("Lil Nouns governor:", LIL_NOUNS_GOVERNOR);
    }
}
