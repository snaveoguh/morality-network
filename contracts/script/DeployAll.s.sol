// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {MoralityRegistry} from "../src/MoralityRegistry.sol";
import {MoralityRatings} from "../src/MoralityRatings.sol";
import {MoralityComments} from "../src/MoralityComments.sol";
import {MoralityTipping} from "../src/MoralityTipping.sol";
import {MoralityLeaderboard} from "../src/MoralityLeaderboard.sol";
import {MoralityProposalVoting} from "../src/MoralityProposalVoting.sol";
import {MoralityPredictionMarket} from "../src/MoralityPredictionMarket.sol";
import {MoralityAgentVault} from "../src/MoralityAgentVault.sol";
import {PooterEditions} from "../src/PooterEditions.sol";

contract DeployAll is Script {
    address internal constant DEFAULT_NOUNS_GOVERNOR = 0x6f3E6272A167e8AcCb32072d08E0957F9c79223d;
    address internal constant DEFAULT_LIL_NOUNS_GOVERNOR = 0x5d2C31ce16924C2a71D317e5BbFd5ce387854039;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);

        MoralityRegistry registry = new MoralityRegistry();
        MoralityRatings ratings = new MoralityRatings(address(registry));
        MoralityComments comments = new MoralityComments();
        MoralityTipping tipping = new MoralityTipping(address(registry), address(comments));
        comments.setTippingContract(address(tipping));
        MoralityLeaderboard leaderboard =
            new MoralityLeaderboard(address(registry), address(ratings), address(tipping), address(comments));
        MoralityPredictionMarket market = new MoralityPredictionMarket();
        MoralityAgentVault vault = new MoralityAgentVault(
            vm.envOr("VAULT_MANAGER", deployer),
            vm.envOr("VAULT_FEE_RECIPIENT", deployer),
            vm.envOr("VAULT_FEE_BPS", uint256(500))
        );

        // PooterEditions — 1/1 daily edition NFTs
        string memory baseTokenURI = vm.envOr("POOTER_EDITIONS_BASE_URI", string("https://pooter.world/api/edition/"));
        PooterEditions pooterEditions = new PooterEditions(baseTokenURI);

        MoralityProposalVoting voting;
        address nounsToken = vm.envOr("NOUNS_TOKEN", address(0));
        if (nounsToken != address(0)) {
            voting = new MoralityProposalVoting(nounsToken);
        }

        address aiOracle = vm.envOr("AI_ORACLE", address(0));
        if (aiOracle != address(0)) {
            leaderboard.setAIOracle(aiOracle);
        }

        address nounsGovernor = vm.envOr("NOUNS_GOVERNOR", DEFAULT_NOUNS_GOVERNOR);
        address lilNounsGovernor = vm.envOr("LIL_NOUNS_GOVERNOR", DEFAULT_LIL_NOUNS_GOVERNOR);
        if (nounsGovernor != address(0)) {
            market.setDaoResolver("nouns", nounsGovernor, true);
        }
        if (lilNounsGovernor != address(0)) {
            market.setDaoResolver("lil-nouns", lilNounsGovernor, true);
        }

        if (address(voting) != address(0)) {
            if (nounsGovernor != address(0)) {
                voting.setDaoResolver("nouns", nounsGovernor, true);
            }
            if (lilNounsGovernor != address(0)) {
                voting.setDaoResolver("lil-nouns", lilNounsGovernor, true);
            }
        }

        vm.stopBroadcast();

        console2.log("MoralityRegistry:", address(registry));
        console2.log("MoralityRatings:", address(ratings));
        console2.log("MoralityComments:", address(comments));
        console2.log("MoralityTipping:", address(tipping));
        console2.log("MoralityLeaderboard:", address(leaderboard));
        console2.log("MoralityPredictionMarket:", address(market));
        console2.log("MoralityAgentVault:", address(vault));
        console2.log("PooterEditions:", address(pooterEditions));
        if (address(voting) != address(0)) {
            console2.log("MoralityProposalVoting:", address(voting));
        } else {
            console2.log("MoralityProposalVoting: skipped (set NOUNS_TOKEN to deploy)");
        }
    }
}
