// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";

/// @title DevReserveVault
/// @notice Simple ERC4626 reserve vault for testnet/dev rollouts when a real Morpho target is unavailable.
contract DevReserveVault is ERC20, ERC4626, Ownable {
    constructor(address asset_, address owner_, string memory name_, string memory symbol_)
        ERC20(name_, symbol_)
        ERC4626(IERC20(asset_))
        Ownable(owner_)
    {}

    function decimals() public view override(ERC20, ERC4626) returns (uint8) {
        return super.decimals();
    }

    /// @notice Add extra assets to the vault to simulate reserve yield on dev/testnet.
    function sponsorYield(uint256 assets) external {
        require(assets > 0, "Zero assets");
        require(IERC20(asset()).transferFrom(msg.sender, address(this), assets), "Transfer failed");
    }
}
