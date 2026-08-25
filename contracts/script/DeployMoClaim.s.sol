// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/MoToken.sol";
import "../src/MoClaimDistributor.sol";

/// @notice Deploys the redeployed MO token (fixed supply, minted to the
///         treasury Safe) and the Merkle claim distributor (root set by the
///         Safe). After deploy: fund the distributor from the Safe with the
///         epoch-1 tree total, then set the root via the Safe.
/// Usage:
///   cd contracts && source .env && \
///   MO_TREASURY_SAFE=0x... MO_TOTAL_SUPPLY_WEI=... \
///   forge script script/DeployMoClaim.s.sol --rpc-url "$BASE_RPC_URL" --broadcast
contract DeployMoClaim is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address treasurySafe = vm.envAddress("MO_TREASURY_SAFE");
        uint256 totalSupply = vm.envUint("MO_TOTAL_SUPPLY_WEI");

        vm.startBroadcast(deployerKey);
        MoToken token = new MoToken(treasurySafe, totalSupply);
        MoClaimDistributor dist = new MoClaimDistributor(IERC20(address(token)), treasurySafe);
        vm.stopBroadcast();

        console.log("MoToken deployed:", address(token));
        console.log("MoClaimDistributor deployed:", address(dist));
        console.log("treasury / rootSetter:", treasurySafe);
        console.log("total supply (wei):", totalSupply);
    }
}
