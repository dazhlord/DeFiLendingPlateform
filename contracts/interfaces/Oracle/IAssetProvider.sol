//SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

interface IAssetProvider {
    function getAssetType(address asset) external view returns(uint256, address);
}