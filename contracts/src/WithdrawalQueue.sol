// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";

contract WithdrawalQueue is Initializable, OwnableUpgradeable, UUPSUpgradeable, PausableUpgradeable {
    struct WithdrawRequest {
        address owner;
        address receiver;
        uint256 shares;
        uint256 assetsRequested;
        uint256 assetsFulfilled;
        uint64 createdAt;
        bool finalized;
    }

    address public vault;
    uint256 public nextRequestId;
    uint256 private reentrancyLock;

    mapping(uint256 => WithdrawRequest) private requests;

    event VaultUpdated(address indexed previousVault, address indexed nextVault);
    event WithdrawEnqueued(
        uint256 indexed requestId,
        address indexed owner,
        address indexed receiver,
        uint256 shares,
        uint256 assetsRequested
    );
    event WithdrawFulfilled(uint256 indexed requestId, uint256 assetsOut);
    event WithdrawCancelled(uint256 indexed requestId);

    modifier onlyVault() {
        require(msg.sender == vault, "Not vault");
        _;
    }

    modifier nonReentrant() {
        require(reentrancyLock == 1, "Reentrancy");
        reentrancyLock = 2;
        _;
        reentrancyLock = 1;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address owner_, address vault_) public initializer {
        require(owner_ != address(0), "Zero owner");
        require(vault_ != address(0), "Zero vault");

        __Ownable_init(owner_);
        __Pausable_init();
        vault = vault_;
        nextRequestId = 1;
        reentrancyLock = 1;
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {
        require(newImplementation.code.length > 0, "Not a contract");
    }

    function enqueue(
        address owner,
        address receiver,
        uint256 shares,
        uint256 assetsRequested
    ) external onlyVault whenNotPaused nonReentrant returns (uint256 requestId) {
        require(owner != address(0), "Zero owner");
        require(receiver != address(0), "Zero receiver");
        require(shares > 0, "Zero shares");

        requestId = nextRequestId++;
        requests[requestId] = WithdrawRequest({
            owner: owner,
            receiver: receiver,
            shares: shares,
            assetsRequested: assetsRequested,
            assetsFulfilled: 0,
            createdAt: uint64(block.timestamp),
            finalized: false
        });

        emit WithdrawEnqueued(requestId, owner, receiver, shares, assetsRequested);
    }

    function markFulfilled(uint256 requestId, uint256 assetsOut) external onlyVault nonReentrant {
        WithdrawRequest storage request = requests[requestId];
        require(request.owner != address(0), "Unknown request");
        require(!request.finalized, "Already finalized");

        request.assetsFulfilled = assetsOut;
        request.finalized = true;

        emit WithdrawFulfilled(requestId, assetsOut);
    }

    function cancel(uint256 requestId) external onlyVault nonReentrant {
        WithdrawRequest storage request = requests[requestId];
        require(request.owner != address(0), "Unknown request");
        require(!request.finalized, "Already finalized");

        request.finalized = true;
        emit WithdrawCancelled(requestId);
    }

    function getRequest(uint256 requestId)
        external
        view
        returns (
            address owner,
            address receiver,
            uint256 shares,
            uint256 assetsRequested,
            uint256 assetsFulfilled,
            uint64 createdAt,
            bool finalized
        )
    {
        WithdrawRequest storage request = requests[requestId];
        return (
            request.owner,
            request.receiver,
            request.shares,
            request.assetsRequested,
            request.assetsFulfilled,
            request.createdAt,
            request.finalized
        );
    }

    function setVault(address nextVault) external onlyOwner {
        require(nextVault != address(0), "Zero vault");
        emit VaultUpdated(vault, nextVault);
        vault = nextVault;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    uint256[40] private __gap;
}
