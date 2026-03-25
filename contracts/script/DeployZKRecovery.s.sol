// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {Groth16Verifier} from "../src/Groth16Verifier.sol";
import {ZKRecovery} from "../src/ZKRecovery.sol";

/**
 * @title DeployZKRecovery
 * @notice Deploys the Groth16Verifier (stateless, no proxy) and
 *         ZKRecovery behind a UUPS proxy.
 *
 * Usage:
 *   forge script script/DeployZKRecovery.s.sol:DeployZKRecovery \
 *     --rpc-url $BASE_RPC --broadcast --verify
 */
contract DeployZKRecovery is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerKey);

        // 1. Deploy Groth16Verifier (stateless — no proxy needed)
        Groth16Verifier verifier = new Groth16Verifier();
        console.log("Groth16Verifier:", address(verifier));

        // 2. Deploy ZKRecovery behind UUPS proxy
        ZKRecovery recovery = ZKRecovery(address(new ERC1967Proxy(
            address(new ZKRecovery()),
            abi.encodeCall(ZKRecovery.initialize, (address(verifier)))
        )));
        console.log("ZKRecovery (proxy):", address(recovery));

        vm.stopBroadcast();
    }
}
