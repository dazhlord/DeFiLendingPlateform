//SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;
import "@openzeppelin/contracts/access/Ownable.sol";

contract AssetProvider is Ownable{
    // index  = 1 : ChainlinkAsset
    //          2 : BalancerLP
    //          3 : CurveLP

    struct AssetType{
        uint256 index;
        address pool;
    }
    mapping(address => AssetType) public assetType;   //asset -> assetType

    function setCrvInfo(address asset, uint index, address pool) public onlyOwner {
        AssetType storage assetInfo = assetType[asset];
        require(index == 3 && pool != address(0), "ERR_ASSETPROVIDER_INVALID_CURVE_POOL_ADDRESS");
        assetInfo.index = index;
        assetInfo.pool = pool;
    }
    
    function setAssetInfo(address asset, uint256 index) public onlyOwner {
        AssetType storage assetInfo = assetType[asset];
        require(index != 3);
        assetInfo.index = index;
    }

    function getAssetType(address asset) public view returns(uint256, address) {
        return (assetType[asset].index, assetType[asset].pool);
    }
}