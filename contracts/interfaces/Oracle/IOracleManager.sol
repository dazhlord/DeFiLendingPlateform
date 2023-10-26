//SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

interface IOracleManager {
    function getAssetPrice(address asset) external view returns(uint256 price);
}