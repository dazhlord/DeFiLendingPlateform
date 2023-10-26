//SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;
import "../interfaces/Oracle/IPriceOracle.sol";
import '../interfaces/Oracle/AggregatorInterface.sol';
import '../interfaces/Oracle/IPriceOracleGetter.sol';
import "../interfaces/Oracle/IAssetProvider.sol";
import "../interfaces/Oracle/IChainlinkPriceFeed.sol";
import "../interfaces/Oracle/IChainlinkAggregator.sol";

import "./BalancerOracle.sol";
import "./CurveOracle.sol";

contract PriceOracleManager {
    IPriceOracleGetter public fallbackOracle;
    IAssetProvider public assetProvider;

    address public owner;
    address public vault;

    struct ChainlinkData {
        IChainlinkPriceFeed feed;
        uint64 heartbeat;
    }
    mapping(address => ChainlinkData) private _assetsSources;

    address public BASE_CURRENCY;           //removed immutable keyword since
    uint256 public BASE_CURRENCY_DECIMALS; //amount of decimals that the chainlink aggregator assumes for price feeds with this currency as the base
    uint256 public BASE_CURRENCY_UNIT;
    string public BASE_CURRENCY_STRING;

    address public constant ETH_NATIVE = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
    address public WETH;

    modifier onlyAdminOrVault() {
        require(owner == msg.sender || vault == msg.sender, "ERR_NOT_ADMIN_OR_VAULT");
        _;
    }

    constructor(address _vault, address addressProvider){
        owner = msg.sender;
        vault = _vault;
        assetProvider = IAssetProvider(addressProvider);
    }
    function setBaseCurrency(
        address baseCurrency,
        uint256 baseCurrencyDecimals,
        uint256 baseCurrencyUnit,
        string calldata baseCurrencyString
    ) external onlyAdminOrVault {
        require(BASE_CURRENCY == address(0), "ERR_VO_BASE_CURRENCY_SET_ONLY_ONCE");
        BASE_CURRENCY = baseCurrency;
        BASE_CURRENCY_DECIMALS = baseCurrencyDecimals;
        BASE_CURRENCY_UNIT = baseCurrencyUnit;
        BASE_CURRENCY_STRING = baseCurrencyString;
    }

    function setWETH(
        address weth
    ) external onlyAdminOrVault {
        require(WETH == address(0), "ERR_ORACLE_WETH_SET_ONLY_ONCE");
        WETH = weth;
    }

    function setAssetSources(
        address[] calldata assets,
        ChainlinkData[] calldata sources,
        bool checkDenomination
    ) external onlyAdminOrVault {
        require(assets.length == sources.length, "ERR_ARRAY_LENGTH_MISMATCH");
        uint256 assetsLength = assets.length;
        for (uint256 i; i < assetsLength; ++i) {
            // require(!checkDenomination || Helpers.compareSuffix(IChainlinkPriceFeed(sources[i].feed).description(), BASE_CURRENCY_STRING), "ERR_ORACLE_BAD_DENOMINATION");
            require(IChainlinkPriceFeed(sources[i].feed).decimals() == BASE_CURRENCY_DECIMALS, "ERR_ORACLE_BAD_DECIMALS");
            _assetsSources[assets[i]] = sources[i];
        }
    }

    function setFallBackOracle(address _oracle) public onlyAdminOrVault() {
        fallbackOracle = IPriceOracleGetter(_oracle);
    }

    function getAssetPrice(address asset) public returns(uint256 price) {
        if(asset == BASE_CURRENCY) {
            return BASE_CURRENCY_UNIT;
        }
        (uint assetType, ) = assetProvider.getAssetType(asset);
        if(assetType == 0)
            price = getChainlinkAssetPrice(asset);
        else if(assetType == 1)
            price = getBalancerPrice(asset);
        else if(assetType == 2)
            price = getCurveAssetPrice(asset);
        require(price != 0, "ERR_INVALID_ASSET");
    }

    function getChainlinkAssetPrice(address asset) internal returns(uint256) {
        IChainlinkPriceFeed source = _assetsSources[asset].feed;
        if (address(source) == address(0)) {
            return fallbackOracle.getAssetPrice(asset);
        } else {
            try source.latestRoundData() returns (
                uint80,
                int256 price,
                uint,
                uint256 updatedAt,
                uint80
            ) {
                IChainlinkAggregator aggregator = IChainlinkAggregator(source.aggregator());
                if (price > int256(aggregator.minAnswer()) && 
                    price < int256(aggregator.maxAnswer()) && 
                    block.timestamp - updatedAt < _assetsSources[asset].heartbeat
                ) {
                    return uint256(price);
                } else {
                    return fallbackOracle.getAssetPrice(asset);
                }
            } catch {
                return fallbackOracle.getAssetPrice(asset);
            }
        }
    }

    function getBalancerPrice(address asset) public returns(uint256) {
        uint price = BalancerOracle.getAssetPrice(address(this), asset);
        if(price == 0)
            return fallbackOracle.getAssetPrice(asset);
    }

    function getCurveAssetPrice(
        address asset) internal returns (uint256 price) {
        // DataTypes.CurveMetadata memory c = _assetMappings.getCurveMetadata(asset);
        (, address pool) = assetProvider.getAssetType(asset);

        if (!Address.isContract(pool)) {
            return fallbackOracle.getAssetPrice(asset);
        }

        uint256 poolSize = 0;

        while(ICurvePool(pool).coins(poolSize) != address(0)) {
            poolSize ++;
        }
        uint256[] memory prices = new uint256[](poolSize);

        for (uint256 i; i < poolSize;) {
            address underlying = ICurvePool(pool).coins(i);
            if(underlying == ETH_NATIVE){
                underlying = WETH;
            }
            prices[i] = getAssetPrice(underlying); //handles case where underlying is curve too.
            require(prices[i] != 0, "ERR_ORACLE_UNDERLYING_FAIL");

            unchecked { ++i; }
        }
        price = CurveOracle.get_price_v2(pool, prices);
        if(price == 0){
            return fallbackOracle.getAssetPrice(asset);
        }
        return price;
    }

    //Just used for calling curve remove liquidity. Without this, remove_liquidity cannot find function selector receive()
    receive() external payable {
	}
}
