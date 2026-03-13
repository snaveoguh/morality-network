// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
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

        // ── Core contracts ──────────────────────────────────────────────────
        MoralityRegistry registry = MoralityRegistry(address(new ERC1967Proxy(
            address(new MoralityRegistry()),
            abi.encodeCall(MoralityRegistry.initialize, ())
        )));

        MoralityRatings ratings = MoralityRatings(address(new ERC1967Proxy(
            address(new MoralityRatings()),
            abi.encodeCall(MoralityRatings.initialize, (address(registry)))
        )));

        MoralityComments comments = MoralityComments(address(new ERC1967Proxy(
            address(new MoralityComments()),
            abi.encodeCall(MoralityComments.initialize, ())
        )));

        MoralityTipping tipping = MoralityTipping(payable(address(new ERC1967Proxy(
            address(new MoralityTipping()),
            abi.encodeCall(MoralityTipping.initialize, (address(registry), address(comments)))
        ))));

        comments.setTippingContract(address(tipping));

        MoralityLeaderboard leaderboard = MoralityLeaderboard(address(new ERC1967Proxy(
            address(new MoralityLeaderboard()),
            abi.encodeCall(
                MoralityLeaderboard.initialize,
                (address(registry), address(ratings), address(tipping), address(comments))
            )
        )));

        // ── Prediction Market ───────────────────────────────────────────────
        MoralityPredictionMarket market = MoralityPredictionMarket(payable(address(new ERC1967Proxy(
            address(new MoralityPredictionMarket()),
            abi.encodeCall(MoralityPredictionMarket.initialize, ())
        ))));

        // ── Agent Vault ─────────────────────────────────────────────────────
        _deployVaultAndEditions(deployer, market);
        _configureResolvers(market, leaderboard);

        vm.stopBroadcast();

        console2.log("MoralityRegistry (proxy):", address(registry));
        console2.log("MoralityRatings (proxy):", address(ratings));
        console2.log("MoralityComments (proxy):", address(comments));
        console2.log("MoralityTipping (proxy):", address(tipping));
        console2.log("MoralityLeaderboard (proxy):", address(leaderboard));
        console2.log("MoralityPredictionMarket (proxy):", address(market));
    }

    function _deployVaultAndEditions(address deployer, MoralityPredictionMarket market) internal {
        MoralityAgentVault vault = MoralityAgentVault(payable(address(new ERC1967Proxy(
            address(new MoralityAgentVault()),
            abi.encodeCall(
                MoralityAgentVault.initialize,
                (
                    vm.envOr("VAULT_MANAGER", deployer),
                    vm.envOr("VAULT_FEE_RECIPIENT", deployer),
                    vm.envOr("VAULT_FEE_BPS", uint256(500))
                )
            )
        ))));

        string memory baseTokenURI = vm.envOr("POOTER_EDITIONS_BASE_URI", string("https://pooter.world/api/edition/"));
        PooterEditions pooterEditions = PooterEditions(address(new ERC1967Proxy(
            address(new PooterEditions()),
            abi.encodeCall(PooterEditions.initialize, (baseTokenURI))
        )));

        // ── ProposalVoting (conditional) ────────────────────────────────────
        address nounsToken = vm.envOr("NOUNS_TOKEN", address(0));
        if (nounsToken != address(0)) {
            MoralityProposalVoting voting = MoralityProposalVoting(payable(address(new ERC1967Proxy(
                address(new MoralityProposalVoting()),
                abi.encodeCall(MoralityProposalVoting.initialize, (nounsToken))
            ))));

            _configureVotingResolvers(voting);
            console2.log("MoralityProposalVoting (proxy):", address(voting));
        } else {
            console2.log("MoralityProposalVoting: skipped (set NOUNS_TOKEN to deploy)");
        }

        console2.log("MoralityAgentVault (proxy):", address(vault));
        console2.log("PooterEditions (proxy):", address(pooterEditions));
    }

    function _configureResolvers(MoralityPredictionMarket market, MoralityLeaderboard leaderboard) internal {
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
    }

    function _configureVotingResolvers(MoralityProposalVoting voting) internal {
        address nounsGovernor = vm.envOr("NOUNS_GOVERNOR", DEFAULT_NOUNS_GOVERNOR);
        address lilNounsGovernor = vm.envOr("LIL_NOUNS_GOVERNOR", DEFAULT_LIL_NOUNS_GOVERNOR);
        if (nounsGovernor != address(0)) {
            voting.setDaoResolver("nouns", nounsGovernor, true);
        }
        if (lilNounsGovernor != address(0)) {
            voting.setDaoResolver("lil-nouns", lilNounsGovernor, true);
        }
    }
}
