// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/// @title MoClaimDistributor — Merkle-gated payout of legacy MO balances.
/// @notice Pays reconciled morality.network balances to the self-custody
///         wallet each account holder proved control of on pooter.world.
///         Deliberately minimal (same philosophy as LedgerAnchor: small enough
///         to audit before it makes enemies): an immutable token, a root per
///         epoch settable only by the treasury Safe, a claimed-bitmap, and a
///         transfer. Non-upgradeable.
///
///         Epochs exist so newly-linked wallets can be included later: each
///         snapshot of the off-chain ledger is published as a new epoch root.
///         Because every epoch's tree is built from live ledger balances
///         (which are debited when a claim is observed), the root setter MUST
///         retire the previous epoch (set its root to 0) in the same Safe
///         batch that publishes a new one — otherwise a balance present in two
///         trees could be claimed from both.
///
///         Leaf format is the OpenZeppelin standard-merkle-tree encoding of
///         (uint256 index, address account, uint256 amount):
///         keccak256(bytes.concat(keccak256(abi.encode(index, account, amount)))).
contract MoClaimDistributor {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;
    /// @notice The treasury Safe. Sets roots, can recover unclaimed funds.
    address public immutable rootSetter;

    /// @notice Merkle root per epoch. A zero root disables the epoch.
    mapping(uint256 => bytes32) public roots;
    /// @notice Claimed bitmap per epoch: epoch => wordIndex => bits.
    mapping(uint256 => mapping(uint256 => uint256)) private claimedBitMap;

    event RootSet(uint256 indexed epoch, bytes32 root);
    event Claimed(uint256 indexed epoch, uint256 indexed index, address indexed account, uint256 amount);
    event Recovered(address to, uint256 amount);

    error NotRootSetter();
    error EpochClosed();
    error AlreadyClaimed();
    error InvalidProof();

    constructor(IERC20 token_, address rootSetter_) {
        require(address(token_) != address(0), "token=0");
        require(rootSetter_ != address(0), "rootSetter=0");
        token = token_;
        rootSetter = rootSetter_;
    }

    /// @notice Publish (or retire, with root=0) an epoch's Merkle root.
    function setRoot(uint256 epoch, bytes32 root) external {
        if (msg.sender != rootSetter) revert NotRootSetter();
        roots[epoch] = root;
        emit RootSet(epoch, root);
    }

    function isClaimed(uint256 epoch, uint256 index) public view returns (bool) {
        uint256 word = claimedBitMap[epoch][index / 256];
        return (word >> (index % 256)) & 1 == 1;
    }

    /// @notice Claim `amount` MO for `account`. Callable by anyone with a valid
    ///         proof — funds only ever move to the proven `account` address.
    function claim(uint256 epoch, uint256 index, address account, uint256 amount, bytes32[] calldata proof) external {
        bytes32 root = roots[epoch];
        if (root == bytes32(0)) revert EpochClosed();
        if (isClaimed(epoch, index)) revert AlreadyClaimed();

        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(index, account, amount))));
        if (!MerkleProof.verify(proof, root, leaf)) revert InvalidProof();

        claimedBitMap[epoch][index / 256] |= 1 << (index % 256);
        emit Claimed(epoch, index, account, amount);
        token.safeTransfer(account, amount);
    }

    /// @notice Recover token balance to the treasury Safe (unclaimed-tail
    ///         sweep after the pre-announced window; entitlements persist
    ///         off-chain and late claimants are honoured manually).
    function recover(uint256 amount) external {
        if (msg.sender != rootSetter) revert NotRootSetter();
        emit Recovered(rootSetter, amount);
        token.safeTransfer(rootSetter, amount);
    }
}
