// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

contract MockOracle {
    mapping(address => uint256) public prices;  //lptoken -> prices

    function setPrice(address lpToken, uint256 price) external {
        prices[lpToken] = price;
    }

    function getAssetPrice(address lpToken) external view returns(uint256) {
        return prices[lpToken];
    }
}