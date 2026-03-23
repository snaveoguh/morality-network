// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Governor-like interface (Governor Bravo/DAOs with `state(uint256)`).
interface IProposalState {
    function state(uint256 proposalId) external view returns (uint8);
}
