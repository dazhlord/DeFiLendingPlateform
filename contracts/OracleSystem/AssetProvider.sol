//SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;
import "@openzeppelin/contracts/access/Ownable.sol";

contract AssetProvider is Ownable{
    // index  = 0 : ChainlinkAsset
    //          1 : BalancerLP
    //          2 : CurveLP

    struct AssetType{
        uint256 index;
        address pool;
    }
    mapping(address => AssetType) public assetType;   //asset -> assetType

    function setAssetType(address asset, AssetType memory t) public onlyOwner {
        AssetType storage assetInfo = assetType[asset];
        assetInfo.index = t.index;
        if(t.index == 2) {
            require(t.pool != address(0), "ERR_ASSETPROVIDER_INVALID_CURVE_POOL_ADDRESS");
            assetInfo.pool = t.pool;
        }
    }

    function getAssetType(address asset) public onlyOwner view returns(uint256, address) {
        return (assetType[asset].index, assetType[asset].pool);
    }
}