// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MoToken — the redeployed MO token on Base.
/// @notice Fixed supply, minted once to the treasury at deploy. No owner, no
///         mint, no pause, no upgrade — the entire supply and every transfer
///         rule is visible here forever. The supply should equal the published
///         reconciled legacy ledger plus any pre-announced treasury allocation;
///         the deploy transaction is the allocation's audit trail.
contract MoToken is ERC20 {
    constructor(address treasury, uint256 supply) ERC20("Morality", "MO") {
        require(treasury != address(0), "treasury=0");
        _mint(treasury, supply);
    }
}
