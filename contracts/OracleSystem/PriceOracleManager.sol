//SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;
import '../interfaces/Oracle/IPriceOracleGetter.sol';
import "../interfaces/Oracle/IAssetProvider.sol";
import "../interfaces/Oracle/IChainlinkPriceFeed.sol";
import "../interfaces/Oracle/IChainlinkAggregator.sol";

import "./BalancerOracle.sol";
import "./CurveOracle.sol";

import "hardhat/console.sol";

contract PriceOracleManager {
    IAssetProvider public assetProvider;

    address public owner;
    address public vault;

    mapping(address => address) private _assetsSources; // asset -> IChainlinkPriceFeed

    address public WETH = address(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);
    address public ETH = address(0x0000000000000000000000000000000000000000);

    address payable public curveOracle;
    address public balancerOracle;

    uint256 public duration = 1 hours;

    mapping(address => uint256) public prices;

    modifier onlyAdminOrVault() {
        require(owner == msg.sender || vault == msg.sender, "ERR_NOT_ADMIN_OR_VAULT");
        _;
    }

    constructor(address _vault, address addressProvider){
        owner = msg.sender;
        vault = _vault;
        assetProvider = IAssetProvider(addressProvider);
    }

    function setCurveOracle(address payable _curveOracle) external onlyAdminOrVault {
        curveOracle = _curveOracle;
    }

    function setBalancerOracle(address _balancerOracle) external onlyAdminOrVault {
        balancerOracle = _balancerOracle;
    }

    function setAssetSources(
        address[] calldata assets,
        address[] calldata sources
    ) external onlyAdminOrVault {
        require(assets.length == sources.length, "ERR_ARRAY_LENGTH_MISMATCH");
        uint256 assetsLength = assets.length;
        for (uint256 i; i < assetsLength; ++i) {
            // require(!checkDenomination || Helpers.compareSuffix(IChainlinkPriceFeed(sources[i].feed).description(), BASE_CURRENCY_STRING), "ERR_ORACLE_BAD_DENOMINATION");
            _assetsSources[assets[i]] = sources[i];
        }
    }

    function getAssetPrice(address asset) public view returns(uint256 price) {
        (uint assetType, ) = assetProvider.getAssetType(asset);

        if(assetType == 1)
            price = getChainlinkAssetPrice(asset);
        else if(assetType == 2)
            price = getBalancerLPPrice(asset);
        else if(assetType == 3)
            price = getCurveLPPrice(asset);
    }

    function getChainlinkAssetPrice(address asset) internal view returns(uint256) {
        IChainlinkPriceFeed source = IChainlinkPriceFeed(_assetsSources[asset]);
        if (address(source) != address(0))
        {
            try source.latestRoundData() returns (
                uint80,
                int256 price,
                uint,
                uint256 updatedAt,
                uint80
            ) {
                IChainlinkAggregator aggregator = IChainlinkAggregator(source.aggregator());
                if (price > int256(aggregator.minAnswer()) && 
                    price < int256(aggregator.maxAnswer())
                ) {
                    return uint256(price);
                } else {
                    return 0;
                }
            } catch {
                return 0;
            }
        }
    }

    function getBalancerLPPrice(address asset) internal view returns(uint256 price) {
        price = BalancerOracle(balancerOracle).getAssetPrice(asset);
    }

    function getCurveLPPrice(
        address asset) internal view returns (uint256 price) {
        (, address pool) = assetProvider.getAssetType(asset);

        price = CurveOracle(curveOracle).getAssetPrice(asset, pool);
    }
}
