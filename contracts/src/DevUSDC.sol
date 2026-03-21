// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title DevUSDC
/// @notice Mintable 6-decimal bridge asset for testnet/dev vault-rail rollouts.
contract DevUSDC is ERC20, Ownable {
    constructor(address owner_) ERC20("Dev USD Coin", "dUSDC") Ownable(owner_) {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
