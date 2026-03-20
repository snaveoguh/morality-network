// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {MoralityTipping} from "../src/MoralityTipping.sol";
import {MoralityPredictionMarket} from "../src/MoralityPredictionMarket.sol";
import {MoralityAgentVault} from "../src/MoralityAgentVault.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/// @notice Upgrade 3 UUPS proxies on Base mainnet to security-hardened implementations.
///         Changes: PausableUpgradeable, ReentrancyGuard, virtual offset (vault), allocation cap.
///         Storage compatible — no sequential slot reordering.
contract UpgradeSecurityBase is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");

        // Proxy addresses on Base mainnet (from DeployAll broadcast)
        address tippingProxy = vm.envAddress("TIPPING_PROXY");
        address predictionProxy = vm.envAddress("PREDICTION_MARKET_PROXY");
        address vaultProxy = vm.envAddress("AGENT_VAULT_PROXY");

        vm.startBroadcast(deployerKey);

        // 1. Upgrade MoralityTipping
        MoralityTipping newTipping = new MoralityTipping();
        UUPSUpgradeable(tippingProxy).upgradeToAndCall(address(newTipping), "");
        console2.log("Tipping impl:", address(newTipping));
        console2.log("Tipping proxy upgraded:", tippingProxy);

        // 2. Upgrade MoralityPredictionMarket
        MoralityPredictionMarket newPrediction = new MoralityPredictionMarket();
        UUPSUpgradeable(predictionProxy).upgradeToAndCall(address(newPrediction), "");
        console2.log("PredictionMarket impl:", address(newPrediction));
        console2.log("PredictionMarket proxy upgraded:", predictionProxy);

        // 3. Upgrade MoralityAgentVault
        //    maxAllocationBps is appended at slot 14 (after reentrancyLock).
        //    Default 0 — must be set via setMaxAllocationBps() after upgrade.
        MoralityAgentVault newVault = new MoralityAgentVault();
        UUPSUpgradeable(vaultProxy).upgradeToAndCall(address(newVault), "");
        console2.log("AgentVault impl:", address(newVault));
        console2.log("AgentVault proxy upgraded:", vaultProxy);

        // 4. Set maxAllocationBps on vault (default 0 from empty storage — must initialize)
        MoralityAgentVault(payable(vaultProxy)).setMaxAllocationBps(5000); // 50%
        console2.log("AgentVault maxAllocationBps set to 5000 (50%)");

        vm.stopBroadcast();
    }
}
