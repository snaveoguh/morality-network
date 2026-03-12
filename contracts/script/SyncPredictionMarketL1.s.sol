// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {IProposalState, MoralityPredictionMarket} from "../src/MoralityPredictionMarket.sol";

/// @notice Operator helper for the Ethereum mainnet prediction market.
///         For a given DAO/proposal pair it will:
///           1. call createMarket() when the proposal is live and no market exists
///           2. call resolve() when the market exists and the governor is terminal
///         It never creates markets for proposals that are already terminal.
contract SyncPredictionMarketL1 is Script {
    uint8 internal constant STATE_PENDING = 0;
    uint8 internal constant STATE_ACTIVE = 1;
    uint8 internal constant STATE_CANCELED = 2;
    uint8 internal constant STATE_DEFEATED = 3;
    uint8 internal constant STATE_SUCCEEDED = 4;
    uint8 internal constant STATE_QUEUED = 5;
    uint8 internal constant STATE_EXPIRED = 6;
    uint8 internal constant STATE_EXECUTED = 7;
    uint8 internal constant STATE_VETOED = 8;
    uint8 internal constant STATE_OBJECTION_PERIOD = 9;
    uint8 internal constant STATE_UPDATABLE = 10;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address marketAddress = vm.envAddress("PREDICTION_MARKET_ADDRESS");
        string memory dao = vm.envOr("DAO_KEY", string("nouns"));
        string memory proposalId = vm.envString("PROPOSAL_ID");

        MoralityPredictionMarket market = MoralityPredictionMarket(payable(marketAddress));
        (address governor, bool enabled) = market.daoResolverConfigs(keccak256(bytes(dao)));

        require(enabled && governor != address(0), "Resolver not configured");

        uint256 numericProposalId = vm.parseUint(proposalId);
        uint8 chainState = IProposalState(governor).state(numericProposalId);
        (, , , , , , uint8 outcome, bool exists) = market.getMarket(dao, proposalId);

        console2.log("Prediction market:", marketAddress);
        console2.log("DAO:", dao);
        console2.log("Proposal ID:", proposalId);
        console2.log("Governor:", governor);
        console2.log("Governor state:", chainState);
        console2.log("Market exists:", exists);
        console2.log("Market outcome:", outcome);

        if (!exists) {
            if (!_isStakeableState(chainState)) {
                console2.log("No action: proposal is not live, so createMarket() is skipped.");
                return;
            }

            vm.startBroadcast(deployerKey);
            market.createMarket(dao, proposalId);
            vm.stopBroadcast();

            console2.log("Action: createMarket()");
            return;
        }

        if (outcome != 0) {
            console2.log("No action: market already resolved.");
            return;
        }

        if (!_isTerminalState(chainState)) {
            console2.log("No action: market exists but proposal is still live.");
            return;
        }

        vm.startBroadcast(deployerKey);
        market.resolve(dao, proposalId);
        vm.stopBroadcast();

        console2.log("Action: resolve()");
    }

    function _isStakeableState(uint8 chainState) internal pure returns (bool) {
        return chainState == STATE_PENDING
            || chainState == STATE_ACTIVE
            || chainState == STATE_OBJECTION_PERIOD
            || chainState == STATE_UPDATABLE;
    }

    function _isTerminalState(uint8 chainState) internal pure returns (bool) {
        return chainState == STATE_CANCELED
            || chainState == STATE_DEFEATED
            || chainState == STATE_SUCCEEDED
            || chainState == STATE_QUEUED
            || chainState == STATE_EXPIRED
            || chainState == STATE_EXECUTED
            || chainState == STATE_VETOED;
    }
}
