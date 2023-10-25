//SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;
import "@openzeppelin/contracts/access/Ownable.sol";

import '../interfaces/Oracle/AggregatorInterface.sol';
import '../interfaces/Oracle/IPriceOracleGetter.sol';

contract AssetPriceOracle is Ownable{
    mapping(address => AggregatorInterface) private assetsSources;

    IPriceOracleGetter private _fallbackOracle;
    address public immutable BASE_CURRENCY;
    uint256 public immutable BASE_CURRENCY_UNIT;

    constructor(address[] memory assets, address[] memory sources,address currency, uint256 unit) {
        _setAssetsSources(assets, sources);
        BASE_CURRENCY = currency;
        BASE_CURRENCY_UNIT = unit;
    }

    function setAssetSources(address[] calldata assets, address[] calldata sources) external onlyOwner {
        _setAssetsSources(assets,sources);
    }

    function getAssetPrice(address asset) public view returns(uint256) {
        AggregatorInterface source = assetsSources[asset];

        (, int price, , ,) = source.latestRoundData();
    }

    function _setAssetsSources(address[] memory assets, address[] memory sources) internal {
        require(assets.length == sources.length);
        for (uint256 i = 0; i < assets.length; i++) {
            assetsSources[assets[i]] = AggregatorInterface(sources[i]);
        }
    }
}
