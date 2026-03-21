// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IAssetConverter} from "./interfaces/IAssetConverter.sol";

contract ExecutorAssetConverter is Initializable, OwnableUpgradeable, UUPSUpgradeable, PausableUpgradeable, IAssetConverter {
    struct InitParams {
        address owner;
        address assetIn;
        address bridgeAsset;
        address router;
        address bridgeAssetLiquidityProvider;
        address vaultAssetLiquidityProvider;
        address assetInSink;
        address bridgeAssetSink;
        uint8 assetInDecimals;
        uint8 bridgeAssetDecimals;
        uint256 toBridgeRateE18;
        uint256 toVaultRateE18;
    }

    address public assetIn;
    address public bridgeAsset;
    address public router;
    address public bridgeAssetLiquidityProvider;
    address public vaultAssetLiquidityProvider;
    address public assetInSink;
    address public bridgeAssetSink;
    uint8 public assetInDecimals;
    uint8 public bridgeAssetDecimals;
    uint256 public toBridgeRateE18;
    uint256 public toVaultRateE18;

    event RouterUpdated(address indexed previousRouter, address indexed nextRouter);
    event BridgeAssetLiquidityProviderUpdated(address indexed previousProvider, address indexed nextProvider);
    event VaultAssetLiquidityProviderUpdated(address indexed previousProvider, address indexed nextProvider);
    event AssetInSinkUpdated(address indexed previousSink, address indexed nextSink);
    event BridgeAssetSinkUpdated(address indexed previousSink, address indexed nextSink);
    event RatesUpdated(uint256 previousToBridgeRateE18, uint256 nextToBridgeRateE18, uint256 previousToVaultRateE18, uint256 nextToVaultRateE18);
    event ConvertedToBridgeAsset(bytes32 indexed quoteId, uint256 amountIn, uint256 amountOut, address indexed receiver);
    event ConvertedToVaultAsset(bytes32 indexed quoteId, uint256 amountIn, uint256 amountOut, address indexed receiver);

    modifier onlyRouter() {
        require(msg.sender == router, "Not router");
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(InitParams memory params) public initializer {
        require(params.owner != address(0), "Zero owner");
        require(params.assetIn != address(0), "Zero assetIn");
        require(params.bridgeAsset != address(0), "Zero bridge asset");
        require(params.router != address(0), "Zero router");
        require(params.bridgeAssetLiquidityProvider != address(0), "Zero bridge LP");
        require(params.vaultAssetLiquidityProvider != address(0), "Zero vault LP");
        require(params.toBridgeRateE18 > 0, "Zero bridge rate");
        require(params.toVaultRateE18 > 0, "Zero vault rate");

        __Ownable_init(params.owner);
        __Pausable_init();

        assetIn = params.assetIn;
        bridgeAsset = params.bridgeAsset;
        router = params.router;
        bridgeAssetLiquidityProvider = params.bridgeAssetLiquidityProvider;
        vaultAssetLiquidityProvider = params.vaultAssetLiquidityProvider;
        assetInSink = params.assetInSink == address(0) ? params.owner : params.assetInSink;
        bridgeAssetSink = params.bridgeAssetSink == address(0) ? params.owner : params.bridgeAssetSink;
        assetInDecimals = params.assetInDecimals;
        bridgeAssetDecimals = params.bridgeAssetDecimals;
        toBridgeRateE18 = params.toBridgeRateE18;
        toVaultRateE18 = params.toVaultRateE18;
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    function previewToBridgeAsset(uint256 amountIn) public view returns (uint256 amountOut) {
        return _convertAmount(amountIn, assetInDecimals, bridgeAssetDecimals, toBridgeRateE18);
    }

    function previewToVaultAsset(uint256 amountIn) public view returns (uint256 amountOut) {
        return _convertAmount(amountIn, bridgeAssetDecimals, assetInDecimals, toVaultRateE18);
    }

    function convertToBridgeAsset(uint256 amountIn, address receiver, bytes32 quoteId)
        external
        onlyRouter
        whenNotPaused
        returns (uint256 amountOut)
    {
        require(receiver != address(0), "Zero receiver");
        require(amountIn > 0, "Zero amount");
        amountOut = previewToBridgeAsset(amountIn);
        require(IERC20(assetIn).transferFrom(msg.sender, assetInSink, amountIn), "Asset in transfer failed");
        require(IERC20(bridgeAsset).transferFrom(bridgeAssetLiquidityProvider, receiver, amountOut), "Bridge asset transfer failed");
        emit ConvertedToBridgeAsset(quoteId, amountIn, amountOut, receiver);
    }

    function convertToVaultAsset(uint256 amountIn, address receiver, bytes32 quoteId)
        external
        onlyRouter
        whenNotPaused
        returns (uint256 amountOut)
    {
        require(receiver != address(0), "Zero receiver");
        require(amountIn > 0, "Zero amount");
        amountOut = previewToVaultAsset(amountIn);
        require(IERC20(bridgeAsset).transferFrom(msg.sender, bridgeAssetSink, amountIn), "Bridge asset transfer failed");
        require(IERC20(assetIn).transferFrom(vaultAssetLiquidityProvider, receiver, amountOut), "Vault asset transfer failed");
        emit ConvertedToVaultAsset(quoteId, amountIn, amountOut, receiver);
    }

    function setRouter(address nextRouter) external onlyOwner {
        require(nextRouter != address(0), "Zero router");
        emit RouterUpdated(router, nextRouter);
        router = nextRouter;
    }

    function setBridgeAssetLiquidityProvider(address nextProvider) external onlyOwner {
        require(nextProvider != address(0), "Zero provider");
        emit BridgeAssetLiquidityProviderUpdated(bridgeAssetLiquidityProvider, nextProvider);
        bridgeAssetLiquidityProvider = nextProvider;
    }

    function setVaultAssetLiquidityProvider(address nextProvider) external onlyOwner {
        require(nextProvider != address(0), "Zero provider");
        emit VaultAssetLiquidityProviderUpdated(vaultAssetLiquidityProvider, nextProvider);
        vaultAssetLiquidityProvider = nextProvider;
    }

    function setAssetInSink(address nextSink) external onlyOwner {
        require(nextSink != address(0), "Zero sink");
        emit AssetInSinkUpdated(assetInSink, nextSink);
        assetInSink = nextSink;
    }

    function setBridgeAssetSink(address nextSink) external onlyOwner {
        require(nextSink != address(0), "Zero sink");
        emit BridgeAssetSinkUpdated(bridgeAssetSink, nextSink);
        bridgeAssetSink = nextSink;
    }

    function setRates(uint256 nextToBridgeRateE18, uint256 nextToVaultRateE18) external onlyOwner {
        require(nextToBridgeRateE18 > 0, "Zero bridge rate");
        require(nextToVaultRateE18 > 0, "Zero vault rate");
        emit RatesUpdated(toBridgeRateE18, nextToBridgeRateE18, toVaultRateE18, nextToVaultRateE18);
        toBridgeRateE18 = nextToBridgeRateE18;
        toVaultRateE18 = nextToVaultRateE18;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function _convertAmount(
        uint256 amountIn,
        uint8 decimalsIn,
        uint8 decimalsOut,
        uint256 rateE18
    ) internal pure returns (uint256) {
        return (amountIn * rateE18 * (10 ** uint256(decimalsOut))) / ((10 ** uint256(decimalsIn)) * 1e18);
    }
}
