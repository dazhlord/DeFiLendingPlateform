//SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

interface IStrategy {
    function deposit(address lpToken, uint256 amount) external;
    function withdraw(address lpToken, uint256 amount) external returns(uint256);
}